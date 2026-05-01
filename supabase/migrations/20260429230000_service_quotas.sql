-- Migration: Add service_quotas table for tracking external API limits
-- Task: Implement RapidAPI quota tracking for TikTok Fetcher

CREATE TABLE IF NOT EXISTS public.service_quotas (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    service text UNIQUE NOT NULL,
    used bigint NOT NULL DEFAULT 0,
    "limit" bigint NOT NULL DEFAULT 0,
    reset_at timestamptz,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE public.service_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated admins to select service_quotas"
    ON public.service_quotas
    FOR SELECT
    TO authenticated
    USING (
        public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'super_admin')
        OR public.has_role(auth.uid(), 'overview.read')
    );

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_service_quotas_updated_at ON public.service_quotas;
CREATE TRIGGER set_service_quotas_updated_at
    BEFORE UPDATE ON public.service_quotas
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
