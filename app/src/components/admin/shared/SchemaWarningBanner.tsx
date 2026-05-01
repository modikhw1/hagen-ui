'use client';

import { Alert, Stack } from '@mantine/core';
import { AlertTriangle } from 'lucide-react';

interface SchemaWarningBannerProps {
  warnings?: string[] | null;
}

const warningCopy: Record<string, string> = {
  'team-overview-degraded': 'Teamoversikten är tillfälligt degraderad. Visa datan med försiktighet.',
  'customer-detail-rpc-fallback': 'Kunddetalj kör i fallback-läge. Vissa fält kan vara fördröjda.',
  'billing-view-fallback': 'Billing-vyn visar fallback-data. Kontrollera migreringar och vyer.',
};

export function SchemaWarningBanner({ warnings }: SchemaWarningBannerProps) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <Stack gap="xs" mb="md">
      {warnings.map((code) => (
        <Alert
          key={code}
          variant="light"
          color="yellow"
          title="Systemvarning"
          icon={<AlertTriangle size={16} />}
        >
          {warningCopy[code] ?? code}
        </Alert>
      ))}
    </Stack>
  );
}
