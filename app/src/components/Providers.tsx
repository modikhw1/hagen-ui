'use client';

import { ReactNode, useEffect, useState } from 'react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProfileProvider } from '@/contexts/ProfileContext';

export function Providers({ children }: { children: ReactNode }) {
  const [isAdminRoute, setIsAdminRoute] = useState(false);

  useEffect(() => {
    // Check if we're on admin or studio routes
    const pathname = window.location.pathname;
    setIsAdminRoute(pathname.startsWith('/admin') || pathname.startsWith('/studio'));
  }, []);

  return (
    <MantineProvider>
      <Notifications />
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
