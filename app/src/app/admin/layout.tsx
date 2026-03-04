'use client';

import { ReactNode, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { LeTrendColors, LeTrendTypography, LeTrendGradients, LeTrendRadius } from '@/styles/letrend-design-system';

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log('[Admin Layout] Auth state:', {
      loading,
      hasUser: !!user,
      email: user?.email,
      hasProfile: !!profile,
      isAdmin: profile?.is_admin,
      role: profile?.role
    });

    if (!loading && !user) {
      console.log('[Admin Layout] No user, redirecting to login');
      router.push('/login?redirect=/admin');
      return;
    }

    // Enforce admin-only access
    if (!loading && user && !profile?.is_admin && profile?.role !== 'admin') {
      console.log('[Admin Layout] Not admin, redirecting home');
      router.push('/?error=admin_required');
    }
  }, [user, profile, loading, router]);

  // Show loading state
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8f9fa'
      }}>
        <div style={{ color: '#6b7280' }}>Laddar...</div>
      </div>
    );
  }

  // Block non-admin users
  if (!user || (!profile?.is_admin && profile?.role !== 'admin')) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8f9fa'
      }}>
        <div style={{
          textAlign: 'center',
          color: '#e53e3e'
        }}>
          <div style={{
            fontSize: '48px',
            marginBottom: '16px'
          }}>🔒</div>
          <div style={{
            fontSize: '18px',
            fontWeight: 600,
            marginBottom: '8px'
          }}>
            Endast för administratörer
          </div>
          <div style={{
            fontSize: '14px',
            color: '#9ca3af'
          }}>
            Du har inte behörighet att se denna sida.
          </div>
        </div>
      </div>
    );
  }

  // Render admin interface
  return (
    <div style={{
      minHeight: '100vh',
      background: LeTrendColors.cream
    }}>
      {/* Admin header */}
      <header style={{
        background: LeTrendGradients.brownPrimary,
        color: LeTrendColors.cream,
        padding: '16px 32px',
        borderBottom: `3px solid ${LeTrendColors.brownLight}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(74, 47, 24, 0.15)',
      }}>
        <div style={{
          fontSize: '20px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontFamily: LeTrendTypography.fontFamily.heading,
        }}>
          <img
            src="/lt-transparent.png"
            alt="LeTrend"
            style={{
              width: '32px',
              height: '32px',
              filter: 'brightness(0) invert(1)',
            }}
          />
          <span>LeTrend Admin</span>
        </div>

        <nav style={{
          display: 'flex',
          gap: '24px'
        }}>
          <a href="/admin" style={{
            color: 'rgba(250, 248, 245, 0.7)',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'color 0.2s',
            padding: '8px 12px',
            borderRadius: LeTrendRadius.md,
          }}>
            Dashboard
          </a>
          <a href="/admin/customers" style={{
            color: 'rgba(250, 248, 245, 0.7)',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'color 0.2s',
            padding: '8px 12px',
            borderRadius: LeTrendRadius.md,
          }}>
            Kunder
          </a>
          <a href="/admin/subscriptions" style={{
            color: 'rgba(250, 248, 245, 0.7)',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'color 0.2s',
            padding: '8px 12px',
            borderRadius: LeTrendRadius.md,
          }}>
            Prenumerationer
          </a>
          <a href="/admin/invoices" style={{
            color: 'rgba(250, 248, 245, 0.7)',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'color 0.2s',
            padding: '8px 12px',
            borderRadius: LeTrendRadius.md,
          }}>
            Fakturor
          </a>
          <a href="/admin/team" style={{
            color: 'rgba(250, 248, 245, 0.7)',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500,
            transition: 'color 0.2s',
            padding: '8px 12px',
            borderRadius: LeTrendRadius.md,
          }}>
            Team
          </a>
        </nav>

        <div style={{
          fontSize: '14px',
          color: 'rgba(250, 248, 245, 0.8)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span>{profile?.email}</span>
          <a href="/studio" style={{
            color: LeTrendColors.cream,
            textDecoration: 'none',
            fontSize: '13px',
            opacity: 0.9,
          }}>
            → Studio
          </a>
        </div>
      </header>

      {/* Main content */}
      <main style={{
        padding: '32px',
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
        {children}
      </main>
    </div>
  );
}
