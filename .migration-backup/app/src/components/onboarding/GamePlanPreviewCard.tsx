'use client';

import { onboardingTheme as t } from '@/lib/onboarding/theme';

interface GamePlanPreviewCardProps {
  title: string | null;
  description: string | null;
  goals: string[];
  updatedAt: string | null;
}

function formatUpdatedAt(value: string | null) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleDateString('sv-SE', {
    month: 'short',
    day: 'numeric',
  });
}

export function GamePlanPreviewCard({
  title,
  description,
  goals,
  updatedAt,
}: GamePlanPreviewCardProps) {
  const formattedUpdatedAt = formatUpdatedAt(updatedAt);

  return (
    <div
      style={{
        background: `linear-gradient(145deg, ${t.brand.dark} 0%, ${t.brand.primary} 100%)`,
        borderRadius: '16px',
        padding: '24px',
        margin: '0 24px 16px',
        color: t.bg.primary,
        boxShadow: '0 10px 28px rgba(107, 68, 35, 0.22)',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '1.5px',
          textTransform: 'uppercase',
          color: 'rgba(251, 245, 236, 0.76)',
          marginBottom: '14px',
        }}
      >
        Din game plan
      </div>

      <h2
        style={{
          fontFamily: 'Georgia, serif',
          fontSize: '24px',
          fontWeight: 400,
          lineHeight: 1.25,
          margin: '0 0 10px',
        }}
      >
        {title || 'Det som ska driva ert momentum nu'}
      </h2>

      {description ? (
        <p
          style={{
            margin: '0 0 16px',
            fontSize: '14px',
            lineHeight: 1.7,
            color: 'rgba(251, 245, 236, 0.88)',
          }}
        >
          {description}
        </p>
      ) : null}

      {goals.length > 0 ? (
        <div style={{ display: 'grid', gap: '10px' }}>
          {goals.map((goal) => (
            <div
              key={goal}
              style={{
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                padding: '12px 14px',
                fontSize: '13px',
                lineHeight: 1.6,
              }}
            >
              {goal}
            </div>
          ))}
        </div>
      ) : null}

      {formattedUpdatedAt ? (
        <div
          style={{
            marginTop: '16px',
            fontSize: '12px',
            color: 'rgba(251, 245, 236, 0.72)',
          }}
        >
          Senast uppdaterad {formattedUpdatedAt}
        </div>
      ) : null}
    </div>
  );
}
