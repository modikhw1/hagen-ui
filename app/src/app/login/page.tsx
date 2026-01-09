'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { signIn } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError('Fel e-post eller lösenord');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
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
            Välkommen till LeTrend
          </h1>
          <p style={{
            fontSize: '15px',
            color: '#7D6E5D',
            lineHeight: '1.5'
          }}>
            Virala sketchkoncept för ditt varumärke
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: '0 4px 24px rgba(44, 36, 22, 0.08)'
          }}>
            {error && (
              <div style={{
                padding: '12px 16px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: '12px',
                marginBottom: '20px',
                color: '#DC2626',
                fontSize: '14px'
              }}>
                {error}
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
                  transition: 'border-color 0.15s',
                  boxSizing: 'border-box'
                }}
              />
            </div>

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
                placeholder="••••••••"
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
              }}
            >
              {loading ? 'Loggar in...' : 'Logga in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
