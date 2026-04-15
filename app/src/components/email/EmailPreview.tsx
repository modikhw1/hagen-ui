'use client';

import React from 'react';
import { LeTrendColors, LeTrendRadius, LeTrendShadows } from '@/styles/letrend-design-system';

type EmailPreviewProps = {
  open: boolean;
  subject: string;
  html: string;
  title: string;
  onClose: () => void;
};

export function EmailPreview({ open, subject, html, title, onClose }: EmailPreviewProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(26, 22, 18, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          overflow: 'hidden',
          borderRadius: 20,
          background: '#F5F2EE',
          boxShadow: LeTrendShadows.xl,
          border: `1px solid ${LeTrendColors.borderStrong}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '18px 20px',
            borderBottom: `1px solid ${LeTrendColors.borderStrong}`,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: LeTrendColors.brownDark }}>
              Förhandsgranskning - {title}
            </div>
            <div style={{ fontSize: 12, color: LeTrendColors.textMuted, marginTop: 2 }}>
              Exakt HTML som skickas till kunden
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: `1px solid ${LeTrendColors.borderStrong}`,
              background: '#FFFFFF',
              color: LeTrendColors.brownDark,
              borderRadius: LeTrendRadius.xlSoft,
              padding: '10px 14px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Stäng
          </button>
        </div>

        <div style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 80px)', padding: 20 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: LeTrendColors.brownDark,
              padding: 16,
              background: LeTrendColors.surfaceMuted,
              border: `1px solid ${LeTrendColors.borderStrong}`,
              borderBottom: 'none',
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
            }}
          >
            {subject}
          </div>
          <div
            style={{
              maxWidth: 520,
              margin: '0 auto',
              border: `1px solid ${LeTrendColors.borderStrong}`,
              borderRadius: 12,
              overflow: 'hidden',
              background: '#FFFFFF',
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}
