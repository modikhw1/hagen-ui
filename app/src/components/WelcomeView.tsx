'use client';

import Image from 'next/image';

interface WelcomeViewProps {
  businessName?: string;
  onViewDemo: () => void;
  onContact: () => void;
}

export function WelcomeView({ businessName, onViewDemo, onContact }: WelcomeViewProps) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '40px 24px',
      background: 'linear-gradient(180deg, #FAF8F5 0%, #F0EBE4 100%)'
    }}>
      <div style={{
        maxWidth: '520px',
        margin: '0 auto',
        width: '100%'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ margin: '0 auto 24px', width: '100px', height: '100px' }}>
            <Image
              src="/transparent.png"
              alt="LeTrend"
              width={100}
              height={100}
              style={{ objectFit: 'contain' }}
            />
          </div>
        </div>

        {/* Success Card */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: '24px',
          padding: '40px 32px',
          boxShadow: '0 4px 24px rgba(44, 36, 22, 0.08)',
          textAlign: 'center'
        }}>
          {/* Success icon */}
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #5A8B6A 0%, #4A7B5A 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            boxShadow: '0 4px 12px rgba(90, 139, 106, 0.3)'
          }}>
            <span style={{ fontSize: '28px', color: '#FFFFFF' }}>✓</span>
          </div>

          <h1 style={{
            fontSize: '26px',
            fontWeight: '600',
            color: '#1A1612',
            marginBottom: '8px'
          }}>
            Välkommen{businessName ? `, ${businessName}` : ''}!
          </h1>

          <p style={{
            fontSize: '16px',
            color: '#5D4D3D',
            marginBottom: '32px'
          }}>
            Din prenumeration är aktiv.
          </p>

          {/* Next steps */}
          <div style={{
            background: '#FAF8F5',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '32px',
            textAlign: 'left'
          }}>
            <h3 style={{
              fontSize: '14px',
              fontWeight: '600',
              color: '#6B4423',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              Vad händer nu?
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#E8E0D8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6B4423'
                }}>1</div>
                <div>
                  <p style={{ fontSize: '14px', color: '#1A1612', fontWeight: '500', marginBottom: '4px' }}>
                    Vi kontaktar dig
                  </p>
                  <p style={{ fontSize: '13px', color: '#7D6E5D', lineHeight: '1.5' }}>
                    Inom kort hör vi av oss för att förstå dina mål och behov.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#E8E0D8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6B4423'
                }}>2</div>
                <div>
                  <p style={{ fontSize: '14px', color: '#1A1612', fontWeight: '500', marginBottom: '4px' }}>
                    Dina koncept kommer
                  </p>
                  <p style={{ fontSize: '13px', color: '#7D6E5D', lineHeight: '1.5' }}>
                    Inom några dagar lägger vi till dina första skräddarsydda koncept.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#E8E0D8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#6B4423'
                }}>3</div>
                <div>
                  <p style={{ fontSize: '14px', color: '#1A1612', fontWeight: '500', marginBottom: '4px' }}>
                    Du får en notis
                  </p>
                  <p style={{ fontSize: '13px', color: '#7D6E5D', lineHeight: '1.5' }}>
                    Vi mailar dig när nya koncept läggs till.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onViewDemo}
              style={{
                flex: 1,
                padding: '16px',
                background: 'linear-gradient(145deg, #6B4423, #4A2F18)',
                border: 'none',
                borderRadius: '14px',
                color: '#FAF8F5',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Se demo som referens
            </button>

            <button
              onClick={onContact}
              style={{
                flex: 1,
                padding: '16px',
                background: '#FFFFFF',
                border: '2px solid #E8E0D8',
                borderRadius: '14px',
                color: '#5D4D3D',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Kontakta oss
            </button>
          </div>
        </div>

        {/* Footer note */}
        <p style={{
          textAlign: 'center',
          marginTop: '24px',
          color: '#A89080',
          fontSize: '13px'
        }}>
          Frågor? Mejla <a href="mailto:hej@letrend.se" style={{ color: '#6B4423' }}>hej@letrend.se</a>
        </p>
      </div>
    </div>
  );
}
