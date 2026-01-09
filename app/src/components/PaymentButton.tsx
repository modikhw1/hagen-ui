'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface PaymentButtonProps {
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export function PaymentButton({ style, children }: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const handleCheckout = async () => {
    if (!user) {
      // Redirect to login
      window.location.href = '/login';
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          userEmail: user.email,
        }),
      });

      const { url, error } = await response.json();

      if (error) {
        console.error('Checkout error:', error);
        alert('Något gick fel. Försök igen.');
        return;
      }

      // Redirect to Stripe Checkout
      window.location.href = url;
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Något gick fel. Försök igen.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCheckout}
      disabled={loading}
      style={{
        padding: '14px 28px',
        background: loading
          ? '#A89080'
          : 'linear-gradient(145deg, #6B4423, #4A2F18)',
        border: 'none',
        borderRadius: '14px',
        color: '#FAF8F5',
        fontSize: '15px',
        fontWeight: '600',
        cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        ...style,
      }}
    >
      {loading ? (
        <>
          <span
            style={{
              width: '14px',
              height: '14px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          Laddar...
        </>
      ) : (
        children || 'Köp tillgång – 499 kr'
      )}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}
