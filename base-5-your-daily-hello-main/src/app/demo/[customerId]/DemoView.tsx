'use client';

import React, { useState } from 'react';
import { LeTrendColors, LeTrendTypography, LeTrendRadius } from '@/styles/letrend-design-system';
import { GamePlanDisplay } from '@/components/gameplan-editor/GamePlanDisplay';
import { FeedTimeline, type TimelineConcept } from '@/components/studio/FeedTimeline';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface CustomerBrief {
  tone?: string;
  constraints?: string;
  current_focus?: string;
}

interface DemoViewProps {
  customerId: string;
  businessName: string;
  logoUrl: string | null;
  brief: CustomerBrief | null;
  gamePlanHtml: string;
  concepts: TimelineConcept[];
}

type Tab = 'gameplan' | 'feed';

// ─────────────────────────────────────────────
// DemoView — customer-facing presentation
// ─────────────────────────────────────────────

export default function DemoView({
  businessName,
  logoUrl,
  brief,
  gamePlanHtml,
  concepts,
}: DemoViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('gameplan');

  const hasBrief = brief && (brief.tone || brief.constraints || brief.current_focus);
  const hasGamePlan = gamePlanHtml.trim().length > 0;
  const feedConcepts = concepts.filter(c => c.feed_order !== null);

  return (
    <div style={{
      minHeight: '100vh',
      background: LeTrendColors.cream,
      fontFamily: LeTrendTypography.fontFamily.body,
      color: LeTrendColors.textPrimary,
    }}>
      {/* Header */}
      <header style={{
        borderBottom: `1px solid ${LeTrendColors.border}`,
        background: '#fff',
        padding: '0 32px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{
          maxWidth: 900,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 60,
        }}>
          {/* Business identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={businessName}
                style={{ width: 32, height: 32, borderRadius: LeTrendRadius.md, objectFit: 'cover' }}
              />
            ) : (
              <div style={{
                width: 32,
                height: 32,
                borderRadius: LeTrendRadius.md,
                background: LeTrendColors.brownLight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: LeTrendColors.cream,
                fontSize: 14,
                fontWeight: 700,
              }}>
                {businessName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: LeTrendColors.textPrimary }}>
                {businessName}
              </div>
              <div style={{ fontSize: 11, color: LeTrendColors.textMuted }}>
                Content-strategi av LeTrend
              </div>
            </div>
          </div>

          {/* LeTrend branding */}
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: LeTrendColors.brownLight,
            letterSpacing: '0.08em',
          }}>
            LETREND
          </div>
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 32px 64px' }}>

        {/* Brief strip */}
        {hasBrief && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 1,
            background: LeTrendColors.border,
            borderRadius: LeTrendRadius.lg,
            overflow: 'hidden',
            marginBottom: 32,
          }}>
            {[
              { label: 'Ton & känsla', value: brief?.tone },
              { label: 'Begränsningar', value: brief?.constraints },
              { label: 'Fokus just nu', value: brief?.current_focus },
            ].filter(f => f.value).map(({ label, value }) => (
              <div key={label} style={{
                background: '#fff',
                padding: '16px 20px',
              }}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: LeTrendColors.textMuted,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                }}>
                  {label}
                </div>
                <div style={{ fontSize: 13, color: LeTrendColors.textPrimary, lineHeight: 1.5 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab nav */}
        <div style={{
          display: 'flex',
          gap: 0,
          borderBottom: `1px solid ${LeTrendColors.border}`,
          marginBottom: 28,
        }}>
          {([
            { id: 'gameplan' as Tab, label: 'Game Plan' },
            { id: 'feed' as Tab, label: 'Content-kalender' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 600,
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id
                  ? `2px solid ${LeTrendColors.brownLight}`
                  : '2px solid transparent',
                color: activeTab === tab.id ? LeTrendColors.brownLight : LeTrendColors.textSecondary,
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'gameplan' && (
          <section>
            <h2 style={{
              fontFamily: LeTrendTypography.fontFamily.heading,
              fontSize: 22,
              fontWeight: 400,
              color: LeTrendColors.textPrimary,
              marginBottom: 20,
              marginTop: 0,
            }}>
              Din content-strategi
            </h2>
            {hasGamePlan ? (
              <div style={{
                background: '#fff',
                borderRadius: LeTrendRadius.lg,
                padding: '28px 32px',
                border: `1px solid ${LeTrendColors.border}`,
              }}>
                <GamePlanDisplay html={gamePlanHtml} />
              </div>
            ) : (
              <div style={{
                background: '#fff',
                borderRadius: LeTrendRadius.lg,
                padding: '48px 32px',
                border: `1px solid ${LeTrendColors.border}`,
                textAlign: 'center',
                color: LeTrendColors.textMuted,
                fontSize: 14,
              }}>
                Game plan är under uppbyggnad.
              </div>
            )}
          </section>
        )}

        {activeTab === 'feed' && (
          <section>
            <h2 style={{
              fontFamily: LeTrendTypography.fontFamily.heading,
              fontSize: 22,
              fontWeight: 400,
              color: LeTrendColors.textPrimary,
              marginBottom: 8,
              marginTop: 0,
            }}>
              Content-kalender
            </h2>
            <p style={{
              fontSize: 13,
              color: LeTrendColors.textSecondary,
              marginBottom: 24,
              marginTop: 0,
            }}>
              Kommande klipp, redo att producera, och publicerad historik — allt på ett ställe.
            </p>
            <div style={{
              background: '#fff',
              borderRadius: LeTrendRadius.lg,
              padding: '24px',
              border: `1px solid ${LeTrendColors.border}`,
            }}>
              {feedConcepts.length > 0 ? (
                <FeedTimeline
                  concepts={feedConcepts}
                  readOnly
                />
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '48px 32px',
                  color: LeTrendColors.textMuted,
                  fontSize: 14,
                }}>
                  Inga klipp i kalendern än.
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
