'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useOverviewData } from '@/hooks/admin/useOverviewData';
import { deriveOverview } from '@/lib/admin/overview-derive';
import { attentionTimestamp } from '@/lib/admin-derive/attention';

export default function NotificationBell() {
  const pathname = usePathname() ?? '';
  const { data } = useOverviewData();

  const unreadCount = useMemo(() => {
    if (!data) return 0;

    const derived = deriveOverview(data);
    const lastSeenAt = data.attentionFeedSeenAt ? new Date(data.attentionFeedSeenAt) : null;

    if (!lastSeenAt) {
      return derived.attentionItems.length;
    }

    return derived.attentionItems.filter((item) => {
      const timestamp = attentionTimestamp(item);
      return timestamp ? +timestamp > +lastSeenAt : false;
    }).length;
  }, [data]);

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
          ? `${unreadCount} olasta notifications`
          : 'Oppna notifications'
      }
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1.5 py-0.5 text-center text-[10px] font-semibold text-destructive-foreground">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
