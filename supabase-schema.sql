-- ================================================================
-- NIKS MASALA — Supabase Schema (production-grade)
--
-- Paste this entire file into:
--   Supabase Dashboard → Your Project → SQL Editor → Run
--
-- Architecture:
--   * Authentication uses Supabase Auth (native auth.users) — no
--     plaintext passwords. Free for the first 50k MAU.
--   * Orders, contact messages, newsletter subscribers all sit
--     behind tight Row Level Security.
--   * Writes that touch sensitive data go through the SERVICE_ROLE
--     key inside Cloudflare Pages Functions — never from the browser.
--   * The anon role can: read products + settings; submit messages,
--     newsletter signups; that's it.
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
  variants     jsonb,                 -- [{pack,grams,price}, ...]
  description  text,
  long_desc    text,
  badge        text,
  stock        integer default 0,
  created_at   timestamptz default now()
);

create table if not exists settings (
  key    text primary key,
  value  text
);

-- Orders — user_id is nullable so guest checkout still works.
create table if not exists orders (
  id              text primary key,
  user_id         uuid references auth.users(id) on delete set null,
  date            text,
  customer        jsonb,             -- {name,email,phone,address,city,state,pincode}
  notes           text,
  items           jsonb,             -- [{id,name,pack,price,qty,grams}, ...]
  subtotal        numeric default 0,
  shipping        numeric default 0,
  discount        numeric default 0,
  total           numeric default 0,
  payment         text,
  payment_id      text,
  rzp_order_id    text,
  coupon          text,
  status          text default 'AwaitingPayment',
  tracking_status text default 'placed',
  tracking_notes  text,
  paid_at         timestamptz,
  created_at      timestamptz default now()
);
create index if not exists orders_created_at_idx on orders(created_at desc);
create index if not exists orders_status_idx     on orders(status);
create index if not exists orders_user_id_idx    on orders(user_id);
create index if not exists orders_customer_email_idx on orders((customer->>'email'));

-- Profiles row, 1-to-1 with auth.users. Stores non-auth metadata.
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text,
  phone       text,
  default_address jsonb,
  created_at  timestamptz default now()
);

-- Trigger: when a user signs up, create their profile row.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, phone)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'name', ''),
          coalesce(new.raw_user_meta_data->>'phone', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Coupons table — server-validated at /api/order/create.
create table if not exists coupons (
  code             text primary key,
  type             text not null check (type in ('percent','flat')),
  value            numeric not null check (value > 0),
  min_subtotal     numeric default 0,
  max_redemptions  integer,
  times_redeemed   integer default 0,
  expires_at       timestamptz,
  created_at       timestamptz default now()
);
-- Seed the launch coupon
insert into coupons (code, type, value, min_subtotal, max_redemptions, expires_at)
values ('NIKS10', 'percent', 10, 199, 1000, now() + interval '1 year')
on conflict (code) do nothing;

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

-- ----------------------------------------------------------------
-- Stored procedures
-- ----------------------------------------------------------------

-- Atomic stock decrement. Called from /api/order/verify after payment.
-- Won't go below zero; returns the new stock value.
create or replace function public.decrement_stock(p_id text, p_qty integer)
returns integer language plpgsql security definer as $$
declare new_stock integer;
begin
  update products
     set stock = greatest(0, coalesce(stock,0) - p_qty)
   where id = p_id
   returning stock into new_stock;
  return new_stock;
end;
$$;
revoke all on function public.decrement_stock(text,integer) from public, anon, authenticated;

-- Coupon redemption counter
create or replace function public.increment_coupon(p_code text)
returns integer language plpgsql security definer as $$
declare new_count integer;
begin
  update coupons set times_redeemed = coalesce(times_redeemed,0) + 1
   where code = p_code
   returning times_redeemed into new_count;
  return new_count;
end;
$$;
revoke all on function public.increment_coupon(text) from public, anon, authenticated;

-- Public-safe order tracking view: only id/status/date — no PII.
create or replace view orders_public as
  select id, date, status, tracking_status, tracking_notes
  from orders
  where status <> 'AwaitingPayment';
grant select on orders_public to anon, authenticated;

-- ----------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------
alter table products    enable row level security;
alter table settings    enable row level security;
alter table orders      enable row level security;
alter table profiles    enable row level security;
alter table coupons     enable row level security;
alter table messages    enable row level security;
alter table newsletter  enable row level security;

-- Drop any earlier wide-open policies
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname='public' loop
    execute format('drop policy if exists %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- Products: world-readable (catalog is a public page).
create policy "products_read_anon" on products
  for select to anon, authenticated using (true);

-- Settings: world-readable.
create policy "settings_read_anon" on settings
  for select to anon, authenticated using (true);

-- Orders: anonymous role has NO direct access. Inserts/reads come
-- through Pages Functions using SERVICE_ROLE. Authenticated users
-- can read their own orders (via account.html). They cannot insert
-- directly — the checkout flow goes through the API.
create policy "orders_owner_read" on orders
  for select to authenticated using (auth.uid() = user_id);

-- Profiles: owner read + update.
create policy "profiles_owner_read" on profiles
  for select to authenticated using (auth.uid() = id);
create policy "profiles_owner_update" on profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Coupons: nobody reads via anon/authenticated — only the server
-- functions validate them. Keeps competitor scraping at bay.
-- (No policy granted; RLS denies by default.)

-- Messages: anon may insert (contact form). No reads via anon.
create policy "messages_insert_anon" on messages
  for insert to anon, authenticated with check (true);

-- Newsletter: anon may insert their own email. No reads via anon.
create policy "newsletter_insert_anon" on newsletter
  for insert to anon, authenticated with check (true);

-- ----------------------------------------------------------------
-- IMPORTANT — what to switch on in Supabase Dashboard
-- ----------------------------------------------------------------
-- Authentication → Providers → Email:
--   * "Enable email signups": ON
--   * "Confirm email": ON (recommended; users get a one-click verify link)
--   * Customize the "Confirm signup" and "Reset password" email templates
--     under Authentication → Email Templates.
--   * Site URL → set to https://niksmasala.com (or your Pages preview URL)
--   * Redirect URLs → add the same domain + any preview subdomains.
--
-- Authentication → Rate limits:
--   * Tune sign-ins per IP/hour to something sane (default is generous).
--
-- Project Settings → API:
--   * Copy `service_role` key into Cloudflare Pages env (NEVER frontend).
--   * Copy `anon` key — already public, used by app.js for client reads.
