'use client';

import Link from 'next/link';
import { Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
            onValueChange={(nextPeriod) => {
              set({ period: nextPeriod === period.key ? null : nextPeriod });
            }}
          >
            <SelectTrigger className="w-[200px] bg-card h-9">
              <SelectValue placeholder="Välj period" />
            </SelectTrigger>
            <SelectContent>
              {availablePeriods.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <a
            href={exportHref}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            <Download className="h-4 w-4" />
            Exportera CSV
          </a>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/admin/team"
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  Till teamvyn
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                Payroll-perioden använder samma underlag som teamets coverage och handovers.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </>
      }
    />
  );
}
