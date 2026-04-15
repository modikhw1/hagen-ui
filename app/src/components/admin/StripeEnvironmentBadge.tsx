'use client';

import { LeTrendRadius } from '@/styles/letrend-design-system';
import { getStripeEnvironment, isStripeTestEnvironment } from '@/lib/stripe/environment';

export default function StripeEnvironmentBadge() {
  const environment = getStripeEnvironment();
  const isTest = isStripeTestEnvironment();

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 24,
        zIndex: 120,
        display: 'flex',
        justifyContent: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 14px',
          borderRadius: LeTrendRadius.md,
          background: isTest ? '#fef3c7' : '#fee2e2',
          border: `1px solid ${isTest ? '#f59e0b' : '#ef4444'}`,
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
          pointerEvents: 'auto',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: isTest ? '#92400e' : '#991b1b',
          }}
        >
          {environment}
        </span>
        <span
          style={{
            fontSize: '12px',
            color: isTest ? '#b45309' : '#b91c1c',
          }}
        >
          {isTest ? 'Testdata visas i admin' : 'Livedata visas i admin'}
        </span>
      </div>
    </div>
  );
}
