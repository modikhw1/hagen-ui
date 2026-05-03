'use client';

import { ReactNode, Suspense, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { resolveAppRole } from '@/lib/auth/navigation';
import {
  buildStudioWorkspaceHref,
  getStudioWorkspaceSection,
  STUDIO_SHELL_NAV_ITEMS,
  STUDIO_WORKSPACE_SECTIONS,
} from '@/lib/studio/navigation';
import {
  LeTrendColors,
  LeTrendGradients,
  LeTrendTypography,
} from '@/styles/letrend-design-system';

const studioStyles = {
  container: {
    minHeight: '100vh',
    background: LeTrendColors.cream,
  },
  header: {
    background: LeTrendGradients.brownPrimary,
    color: LeTrendColors.cream,
    padding: '24px 32px 18px',
    borderBottom: `3px solid ${LeTrendColors.brownLight}`,
    boxShadow: '0 2px 8px rgba(74, 47, 24, 0.15)',
  },
  headerContent: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '24px',
    marginBottom: '18px',
  },
  brandBlock: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  eyebrow: {
    fontSize: '11px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    color: 'rgba(250, 248, 245, 0.72)',
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
    filter: 'brightness(0) invert(1)',
  },
  subtitle: {
    fontSize: '13px',
    color: 'rgba(250, 248, 245, 0.8)',
    maxWidth: '560px',
  },
  navBlock: {
    display: 'grid',
    gap: '14px',
  },
  navGroupLabel: {
    fontSize: '11px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'rgba(250, 248, 245, 0.56)',
    marginBottom: '8px',
  },
  nav: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap' as const,
  },
  navLink: {
    color: 'rgba(250, 248, 245, 0.72)',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'color 0.2s, background 0.2s',
    padding: '9px 14px',
    borderRadius: 999,
    border: '1px solid rgba(250, 248, 245, 0.12)',
  },
  navLinkActive: {
    color: LeTrendColors.cream,
    background: 'rgba(250, 248, 245, 0.14)',
    border: '1px solid rgba(250, 248, 245, 0.2)',
  },
  workspaceNav: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid rgba(250, 248, 245, 0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap' as const,
  },
  workspaceMeta: {
    display: 'grid',
    gap: '4px',
  },
  workspaceLinks: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  userInfo: {
    fontSize: '14px',
    color: 'rgba(250, 248, 245, 0.8)',
    display: 'flex',
    alignItems: 'flex-end',
    flexDirection: 'column' as const,
    gap: '6px',
    textAlign: 'right' as const,
  },
  adminLink: {
    color: LeTrendColors.cream,
    fontSize: '12px',
    textDecoration: 'none',
    opacity: 0.88,
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid rgba(250, 248, 245, 0.14)',
  },
  userActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
    justifyContent: 'flex-end',
  },
  actionButton: {
    color: LeTrendColors.cream,
    fontSize: '12px',
    background: 'transparent',
    textDecoration: 'none',
    opacity: 0.88,
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid rgba(250, 248, 245, 0.14)',
    cursor: 'pointer',
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

function isActiveRoute(pathname: string, href: string) {
  if (href === '/studio') {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function StudioLayout({ children }: StudioLayoutProps) {
  return (
    <Suspense fallback={<StudioLayoutFallback />}>
      <StudioLayoutContent>{children}</StudioLayoutContent>
    </Suspense>
  );
}

function StudioLayoutContent({ children }: StudioLayoutProps) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const role = profile ? resolveAppRole(profile) : null;

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login?redirect=/studio/customers');
      return;
    }

    if (!loading && user) {
      const hasAccess = Boolean(
        profile?.is_admin ||
        role === 'admin' ||
        role === 'content_manager'
      );

      if (!hasAccess) {
        router.replace('/feed?error=studio_access_denied');
      }
    }
  }, [loading, profile, role, router, user]);

  if (loading) {
    return (
      <div
        style={{
          ...studioStyles.container,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ color: '#6b7280' }}>Laddar...</div>
      </div>
    );
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
      <div
        style={{
          ...studioStyles.container,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ color: '#6b7280', textAlign: 'center' }}>
          <div style={{ fontWeight: 600 }}>Åtkomst krävs</div>
          <div style={{ fontSize: '14px', marginTop: '4px' }}>
            Studio är tillgängligt för admins och content managers.
          </div>
        </div>
      </div>
    );
  }

  const primaryNavItems = STUDIO_SHELL_NAV_ITEMS.filter((item) => item.kind === 'primary');
  const utilityNavItems = STUDIO_SHELL_NAV_ITEMS.filter((item) => item.kind === 'utility');
  const workspaceMatch = pathname.match(/^\/studio\/customers\/([^/]+)$/);
  const workspaceCustomerId = workspaceMatch?.[1] ?? null;
  const workspaceSection = getStudioWorkspaceSection(searchParams?.get('section'));
  const isAdmin = Boolean(profile?.is_admin || role === 'admin');

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  return (
    <div style={studioStyles.container}>
      <header style={studioStyles.header}>
        <div style={studioStyles.headerContent}>
          <div style={studioStyles.brandBlock}>
            <div style={studioStyles.eyebrow}>Studio workspace</div>
            <div style={studioStyles.logo}>
              <Image src="/lt-transparent.png" alt="LeTrend" width={32} height={32} style={studioStyles.logoImage} />
              <span>LeTrend Studio</span>
            </div>
            <div style={studioStyles.subtitle}>
              Kundarbete, koncept, feed-planering och handoff hör ihop här. Admin ligger separat för orgnivå och drift.
            </div>
          </div>

          <div style={studioStyles.userInfo}>
            <span>{profile?.email}</span>
            {isAdmin && (
              <Link href="/admin" style={studioStyles.adminLink}>
                Öppna admin
              </Link>
            )}
            <button type="button" onClick={() => void handleLogout()} style={studioStyles.actionButton}>
              Logga ut
            </button>
          </div>
        </div>

        <div style={studioStyles.navBlock}>
          <div>
            <div style={studioStyles.navGroupLabel}>Arbetsyta</div>
            <nav style={studioStyles.nav}>
              {primaryNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    ...studioStyles.navLink,
                    ...(isActiveRoute(pathname, item.href) ? studioStyles.navLinkActive : {}),
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div>
            <div style={studioStyles.navGroupLabel}>Verktyg</div>
            <nav style={studioStyles.nav}>
              {utilityNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    ...studioStyles.navLink,
                    ...(isActiveRoute(pathname, item.href) ? studioStyles.navLinkActive : {}),
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        {workspaceCustomerId && (
          <div style={studioStyles.workspaceNav}>
            <div style={studioStyles.workspaceMeta}>
              <Link href="/studio/customers" style={studioStyles.adminLink}>
                Till kundlista
              </Link>
              <div style={{ fontSize: '13px', color: 'rgba(250, 248, 245, 0.78)' }}>
                Hoppa mellan delarna i kundarbetsytan
              </div>
            </div>

            <div style={studioStyles.workspaceLinks}>
              {STUDIO_WORKSPACE_SECTIONS.filter((s) => s.kind === 'primary').map((section) => (
                <Link
                  key={section.key}
                  href={buildStudioWorkspaceHref(workspaceCustomerId, section.key)}
                  style={{
                    ...studioStyles.navLink,
                    ...(workspaceSection === section.key ? studioStyles.navLinkActive : {}),
                  }}
                >
                  {section.short_label}
                </Link>
              ))}
              <span style={{ opacity: 0.25, alignSelf: 'center', fontSize: '12px', padding: '0 2px' }}>|</span>
              {STUDIO_WORKSPACE_SECTIONS.filter((s) => s.kind === 'utility').map((section) => (
                <Link
                  key={section.key}
                  href={buildStudioWorkspaceHref(workspaceCustomerId, section.key)}
                  style={{
                    ...studioStyles.navLink,
                    ...(workspaceSection === section.key ? studioStyles.navLinkActive : {}),
                    opacity: workspaceSection === section.key ? 1 : 0.5,
                    fontSize: '12px',
                  }}
                >
                  {section.short_label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      <main style={studioStyles.main}>{children}</main>
    </div>
  );
}

function StudioLayoutFallback() {
  return (
    <div
      style={{
        ...studioStyles.container,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ color: '#6b7280' }}>Laddar...</div>
    </div>
  );
}
