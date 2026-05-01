// app/src/components/admin/customers/CustomersTable.tsx

'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Users, Clock, PauseCircle, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';
import AdminAvatar from '@/components/admin/AdminAvatar';
import EmptyState from '@/components/admin/ui/EmptyState';
import { StatusPill } from '@/components/admin/ui/StatusPill';
import { CustomerPulsePill } from './CustomerPulsePill';
import { customerStatusConfig } from '@/lib/admin/labels';
import { cmColorVar } from '@/lib/admin/teamPalette';
import { formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';
import type { AdminCustomerListItem, CustomerListSort } from '@/lib/admin/customers/list.types';

interface CustomersTableProps {
  items: AdminCustomerListItem[];
  isPending: boolean;
  onMutated: () => void;
  onLocalPatch: (id: string, patch: Partial<AdminCustomerListItem>) => void;
  currentSort: CustomerListSort;
  onSortChange: (sort: CustomerListSort) => void;
}

const DAY_NAMES: Record<string, string> = {
  '0': 'Mån', '1': 'Tis', '2': 'Ons', '3': 'Tor', '4': 'Fre', '5': 'Lör', '6': 'Sön',
};

export function CustomersTable({ items, isPending, currentSort, onSortChange }: CustomersTableProps) {
  const handleSort = (field: 'name' | 'cm' | 'price' | 'status') => {
    const asc = `${field}_asc` as CustomerListSort;
    const desc = `${field}_desc` as CustomerListSort;

    if (currentSort === asc) onSortChange(desc);
    else if (currentSort === desc) onSortChange('recent');
    else onSortChange(asc);
  };

  const SortIcon = ({ field }: { field: 'name' | 'cm' | 'price' | 'status' }) => {
    const isActive = currentSort.startsWith(field);
    if (!isActive) return <ArrowUpDown size={12} className="ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />;
    return currentSort.endsWith('asc') 
      ? <ChevronUp size={12} className="ml-1 text-primary" /> 
      : <ChevronDown size={12} className="ml-1 text-primary" />;
  };

  if (items.length === 0 && !isPending) {
    return (
      <div className="rounded-lg border border-border bg-card p-12">
        <EmptyState
          icon={Users}
          title="Inga kunder hittades"
          hint="Prova att ändra dina filter eller sökord för att hitta det du letar efter."
        />
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-lg border border-border bg-card transition-opacity ${isPending ? 'opacity-50' : 'opacity-100'}`}>
      <div className="grid grid-cols-[2.5fr_1fr_1fr_120px_120px] gap-4 border-b border-border bg-muted/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground select-none">
        <button 
          onClick={() => handleSort('name')}
          className="flex items-center hover:text-foreground transition-colors group text-left"
          style={{ all: 'unset', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        >
          Företag <SortIcon field="name" />
        </button>
        <button 
          onClick={() => handleSort('cm')}
          className="flex items-center hover:text-foreground transition-colors group text-left"
          style={{ all: 'unset', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        >
          CM <SortIcon field="cm" />
        </button>
        <button 
          onClick={() => handleSort('price')}
          className="flex items-center hover:text-foreground transition-colors group"
          style={{ all: 'unset', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        >
          Pris <SortIcon field="price" />
        </button>
        <div className="text-center">Operativ puls</div>
        <button 
          onClick={() => handleSort('status')}
          className="flex items-center hover:text-foreground transition-colors group"
          style={{ all: 'unset', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
        >
          Status <SortIcon field="status" />
        </button>
      </div>

      <div className="divide-y divide-border">
        {items.map((customer) => {
          const statusConfig = customerStatusConfig(customer.status);
          
          // Use the server-enriched fields
          const fullName = customer.cm_full_name || 'Otilldelad';
          const cmName = fullName.split(' ')[0];
          const avatarUrl = customer.cm_avatar_url || null;

          // Beräkna Operativ Puls Dynamiskt
          const expected = customer.expected_concepts_per_week ?? 2;
          const planned = customer.planned_concepts_count ?? 0;
          const lastCmAction = customer.last_cm_action_at ? new Date(customer.last_cm_action_at) : null;
          const lastPublished = customer.last_published_at ? new Date(customer.last_published_at) : null;
          
          const daysSinceCM = lastCmAction ? (Date.now() - lastCmAction.getTime()) / (1000 * 60 * 60 * 24) : 999;
          const daysSinceUpload = lastPublished ? (Date.now() - lastPublished.getTime()) / (1000 * 60 * 60 * 24) : 999;

          let pulseStatus: 'ok' | 'stagnant' | 'needs_action' | 'resting' = 'ok';
          let reason = '';

          if (planned < (expected * 1.5)) {
            pulseStatus = 'needs_action';
            reason = `Koncept behövs (bara ${planned} kvar)`;
          } else if (daysSinceCM > 7 || daysSinceUpload > 7) {
            pulseStatus = 'stagnant';
            if (daysSinceCM > 7 && daysSinceUpload > 7) {
              reason = 'Står still (ingen CM-aktivitet eller uppladdning)';
            } else if (daysSinceCM > 7) {
              reason = `Står still (${Math.floor(daysSinceCM)}d sedan CM-åtgärd)`;
            } else {
              reason = `Står still (${Math.floor(daysSinceUpload)}d sedan uppladdning)`;
            }
          } else if (customer.status === 'paused' || customer.paused_until) {
            pulseStatus = 'resting';
            reason = 'Vilande / Pausad';
          } else {
            pulseStatus = 'ok';
            reason = 'Allt rullar på som det ska';
          }

          const scheduleLabels = (customer.upload_schedule ?? ['1', '4'])
            .sort()
            .map(d => DAY_NAMES[d] || d)
            .join(', ');

          return (
            <Link
              key={customer.id}
              href={`/admin/customers/${customer.id}`}
              prefetch={false}
              className="grid grid-cols-[2.5fr_1fr_1fr_120px_120px] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/50"
            >
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {customer.business_name}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {customer.contact_email}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <AdminAvatar
                    name={cmName}
                    avatarUrl={customer.cm_avatar_url}
                    size="sm"
                    fallbackColor={customer.account_manager_profile_id ? `hsl(var(--${cmColorVar(customer.account_manager_profile_id)}))` : undefined}
                  />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-foreground">
                      {cmName.split(' ')[0]}
                    </span>
                    {customer.scheduled_cm_change && (
                      <div className="flex items-center gap-0.5 text-[9px] font-semibold text-blue-600 leading-none mt-0.5">
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
                    barLabel: scheduleLabels
                  }}
                />
              </div>

              <div>
                <StatusPill
                  label={statusConfig.label}
                  tone={
                    statusConfig.className.includes('success') ? 'success' :
                    statusConfig.className.includes('danger') ? 'danger' :
                    statusConfig.className.includes('warning') ? 'warning' :
                    statusConfig.className.includes('info') ? 'info' : 'neutral'
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
