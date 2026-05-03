'use client';

import { ReactNode, Suspense, useEffect } from 'react';
import { Link } from 'wouter';
import { ShieldCheck } from 'lucide-react';
import { useRouter } from '@/lib/navigation-compat';
import { useAuth } from '@/contexts/AuthContext';
import { getPrimaryRouteForRole, resolveAppRole } from '@/lib/auth/navigation';
import { AppShell, type AppShellNavItem } from '@/components/admin/AdminLayout';
import { STUDIO_SHELL_NAV_ITEMS } from '@/lib/studio/navigation';

const studioNavItems: AppShellNavItem[] = STUDIO_SHELL_NAV_ITEMS.map((item) => ({
  href: item.href,
  label: item.label,
  icon: item.icon,
}));

const containerStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#6b7280',
} as const;

interface StudioLayoutProps {
  children: ReactNode;
}

export default function StudioLayout({ children }: StudioLayoutProps) {
  return (
    <Suspense fallback={<div style={containerStyle}>Laddar...</div>}>
      <StudioLayoutContent>{children}</StudioLayoutContent>
    </Suspense>
  );
}

function StudioLayoutContent({ children }: StudioLayoutProps) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const role = profile ? resolveAppRole(profile) : null;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login?redirect=/studio');
      return;
    }
    if (!profile) return;

    const hasAccess = role === 'admin' || role === 'content_manager';
    if (!hasAccess) {
      const isMobileCustomer = typeof window !== 'undefined' && window.innerWidth < 768;
      router.replace(getPrimaryRouteForRole(role ?? profile, {
        surface: isMobileCustomer ? 'mobile' : 'desktop',
      }));
    }
  }, [loading, profile, role, router, user]);

  if (loading) {
    return <div style={containerStyle}>Laddar...</div>;
  }

  const hasAccess = Boolean(
    user && (
      profile?.is_admin ||
      role === 'admin' ||
      role === 'content_manager'
    )
  );

  if (!user || !hasAccess) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 600 }}>Åtkomst krävs</div>
          <div style={{ fontSize: '14px', marginTop: '4px' }}>
            Studio är tillgängligt för admins och content managers.
          </div>
        </div>
      </div>
    );
  }

  const isAdmin = Boolean(profile?.is_admin || role === 'admin');

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  const adminLink = isAdmin ? (
    <Link
      to="/admin"
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
    >
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">Öppna admin</span>
    </Link>
  ) : null;

  return (
    <AppShell
      userEmail={user.email || 'studio'}
      onLogout={handleLogout}
      navItems={studioNavItems}
      brandLabel="LeTrend"
      brandSubLabel="Studio"
      roleBadgeLabel={isAdmin ? 'admin' : 'content manager'}
      navAriaLabel="Studio-navigering"
      collapsedStorageKey="studio:shell:collapsed"
      showNotificationBell={false}
      extraFooterAction={adminLink}
    >
      {children}
    </AppShell>
  );
}
