'use client';

import { onboardingTheme as t } from '@/lib/onboarding/theme';

interface TikTokProfileCardProps {
  handle: string;
  profileUrl: string | null;
}

export function TikTokProfileCard({ handle, profileUrl }: TikTokProfileCardProps) {
  const displayHandle = handle.startsWith('@') ? handle : `@${handle}`;
  const url = profileUrl || `https://www.tiktok.com/${displayHandle}`;

  return (
    <div
      style={{
        background: t.bg.card,
        borderRadius: '16px',
        padding: '20px 24px',
        margin: '0 24px 16px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '24px' }}>&#9835;</span>
        <div>
          <p style={{ color: t.text.primary, fontWeight: 600, fontSize: '15px', margin: '0 0 2px', fontFamily: 'monospace' }}>
            {displayHandle}
          </p>
          <p style={{ color: t.text.secondary, fontSize: '13px', margin: 0 }}>Ert TikTok-konto är kopplat</p>
        </div>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: t.brand.primary, fontSize: '14px', textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}
      >
        Öppna profil &rarr;
      </a>
    </div>
  );
}
