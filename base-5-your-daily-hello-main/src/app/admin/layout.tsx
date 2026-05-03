'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AdminRealtimeBridge from '@/components/admin/AdminRealtimeBridge';
import AdminLayout from '@/components/admin/AdminLayout';
import { EnvBand } from '@/components/admin/ui/EnvBand';
import { useAuth } from '@/contexts/AuthContext';
import { SHELL_COPY } from '@/lib/admin/copy/shell-strings';
import { resolveAppRole } from '@/lib/auth/navigation';

export default function AdminAuthShell({ children }: { children: ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const role = profile ? resolveAppRole(profile) : null;
  useEffect(() => {
    if (!loading && (!user || (!profile?.is_admin && role !== 'admin'))) {
      router.replace('/login?redirect=/admin');
    }
  }, [loading, profile?.is_admin, role, router, user]);

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  if (loading || !user) {
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
