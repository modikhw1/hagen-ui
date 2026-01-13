'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase/client'
import { colors, fontFamily, pageContainer, scrollContainer, buttonBase, primaryButton } from '@/styles/mobile-design'

type Mode = 'login' | 'register' | 'forgot'

export default function MobileLoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { signIn, signUp } = useAuth()

  const passwordStrength = mode === 'register' && password
    ? password.length < 6 ? 'weak' : password.length < 10 ? 'ok' : 'strong'
    : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Demo mode: demo/demo → skip directly to demo view
    if (email === 'demo' && password === 'demo') {
      router.push('/m?demo=true')
      return
    }

    // Auth test mode: auth1/auth1 → go to auth/payment flow
    if (email === 'auth1' && password === 'auth1') {
      router.push('/m?auth=true')
      return
    }

    setLoading(true)

    try {
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/m`,
        })
        if (error) {
          setError('Kunde inte skicka återställningslänk')
        } else {
          setSuccess('Kolla din e-post för återställningslänk!')
        }
        setLoading(false)
        return
      }

      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) {
          if (error.message.includes('Invalid login')) {
            setError('Fel e-post eller lösenord')
          } else if (error.message.includes('Email not confirmed')) {
            setError('Du behöver bekräfta din e-post först.')
          } else {
            setError(error.message || 'Inloggningen misslyckades')
          }
          setLoading(false)
          return
        }
        router.push('/m')
      } else {
        // Register
        if (!businessName.trim()) {
          setError('Ange ditt företagsnamn')
          setLoading(false)
          return
        }

        if (password.length < 6) {
          setError('Lösenordet måste vara minst 6 tecken')
          setLoading(false)
          return
        }

        const { error, needsConfirmation } = await signUp(email, password, businessName)

        if (error) {
          if (error.message.includes('already registered') || error.message.includes('already been registered')) {
            setError('E-postadressen är redan registrerad. Prova logga in istället!')
          } else if (error.message.includes('invalid') && error.message.includes('email')) {
            setError('Ogiltig e-postadress')
          } else if (error.message.includes('password')) {
            setError('Lösenordet uppfyller inte kraven')
          } else {
            setError(error.message || 'Registreringen misslyckades')
          }
          setLoading(false)
          return
        }

        if (needsConfirmation) {
          setSuccess('Konto skapat! Kolla din e-post för att bekräfta.')
          setLoading(false)
          return
        }

        setSuccess('Välkommen! Omdirigerar...')
        setTimeout(() => router.push('/m'), 1000)
      }
    } catch {
      setError('Något gick fel. Försök igen.')
    }

    setLoading(false)
  }

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
          {mode === 'login' ? 'Välkommen tillbaka' : mode === 'register' ? 'Skapa konto' : 'Återställ lösenord'}
        </h1>
        <p style={{
          fontSize: 15,
          color: colors.textMuted,
          marginBottom: 32,
          fontFamily,
          textAlign: 'center',
        }}>
          {mode === 'login'
            ? 'Logga in för att se dina koncept'
            : mode === 'register'
            ? 'Kom igång med virala sketchkoncept'
            : 'Ange din e-post för återställning'
          }
        </p>

        <form onSubmit={handleSubmit} noValidate style={{
          width: '100%',
          maxWidth: 380,
          background: colors.card,
          borderRadius: 20,
          padding: 24,
          boxShadow: '0 2px 16px rgba(74, 47, 24, 0.08)'
        }}>
          {error && (
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
              <span>{error}</span>
            </div>
          )}

          {success && (
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
              <span>{success}</span>
            </div>
          )}

          {/* Business Name (register only) */}
          {mode === 'register' && (
            <label style={{ display: 'block', marginBottom: 20 }}>
              <span style={labelStyle}>Företagsnamn</span>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="din@email.se"
              required
              style={inputStyle}
            />
          </label>

          {mode !== 'forgot' && (
            <label style={{ display: 'block', marginBottom: 24 }}>
              <span style={labelStyle}>Lösenord</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Minst 6 tecken' : '••••••••'}
                required
                minLength={mode === 'register' ? 6 : undefined}
                style={inputStyle}
              />
              {/* Password strength */}
              {mode === 'register' && password && (
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
                      width: passwordStrength === 'weak' ? '33%' : passwordStrength === 'ok' ? '66%' : '100%',
                      background: passwordStrength === 'weak' ? '#B4645A' : passwordStrength === 'ok' ? '#C9A85C' : '#5A8B6A',
                    }} />
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 500,
                    fontFamily,
                    color: passwordStrength === 'weak' ? '#8B4D3D' : passwordStrength === 'ok' ? '#8B7340' : '#3D6B4D',
                  }}>
                    {passwordStrength === 'weak' ? 'För kort' : passwordStrength === 'ok' ? 'OK' : 'Starkt'}
                  </span>
                </div>
              )}
            </label>
          )}

          <button
            type="submit"
            disabled={loading || (mode === 'register' && passwordStrength === 'weak')}
            style={{
              ...primaryButton,
              opacity: loading || (mode === 'register' && passwordStrength === 'weak') ? 0.7 : 1,
              cursor: loading || (mode === 'register' && passwordStrength === 'weak') ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {loading && (
              <span style={{
                width: 16,
                height: 16,
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            )}
            {loading
              ? (mode === 'login' ? 'Loggar in...' : mode === 'register' ? 'Skapar konto...' : 'Skickar...')
              : (mode === 'login' ? 'Logga in' : mode === 'register' ? 'Skapa konto' : 'Skicka återställningslänk')
            }
          </button>

          {/* Forgot password link */}
          {mode === 'login' && (
            <button
              type="button"
              onClick={() => { setMode('forgot'); setError(''); setSuccess('') }}
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
            {mode === 'login' ? (
              <>
                Har du inget konto?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(''); setSuccess('') }}
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
            ) : mode === 'register' ? (
              <>
                Har du redan konto?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setSuccess('') }}
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
                onClick={() => { setMode('login'); setError(''); setSuccess('') }}
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
