'use client';

import Link from 'next/link';
import AdminAvatar from '@/components/admin/AdminAvatar';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useTeamMembers } from '@/hooks/admin/useTeamMembers';
import { CustomerRouteError, CustomerRouteLoading, CustomerSection } from './shared';

export default function CustomerTeamRoute({ customerId }: { customerId: string }) {
  const { data: customer, isLoading, error } = useCustomerDetail(customerId);
  const { data: team = [] } = useTeamMembers();

  if (isLoading) {
    return <CustomerRouteLoading label="Laddar team..." />;
  }

  if (error || !customer) {
    return <CustomerRouteError message={error?.message || 'Kunden hittades inte.'} />;
  }

  const cm = customer.account_manager
    ? team.find(
        (member) =>
          member.email === customer.account_manager || member.name === customer.account_manager,
      )
    : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <CustomerSection title="Content Manager">
        {cm ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <AdminAvatar name={cm.name} avatarUrl={cm.avatar_url} size="md" />
              <div>
                <div className="text-sm font-semibold text-foreground">{cm.name}</div>
                <div className="text-xs text-muted-foreground">{cm.email}</div>
              </div>
            </div>
            <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
              {customer.account_manager_profile_id || customer.account_manager
                ? 'Kunden har en aktiv CM-tilldelning.'
                : 'Ingen CM tilldelad.'}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ingen CM tilldelad.</p>
        )}
      </CustomerSection>

      <CustomerSection title="CM-atgarder">
        <Link
          href={`/admin/customers/${customerId}/team/change`}
          scroll={false}
          className="block rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Andra Content Manager
        </Link>
      </CustomerSection>

      <CustomerSection title="Coverage & handover">
        {customer.coverage_absences.length > 0 ? (
          <div className="space-y-2">
            {customer.coverage_absences.map((absence) => (
              <div
                key={absence.id}
                className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground"
              >
                <div className="font-semibold text-foreground">
                  {absence.is_active ? 'Aktiv coverage' : 'Schemalagd coverage'}
                </div>
                <div>
                  {absence.starts_on} - {absence.ends_on}
                  {absence.backup_cm_name ? ` · ${absence.backup_cm_name}` : ''}
                </div>
                <div>
                  Payroll: {absence.compensation_mode === 'primary_cm' ? 'ordinarie CM' : 'covering CM'}
                </div>
                {absence.note ? <div className="mt-1">{absence.note}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ingen tillfallig coverage registrerad.</p>
        )}
      </CustomerSection>
    </div>
  );
}
