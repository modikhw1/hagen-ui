'use client';

import { ReactNode } from 'react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { AuthProvider } from '@/contexts/AuthContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider>
      <Notifications />
      <AuthProvider>
        {children}
      </AuthProvider>
    </MantineProvider>
  );
}
