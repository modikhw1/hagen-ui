'use client';

import { onboardingTheme as t } from '@/lib/onboarding/theme';

interface Step {
  number: string;
  title: string;
  description: string;
}

interface ProcessTimelineProps {
  steps: Step[];
}

export function ProcessTimeline({ steps }: ProcessTimelineProps) {
  return (
    <div
      style={{
        background: t.bg.card,
        borderRadius: '16px',
        padding: '28px 24px',
        margin: '0 24px 16px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}
    >
      <h2
        style={{
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '1.5px',
          textTransform: 'uppercase' as const,
          color: t.text.muted,
          margin: '0 0 20px',
        }}
      >
        Så fungerar det
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '0' }}>
        {steps.map((step, i) => (
          <div
            key={step.number}
            style={{
              display: 'flex',
              gap: '16px',
              paddingBottom: i < steps.length - 1 ? '20px' : '0',
            }}
          >
            {/* Number + line */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', width: '32px', flexShrink: 0 }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: t.bg.secondary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 700, color: t.brand.primary }}>{step.number}</span>
              </div>
              {i < steps.length - 1 && (
                <div style={{ width: '2px', flex: 1, background: t.border.light, marginTop: '4px' }} />
              )}
            </div>
            {/* Content */}
            <div style={{ paddingTop: '4px' }}>
              <p style={{ color: t.text.primary, fontWeight: 600, fontSize: '15px', margin: '0 0 4px' }}>
                {step.title}
              </p>
              <p style={{ color: t.text.secondary, fontSize: '14px', lineHeight: 1.5, margin: 0 }}>
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
