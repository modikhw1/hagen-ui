-- Pricing config for the admin cost calculator. One row per
-- (service, unit). Operators tweak these rows directly in Supabase
-- without redeploying the api-server. See docs/admin-cost-sources.md.

BEGIN;

CREATE TABLE IF NOT EXISTS public.service_pricing (
  service     text        NOT NULL,
  unit        text        NOT NULL,
  price_ore   integer     NOT NULL DEFAULT 0,
  source      text        NOT NULL DEFAULT 'estimate' CHECK (source IN ('measured', 'estimate', 'missing')),
  notes       text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service, unit)
);

INSERT INTO public.service_pricing (service, unit, price_ore, source, notes) VALUES
  ('rapidapi', 'per_call',           5,   'estimate', 'tiktok-scraper7 PRO plan ≈ 0.005 USD per call'),
  ('rapidapi', 'monthly_flat',       2500, 'estimate', 'tiktok-scraper7 base subscription ≈ 25 kr/mån, used in projection'),
  ('gemini',   'per_1k_input_tok',   1,   'missing',  'gemini-2.5-flash, only counted when hagen returns usage'),
  ('gemini',   'per_1k_output_tok', 4,   'missing',  'gemini-2.5-flash, only counted when hagen returns usage'),
  ('vertex',   'per_prepare',       10,  'estimate', 'hagen /api/letrend/concept/prepare'),
  ('vertex',   'per_deep_analyze',  50,  'estimate', 'hagen /api/videos/analyze/deep'),
  ('gcs',      'per_gb_day',        1,   'missing',  'estimate of stored cache GB-days'),
  ('stripe',   'percent_basis',     150, 'measured', '1.50% of charged amount, basis points'),
  ('stripe',   'fixed_per_charge',  180, 'measured', '1.80 SEK fixed per card charge'),
  ('supabase', 'per_day_flat',      250, 'estimate', 'Pro tier flat ≈ 75 kr / month, written by daily snapshot')
ON CONFLICT (service, unit) DO NOTHING;

COMMIT;
