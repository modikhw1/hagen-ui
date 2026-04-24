'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Send,
  ShieldCheck,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import NotificationBell from '@/components/admin/NotificationBell';
import {
  AdminPageActionsSlot,
  AdminPageHeaderProvider,
  AdminPageHeaderSlot,
} from '@/admin-ui';
import { EnvBand } from '@/components/admin/ui/EnvBand';
import { Button } from '@/components/ui/button';
import { SHELL_COPY } from '@/lib/admin/copy/shell-strings';
import { isRouteActive, type RouteMatcherItem } from '@/lib/admin/navigation/active';
import { prefetchSection } from '@/lib/admin/navigation/prefetch';

type NavItem = RouteMatcherItem & {
  href: string;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { href: '/admin', label: SHELL_COPY.overview, icon: LayoutDashboard, exact: true },
  { href: '/admin/customers', label: SHELL_COPY.customers, icon: Users },
  {
    href: '/admin/billing',
    label: SHELL_COPY.billing,
    icon: CreditCard,
    matchers: ['/admin/invoices', '/admin/subscriptions', '/admin/billing-health'],
  },
  {
    href: '/admin/team',
    label: SHELL_COPY.team,
    icon: UsersRound,
    matchers: ['/admin/team/payroll'],
  },
  { href: '/admin/demos', label: SHELL_COPY.demos, icon: Send },
  {
    href: '/admin/notifications',
    label: SHELL_COPY.notifications,
    icon: Bell,
  },
  {
    href: '/admin/settings',
    label: SHELL_COPY.ops,
    icon: ShieldCheck,
    matchers: ['/admin/payroll', '/admin/audit-log'],
  },
];

function SidebarLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const isActive = isRouteActive(pathname, item);

  return (
    <Link
      href={item.href}
      prefetch
      onMouseEnter={() => prefetchSection(item.href, router)}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      }`}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

function SidebarContent({
  userEmail,
  onLogout,
  onNavigate,
}: {
  userEmail: string;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <span className="text-xs font-bold text-primary-foreground">LT</span>
          </div>
          <div>
            <div className="font-heading text-base font-semibold leading-tight text-foreground">
              LeTrend
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {SHELL_COPY.adminBadge}
            </div>
          </div>
        </div>
      </div>

      <nav aria-label={SHELL_COPY.adminNavigationAria} className="flex flex-1 flex-col gap-1 px-3 py-4">
        {navItems.map((item) => (
          <SidebarLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="space-y-2 border-t border-border px-3 py-4">
        <div className="rounded-md bg-accent/50 px-3 py-2">
          <div className="truncate text-xs font-medium text-foreground">admin</div>
          <div className="truncate text-[11px] text-muted-foreground">{userEmail}</div>
        </div>
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>{SHELL_COPY.logout}</span>
        </button>
      </div>
    </>
  );
}

function AdminLayoutFrame({
  children,
  userEmail,
  onLogout,
}: {
  children: ReactNode;
  userEmail: string;
  onLogout: () => void;
}) {
  const pathname = usePathname() ?? '';
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentNavItem = useMemo(
    () => navItems.find((item) => isRouteActive(pathname, item)) ?? navItems[0],
    [pathname],
  );

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {SHELL_COPY.skipToContent}
      </a>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label={SHELL_COPY.closeMenu}
            className="absolute inset-0 bg-foreground/30"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
          <aside className="absolute left-0 top-0 flex h-full w-60 flex-col border-r border-border bg-secondary shadow-xl">
            <div className="flex items-center justify-end px-3 py-3">
              <Button
                aria-label={SHELL_COPY.closeMenu}
                onClick={() => setMobileOpen(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarContent
              userEmail={userEmail}
              onLogout={onLogout}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <aside className="fixed left-0 top-0 hidden h-screen w-60 flex-col border-r border-border bg-secondary lg:flex">
        <SidebarContent userEmail={userEmail} onLogout={onLogout} />
      </aside>

      <main className="min-h-screen flex-1 lg:ml-60">
        <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
          <EnvBand />
          <div className="flex max-w-[1080px] items-center gap-3 px-4 py-4 sm:px-8">
            <Button
              aria-label={SHELL_COPY.openMenu}
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <AdminPageHeaderSlot fallbackTitle={currentNavItem.label} />
            <div className="ml-auto flex items-center gap-2">
              <AdminPageActionsSlot />
              <NotificationBell />
            </div>
          </div>
        </header>
        <div className="max-w-[1080px] p-4 sm:p-8" id="main-content">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function AdminLayout({
  children,
  userEmail,
  onLogout,
}: {
  children: ReactNode;
  userEmail: string;
  onLogout: () => void;
}) {
  return (
    <AdminPageHeaderProvider>
      <AdminLayoutFrame userEmail={userEmail} onLogout={onLogout}>
        {children}
      </AdminLayoutFrame>
    </AdminPageHeaderProvider>
  );
}
