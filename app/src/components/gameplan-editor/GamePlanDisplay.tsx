'use client';

import { sanitizeRichTextHtml } from './utils/sanitize';

interface GamePlanDisplayProps {
  html: string;
  hasChanges?: boolean;
}

export function GamePlanDisplay({ html, hasChanges = false }: GamePlanDisplayProps) {
  const safeHtml = sanitizeRichTextHtml(html || '');

  return (
    <div style={{ fontSize: '14px', lineHeight: 1.7, position: 'relative' }}>
      {hasChanges && (
        <div
          title="New updates in the game plan"
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
        <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
      ) : (
        <div style={{ color: '#9ca3af' }}>No game plan yet.</div>
      )}
    </div>
  );
}
