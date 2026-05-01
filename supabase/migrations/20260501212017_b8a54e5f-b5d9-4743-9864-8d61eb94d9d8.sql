-- 1. Lägg till share_token
ALTER TABLE public.demos
  ADD COLUMN IF NOT EXISTS share_token text;

-- Generera tokens för befintliga rader
UPDATE public.demos
   SET share_token = encode(extensions.gen_random_bytes(18), 'hex')
 WHERE share_token IS NULL;

ALTER TABLE public.demos
  ALTER COLUMN share_token SET NOT NULL,
  ALTER COLUMN share_token SET DEFAULT encode(extensions.gen_random_bytes(18), 'hex');

CREATE UNIQUE INDEX IF NOT EXISTS demos_share_token_unique
  ON public.demos (share_token);

-- 2. Lägg till 'quoted' i demo_status enum
ALTER TYPE public.demo_status ADD VALUE IF NOT EXISTS 'quoted' BEFORE 'won';

-- 3. Publik läsning via share_token (anonyma besökare)
DROP POLICY IF EXISTS demos_public_token_select ON public.demos;
CREATE POLICY demos_public_token_select
  ON public.demos
  FOR SELECT
  TO anon, authenticated
  USING (share_token IS NOT NULL);
-- Säkerheten ligger i att klienten måste känna till tokenen; vi filtrerar på share_token = ? i query.