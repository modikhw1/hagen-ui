'use client';

import { PricingPlans } from '@/components';

export default function PricingPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
      paddingTop: '40px',
    }}>
      <PricingPlans />
    </div>
  );
}
