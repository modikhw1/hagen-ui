'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { resolveAppRole } from '@/lib/auth/navigation';

export default function AdminAuthShell({ children }: { children: ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const role = profile ? resolveAppRole(profile) : null;
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

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
    return <div className="p-10 text-sm text-muted-foreground">Laddar admin...</div>;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AdminLayout userEmail={user.email || 'admin'} onLogout={handleLogout}>
        {children}
      </AdminLayout>
    </QueryClientProvider>
  );
}
