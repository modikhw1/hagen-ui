'use client';

import { onboardingTheme as t } from '@/lib/onboarding/theme';

interface PackageSummaryProps {
  pricePerMonth: number;
  interval: string;
  scopeItems: string[];
}

const INTERVAL_LABELS: Record<string, string> = {
  month: 'månad',
  quarter: 'kvartal',
  year: 'år',
};

const DEFAULT_SCOPE_ITEMS = [
  'Dedikerad content manager',
  'Veckovisa videoidéer',
  'Månatlig game plan',
  'Prioriterade virala trender',
];

export function PackageSummary({ pricePerMonth, interval, scopeItems }: PackageSummaryProps) {
  const items = scopeItems.length > 0 ? scopeItems : DEFAULT_SCOPE_ITEMS;
  const intervalLabel = INTERVAL_LABELS[interval] || 'månad';

  const priceDisplay =
    pricePerMonth > 0
      ? new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 }).format(pricePerMonth)
      : null;

  return (
    <div
      style={{
        background: t.bg.card,
        borderRadius: '16px',
        padding: '28px 24px',
        margin: '0 24px 16px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}
    >
      <h2
        style={{
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '1.5px',
          textTransform: 'uppercase' as const,
          color: t.text.muted,
          margin: '0 0 16px',
        }}
      >
        Ditt paket
      </h2>

      <ul style={{ listStyle: 'none', margin: '0 0 20px', padding: 0 }}>
        {items.map((item, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ color: t.success, fontSize: '16px' }}>&#10003;</span>
            <span style={{ color: t.text.primary, fontSize: '14px' }}>{item}</span>
          </li>
        ))}
      </ul>

      <div style={{ borderTop: `1px solid ${t.border.light}`, paddingTop: '16px' }}>
        {priceDisplay ? (
          <>
            <p style={{ color: t.text.primary, fontWeight: 700, fontSize: '20px', margin: '0 0 4px' }}>
              {priceDisplay}{' '}
              <span style={{ fontWeight: 400, fontSize: '14px', color: t.text.secondary }}>/ {intervalLabel}</span>
            </p>
            <p style={{ color: t.text.muted, fontSize: '13px', margin: 0 }}>exkl. moms</p>
          </>
        ) : (
          <p style={{ color: t.text.secondary, fontSize: '14px', margin: 0 }}>
            Pris sätts i samråd med LeTrend
          </p>
        )}
      </div>
    </div>
  );
}
