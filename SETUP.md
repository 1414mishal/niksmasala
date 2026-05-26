# SETUP.md — Niks Masala production deploy

Follow this top to bottom. The whole pipeline runs on **free tiers**.
The only ongoing costs are Razorpay's 2% per transaction and (optionally)
a custom domain.

```
Browser  →  Cloudflare Pages (static + Functions)  →  Supabase (DB + Auth)
                                  ↓
                          Razorpay (payments, 2%/tx)
                          Resend    (email, 3k/mo free)
                          WhatsApp  (click-to-chat, free)
```

Estimated setup time: **60-90 minutes** for someone who's never touched
Cloudflare or Supabase before.

---

## Step 1 — Supabase

Free tier: 500 MB DB, 50k monthly-active users, 5 GB egress / month.
Enough for the first ~500 orders/month at minimum.

1. Go to <https://supabase.com> → "Start your project" → sign in with GitHub.
2. **New Project**
   * Name: `niks-masala`
   * Database password: generate, save to a password manager.
   * Region: **Mumbai** (lowest latency for Indian buyers).
   * Pricing plan: **Free**.
   * Wait ~2 minutes for provisioning.
3. **SQL Editor** → **New query** → paste the entire contents of
   [`supabase-schema.sql`](supabase-schema.sql) → click **Run**. You should
   see "Success. No rows returned."
4. **Authentication → Providers → Email**:
   * Enable email signups: **ON**
   * Confirm email: **ON** (users get a verify link).
5. **Authentication → URL Configuration**:
   * Site URL: `https://niksmasala.com` (or your Pages URL for now,
     e.g. `https://niksmasala.pages.dev`)
   * Redirect URLs (one per line):
     ```
     https://niksmasala.com/account.html
     https://niksmasala.com/account.html?reset=1
     https://niksmasala.pages.dev/account.html
     https://niksmasala.pages.dev/account.html?reset=1
     ```
6. **Authentication → Email Templates**: customise "Confirm signup" and
   "Reset password" with your brand text. The default works but feels
   generic. Make sure the `{{ .ConfirmationURL }}` placeholder is preserved.
7. **Project Settings → API**: copy these — you'll paste them into
   Cloudflare in Step 4.
   * `Project URL` → `https://xxxxx.supabase.co`
   * `anon` key (public) — for the frontend
   * `service_role` key (SECRET) — for the Cloudflare Functions only.
     **Never** put this in HTML or commit it.
8. **Settings → Data API → "Exposed schemas"**: should include `public`.
   Already the default — verify it.

Optional but recommended:
   * **Database → Webhooks**: skip for now.
   * **Edge Functions**: skip (we're using Cloudflare instead).

---

## Step 2 — Razorpay

Free account, 2% per successful transaction (no setup or monthly fee).

1. Go to <https://razorpay.com> → Sign Up (use your business email).
2. KYC: upload PAN, GST certificate, bank-account proof, current address
   proof for the directors. Approval usually takes 1–3 working days for
   a registered Pvt Ltd.
3. **Dashboard → Settings → API Keys**:
   * In **Test mode** first: click "Generate Test Key" → save `Key Id`
     and `Key Secret`. Use these until you've tested end-to-end.
   * Once KYC passes: flip to **Live mode** and generate live keys.
     Same fields — different prefix (`rzp_live_...`).
4. **Settings → Webhooks** (recommended, optional for v1):
   * Add `https://niksmasala.com/api/order/verify` as a webhook URL.
   * Subscribe to: `payment.captured`, `payment.failed`.
   * Set the webhook secret — paste it into Cloudflare env as
     `RAZORPAY_WEBHOOK_SECRET`. (Our verify.js can be extended to also
     accept webhook signatures — extra belt-and-braces.)

---

## Step 3 — Resend (transactional email)

Free: 100 emails/day, 3000/month, 1 verified domain.

1. <https://resend.com> → Sign Up → verify your email.
2. **Domains → Add Domain**:
   * Type `niksmasala.com`.
   * Resend gives you 3-4 DNS records (SPF, DKIM, MX-optional).
   * Add them at your domain registrar's DNS panel. Wait 5-30 minutes
     for propagation; Resend will show ✅ when verified.
3. **API Keys → Create API Key** → name it `niks-pages` → copy the key
   (`re_...`). Save for Cloudflare env.
4. Until your domain is verified you can send via Resend's test sender
   `onboarding@resend.dev` to your own email only. Don't ship live with
   that — set up the domain first.

---

## Step 4 — Cloudflare Pages (hosting + Functions)

Free: unlimited static bandwidth, 100k Function requests/day, custom
domain free, automatic SSL.

1. <https://dash.cloudflare.com> → Sign Up → confirm your email.
2. **Workers & Pages → Create application → Pages → Connect to Git**.
3. Authorise GitHub → pick the `1414mishal/niksmasala` repo.
4. **Set up builds and deployments**:
   * Project name: `niksmasala`
   * Production branch: `main`
   * Build command: *(leave blank — this is a static site)*
   * Build output directory: `/`
   * Root directory: `/`
   * Click **Save and Deploy**. First build takes ~30 seconds.
5. Once it deploys, you'll get a URL like `https://niksmasala.pages.dev` —
   open it, the site should work (without API features yet because no env vars).
6. **Settings → Environment variables → Production** → add these:

   | Name | Value | Where it comes from |
   |---|---|---|
   | `SUPABASE_URL` | `https://xxxxx.supabase.co` | Supabase Step 1.7 |
   | `SUPABASE_SERVICE_ROLE` | `eyJhbGc...` (the SECRET one) | Supabase Step 1.7 |
   | `RAZORPAY_KEY_ID` | `rzp_test_xxx` or `rzp_live_xxx` | Razorpay Step 2.3 |
   | `RAZORPAY_KEY_SECRET` | the secret half | Razorpay Step 2.3 |
   | `RESEND_API_KEY` | `re_xxx` | Resend Step 3.3 |
   | `RESEND_FROM` | `Niks Masala <orders@niksmasala.com>` | your own |
   | `OPS_EMAIL` | `hello@niksmasala.com` | where contact-form goes |
   | `FREE_SHIPPING_THRESHOLD` | `799` | business rule |
   | `SHIPPING_FEE_LIGHT` | `60` | business rule |
   | `SHIPPING_FEE_HEAVY` | `120` | business rule |
   | `COD_MAX_OPEN` | `3` (default if unset) | Max Cash-on-Delivery orders one phone number can have open (not yet Delivered / Cancelled) before COD is blocked. Stops fake-order spam that costs courier returns. Set to a higher number if your real customers regularly batch orders. |
   | `ALLOWED_ORIGINS` | `https://niksmasala.com,https://www.niksmasala.com` | CORS allow-list — only these origins can hit `/api/*`. Defaults handle both with and without `www`. |
   | `ADMIN_TOKEN` | a long random string — generate with `openssl rand -hex 32` or any password manager | gates admin write APIs (`/api/admin/products`). Save it somewhere safe — the admin panel asks for it once after login. |

   Click each one as **Encrypted** so it's never exposed in build logs.

   **How `ADMIN_TOKEN` works:**
   The admin panel sends `Authorization: Bearer <ADMIN_TOKEN>` on every
   product save / delete. The Cloudflare Function compares it to this env
   var with a timing-safe equality check. Anyone without the token gets
   `401 Unauthorized`. So when your client edits products in
   `/admin.html`, the changes are immediately persisted to the Supabase
   `products` table — no SQL editor needed, no redeploy needed. The
   public homepage and shop fetch from `/api/products` and re-render
   live, so new products appear within seconds.

   **To rotate the token** (e.g., a previous admin should lose access):
   regenerate `openssl rand -hex 32`, update the env var, redeploy, and
   give the new value to whoever should still have access. Sessions
   storing the old token will silently start failing — they'll be
   re-prompted on next save.

7. **Settings → Functions → Compatibility flags**:
   * Production compatibility date: any date in 2024 or later is fine.
   * No flags needed.

8. **Re-deploy** so the new env vars take effect:
   Deployments → top deployment → "..." → **Retry deployment**.

9. **Frontend Supabase key** — open [`assets/app.js`](assets/app.js) and
   confirm `_SB_URL` and `_SB_KEY` match your new project's URL and
   `anon` key (not service_role). The current values are the previous
   project's; replace and commit.

10. **Custom domain** (optional, ₹800/yr at any registrar):
    * **Custom domains → Set up a custom domain** → `niksmasala.com`.
    * Cloudflare gives you 2 DNS records — add them at your registrar.
    * Wait ~10 minutes. SSL auto-issued.
    * Update Supabase Auth Site URL and Redirect URLs to use the
      custom domain (Step 1.5).

---

## Step 5 — Cloudflare Web Analytics (free, optional)

1. **Web Analytics → Add a site** → enter `niksmasala.com` (or the Pages
   URL).
2. Cloudflare gives you a JavaScript snippet containing a token like
   `f9a1b2c3d4...`. Copy just the **token string**.
3. Open [`assets/app.js`](assets/app.js) and add a `<script>` to the
   top of [`index.html`](index.html) (or any page you want measured):
   ```html
   <script>window.CF_ANALYTICS_TOKEN = 'YOUR_TOKEN_HERE';</script>
   ```
   The snippet in app.js will pick it up and load the beacon. No cookies,
   no GDPR banner needed.

---

## Step 6 — Test the live flow

1. Open `https://niksmasala.pages.dev/` (or your custom domain).
2. Browse → Add to cart → Checkout.
3. Fill the form, **pick UPI** (still in test mode).
4. Razorpay's test screen appears — use card `4111 1111 1111 1111`,
   any future expiry, any CVV.
5. Payment succeeds → redirected to thankyou.html → check your inbox
   (should arrive from your Resend domain).
6. Click **Download Invoice (PDF)** — should produce
   `Niks-Invoice-NM26-XXXXXXXXXX.pdf`.
7. Open `/track.html` → paste the order ID → confirms status.
8. Open Supabase → Table editor → `orders` — your row should be there
   with `status = 'Processing'`.

If any step fails:
* Cloudflare Pages → Deployments → click latest → **Real-time logs** —
  Function errors appear here.
* Browser DevTools → Network → look at the failing `/api/...` response.

---

## Step 7 — Switch to live Razorpay (only after Step 6 passes 5+ times)

1. Razorpay Dashboard → **Live mode** → API Keys → Generate live keys.
2. Cloudflare → Pages → niksmasala → Settings → Environment variables:
   * Edit `RAZORPAY_KEY_ID` → paste `rzp_live_xxx`.
   * Edit `RAZORPAY_KEY_SECRET` → paste the live secret.
3. **Re-deploy**.
4. Run one real ₹1 order with a colleague's card or UPI. Refund it from
   Razorpay dashboard. Confirm everything works end-to-end.
5. You are now live. Welcome to the next stage.

---

## Cost summary

| Service | Free tier | Where you cross it | Cost beyond free |
|---|---|---|---|
| Cloudflare Pages | 500 builds/mo, 100k Function req/day, unlimited bandwidth | ~3000 orders/day | Workers Paid plan $5/mo |
| Supabase | 500 MB DB, 50k MAU, 5 GB egress | ~5000 users + heavy traffic | $25/mo Pro plan |
| Resend | 100 emails/day, 3k/mo | ~100 orders/day | $20/mo for 50k emails |
| Razorpay | Free account, no subscription | always | 2% per successful transaction |
| Domain (optional) | — | n/a | ₹600-1000/year |
| Cloudflare Web Analytics | Unlimited | n/a | Free forever |
| WhatsApp click-to-chat | Unlimited | n/a | Free (uses customer's WhatsApp) |

At 30 orders/day average ticket ₹500 = ₹15,000/day = ₹4.5L/month gross.
Razorpay fee: ₹9,000/month. Everything else: ₹0. You hit Resend's limit
around month 3 and pay $20/mo — by then you're earning ~₹5L/month.

---

## Day-2 operations (after launch)

### Adding a coupon code
Supabase → SQL Editor →
```sql
insert into coupons (code, type, value, min_subtotal, max_redemptions, expires_at)
values ('DIWALI20', 'percent', 20, 500, 200, '2026-11-15');
```

### Marking an order shipped
Supabase → Table editor → `orders` → edit row → set
`tracking_status = 'shipped'`, `tracking_notes = 'Delhivery AWB 1234567890'`.
The buyer's tracking page picks this up live.

### Refunding a payment
Razorpay Dashboard → Transactions → search by payment_id → click **Refund**.
Manually update the Supabase order row's `status` to `Cancelled`.

### Viewing newsletter signups / contact messages
Supabase → Table editor → `newsletter` / `messages`.

### Pulling a CSV of orders for accounting
Supabase → SQL Editor →
```sql
copy (
  select id, date, customer->>'name' as name, customer->>'email' as email,
         total, payment, status
  from orders where status <> 'AwaitingPayment'
  order by created_at desc
) to stdout with csv header;
```

---

## What's still NOT done

These were dropped from scope because they need either money or a
larger engineering pass. Listed so the client knows what to budget for
next year:

* **GST monthly filing automation** — invoices generate fine; you still
  file GSTR-1/3B manually or via an accountant.
* **Shiprocket / Delhivery API integration** — currently you key in the
  AWB by hand in Supabase. Their APIs are free but require ~1 day to
  wire up.
* **Pincode-serviceability check at checkout** — same as above.
* **Abandoned-cart email** — needs a scheduled trigger.
  Cloudflare Workers Cron is free, just hasn't been built.
* **Wishlist / save for later** — straightforward feature, not built.
* **Hindi / Kannada i18n** — recommended for organic Mangaluru SEO.

These are sensible v1.1 features. None is blocking launch.

---

## When something breaks

1. Open Cloudflare Pages → Deployments → latest → real-time logs.
2. Open Supabase → Logs → API logs.
3. Open Sentry (if configured) → top issue.
4. If all three are quiet, it's almost certainly a frontend JS error —
   open the browser DevTools console on the affected page.

Most production issues are env-var typos or expired tokens. Check those
first.
