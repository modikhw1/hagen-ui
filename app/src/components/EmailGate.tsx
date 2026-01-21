'use client';

import { useState } from 'react';
import Image from 'next/image';

interface EmailGateProps {
  onEmailSubmitted: (email: string) => void;
  onLoginClick: () => void;
}

export function EmailGate({ onEmailSubmitted, onLoginClick }: EmailGateProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Ange din e-postadress');
      return;
    }

    // Basic email validation
    if (!email.includes('@') || !email.includes('.')) {
      setError('Ange en giltig e-postadress');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'demo' }),
      });

      if (!res.ok) {
        throw new Error('Failed to save');
      }

      // Store email in sessionStorage so we don't ask again
      sessionStorage.setItem('demo-email', email);
      onEmailSubmitted(email);
    } catch {
      setError('Något gick fel. Försök igen.');
    } finally {
      setLoading(false);
    }
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
            Se hur LeTrend fungerar
          </h1>
          <p style={{
            fontSize: '15px',
            color: '#7D6E5D',
            lineHeight: '1.5'
          }}>
            Utforska koncept som matchas med ditt varumärke
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

            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '500',
                color: '#5D4D3D',
                marginBottom: '8px'
              }}>
                Din e-postadress
              </label>
              <input
                type="email"
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
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '16px',
                background: loading
                  ? '#A89080'
                  : 'linear-gradient(145deg, #6B4423, #4A2F18)',
                border: 'none',
                borderRadius: '14px',
                color: '#FAF8F5',
                fontSize: '16px',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
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
              {loading ? 'Laddar...' : 'Visa demo →'}
            </button>

            <div style={{
              marginTop: '20px',
              textAlign: 'center',
              fontSize: '14px',
              color: '#7D6E5D'
            }}>
              Redan kund?{' '}
              <button
                type="button"
                onClick={onLoginClick}
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
            </div>
          </div>
        </form>

        {/* Benefits preview */}
        <div style={{
          marginTop: '32px',
          textAlign: 'center',
          color: '#A89080',
          fontSize: '13px'
        }}>
          <p style={{ marginBottom: '12px' }}>✓ Se exempelkoncept matchade till olika profiler</p>
          <p style={{ marginBottom: '12px' }}>✓ Utforska hur analysen fungerar</p>
          <p>✓ Helt gratis, ingen bindningstid</p>
        </div>
      </div>
    </div>
  );
}
