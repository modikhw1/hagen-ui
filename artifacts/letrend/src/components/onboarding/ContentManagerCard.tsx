'use client';

import { useState } from 'react';
import { onboardingTheme as t } from '@/lib/onboarding/theme';

interface ContentManagerCardProps {
  name: string;
  avatarUrl: string | null;
  email: string | null;
}

function Initials({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      style={{
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${t.brand.primary} 0%, ${t.brand.dark} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span style={{ color: t.bg.primary, fontSize: '18px', fontWeight: 600 }}>{initials}</span>
    </div>
  );
}

export function ContentManagerCard({ name, avatarUrl, email }: ContentManagerCardProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      style={{
        background: t.bg.card,
        borderRadius: '16px',
        padding: '24px',
        margin: '0 24px 16px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '12px' }}>
        {avatarUrl && !imgError ? (
          <img
            src={avatarUrl}
            alt={name}
            onError={() => setImgError(true)}
            style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
          />
        ) : (
          <Initials name={name} />
        )}
        <div>
          <p style={{ color: t.text.primary, fontWeight: 600, fontSize: '16px', margin: '0 0 2px' }}>{name}</p>
          <p style={{ color: t.text.secondary, fontSize: '14px', margin: 0 }}>Din dedikerade content manager</p>
        </div>
      </div>
      <p style={{ color: t.text.secondary, fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
        {name.split(' ')[0]} kommer hjälpa er hitta rätt riktning på TikTok och planera ert innehåll.
      </p>
      {email && (
        <p style={{ color: t.text.muted, fontSize: '13px', marginTop: '8px' }}>
          <a href={`mailto:${email}`} style={{ color: t.brand.primary, textDecoration: 'none' }}>{email}</a>
        </p>
      )}
    </div>
  );
}
