-- Add tiktok_profile_url as the canonical TikTok identity field for a customer.
-- tiktok_handle is retained as the derived display/fetch key, normalized from this URL.
ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS tiktok_profile_url TEXT;
