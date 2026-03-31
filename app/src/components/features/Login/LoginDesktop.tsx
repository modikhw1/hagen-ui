'use client'

import Image from 'next/image'
import { useLoginForm } from '@/hooks/useLoginForm'
import { getAuthCallbackUrl } from '@/lib/url/public'

export function LoginDesktop() {
  const form = useLoginForm({
    loginRedirect: '/',
    demoRedirect: '/?demo=true',
    resetRedirectUrl: getAuthCallbackUrl('recovery'),
  })

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '40px 24px',
      background: 'linear-gradient(180deg, #FAF8F5 0%, #F0EBE4 100%)'
    }}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{
        maxWidth: '420px',
        margin: '0 auto',
        width: '100%'
      }}>
        {/* Logo & Title */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ margin: '0 auto 24px', width: '120px', height: '120px' }}>
            <Image
              src="/transparent.png"
              alt="LeTrend"
              width={120}
              height={120}
              style={{ objectFit: 'contain' }}
            />
          </div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '600',
            color: '#1A1612',
            marginBottom: '8px'
          }}>
            {form.mode === 'login' ? 'Välkommen tillbaka' : form.mode === 'register' ? 'Skapa konto' : 'Återställ lösenord'}
          </h1>
          <p style={{
            fontSize: '15px',
            color: '#7D6E5D',
            lineHeight: '1.5'
          }}>
            {form.mode === 'login'
              ? 'Logga in för att se dina koncept'
              : form.mode === 'register'
              ? 'Kom igång med virala sketchkoncept'
              : 'Ange din e-post för att återställa lösenordet'
            }
          </p>
        </div>

        {/* Form */}
        <form onSubmit={form.handleSubmit}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: '0 4px 24px rgba(44, 36, 22, 0.08)'
          }}>
            {form.error && (
              <div style={{
                padding: '14px 16px',
                background: 'linear-gradient(135deg, #FDF6F3 0%, #FAF0EC 100%)',
                border: '1px solid rgba(180, 100, 80, 0.2)',
                borderRadius: '14px',
                marginBottom: '20px',
                color: '#8B4D3D',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                lineHeight: '1.5'
              }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠</span>
                <span>{form.error}</span>
              </div>
            )}

            {form.success && (
              <div style={{
                padding: '14px 16px',
                background: 'linear-gradient(135deg, #F5F9F6 0%, #EDF5EF 100%)',
                border: '1px solid rgba(80, 140, 100, 0.2)',
                borderRadius: '14px',
                marginBottom: '20px',
                color: '#3D6B4D',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                lineHeight: '1.5'
              }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>✓</span>
                <span>{form.success}</span>
              </div>
            )}

            {/* Business Name (only for register) */}
            {form.mode === 'register' && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#5D4D3D',
                  marginBottom: '8px'
                }}>
                  Företagsnamn
                </label>
                <input
                  type="text"
                  value={form.businessName}
                  onChange={(e) => form.setBusinessName(e.target.value)}
                  placeholder="T.ex. Mellow Café"
                  required
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(74, 47, 24, 0.15)',
                    fontSize: '15px',
                    outline: 'none',
                    transition: 'border-color 0.15s',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '500',
                color: '#5D4D3D',
                marginBottom: '8px'
              }}>
                E-post
              </label>
              <input
                type="text"
                value={form.email}
                onChange={(e) => form.setEmail(e.target.value)}
                placeholder="din@email.se"
                required
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(74, 47, 24, 0.15)',
                  fontSize: '15px',
                  outline: 'none',
                  transition: 'border-color 0.15s',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {form.mode !== 'forgot' && (
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#5D4D3D',
                  marginBottom: '8px'
                }}>
                  Lösenord
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => form.setPassword(e.target.value)}
                  placeholder={form.mode === 'register' ? 'Minst 6 tecken' : '••••••••'}
                  required
                  minLength={form.mode === 'register' ? 6 : undefined}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(74, 47, 24, 0.15)',
                    fontSize: '15px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {/* Password strength indicator */}
                {form.mode === 'register' && form.password && (
                  <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      flex: 1,
                      height: '3px',
                      borderRadius: '2px',
                      background: '#E5E0D8'
                    }}>
                      <div style={{
                        height: '100%',
                        borderRadius: '2px',
                        transition: 'width 0.15s ease-out, background 0.15s',
                        width: form.passwordStrength === 'weak' ? '33%' : form.passwordStrength === 'ok' ? '66%' : '100%',
                        background: form.passwordStrength === 'weak' ? '#B4645A' : form.passwordStrength === 'ok' ? '#C9A85C' : '#5A8B6A'
                      }} />
                    </div>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '500',
                      color: form.passwordStrength === 'weak' ? '#8B4D3D' : form.passwordStrength === 'ok' ? '#8B7340' : '#3D6B4D'
                    }}>
                      {form.passwordStrength === 'weak' ? 'För kort' : form.passwordStrength === 'ok' ? 'OK' : 'Starkt'}
                    </span>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={form.loading || (form.mode === 'register' && form.passwordStrength === 'weak')}
              style={{
                width: '100%',
                padding: '16px',
                background: form.loading || (form.mode === 'register' && form.passwordStrength === 'weak')
                  ? '#A89080'
                  : 'linear-gradient(145deg, #6B4423, #4A2F18)',
                border: 'none',
                borderRadius: '14px',
                color: '#FAF8F5',
                fontSize: '16px',
                fontWeight: '600',
                cursor: form.loading || (form.mode === 'register' && form.passwordStrength === 'weak') ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {form.loading && (
                <span style={{
                  width: '16px',
                  height: '16px',
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
                  background: 'none',
                  border: 'none',
                  color: '#7D6E5D',
                  fontSize: '13px',
                  cursor: 'pointer',
                  marginTop: '12px',
                  width: '100%',
                  textAlign: 'center',
                }}
              >
                Glömt lösenordet?
              </button>
            )}

            {/* Toggle mode */}
            <div style={{
              marginTop: '20px',
              textAlign: 'center',
              fontSize: '14px',
              color: '#7D6E5D'
            }}>
              {form.mode === 'login' ? (
                <>
                  Har du inget konto?{' '}
                  <button
                    type="button"
                    onClick={() => { form.setMode('register'); form.clearMessages() }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#6B4423',
                      fontWeight: '600',
                      cursor: 'pointer',
                      textDecoration: 'underline'
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
                      background: 'none',
                      border: 'none',
                      color: '#6B4423',
                      fontWeight: '600',
                      cursor: 'pointer',
                      textDecoration: 'underline'
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
                    background: 'none',
                    border: 'none',
                    color: '#6B4423',
                    fontWeight: '600',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  ← Tillbaka till inloggning
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
