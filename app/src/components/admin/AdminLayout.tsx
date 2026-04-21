'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  Users,
  UsersRound,
} from 'lucide-react';

const navItems = [
  { href: '/admin', label: 'Översikt', icon: LayoutDashboard, exact: true },
  { href: '/admin/customers', label: 'Kunder', icon: Users },
  {
    href: '/admin/billing',
    label: 'Billing',
    icon: CreditCard,
    matchers: ['/admin/invoices', '/admin/subscriptions', '/admin/billing-health'],
  },
  { href: '/admin/team', label: 'Team', icon: UsersRound },
];

function SidebarLink({
  href,
  label,
  icon: Icon,
  exact,
  matchers,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  exact?: boolean;
  matchers?: string[];
}) {
  const pathname = usePathname() ?? '';
  const isActive = exact
    ? pathname === href
    : pathname.startsWith(href) || (matchers ?? []).some((matcher) => pathname.startsWith(matcher));

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-accent text-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </Link>
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
    <div className="flex min-h-screen bg-background">
      <aside className="fixed left-0 top-0 z-50 flex h-screen w-60 flex-col border-r border-border bg-secondary">
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
                Admin
              </div>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {navItems.map((item) => (
            <SidebarLink key={item.href} {...item} />
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
            <span>Logga ut</span>
          </button>
        </div>
      </aside>

      <main className="ml-60 min-h-screen flex-1">
        <div className="max-w-[1080px] p-8">{children}</div>
      </main>
    </div>
  );
}
