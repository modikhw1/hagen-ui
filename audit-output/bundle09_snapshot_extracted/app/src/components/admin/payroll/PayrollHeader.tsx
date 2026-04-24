'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { PayrollResponse } from '@/lib/admin/schemas/payroll';

type Props = {
  period: PayrollResponse['period'];
  availablePeriods: PayrollResponse['available_periods'];
};

export function PayrollHeader({ period, availablePeriods }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? '/admin/payroll';
  const searchParams = useSearchParams();

  const handlePeriodChange = (nextPeriod: string) => {
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    if (nextPeriod === period.key) {
      next.delete('period');
    } else {
      next.set('period', nextPeriod);
    }

    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">Payroll</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Periodiserat ersattningsunderlag for billingperioden {period.label}.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={searchParams?.get('period') ?? period.key}
          onChange={(event) => handlePeriodChange(event.target.value)}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          {availablePeriods.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
        <Link
          href="/admin/team"
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Till teamvyn
        </Link>
      </div>
    </div>
  );
}
