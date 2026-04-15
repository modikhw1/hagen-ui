-- Migration 040: Billing environment tagging and invoice line item mirroring

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS environment TEXT
  CHECK (environment IN ('test', 'live'));

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS environment TEXT
  CHECK (environment IN ('test', 'live'));

CREATE INDEX IF NOT EXISTS idx_invoices_environment
  ON public.invoices(environment, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_environment
  ON public.subscriptions(environment, created DESC);

CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_line_item_id TEXT NOT NULL UNIQUE,
  stripe_invoice_id TEXT NOT NULL REFERENCES public.invoices(stripe_invoice_id) ON DELETE CASCADE,
  stripe_invoice_item_id TEXT,
  description TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'sek',
  quantity INTEGER,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  environment TEXT CHECK (environment IN ('test', 'live')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice
  ON public.invoice_line_items(stripe_invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_environment
  ON public.invoice_line_items(environment, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_invoice_line_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_invoice_line_items_updated_at ON public.invoice_line_items;
CREATE TRIGGER trigger_invoice_line_items_updated_at
  BEFORE UPDATE ON public.invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_invoice_line_items_updated_at();

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role has full access to invoice_line_items" ON public.invoice_line_items;
CREATE POLICY "Service role has full access to invoice_line_items"
  ON public.invoice_line_items FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

GRANT ALL ON public.invoice_line_items TO service_role;
