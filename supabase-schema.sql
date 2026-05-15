-- ================================================================
-- NIKS MASALA — Supabase Schema (HARDENED RLS)
--
-- Paste this entire file into:
--   Supabase Dashboard → Your Project → SQL Editor → Run
--
-- The previous version had `using (true) with check (true)` on every
-- table — that meant any visitor with the anon key could read every
-- order's PII and every user's password. THIS version is the minimum
-- defensible policy set for a static-site build. Even so, real
-- security still requires a server (Cloudflare Worker / Edge Function)
-- so that the anon role cannot SELECT * from `users` or `orders`.
-- See SECURITY.md.
-- ================================================================

-- ----------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------

create table if not exists products (
  id           text primary key,
  name         text not null,
  slug         text,
  category     text,
  price        numeric default 0,
  old_price    numeric,
  weight       text,
  image        text,
  rating       numeric default 4.5,
  reviews      integer default 0,
  description  text,
  long_desc    text,
  badge        text,
  stock        integer default 0,
  emoji        text default '🌶️',
  created_at   timestamptz default now()
);

create table if not exists settings (
  key    text primary key,
  value  text
);

create table if not exists orders (
  id              text primary key,
  date            text,
  customer        jsonb,
  notes           text,
  items           jsonb,
  subtotal        numeric default 0,
  shipping        numeric default 0,
  discount        numeric default 0,
  total           numeric default 0,
  payment         text,
  payment_id      text,
  status          text default 'Pending',
  tracking_status text default 'placed',
  tracking_notes  text,
  created_at      timestamptz default now()
);

create table if not exists users (
  id          uuid default gen_random_uuid() primary key,
  email       text unique not null,
  name        text,
  phone       text,
  pw          text,           -- SHA-256(email + ':' + password) — band-aid; replace with auth.users + bcrypt
  question    text,
  answer      text,           -- SHA-256(email + ':a:' + answer)
  created_at  timestamptz default now()
);

create table if not exists messages (
  id          uuid default gen_random_uuid() primary key,
  name        text,
  email       text,
  phone       text,
  subject     text,
  msg         text,
  date        timestamptz default now()
);

create table if not exists newsletter (
  email       text primary key,
  created_at  timestamptz default now()
);

-- A public-safe VIEW for order tracking. Exposes ONLY the columns a
-- visitor needs to look up shipping status by order ID — no customer
-- name, phone, address, items or totals. The track.html page should
-- migrate to read from `orders_public` instead of `orders` directly.
create or replace view orders_public as
  select id, date, status, tracking_status, tracking_notes
  from orders;

-- ----------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------
alter table products    enable row level security;
alter table settings    enable row level security;
alter table orders      enable row level security;
alter table users       enable row level security;
alter table messages    enable row level security;
alter table newsletter  enable row level security;

-- Drop the old wide-open policies if re-running.
drop policy if exists "niks_products"        on products;
drop policy if exists "niks_settings"        on settings;
drop policy if exists "niks_orders"          on orders;
drop policy if exists "niks_users"           on users;
drop policy if exists "niks_messages"        on messages;
drop policy if exists "niks_newsletter"      on newsletter;

drop policy if exists "products_read"        on products;
drop policy if exists "settings_read"        on settings;
drop policy if exists "orders_insert"        on orders;
drop policy if exists "users_insert"         on users;
drop policy if exists "users_select_own"     on users;
drop policy if exists "messages_insert"      on messages;
drop policy if exists "newsletter_insert"    on newsletter;

-- Products: anyone can read; only the service_role (admin) can write.
create policy "products_read" on products
  for select to anon using (true);

-- Settings: anyone can read (brand info, shipping rules); only service_role can write.
create policy "settings_read" on settings
  for select to anon using (true);

-- Orders: anonymous visitors may INSERT (place an order) but NOT SELECT, UPDATE or DELETE.
-- This stops mass-enumeration of customer PII via the anon key. Order lookup for
-- the customer's "thank you" / track flow happens against `orders_public`
-- (which intentionally excludes customer details).
create policy "orders_insert" on orders
  for insert to anon with check (true);

-- The public tracking view: read-only, sanitised.
grant select on orders_public to anon;
-- Note: views don't have RLS; the underlying `orders` policy above blocks
-- direct SELECT, and the view exposes only the safe columns.

-- Users: anyone can register (INSERT). SELECT/UPDATE/DELETE blocked at the
-- anon level — until a real auth layer (Supabase Auth + JWT-based RLS)
-- exists, account login should also be routed through a server function.
-- TODO(backend): replace this with Supabase Auth so each user can only
-- read/update their own row via `auth.uid()`.
create policy "users_insert" on users
  for insert to anon with check (true);

-- Messages: visitors can submit contact-form messages. Reading is admin-only.
create policy "messages_insert" on messages
  for insert to anon with check (true);

-- Newsletter: visitors can subscribe. Reading is admin-only.
create policy "newsletter_insert" on newsletter
  for insert to anon with check (true);

-- ----------------------------------------------------------------
-- Useful indexes
-- ----------------------------------------------------------------
create index if not exists orders_status_idx       on orders(status);
create index if not exists orders_created_at_idx   on orders(created_at desc);
create index if not exists users_email_idx         on users(lower(email));

-- ----------------------------------------------------------------
-- WHAT THIS DOES NOT FIX
-- ----------------------------------------------------------------
-- The login flow in account.html still reads from `users` to verify a
-- password hash — that read currently goes through the anon role and
-- will be denied by the policy above. Real fix: a Supabase Edge
-- Function (or Cloudflare Worker) that:
--   1. accepts {email, password}
--   2. uses the SERVICE role to look up the user
--   3. compares bcrypt hashes server-side
--   4. issues a signed session JWT
-- Until that exists, this build is a demo only.
