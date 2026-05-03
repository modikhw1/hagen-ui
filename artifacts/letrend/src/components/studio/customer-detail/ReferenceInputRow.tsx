'use client';

import type { CSSProperties } from 'react';
import {
  detectLinkType,
  getLinkPlatformLabel,
  normalizeHref,
} from '@/components/gameplan-editor/utils/link-helpers';
import type { GamePlanReferenceInput } from '@/lib/game-plan';

interface ReferenceInputRowProps {
  index: number;
  reference: GamePlanReferenceInput;
  onChange: (next: GamePlanReferenceInput) => void;
  onRemove: () => void;
}

const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: 10,
  border: '1px solid rgba(74,47,24,0.12)',
  fontSize: 13,
  color: '#4A4239',
  background: '#FFFFFF',
  outline: 'none',
  boxSizing: 'border-box',
};

function getPlatformIcon(platform: ReturnType<typeof detectLinkType>): string {
  switch (platform) {
    case 'tiktok':
      return '♪';
    case 'instagram':
      return '◎';
    case 'youtube':
      return '▶';
    case 'article':
      return '≡';
    default:
      return '↗';
  }
}

export function ReferenceInputRow({
  index,
  reference,
  onChange,
  onRemove,
}: ReferenceInputRowProps) {
  const normalizedUrl = normalizeHref(reference.url || '');
  const platform = normalizedUrl ? detectLinkType(normalizedUrl) : 'external';

  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        padding: 14,
        borderRadius: 14,
        background: '#F8F4EE',
        border: '1px solid rgba(74,47,24,0.08)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '4px 8px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              color: '#6B4423',
              background: '#F2EADF',
            }}
          >
            Referens {index + 1}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#7D6E5D' }}>
            <span
              aria-hidden="true"
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#FFFFFF',
                border: '1px solid rgba(74,47,24,0.08)',
                color: '#8B7355',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {getPlatformIcon(platform)}
            </span>
            {getLinkPlatformLabel(platform)}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#B45309',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          Ta bort
        </button>
      </div>

      <input
        value={reference.url}
        onChange={(event) => {
          const nextUrl = event.target.value;
          const nextPlatform = nextUrl.trim() ? detectLinkType(normalizeHref(nextUrl)) : undefined;
          onChange({ ...reference, url: nextUrl, platform: nextPlatform });
        }}
        placeholder="Länk till profil, video eller artikel"
        style={fieldStyle}
      />

      <input
        value={reference.label || ''}
        onChange={(event) => onChange({ ...reference, label: event.target.value, platform: reference.platform || platform })}
        placeholder="Titel eller arbetsrubrik"
        maxLength={60}
        style={fieldStyle}
      />

      <textarea
        value={reference.note || ''}
        onChange={(event) => onChange({ ...reference, note: event.target.value, platform: reference.platform || platform })}
        placeholder="Vad gillar du här? T.ex. skön ton, bra pacing eller varm känsla."
        rows={3}
        maxLength={300}
        style={{
          ...fieldStyle,
          minHeight: 88,
          resize: 'vertical',
        }}
      />
    </div>
  );
}
