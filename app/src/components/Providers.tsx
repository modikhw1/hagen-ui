'use client';

import { ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProfileProvider } from '@/contexts/ProfileContext';

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/studio');

  return (
    <MantineProvider>
      <AuthProvider>
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
  );
}
