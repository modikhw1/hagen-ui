import React from 'react';
import Link from 'next/link';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';

interface CustomerActionBarProps {
  label: string;
  description: string;
  showBackLink?: boolean;
}

export function CustomerActionBar({
  label,
  description,
  showBackLink = true,
}: CustomerActionBarProps) {
  return (
    <>
      {showBackLink && (
        <div style={{ marginBottom: 16 }}>
          <Link
            href="/studio/customers"
            style={{
              color: LeTrendColors.textSecondary,
              fontSize: 14,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            Till kundarbete
          </Link>
        </div>
      )}

      <div
        style={{
          background: '#fff',
          borderRadius: LeTrendRadius.lg,
          padding: 20,
          marginBottom: 16,
          border: `1px solid ${LeTrendColors.border}`,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: LeTrendColors.textMuted,
            marginBottom: 6,
          }}
        >
          Aktiv del
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: LeTrendColors.brownDark, marginBottom: 6 }}>
          {label}
        </div>
        <div style={{ fontSize: 14, color: LeTrendColors.textSecondary, lineHeight: 1.6 }}>
          {description}
        </div>
      </div>
    </>
  );
}
