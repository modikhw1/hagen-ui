'use client';

import { useEnv } from '@/hooks/admin/useEnv';
import { OPERATOR_COPY } from '@/lib/admin/copy/operator-glossary';

export function EnvBand() {
  const env = useEnv();
  if (env !== 'test') return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-status-warning-bg px-3 py-1.5 text-xs font-semibold text-status-warning-fg border-b border-status-warning-fg/10">
      <span className="h-1.5 w-1.5 rounded-full bg-status-warning-fg" />
      {OPERATOR_COPY.env.testBadge} — du ser Stripe-testdata
    </div>
  );
}
