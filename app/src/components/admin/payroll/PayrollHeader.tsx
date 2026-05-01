'use client';

import Link from 'next/link';
import { Download } from 'lucide-react';
import { Button, Select, Tooltip } from '@mantine/core';
import { useUrlState } from '@/hooks/useUrlState';
import type { PayrollResponse } from '@/lib/admin/schemas/payroll';
import { PageHeader } from '@/components/admin/ui/layout/PageHeader';

type Props = {
  period: PayrollResponse['period'];
  availablePeriods: PayrollResponse['available_periods'];
};

export function PayrollHeader({ period, availablePeriods }: Props) {
  const { get, set } = useUrlState();
  const selectedPeriod = get('period') ?? period.key;

  const exportHref = `/api/admin/payroll/export?${new URLSearchParams({ period: selectedPeriod }).toString()}`;

  return (
    <PageHeader
      title="Payroll"
      subtitle={`Periodiserat ersättningsunderlag för billingperioden ${period.label}.`}
      actions={
        <>
          <Select
            value={selectedPeriod}
            onChange={(nextPeriod) => {
              set({ period: nextPeriod === period.key ? null : nextPeriod });
            }}
            data={availablePeriods.map((item) => ({
              value: item.key,
              label: item.label,
            }))}
            className="w-[200px]"
            size="sm"
          />

          <Button
            component="a"
            href={exportHref}
            variant="ghost"
            size="sm"
            leftSection={<Download className="h-4 w-4" />}
          >
            Exportera CSV
          </Button>

          <Tooltip
            label="Payroll-perioden använder samma underlag som teamets coverage och handovers."
            withArrow
          >
            <Button
              component={Link}
              href="/admin/team"
              variant="outline"
              size="sm"
            >
              Till teamvyn
            </Button>
          </Tooltip>
        </>
      }
    />
  );
}
