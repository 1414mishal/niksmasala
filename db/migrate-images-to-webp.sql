-- =====================================================================
-- One-time migration: swap every product `image` column from .png / .jpg
-- to its .webp twin. Run AFTER deploying the .webp assets so the new
-- paths actually resolve.
--
-- How to run:
--   Supabase → SQL Editor → New query → paste this → Run.
--   Safe to re-run (idempotent).
-- =====================================================================

UPDATE products
SET    image = regexp_replace(image, '\.(png|jpg|jpeg)$', '.webp', 'i')
WHERE  image ~* '\.(png|jpg|jpeg)$';

-- Sanity check after running:
--   SELECT id, name, image FROM products ORDER BY id LIMIT 5;
-- Every row should now show "assets/products/<slug>.webp"
