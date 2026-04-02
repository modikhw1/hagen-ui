'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPrimaryRouteForRole } from '@/lib/auth/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function RootPage() {
  const router = useRouter();
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    router.replace(getPrimaryRouteForRole(profile, { fallback: '/feed' }));
  }, [loading, profile, router, user]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FAF8F5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>...</div>
        <div style={{ color: '#7D6E5D', fontSize: 15 }}>Öppnar din kundyta...</div>
      </div>
    </div>
  );
}
