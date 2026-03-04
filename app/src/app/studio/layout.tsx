'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isStripeTestMode } from '@/lib/stripe/dynamic-config';
import { LeTrendColors, LeTrendTypography, LeTrendGradients, LeTrendRadius, LeTrendSpacing } from '@/styles/letrend-design-system';

// Studio-specific styles with LeTrend design
const studioStyles = {
  container: {
    minHeight: '100vh',
    background: LeTrendColors.cream,
  },
  header: {
    background: LeTrendGradients.brownPrimary,
    color: LeTrendColors.cream,
    padding: '16px 32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `3px solid ${LeTrendColors.brownLight}`,
    boxShadow: '0 2px 8px rgba(74, 47, 24, 0.15)',
  },
  logo: {
    fontSize: '20px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontFamily: LeTrendTypography.fontFamily.heading,
  },
  logoImage: {
    width: '32px',
    height: '32px',
    filter: 'brightness(0) invert(1)', // Make logo white
  },
  nav: {
    display: 'flex',
    gap: '24px',
  },
  navLink: {
    color: 'rgba(250, 248, 245, 0.7)', // Cream with opacity
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'color 0.2s',
    padding: '8px 12px',
    borderRadius: LeTrendRadius.md,
  },
  navLinkActive: {
    color: LeTrendColors.cream,
    background: 'rgba(250, 248, 245, 0.1)',
  },
  userInfo: {
    fontSize: '14px',
    color: 'rgba(250, 248, 245, 0.8)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  main: {
    padding: '32px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
};

interface StudioLayoutProps {
  children: ReactNode;
}

export default function StudioLayout({ children }: StudioLayoutProps) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login?redirect=/studio');
      return;
    }

    // Check for admin or content_manager role
    if (!loading && user) {
      const hasAccess = profile?.is_admin ||
                       profile?.role === 'admin' ||
                       profile?.role === 'content_manager';

      if (!hasAccess) {
        router.push('/?error=access_denied');
      }
    }
  }, [user, profile, loading, router]);

  // Show loading while checking auth
  if (loading) {
    return (
      <div style={{ ...studioStyles.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#6b7280' }}>Laddar...</div>
      </div>
    );
  }

  // Check role-based access
  const hasAccess = user && (
    profile?.is_admin ||
    profile?.role === 'admin' ||
    profile?.role === 'content_manager'
  );

  if (!user || !hasAccess) {
    return (
      <div style={{ ...studioStyles.container, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#6b7280', textAlign: 'center' }}>
          <div style={{ marginBottom: '8px' }}>⛔</div>
          <div>Åtkomst krävs</div>
          <div style={{ fontSize: '14px', marginTop: '4px' }}>Du måste vara admin för att visa Studio</div>
        </div>
      </div>
    );
  }

  return (
    <div style={studioStyles.container}>
      <header style={studioStyles.header}>
        <div style={studioStyles.logo}>
          <img
            src="/lt-transparent.png"
            alt="LeTrend"
            style={studioStyles.logoImage}
          />
          <span>LeTrend Studio</span>
        </div>
        <nav style={studioStyles.nav}>
          <a href="/studio" style={studioStyles.navLink}>Dashboard</a>
          <a href="/studio/concepts" style={studioStyles.navLink}>Koncept</a>
          <a href="/studio/customers" style={studioStyles.navLink}>Kunder</a>
          <a href="/studio/invoices" style={studioStyles.navLink}>Fakturor</a>
          <a href="/studio/upload" style={studioStyles.navLink}>Ladda upp</a>
        </nav>
        <div style={studioStyles.userInfo}>
          <span>{profile?.email}</span>
          {profile?.is_admin && (
            <a
              href="/admin"
              style={{
                color: LeTrendColors.cream,
                fontSize: '13px',
                textDecoration: 'none',
                opacity: 0.9,
              }}
            >
              → Admin
            </a>
          )}
        </div>
      </header>
      <main style={studioStyles.main}>
        {children}
      </main>
    </div>
  );
}
