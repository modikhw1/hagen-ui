'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useNotificationsUnreadCount } from '@/hooks/admin/useNotifications';
import { SHELL_COPY } from '@/lib/admin/copy/shell-strings';

export default function NotificationBell() {
  const pathname = usePathname() ?? '';
  const { data } = useNotificationsUnreadCount();
  const unreadCount = data?.count ?? 0;

  const isActive = pathname.startsWith('/admin/notifications');

  return (
    <Link
      href="/admin/notifications"
      className={`relative inline-flex items-center justify-center rounded-full border p-2.5 transition-colors ${
        isActive
          ? 'border-primary/30 bg-primary/5 text-primary'
          : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
      aria-label={
        unreadCount > 0
          ? SHELL_COPY.unreadAria(unreadCount)
          : SHELL_COPY.openNotifications
      }
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 ? (
        <span
          aria-live="polite"
          className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1.5 py-0.5 text-center text-[10px] font-semibold text-destructive-foreground"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
