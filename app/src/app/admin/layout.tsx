'use client';

import { ReactNode, useRef, memo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePathname } from 'next/navigation';
import { LeTrendColors, LeTrendTypography, LeTrendRadius } from '@/styles/letrend-design-system';
import Link from 'next/link';

interface AdminLayoutProps {
  children: ReactNode;
}

const SIDEBAR_WIDTH = 240;

const navItems: { href: string; label: string; exact?: boolean }[] = [
  { href: '/admin/customers', label: 'Kunder' },
  { href: '/admin/team', label: 'Team' },
  { href: '/admin/invoices', label: 'Fakturor' },
  { href: '/admin/subscriptions', label: 'Abonnemang' },
];

const AdminSidebar = memo(function AdminSidebar({ pathname, user, profile, signOut }: {
  pathname: string;
  user: { email?: string } | null;
  profile: { email?: string; is_admin?: boolean; role?: string } | null;
  signOut: () => void;
}) {
  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <aside style={{
      width: SIDEBAR_WIDTH,
      background: '#f8f7f5',
      color: '#1a1a1a',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0,
      left: 0,
      height: '100vh',
      zIndex: 100,
      borderRight: '1px solid #e5e4e1',
    }}>
      <div style={{ padding: '20px', borderBottom: '1px solid #e5e4e1' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/lt-transparent.png" alt="LeTrend" style={{ width: '28px', height: '28px' }} />
          <div>
            <div style={{ fontSize: '16px', fontWeight: 600, fontFamily: LeTrendTypography.fontFamily.heading, lineHeight: 1.2, color: '#1a1a1a' }}>LeTrend</div>
            <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Admin</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'block',
              padding: '10px 12px',
              borderRadius: LeTrendRadius.md,
              fontSize: '14px',
              fontWeight: 500,
              textDecoration: 'none',
              color: active ? '#1a1a1a' : '#666',
              background: active ? '#f0efe9' : 'transparent',
              transition: 'all 0.15s ease',
            }}>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: '16px 12px', borderTop: '1px solid #e5e4e1' }}>
        <Link href="/studio" style={{
          display: 'block',
          padding: '10px 12px',
          borderRadius: LeTrendRadius.md,
          fontSize: '13px',
          fontWeight: 500,
          textDecoration: 'none',
          color: '#666',
          marginBottom: '12px',
          border: '1px solid #ddd',
          textAlign: 'center',
          transition: 'all 0.15s ease',
        }}>
          Gå till Studio
        </Link>

        <div style={{ padding: '8px 12px', borderRadius: LeTrendRadius.md, background: '#f5f4f1', marginBottom: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: '#333', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {profile?.email?.split('@')[0] || user?.email?.split('@')[0]}
          </div>
          <div style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.email}
          </div>
        </div>

        <button onClick={() => signOut()} style={{
          display: 'block',
          width: '100%',
          padding: '8px 12px',
          borderRadius: LeTrendRadius.md,
          fontSize: '13px',
          fontWeight: 500,
          color: '#888',
          background: 'transparent',
          border: '1px solid #e5e4e1',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}>
          Logga ut
        </button>
      </div>
    </aside>
  );
});

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, profile, authLoading, profileLoading, signOut } = useAuth();
  const pathname = usePathname();
  const hasVerifiedRef = useRef(false);

  const metadataRole = typeof user?.user_metadata?.role === 'string' ? user.user_metadata.role : null;
  const metadataIsAdmin = metadataRole === 'admin' || user?.user_metadata?.is_admin === true;
  const hasAccess = !!user && (profile?.is_admin || profile?.role === 'admin' || (!profile && metadataIsAdmin));
  const loading = authLoading || profileLoading;

  if (!loading && hasAccess) {
    hasVerifiedRef.current = true;
  }

  if (loading && !hasVerifiedRef.current) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: LeTrendColors.cream,
      }}>
        <div style={{ color: LeTrendColors.textMuted }}>Verifierar behörighet...</div>
      </div>
    );
  }

  if (!loading && !hasAccess) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: LeTrendColors.cream,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3 }}>🔒</div>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: LeTrendColors.textPrimary }}>
            Endast för administratörer
          </div>
          <div style={{ fontSize: '14px', color: LeTrendColors.textMuted }}>
            Du har inte behörighet att se denna sida.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: LeTrendColors.cream,
      display: 'flex',
    }}>
      <AdminSidebar pathname={pathname} user={user} profile={profile} signOut={signOut} />
      <main style={{
        flex: 1,
        marginLeft: SIDEBAR_WIDTH,
        minHeight: '100vh',
        padding: '32px',
      }}>
        {children}
      </main>
    </div>
  );
}
