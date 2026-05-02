'use client';

import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { Toaster } from 'sonner';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { ObservabilityProvider } from '@/components/ObservabilityProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProfileProvider } from '@/contexts/ProfileContext';
import { ApiError } from '@/lib/admin/api-client';

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/studio');
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: (failureCount, error) =>
              error instanceof ApiError
                ? error.status >= 500 && failureCount < 2
                : failureCount < 2,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4_000),
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <Toaster richColors position="top-right" />
        <AuthProvider>
          <ObservabilityProvider />
          {isAdminRoute ? (
            // Admin/Studio routes don't need ProfileProvider (customer-facing context)
            children
          ) : (
            // Customer-facing routes use ProfileProvider for demo mode and user concepts
            <ProfileProvider>
              {children}
            </ProfileProvider>
          )}
        </AuthProvider>
      </MantineProvider>
    </QueryClientProvider>
  );
}
