# SECURITY.md — Niks Masala build status

This document is for the project owner / client. It is the honest list
of what is fixed in this build and what **must** be done by a backend
engineer before this store accepts a single rupee in production.

---

## ✅ Fixed in this build (demo-safe)

| Area | Before | Now |
| --- | --- | --- |
| Fabricated reviews / testimonials | "Priya Sharma — Mumbai" etc. on home and product pages | Removed. Replaced by an honest "no reviews yet" state and brand-promise tiles. |
| Admin "master password" backdoor | `niks2026` always worked as a permanent override | Removed. Admin password is set on first login, stored as SHA-256, no recovery path other than clearing localStorage on the owner's machine. |
| Admin default-password hint on login page | Printed `admin / niks2026` to every visitor | Removed. |
| Admin login token | `sessionStorage.setItem('niks_auth','1')` — anyone with DevTools could set the literal "1" | Replaced with a 16-byte random token; gated by a real password-hash check. |
| Customer passwords stored plaintext | `pw` field saved as-typed in localStorage and Supabase | Hashed client-side with SHA-256(email salt) before storage. Still a band-aid — see backlog. |
| Security-question answers stored plaintext | `answer` field stored verbatim | Hashed with SHA-256(email + ':a' salt). |
| Stored XSS via product names, customer addresses, order notes | Every `innerHTML` interpolation was raw | Single `esc()` / `attr()` helpers in `app.js` applied across `index.html`, `shop.html`, `product.html`, `cart.html`, `checkout.html`, `thankyou.html`, `account.html`, `track.html`. |
| Predictable order IDs | `'NM' + Date.now().toString().slice(-8)` — enumerable | Replaced with `NM{YY}-{10 hex chars from crypto.getRandomValues}` (~1 trillion-space). |
| Tracking page leaked full PII | Full name, phone, address, payment method on any order ID guess | Now masked: `P***** S*****` / `M*****` city. Reads via shared SB client; SQL view `orders_public` exposes only id/status/date. |
| Phone validation rejected `+91` and spaces | `pattern="[0-9]{10}"` | Accepts `+91`, spaces, dashes; normalised to 10 digits server-side ready. |
| Incomplete state dropdown | ~17 states only — Himachal, Uttarakhand, NE states, every UT etc. missing | All 28 states + 8 UTs, grouped with `<optgroup>`. |
| Pincode regex | Allowed leading zero (invalid in India) | `^[1-9]\d{5}$`. |
| No legal pages | Missing Privacy, Terms, Returns, Shipping — required by Consumer Protection (E-Commerce) Rules 2020 | All four created and linked from the footer. Privacy page includes the Grievance Officer block mandated by Rule 5(9). |
| Public admin link in footer | `<a href="admin.html">Admin Login</a>` on every page | Removed. Admin URL is intentionally unlinked. |
| No `robots.txt`, no sitemap, no 404 | Bare static site | `robots.txt`, `sitemap.xml`, `404.html` added; product pages emit JSON-LD `Product` schema; home page emits `Organization` schema; canonical + OG + Twitter tags on every page. |
| Wide-open Supabase RLS | `using (true) with check (true)` on every table | INSERT-only for `orders`, `users`, `messages`, `newsletter`. Public SELECT only on `products`, `settings` and the sanitised `orders_public` view. |
| 15 MB business plan deployed to public | `Niks Masala PPT.pptx` accessible at `/Niks%20Masala%20PPT.pptx` | Deleted. `.gitignore` now blocks `*.pptx`, `*.pdf`, etc. |
| 21 MB duplicate image folder | `Box Images/` (unused) shipped on every visit | Deleted. |
| Fabricated "10k+ happy customers" stat | Hardcoded on About page | Replaced with `11,000 sq.ft. facility` which is a verifiable number. |
| "Loyalty Points" vapor feature | Shown on account dashboard, did nothing | Removed. |
| Newsletter form dropped subscribers | `onsubmit="event.preventDefault();toast(...)"` | Persists to a `newsletter` table (or falls back to local). |
| Contact form dropped messages | Only saved to localStorage of the sender's browser | Inserts into `messages` table; the team can actually read them. |
| Cart wipe on every deploy | `niks_products_version` mismatch wiped the cart | Cart now keyed on its own version; only wiped when the cart schema genuinely changes. |
| `.MOV` references with no fallback | Mute toggling raced on older browsers | Same files, but `.gitignore` now blocks new `.MOV` from being committed — re-encode to `.mp4 (H.264)` before launch. |

---

## ⚠️ NOT FIXED — requires a backend before going live

A static GitHub Pages site **cannot** address these. Each item below
needs a small server (Cloudflare Worker, Vercel Function, or Supabase
Edge Function). Treat the current build as a checkout *mockup*.

### 1. Payment integrity (CRITICAL — do not switch to a live Razorpay key)
The browser still computes `total` and hands the amount to Razorpay
directly. A user can rewrite it in DevTools and pay ₹1 for a ₹10,000
order. **Required pipeline:**

1. Client POSTs `{ items, coupon }` to `/api/create-order`.
2. Server recomputes subtotal, shipping, discount, total against the
   DB-side catalog (the browser's prices are advisory only).
3. Server calls Razorpay `orders.create` with that amount and the
   server's `key_id` + `key_secret`.
4. Server returns `{ razorpay_order_id, amount }`.
5. Client opens Razorpay with `order_id` (not amount).
6. On `payment.success`, client POSTs `{ order_id, payment_id, signature }`
   to `/api/verify`.
7. Server verifies `HMAC_SHA256(key_secret, order_id + "|" + payment_id) === signature`.
8. Only then mark the order as `Processing`.

The TODOs are flagged in `checkout.html` and `app.js`.

### 2. Authenticated user reads
Account login currently SELECTs from `users` via the anon role to
compare hashes. With the hardened RLS above, that SELECT is denied —
which is correct, but it also means login will fail until a server
function (using the `service_role` key) handles it. Same applies to
"My Orders" — the account page must call a server function that filters
orders by the authenticated user's ID.

### 3. Password hashing
SHA-256 is a band-aid that prevents casual leaks but is **not** a real
password hash. A real implementation uses **bcrypt** or **Argon2** with
a per-user salt and a work factor — and runs on a server so the salt
and pepper aren't exposed to the client.

### 4. Transactional email
The "Thank you" page promises a confirmation email. The static site
cannot send mail. Wire `/api/orders/created` to **Resend / SES /
Postmark** and trigger it from a Supabase webhook on `orders.insert`.

### 5. SMS notifications
Indian customers expect SMS on dispatch. Use **MSG91 / Gupshup /
Twilio**.

### 6. GST invoice generation
The footer displays GSTIN `29AAFCI2793E1ZD` but no GST-compliant
invoice is generated. Required by CBIC. Generate a PDF on the server
and attach it to the order-confirmation email.

### 7. Inventory locking
Stock never decrements; concurrent orders will oversell. Decrement
inside the same DB transaction that confirms payment.

### 8. Coupon codes
`NIKS10` is hardcoded client-side and has no usage limit. Move to a DB
table with redemption tracking; validate server-side.

### 9. Shiprocket / Delhivery serviceability check
Currently any pincode is accepted. Hit the courier's serviceability API
at checkout to refuse non-deliverable pincodes.

### 10. Razorpay webhook
The only signal we currently rely on is the client's `handler` callback.
Configure the Razorpay webhook → your server endpoint → mark order paid.
The client-side callback is a UX nicety, not a source of truth.

### 11. Analytics + error tracking
No GA, no Plausible, no Sentry. You won't know what's breaking.

### 12. Rate limiting
Login attempts, password resets, order placement, contact form
submissions — all currently unlimited. Cloudflare Turnstile + WAF rules
or a similar layer in front of any future API.

### 13. Video transcoding
`IMG_*.MOV` are H.264-in-QuickTime. They play in most modern browsers
but `.MOV` MIME is not universally supported. Re-encode to `.mp4`
(H.264) before launch; `.gitignore` now blocks new `.MOV` commits.

---

## How to demo this to the client

1. Open the site. Walk through home → shop → product → cart → checkout.
2. On checkout, run through to "Place Order" with COD (Razorpay is still
   the test key — do not pretend it takes real money).
3. Open the Account → Sign Up flow with a test email + password ≥ 8
   chars. Show them the hashed `pw` in Supabase.
4. Show them `track.html?id=NM26-XXXXXXXXXX` — point out the masked name
   / city as the privacy fix.
5. Show the **Policies** row in the footer (Privacy, Terms, Returns,
   Shipping) — all four exist and are linked.
6. Open `SECURITY.md` (this file). Read through "NOT FIXED". Be honest:
   *"This is the front-end and demo wiring. To take real money safely
   we need ~5 days of backend work — a Cloudflare Worker for payment
   verification, transactional email, SMS, and GST invoices."*
7. Quote that scope. Do not let them push the live Razorpay key in.

---

## Quick smoke test before the meeting

```
# from the repo root
python3 -m http.server 8080
# then open http://localhost:8080
```

Click every nav link, add to cart, view cart, view drawer, hit
checkout (don't submit), open every footer policy link, open
`track.html` and search for a random ID (should show masked "Not
found"), open `account.html` and register a test user.

If any of those break, ping me before the meeting.
