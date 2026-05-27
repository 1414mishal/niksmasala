-- =====================================================================
-- Migration: add Shiprocket integration columns to the orders table.
-- Safe to run on a populated table — all columns are nullable.
-- Safe to re-run (uses IF NOT EXISTS).
--
-- How to run:
--   Supabase → SQL Editor → New query → paste this → Run.
-- =====================================================================

alter table public.orders add column if not exists shiprocket_order_id    text;
alter table public.orders add column if not exists shiprocket_shipment_id text;
alter table public.orders add column if not exists awb                    text;
alter table public.orders add column if not exists courier                text;
alter table public.orders add column if not exists label_url              text;

-- Optional helper index for looking up orders by AWB (e.g. webhook handlers
-- in the future, or for "find the order this courier just delivered" flows).
create index if not exists orders_awb_idx on orders(awb) where awb is not null;

-- Sanity check after running:
--   SELECT id, status, awb, courier, label_url
--   FROM orders WHERE awb IS NOT NULL ORDER BY created_at DESC LIMIT 5;
