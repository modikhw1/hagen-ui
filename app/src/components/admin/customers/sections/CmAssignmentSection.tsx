'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import AdminAvatar from '@/components/admin/AdminAvatar';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useTeamMembers } from '@/hooks/admin/useTeamMembers';
import { CustomerSection, CustomerSectionSkeleton } from '@/components/admin/customers/routes/shared';
import ChangeCMModal from '@/components/admin/customers/modals/ChangeCMModal';

export default function CmAssignmentSection({ customerId }: { customerId: string }) {
  const { data: customer, isLoading: customerLoading } = useCustomerDetail(customerId);
  const { data: team = [], isLoading: teamLoading } = useTeamMembers();
  const [modalOpen, setModalOpen] = useState(false);

  if (customerLoading || teamLoading) return <CustomerSectionSkeleton blocks={2} />;
  if (!customer) return null;

  const cm = customer.account_manager
    ? team.find(
        (member) =>
          member.email === customer.account_manager || member.name === customer.account_manager,
      )
    : undefined;

  return (
    <CustomerSection 
      title="Content Manager"
      action={
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Byt CM
        </button>
      }
    >
      <div className="space-y-4">
        {cm ? (
          <div className="flex items-center gap-3">
            <AdminAvatar name={cm.name} avatarUrl={cm.avatar_url} size="md" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{cm.name}</div>
              <div className="text-xs text-muted-foreground truncate">{cm.email}</div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Ingen CM tilldelad.</p>
        )}

        {customer.coverage_absences.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Aktiv / Schemalagd coverage</div>
            {customer.coverage_absences.map((absence) => (
              <div key={absence.id} className="rounded-md border border-border bg-secondary/20 px-3 py-2 text-[11px] text-muted-foreground">
                <div className="font-semibold text-foreground">
                  {absence.is_active ? 'Aktiv coverage' : 'Schemalagd coverage'}
                </div>
                <div>{absence.starts_on} - {absence.ends_on} {absence.backup_cm_name ? ` · ${absence.backup_cm_name}` : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ChangeCMModal 
        open={modalOpen} 
        onOpenChange={setModalOpen} 
        customerId={customerId} 
        currentCmId={customer.account_manager_profile_id ?? null}
      />
    </CustomerSection>
  );
}
