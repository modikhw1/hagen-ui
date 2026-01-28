'use client'

import Image from 'next/image'
import { useLoginForm } from '@/hooks/useLoginForm'
import { colors, fontFamily, pageContainer, scrollContainer, buttonBase, primaryButton } from '@/styles/mobile-design'

export function LoginMobile() {
  const form = useLoginForm({
    loginRedirect: '/m',
    demoRedirect: '/m?demo=true',
    resetRedirectUrl: `${typeof window !== 'undefined' ? window.location.origin : ''}/m`,
    extraDemoCredentials: [
      { email: 'auth1', password: 'auth1', redirect: '/m?auth=true' }
    ]
  })

  const inputStyle = {
    width: '100%',
    padding: '14px 16px',
    fontSize: 16,
    fontFamily,
    border: `1px solid ${colors.muted}`,
    borderRadius: 12,
    boxSizing: 'border-box' as const,
    outline: 'none',
    background: '#fff',
  }

  const labelStyle = {
    fontSize: 14,
    fontWeight: 500,
    color: colors.text,
    display: 'block',
    marginBottom: 8,
    fontFamily,
  }

  return (
    <div style={{ ...pageContainer, background: colors.bg }}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{
        ...scrollContainer,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        minHeight: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 24, width: 80, height: 80 }}>
          <Image
            src="/transparent.png"
            alt="LeTrend"
            width={80}
            height={80}
            style={{ objectFit: 'contain' }}
          />
        </div>

        <h1 style={{
          fontSize: 26,
          fontWeight: 600,
          color: colors.text,
          marginBottom: 8,
          fontFamily,
          textAlign: 'center',
        }}>
          {form.mode === 'login' ? 'Välkommen tillbaka' : form.mode === 'register' ? 'Skapa konto' : 'Återställ lösenord'}
        </h1>
        <p style={{
          fontSize: 15,
          color: colors.textMuted,
          marginBottom: 32,
          fontFamily,
          textAlign: 'center',
        }}>
          {form.mode === 'login'
            ? 'Logga in för att se dina koncept'
            : form.mode === 'register'
            ? 'Kom igång med virala sketchkoncept'
            : 'Ange din e-post för återställning'
          }
        </p>

        <form onSubmit={form.handleSubmit} noValidate style={{
          width: '100%',
          maxWidth: 380,
          background: colors.card,
          borderRadius: 20,
          padding: 24,
          boxShadow: '0 2px 16px rgba(74, 47, 24, 0.08)'
        }}>
          {form.error && (
            <div style={{
              padding: '14px 16px',
              background: 'rgba(180, 100, 80, 0.1)',
              border: '1px solid rgba(180, 100, 80, 0.2)',
              borderRadius: 14,
              marginBottom: 20,
              color: '#8B4D3D',
              fontSize: 14,
              fontFamily,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}>
              <span>⚠</span>
              <span>{form.error}</span>
            </div>
          )}

          {form.success && (
            <div style={{
              padding: '14px 16px',
              background: 'rgba(80, 140, 100, 0.1)',
              border: '1px solid rgba(80, 140, 100, 0.2)',
              borderRadius: 14,
              marginBottom: 20,
              color: '#3D6B4D',
              fontSize: 14,
              fontFamily,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}>
              <span>✓</span>
              <span>{form.success}</span>
            </div>
          )}

          {/* Business Name (register only) */}
          {form.mode === 'register' && (
            <label style={{ display: 'block', marginBottom: 20 }}>
              <span style={labelStyle}>Företagsnamn</span>
              <input
                type="text"
                value={form.businessName}
                onChange={(e) => form.setBusinessName(e.target.value)}
                placeholder="T.ex. Mellow Café"
                required
                style={inputStyle}
              />
            </label>
          )}

          <label style={{ display: 'block', marginBottom: 20 }}>
            <span style={labelStyle}>E-post</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => form.setEmail(e.target.value)}
              placeholder="din@email.se"
              required
              style={inputStyle}
            />
          </label>

          {form.mode !== 'forgot' && (
            <label style={{ display: 'block', marginBottom: 24 }}>
              <span style={labelStyle}>Lösenord</span>
              <input
                type="password"
                value={form.password}
                onChange={(e) => form.setPassword(e.target.value)}
                placeholder={form.mode === 'register' ? 'Minst 6 tecken' : '••••••••'}
                required
                minLength={form.mode === 'register' ? 6 : undefined}
                style={inputStyle}
              />
              {/* Password strength */}
              {form.mode === 'register' && form.password && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    flex: 1,
                    height: 3,
                    borderRadius: 2,
                    background: colors.muted,
                  }}>
                    <div style={{
                      height: '100%',
                      borderRadius: 2,
                      transition: 'width 0.15s, background 0.15s',
                      width: form.passwordStrength === 'weak' ? '33%' : form.passwordStrength === 'ok' ? '66%' : '100%',
                      background: form.passwordStrength === 'weak' ? '#B4645A' : form.passwordStrength === 'ok' ? '#C9A85C' : '#5A8B6A',
                    }} />
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 500,
                    fontFamily,
                    color: form.passwordStrength === 'weak' ? '#8B4D3D' : form.passwordStrength === 'ok' ? '#8B7340' : '#3D6B4D',
                  }}>
                    {form.passwordStrength === 'weak' ? 'För kort' : form.passwordStrength === 'ok' ? 'OK' : 'Starkt'}
                  </span>
                </div>
              )}
            </label>
          )}

          <button
            type="submit"
            disabled={form.loading || (form.mode === 'register' && form.passwordStrength === 'weak')}
            style={{
              ...primaryButton,
              opacity: form.loading || (form.mode === 'register' && form.passwordStrength === 'weak') ? 0.7 : 1,
              cursor: form.loading || (form.mode === 'register' && form.passwordStrength === 'weak') ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {form.loading && (
              <span style={{
                width: 16,
                height: 16,
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            )}
            {form.loading
              ? (form.mode === 'login' ? 'Loggar in...' : form.mode === 'register' ? 'Skapar konto...' : 'Skickar...')
              : (form.mode === 'login' ? 'Logga in' : form.mode === 'register' ? 'Skapa konto' : 'Skicka återställningslänk')
            }
          </button>

          {/* Forgot password link */}
          {form.mode === 'login' && (
            <button
              type="button"
              onClick={() => { form.setMode('forgot'); form.clearMessages() }}
              style={{
                ...buttonBase,
                background: 'none',
                color: colors.textMuted,
                fontSize: 13,
                marginTop: 12,
                width: '100%',
                textAlign: 'center',
              }}
            >
              Glömt lösenordet?
            </button>
          )}

          {/* Toggle mode */}
          <div style={{
            marginTop: 20,
            textAlign: 'center',
            fontSize: 14,
            color: colors.textMuted,
            fontFamily,
          }}>
            {form.mode === 'login' ? (
              <>
                Har du inget konto?{' '}
                <button
                  type="button"
                  onClick={() => { form.setMode('register'); form.clearMessages() }}
                  style={{
                    ...buttonBase,
                    background: 'none',
                    color: colors.primary,
                    fontWeight: 600,
                    textDecoration: 'underline',
                  }}
                >
                  Skapa ett här
                </button>
              </>
            ) : form.mode === 'register' ? (
              <>
                Har du redan konto?{' '}
                <button
                  type="button"
                  onClick={() => { form.setMode('login'); form.clearMessages() }}
                  style={{
                    ...buttonBase,
                    background: 'none',
                    color: colors.primary,
                    fontWeight: 600,
                    textDecoration: 'underline',
                  }}
                >
                  Logga in
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => { form.setMode('login'); form.clearMessages() }}
                style={{
                  ...buttonBase,
                  background: 'none',
                  color: colors.primary,
                  fontWeight: 600,
                  textDecoration: 'underline',
                }}
              >
                ← Tillbaka till inloggning
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
