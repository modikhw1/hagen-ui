'use client';

import { onboardingTheme as t } from '@/lib/onboarding/theme';

interface OnboardingCTAProps {
  onCheckout: () => void;
  onExplore: () => void;
  loading?: boolean;
}

export function OnboardingCTA({ onCheckout, onExplore, loading }: OnboardingCTAProps) {
  return (
    <div style={{ padding: '8px 24px 48px', display: 'flex', flexDirection: 'column' as const, gap: '12px' }}>
      <button
        onClick={onCheckout}
        disabled={loading}
        style={{
          width: '100%',
          padding: '16px',
          background: `linear-gradient(135deg, ${t.brand.primary} 0%, ${t.brand.dark} 100%)`,
          color: t.bg.primary,
          border: 'none',
          borderRadius: '12px',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: '16px',
          fontWeight: 600,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? 'Laddar...' : 'Aktivera ditt samarbete'}
      </button>
      <button
        onClick={onExplore}
        style={{
          width: '100%',
          padding: '14px',
          background: 'transparent',
          color: t.text.secondary,
          border: `1px solid ${t.border.medium}`,
          borderRadius: '12px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 500,
        }}
      >
        Utforska plattformen först
      </button>
    </div>
  );
}
