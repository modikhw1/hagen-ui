'use client';

import { sanitizeRichTextHtml } from './utils/sanitize';

interface GamePlanDisplayProps {
  html: string;
  hasChanges?: boolean;
  emptyLabel?: string;
}

export function GamePlanDisplay({
  html,
  hasChanges = false,
  emptyLabel = 'Ingen Game Plan ännu.',
}: GamePlanDisplayProps) {
  const safeHtml = sanitizeRichTextHtml(html || '');

  return (
    <div style={{ position: 'relative' }}>
      {hasChanges && (
        <div
          title="Nya uppdateringar i Game Plan"
          style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            width: '12px',
            height: '12px',
            background: '#10b981',
            borderRadius: '50%',
            border: '2px solid #fff',
          }}
        />
      )}

      {safeHtml.trim() ? (
        <div
          className="gp-rich-text game-plan-content"
          style={{
            background: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid rgba(74, 47, 24, 0.06)',
            padding: '18px 20px',
          }}
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      ) : (
        <div
          style={{
            padding: '20px 18px',
            borderRadius: 12,
            background: '#F5F2EE',
            border: '1px dashed rgba(74, 47, 24, 0.08)',
            color: '#7D6E5D',
            fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: 14,
            lineHeight: 1.6,
            textAlign: 'center',
          }}
        >
          {emptyLabel}
        </div>
      )}
    </div>
  );
}
