'use client';

import { useEffect } from 'react';
import { useRouter } from '@/lib/navigation-compat';
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

    // loading=false + profile=null means no profile row → send to onboarding
    if (!profile) {
      router.replace('/welcome');
      return;
    }

    router.replace(getPrimaryRouteForRole(profile, { fallback: '/welcome' }));
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
