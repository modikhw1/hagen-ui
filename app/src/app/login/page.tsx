'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';

type Mode = 'login' | 'register' | 'forgot';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { signIn, signUp } = useAuth();

  // Compute password strength inline (no state needed)
  const passwordStrength = mode === 'register' && password
    ? password.length < 6 ? 'weak' : password.length < 10 ? 'ok' : 'strong'
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Demo mode: demo/demo → skip to demo
    if (email === 'demo' && password === 'demo') {
      router.push('/?demo=true');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'forgot') {
        // Password reset
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/app`,
        });
        if (error) {
          setError('Kunde inte skicka återställningslänk');
        } else {
          setSuccess('Kolla din e-post för återställningslänk!');
        }
        setLoading(false);
        return;
      }

      if (mode === 'login') {
        console.log('Attempting login for:', email);
        const { error } = await signIn(email, password);
        if (error) {
          console.log('Login error:', error);
          if (error.message.includes('Invalid login')) {
            setError('Fel e-post eller lösenord');
          } else if (error.message.includes('Email not confirmed')) {
            setError('Du behöver bekräfta din e-post först. Kolla din inkorg!');
          } else {
            setError(error.message || 'Inloggningen misslyckades');
          }
          setLoading(false);
          return;
        }
        console.log('Login successful, redirecting...');
        router.push('/app');
      } else {
        // Register
        if (!businessName.trim()) {
          setError('Ange ditt företagsnamn');
          setLoading(false);
          return;
        }

        if (password.length < 6) {
          setError('Lösenordet måste vara minst 6 tecken');
          setLoading(false);
          return;
        }

        console.log('Attempting signup for:', email, 'business:', businessName);
        const { error, needsConfirmation } = await signUp(email, password, businessName);

        if (error) {
          console.log('Signup error:', error);
          // Translate common errors
          if (error.message.includes('already registered') || error.message.includes('already been registered')) {
            setError('E-postadressen är redan registrerad. Prova logga in istället!');
          } else if (error.message.includes('invalid') && error.message.includes('email')) {
            setError('Ogiltig e-postadress');
          } else if (error.message.includes('password')) {
            setError('Lösenordet uppfyller inte kraven');
          } else {
            setError(error.message || 'Registreringen misslyckades');
          }
          setLoading(false);
          return;
        }

        console.log('Signup result - needsConfirmation:', needsConfirmation);

        if (needsConfirmation) {
          setSuccess('🎉 Konto skapat! Kolla din e-post för att bekräfta kontot.');
          setLoading(false);
          return;
        }

        // Auto-logged in
        setSuccess('🎉 Välkommen! Omdirigerar...');
        setTimeout(() => router.push('/app'), 1000);
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError('Något gick fel. Försök igen.');
    }

    setLoading(false);
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
    setSuccess('');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '40px 24px',
      background: 'linear-gradient(180deg, #FAF8F5 0%, #F0EBE4 100%)'
    }}>
      {/* Spinner animation */}
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
              style={{
                objectFit: 'contain'
              }}
            />
          </div>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '600',
            color: '#1A1612',
            marginBottom: '8px'
          }}>
            {mode === 'login' ? 'Välkommen tillbaka' : mode === 'register' ? 'Skapa konto' : 'Återställ lösenord'}
          </h1>
          <p style={{
            fontSize: '15px',
            color: '#7D6E5D',
            lineHeight: '1.5'
          }}>
            {mode === 'login'
              ? 'Logga in för att se dina koncept'
              : mode === 'register'
              ? 'Kom igång med virala sketchkoncept'
              : 'Ange din e-post för att återställa lösenordet'
            }
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: '0 4px 24px rgba(44, 36, 22, 0.08)'
          }}>
            {error && (
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
                <span>{error}</span>
              </div>
            )}

            {success && (
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
                <span>{success}</span>
              </div>
            )}

            {/* Business Name (only for register) */}
            {mode === 'register' && (
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
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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

            {mode !== 'forgot' && (
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Minst 6 tecken' : '••••••••'}
                  required
                  minLength={mode === 'register' ? 6 : undefined}
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
                {mode === 'register' && password && (
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
                        width: passwordStrength === 'weak' ? '33%' : passwordStrength === 'ok' ? '66%' : '100%',
                        background: passwordStrength === 'weak' ? '#B4645A' : passwordStrength === 'ok' ? '#C9A85C' : '#5A8B6A'
                      }} />
                    </div>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '500',
                      color: passwordStrength === 'weak' ? '#8B4D3D' : passwordStrength === 'ok' ? '#8B7340' : '#3D6B4D'
                    }}>
                      {passwordStrength === 'weak' ? 'För kort' : passwordStrength === 'ok' ? 'OK' : 'Starkt'}
                    </span>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (mode === 'register' && passwordStrength === 'weak')}
              style={{
                width: '100%',
                padding: '16px',
                background: loading || (mode === 'register' && passwordStrength === 'weak')
                  ? '#A89080'
                  : 'linear-gradient(145deg, #6B4423, #4A2F18)',
                border: 'none',
                borderRadius: '14px',
                color: '#FAF8F5',
                fontSize: '16px',
                fontWeight: '600',
                cursor: loading || (mode === 'register' && passwordStrength === 'weak') ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {loading && (
                <span style={{
                  width: '16px',
                  height: '16px',
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
                onClick={() => { setMode('forgot'); setError(''); setSuccess(''); }}
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
              {mode === 'login' ? (
                <>
                  Har du inget konto?{' '}
                  <button
                    type="button"
                    onClick={toggleMode}
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
              ) : mode === 'register' ? (
                <>
                  Har du redan konto?{' '}
                  <button
                    type="button"
                    onClick={toggleMode}
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
                  onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
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
  );
}
