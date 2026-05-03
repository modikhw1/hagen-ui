// app/src/components/admin/customers/CustomersTable.tsx

'use client';

import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import Link from 'next/link';
import { ArrowUpDown, ChevronDown, ChevronUp, Clock, PauseCircle, Users } from 'lucide-react';
import AdminAvatar from '@/components/admin/AdminAvatar';
import EmptyState from '@/components/admin/ui/EmptyState';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { customerStatusConfig } from '@/lib/admin/labels';
import { formatSek } from '@/lib/admin/money';
import { cmColorVar } from '@/lib/admin/teamPalette';
import { shortDateSv } from '@/lib/admin/time';
import type { AdminCustomerListItem, CustomerListSort } from '@/lib/admin/customers/list.types';
import { CustomerPulsePill } from './CustomerPulsePill';

interface CustomersTableProps {
  items: AdminCustomerListItem[];
  isPending: boolean;
  onMutated: () => void;
  onLocalPatch: (id: string, patch: Partial<AdminCustomerListItem>) => void;
  currentSort: CustomerListSort;
  onSortChange: (sort: CustomerListSort) => void;
}

interface SortIconProps {
  currentSort: CustomerListSort;
  field: 'name' | 'cm' | 'price' | 'status';
}

const DAY_NAMES: Record<string, string> = {
  '0': 'Man',
  '1': 'Tis',
  '2': 'Ons',
  '3': 'Tor',
  '4': 'Fre',
  '5': 'Lor',
  '6': 'Son',
};

function SortIcon({ currentSort, field }: SortIconProps) {
  const isActive = currentSort.startsWith(field);

  if (!isActive) {
    return <ArrowUpDown size={12} className="ml-1 opacity-0 transition-opacity group-hover:opacity-50" />;
  }

  return currentSort.endsWith('asc') ? (
    <ChevronUp size={12} className="ml-1 text-primary" />
  ) : (
    <ChevronDown size={12} className="ml-1 text-primary" />
  );
}

export function CustomersTable({ items, isPending, currentSort, onSortChange }: CustomersTableProps) {
  const handleSort = (field: 'name' | 'cm' | 'price' | 'status') => {
    const asc = `${field}_asc` as CustomerListSort;
    const desc = `${field}_desc` as CustomerListSort;

    if (currentSort === asc) onSortChange(desc);
    else if (currentSort === desc) onSortChange('recent');
    else onSortChange(asc);
  };

  if (items.length === 0 && !isPending) {
    return (
      <div className="rounded-lg border border-border bg-card p-12">
        <EmptyState
          icon={Users}
          title="Inga kunder hittades"
          hint="Prova att andra dina filter eller sokord for att hitta det du letar efter."
        />
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-lg border border-border bg-card transition-opacity ${
        isPending ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <div className="grid grid-cols-[2.5fr_1fr_1fr_120px_120px] gap-4 border-b border-border bg-muted/50 px-5 py-3 text-[11px] font-semibold tracking-wider text-muted-foreground select-none uppercase">
        <button
          onClick={() => handleSort('name')}
          type="button"
          className="group flex cursor-pointer items-center bg-transparent p-0 text-left text-[11px] font-semibold tracking-wider text-muted-foreground transition-colors hover:text-foreground uppercase"
        >
          FÖRETAG <SortIcon currentSort={currentSort} field="name" />
        </button>
        <button
          onClick={() => handleSort('cm')}
          type="button"
          className="group flex cursor-pointer items-center bg-transparent p-0 text-left text-[11px] font-semibold tracking-wider text-muted-foreground transition-colors hover:text-foreground uppercase"
        >
          CM <SortIcon currentSort={currentSort} field="cm" />
        </button>
        <button
          onClick={() => handleSort('price')}
          type="button"
          className="group flex cursor-pointer items-center bg-transparent p-0 text-[11px] font-semibold tracking-wider text-muted-foreground transition-colors hover:text-foreground uppercase"
        >
          PRIS <SortIcon currentSort={currentSort} field="price" />
        </button>
        <div className="text-center uppercase">OPERATIV PULS</div>
        <button
          onClick={() => handleSort('status')}
          type="button"
          className="group flex cursor-pointer items-center bg-transparent p-0 text-[11px] font-semibold tracking-wider text-muted-foreground transition-colors hover:text-foreground uppercase"
        >
          STATUS <SortIcon currentSort={currentSort} field="status" />
        </button>
      </div>

      <div className="divide-y divide-border">
        {items.map((customer) => {
          const statusConfig = customerStatusConfig(customer.status);
          const hasAssignedCm = Boolean(customer.cm_full_name && customer.cm_full_name.trim().length > 0);
          const cmDisplayName = hasAssignedCm ? customer.cm_full_name!.split(' ')[0] : 'Ej tilldelad';
          const planned = customer.planned_concepts_count ?? 0;
          const lastCmAction = customer.last_cm_action_at ? new Date(customer.last_cm_action_at) : null;
          const pulseStatus = customer.pulse_status ?? 'ok';
          const reason = customer.pulse_reason ?? 'Allt rullar på som det ska';

          const scheduleLabels = (customer.upload_schedule ?? ['1', '4'])
            .sort()
            .map((day) => DAY_NAMES[day] || day)
            .join(', ');

          return (
            <Link
              key={customer.id}
              href={`/admin/customers/${customer.id}`}
              prefetch={false}
              className="grid min-h-[64px] grid-cols-[2.5fr_1fr_1fr_120px_120px] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/50"
            >
              <div>
                <div className="text-sm font-semibold text-foreground">{customer.business_name}</div>
                <div className="truncate text-[11px] text-muted-foreground">{customer.contact_email}</div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <AdminAvatar
                    name={cmDisplayName}
                    avatarUrl={hasAssignedCm ? customer.cm_avatar_url : null}
                    size="sm"
                    fallbackColor={
                      hasAssignedCm && customer.account_manager_profile_id
                        ? `hsl(var(--${cmColorVar(customer.account_manager_profile_id)}))`
                        : undefined
                    }
                  />
                  <div className="flex flex-col">
                    <span className={`text-xs font-medium ${hasAssignedCm ? 'text-foreground' : 'text-muted-foreground italic'}`}>{cmDisplayName}</span>
                    {customer.scheduled_cm_change && (
                      <div className="mt-0.5 flex items-center gap-0.5 text-[9px] leading-none font-semibold text-blue-600">
                        <Clock className="h-2.5 w-2.5" />
                        {shortDateSv(customer.scheduled_cm_change.effective_date)}
                      </div>
                    )}
                  </div>
                </div>
                {customer.paused_until && (
                  <div className="flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-orange-700">
                    <PauseCircle className="h-2.5 w-2.5" />
                    Paus
                  </div>
                )}
              </div>

              <div className="text-sm font-semibold text-foreground">
                {formatSek(customer.monthly_price ? customer.monthly_price * 100 : 0)}
              </div>

              <div className="flex justify-center">
                <CustomerPulsePill
                  status={pulseStatus}
                  reason={reason}
                  detail={{
                    lastPublishedAt: shortDateSv(customer.last_published_at),
                    lastCmActionAt: lastCmAction ? format(lastCmAction, 'd MMM', { locale: sv }) : 'Aldrig',
                    pendingConcepts: planned,
                    barLabel: scheduleLabels,
                  }}
                />
              </div>

              <div>
                <StatusPill
                  label={statusConfig.label}
                  tone={
                    statusConfig.className.includes('success')
                      ? 'success'
                      : statusConfig.className.includes('danger')
                        ? 'danger'
                        : statusConfig.className.includes('warning')
                          ? 'warning'
                          : statusConfig.className.includes('info')
                            ? 'info'
                            : 'neutral'
                  }
                  size="xs"
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
