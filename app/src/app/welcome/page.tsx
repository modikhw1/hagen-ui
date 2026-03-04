'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function WelcomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in (has session)
    const hasSession = localStorage.getItem('pending_agreement_email');
    if (!hasSession) {
      // Not from invite flow - redirect to login
      router.push('/login');
      return;
    }
    setLoading(false);
  }, [router]);

  const handleGetStarted = () => {
    router.push('/onboarding');
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid #E8E0D8',
          borderTopColor: '#6B4423',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #FAF8F5 0%, #F5F0EB 100%)',
      padding: '40px 20px',
    }}>
      <div style={{
        maxWidth: '600px',
        margin: '0 auto',
        textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{
          width: '80px',
          height: '80px',
          background: 'linear-gradient(135deg, #6B4423 0%, #4A2F18 100%)',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 32px',
          boxShadow: '0 8px 32px rgba(107, 68, 35, 0.3)',
        }}>
          <span style={{ color: '#FAF8F5', fontSize: '36px', fontWeight: 'bold', fontFamily: 'serif' }}>Le</span>
        </div>

        <h1 style={{ 
          fontSize: '36px', 
          color: '#1A1612', 
          marginBottom: '16px',
          fontWeight: '700',
          lineHeight: '1.2',
        }}>
          Välkommen till LeTrend!
        </h1>

        <p style={{ 
          fontSize: '18px', 
          color: '#5D4D3D', 
          marginBottom: '40px',
          lineHeight: '1.6',
        }}>
          Din partner för sociala medier och content creation. 
          Vi hjälper dig att växa din närvaro online.
        </p>

        {/* Features */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '32px',
          marginBottom: '40px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          textAlign: 'left',
        }}>
          <h2 style={{ fontSize: '18px', color: '#1A1612', marginBottom: '20px', fontWeight: '600' }}>
            Vad vi erbjuder
          </h2>
          
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', background: '#FAF8F5', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '20px' }}>📱</span>
            </div>
            <div>
              <h3 style={{ fontSize: '16px', color: '#1A1612', marginBottom: '4px', fontWeight: '600' }}>Sociala Medier</h3>
              <p style={{ fontSize: '14px', color: '#5D4D3D', margin: 0 }}>Professionell närvaro på alla plattformar</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            <div style={{ width: '40px', height: '40px', background: '#FAF8F5', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '20px' }}>🎨</span>
            </div>
            <div>
              <h3 style={{ fontSize: '16px', color: '#1A1612', marginBottom: '4px', fontWeight: '600' }}>Content Creation</h3>
              <p style={{ fontSize: '14px', color: '#5D4D3D', margin: 0 }}>Unikt innehåll anpassat för ditt varumärke</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ width: '40px', height: '40px', background: '#FAF8F5', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '20px' }}>📈</span>
            </div>
            <div>
              <h3 style={{ fontSize: '16px', color: '#1A1612', marginBottom: '4px', fontWeight: '600' }}>Tillväxt</h3>
              <p style={{ fontSize: '14px', color: '#5D4D3D', margin: 0 }}>Strategier som levererar resultat</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleGetStarted}
          style={{
            width: '100%',
            maxWidth: '400px',
            padding: '18px 32px',
            background: 'linear-gradient(135deg, #6B4423 0%, #4A2F18 100%)',
            color: '#FAF8F5',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
            fontSize: '18px',
            fontWeight: '600',
            boxShadow: '0 4px 20px rgba(107, 68, 35, 0.4)',
          }}
        >
          Kom igång →
        </button>

        <p style={{ 
          fontSize: '13px', 
          color: '#9A8B7A', 
          marginTop: '20px',
        }}>
          Redo när du är • Inga förpliktelser
        </p>
      </div>
    </div>
  );
}
