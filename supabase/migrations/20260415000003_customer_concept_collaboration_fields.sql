-- Custom collaboration cards need dedicated metadata on customer_concepts.

ALTER TABLE customer_concepts
  ADD COLUMN IF NOT EXISTS partner_name text,
  ADD COLUMN IF NOT EXISTS profile_name text,
  ADD COLUMN IF NOT EXISTS profile_image_url text,
  ADD COLUMN IF NOT EXISTS visual_variant text DEFAULT 'default';
