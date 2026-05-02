'use client';

import { onboardingTheme as t } from '@/lib/onboarding/theme';

interface WelcomeHeroProps {
  businessName: string;
}

export function WelcomeHero({ businessName }: WelcomeHeroProps) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px 32px' }}>
      <div
        style={{
          width: '64px',
          height: '64px',
          background: `linear-gradient(135deg, ${t.brand.primary} 0%, ${t.brand.dark} 100%)`,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '24px',
          boxShadow: `0 8px 24px rgba(107, 68, 35, 0.25)`,
        }}
      >
        <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '24px', color: t.bg.primary }}>
          Le
        </span>
      </div>
      <h1
        style={{
          fontFamily: 'Georgia, serif',
          fontSize: '32px',
          fontWeight: 400,
          color: t.text.primary,
          margin: '0 0 8px',
          lineHeight: 1.2,
        }}
      >
        Välkommen, {businessName}!
      </h1>
      <p style={{ color: t.text.secondary, fontSize: '16px', margin: 0, lineHeight: 1.6 }}>
        Ditt samarbete med LeTrend börjar här.
      </p>
    </div>
  );
}
