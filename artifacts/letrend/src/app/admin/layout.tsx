'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from '@/lib/navigation-compat';
import AdminRealtimeBridge from '@/components/admin/AdminRealtimeBridge';
import AdminLayout from '@/components/admin/AdminLayout';
import { EnvBand } from '@/components/admin/ui/EnvBand';
import { useAuth } from '@/contexts/AuthContext';
import { SHELL_COPY } from '@/lib/admin/copy/shell-strings';
import { getPrimaryRouteForRole, resolveAppRole } from '@/lib/auth/navigation';

export default function AdminAuthShell({ children }: { children: ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const role = profile ? resolveAppRole(profile) : null;
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login?redirect=/admin');
      return;
    }
    // Profile still loading — wait one tick. We DON'T want to render admin
    // content for a non-admin while the profile fetch is in flight.
    if (!profile) return;
    if (role !== 'admin') {
      // Bug fix: previously passed `profile` (object) as the role argument
      // when role was null. Always pass a string role; fall back to '/'.
      const dest = role
        ? getPrimaryRouteForRole(role)
        : '/';
      router.replace(dest);
    }
  }, [loading, profile, role, router, user]);

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  // Gate the render: don't mount AdminLayout (and downstream admin queries)
  // until we have a confirmed admin profile. Prevents the preview-flash and
  // accidental data fetches by non-admins waiting on a redirect.
  if (loading || !user || !profile || role !== 'admin') {
    return <div className="p-10 text-sm text-muted-foreground">{SHELL_COPY.loadingShell}</div>;
  }

  return (
    <>
      <AdminRealtimeBridge />
      <AdminLayout userEmail={user.email || 'admin'} onLogout={handleLogout}>
        {children}
      </AdminLayout>
    </>
  );
}
