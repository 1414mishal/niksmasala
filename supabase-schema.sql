-- ================================================================
-- NIKS MASALA — Supabase Schema
-- Paste this entire file into:
--   Supabase Dashboard → Your Project → SQL Editor → Run
-- ================================================================

-- Products catalog
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

-- Store settings (key / value pairs)
create table if not exists settings (
  key    text primary key,
  value  text
);

-- Customer orders
create table if not exists orders (
  id          text primary key,
  date        text,
  customer    jsonb,
  notes       text,
  items       jsonb,
  subtotal    numeric default 0,
  shipping    numeric default 0,
  discount    numeric default 0,
  total       numeric default 0,
  payment     text,
  payment_id  text,
  status      text default 'Pending',
  created_at  timestamptz default now()
);

-- Customer accounts
create table if not exists users (
  id          uuid default gen_random_uuid() primary key,
  email       text unique not null,
  name        text,
  phone       text,
  pw          text,
  question    text,
  answer      text,
  created_at  timestamptz default now()
);

-- ----------------------------------------------------------------
-- Row Level Security  (anon key has full access — client-side app)
-- ----------------------------------------------------------------
alter table products enable row level security;
alter table settings  enable row level security;
alter table orders    enable row level security;
alter table users     enable row level security;

-- Drop old policies if re-running
drop policy if exists "niks_products" on products;
drop policy if exists "niks_settings" on settings;
drop policy if exists "niks_orders"   on orders;
drop policy if exists "niks_users"    on users;

create policy "niks_products" on products for all to anon using (true) with check (true);
create policy "niks_settings" on settings  for all to anon using (true) with check (true);
create policy "niks_orders"   on orders    for all to anon using (true) with check (true);
create policy "niks_users"    on users     for all to anon using (true) with check (true);
