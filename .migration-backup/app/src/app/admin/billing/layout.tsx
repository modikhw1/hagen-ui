import type { ReactNode } from 'react';
import BillingShellTabs from '@/components/admin/billing/BillingShellTabs';
import { getStripeEnvironment } from '@/lib/stripe/environment';

export default function BillingLayout({ children }: { children: ReactNode }) {
  const defaultHealthEnv = getStripeEnvironment();

  return (
    <div className="space-y-6">
      <BillingShellTabs defaultHealthEnv={defaultHealthEnv} />
      {children}
    </div>
  );
}
