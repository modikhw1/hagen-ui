'use client';

import { display } from '@/lib/display';
import { BRAND_PROFILE, type UIConcept, type Plan } from '@/lib/constants/dashboard';
import { VideoPlayer } from '@/components/shared/VideoPlayer';

export function PreviewView({
  concept,
  onUnlock,
  plan,
  conceptsUsed,
  isMobile
}: {
  concept: UIConcept;
  onUnlock: () => void;
  plan: Plan;
  conceptsUsed: number;
  isMobile?: boolean;
}) {
  const axis = display.mechanism(concept.mechanism);
  const conceptsRemaining = plan.concepts - conceptsUsed;

  return (
    <main style={{
      maxWidth: '1200px',
      margin: '0 auto',
      padding: isMobile ? '16px 16px 120px' : 'clamp(16px, 4vw, 24px) clamp(16px, 4vw, 40px) 120px'
    }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(240px, 300px) 1fr',
          gap: isMobile ? '20px' : 'clamp(20px, 4vw, 40px)',
          alignItems: 'start'
        }}>
        {/* Left column - Video & Content */}
        <div style={{ maxWidth: isMobile ? '100%' : 300 }}>
          <div style={{ position: 'relative', borderRadius: '14px', overflow: 'hidden' }}>
            <VideoPlayer videoUrl={concept.videoUrl} gcsUri={concept.gcsUri} showLabel={false} />

            <div style={{
              position: 'absolute',
              top: '16px',
              left: '16px',
              background: concept.match > 85 ? '#5A8F5A' : '#4A2F18',
              color: '#FFF',
              padding: '8px 14px',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: '700',
              zIndex: 10
            }}>
              {concept.match}% match
            </div>

            <div style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              background: 'rgba(0,0,0,0.4)',
              color: '#FFF',
              padding: '6px 12px',
              borderRadius: '10px',
              fontSize: '12px',
              fontWeight: '600',
              zIndex: 10
            }}>
              {concept.market}
            </div>
          </div>

          <div style={{
            padding: '20px',
            background: '#F5F2EE',
            borderRadius: '16px',
            marginTop: '20px'
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#9D8E7D',
              marginBottom: '10px',
              textTransform: 'uppercase'
            }}>
              VARFÖR DET FUNKAR
            </div>
            <div style={{
              fontSize: '15px',
              color: '#5D4D3D',
              lineHeight: '1.6'
            }}>
              {concept.whyItWorks}
            </div>
          </div>
        </div>

        {/* Right column - Details */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          padding: '28px',
          border: '1px solid rgba(74,47,24,0.08)'
        }}>
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              fontSize: '26px',
              fontWeight: '600',
              color: '#1A1612',
              marginBottom: '12px'
            }}>
              {concept.title}
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap'
            }}>
              <span style={{
                fontSize: '13px',
                padding: '6px 12px',
                background: '#F0EBE4',
                borderRadius: '10px',
                color: '#5D4D3D',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {axis?.icon} {axis?.label}
              </span>
              <span style={{
                fontSize: '13px',
                padding: '6px 12px',
                background: '#F0EBE4',
                borderRadius: '10px',
                color: '#5D4D3D'
              }}>
                {concept.difficulty}
              </span>
              <span style={{
                fontSize: '13px',
                padding: '6px 12px',
                background: '#F0EBE4',
                borderRadius: '10px',
                color: '#5D4D3D'
              }}>
                {concept.teamSize}
              </span>
            </div>
          </div>

          <div style={{
            fontSize: '15px',
            color: '#5D4D3D',
            lineHeight: '1.7',
            marginBottom: '24px',
            paddingBottom: '24px',
            borderBottom: '1px solid rgba(74,47,24,0.08)'
          }}>
            {concept.description}
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#9D8E7D',
              marginBottom: '14px',
              textTransform: 'uppercase'
            }}>
              VAD DU FÅR
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { icon: '📹', label: 'Original videoreferens' },
                { icon: '📝', label: 'Fullständigt översatt manus' },
                { icon: '🎯', label: 'Produktionschecklista' },
                { icon: '🧠', label: 'Humor-analys & tips' },
              ].map((item, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '15px',
                  color: '#3D3229'
                }}>
                  <span style={{ fontSize: '18px' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 16px',
            background: 'rgba(90,143,90,0.1)',
            borderRadius: '12px',
            marginBottom: '24px'
          }}>
            <span style={{ fontSize: '18px' }}>✓</span>
            <span style={{ fontSize: '14px', color: '#3D5A3D' }}>
              Matchar {BRAND_PROFILE.handle}s {BRAND_PROFILE.tone[0]}a ton och {concept.teamSize}-team setup
            </span>
          </div>

          <div style={{
            padding: '20px',
            background: '#F5F2EE',
            borderRadius: '14px'
          }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', color: '#9D8E7D' }}>Inkluderat i din plan</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#1A1612' }}>
                {conceptsRemaining} koncept kvar denna månad
              </div>
            </div>
            <button
              onClick={onUnlock}
              style={{
                width: '100%',
                padding: '18px 28px',
                background: 'linear-gradient(145deg, #5D3A1A, #3D2510)',
                border: 'none',
                borderRadius: '14px',
                color: '#FAF8F5',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Lås upp koncept
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Fixed Unlock Bar */}
      <div
        className="mobile-unlock-bar"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#FFFFFF',
          borderTop: '1px solid rgba(74,47,24,0.1)',
          display: 'none'
        }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div>
            <div style={{ fontSize: '12px', color: '#9D8E7D' }}>Inkluderat i din plan</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#1A1612' }}>
              {conceptsRemaining} koncept kvar denna månad
            </div>
          </div>
          <button
            onClick={onUnlock}
            style={{
              padding: '16px 28px',
              background: 'linear-gradient(145deg, #5D3A1A, #3D2510)',
              border: 'none',
              borderRadius: '14px',
              color: '#FAF8F5',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Lås upp
          </button>
        </div>
      </div>
    </main>
  );
}
