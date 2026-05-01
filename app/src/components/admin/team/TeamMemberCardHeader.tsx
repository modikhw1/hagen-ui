'use client';

import { useState } from 'react';
import { MoreHorizontal, Calendar } from 'lucide-react';
import { Button, Menu, ActionIcon } from '@mantine/core';
import AdminAvatar from '@/components/admin/AdminAvatar';
import TeamMemberKpiCluster from '@/components/admin/team/TeamMemberKpiCluster';
import { teamCopy } from '@/lib/admin/copy/team';
import type { TeamMemberView } from '@/hooks/admin/useTeam';
import { cmColorVar } from '@/lib/admin/teamPalette';

import { CMEditProfileDialog } from './CMEditProfileDialog';
import { CMReassignCustomersDialog } from './CMReassignCustomersDialog';
import { CMArchiveDialog } from './CMArchiveDialog';

export default function TeamMemberCardHeader({
  member,
  onSetAbsence,
}: {
  member: TeamMemberView;
  onSetAbsence: (member: TeamMemberView) => void;
}) {
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,500px)_auto] xl:items-center">
      <div className="flex min-w-0 items-center gap-4">
        <div className="shrink-0">
          <AdminAvatar
            name={member.name}
            avatarUrl={member.avatar_url}
            size="lg"
            fallbackColor={`hsl(var(--${cmColorVar(member.id)}))`}
          />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-base font-semibold text-foreground">{member.name}</div>
            {member.active_absence && member.active_absence.is_active ? (
              <span className="rounded-full border border-status-warning-fg/20 bg-status-warning-bg px-2 py-0.5 text-[10px] font-bold uppercase text-status-warning-fg">
                {teamCopy.activeAbsenceUntil(member.active_absence.ends_on)}
              </span>
            ) : null}
            {member.isCovering ? (
              <span className="rounded-full border border-status-info-fg/20 bg-status-info-bg px-2 py-0.5 text-[10px] font-bold uppercase text-status-info-fg">
                {teamCopy.cover}
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate text-sm text-muted-foreground">
            {member.city || member.email || teamCopy.noLocation}
          </div>
        </div>
      </div>

      <TeamMemberKpiCluster member={member} />

      <div className="flex items-center justify-start gap-2 xl:justify-end">
        <Button
          variant="outline"
          size="xs"
          leftSection={<Calendar size={14} />}
          onClick={() => onSetAbsence(member)}
          className="h-8 text-[11px] font-semibold"
        >
          {teamCopy.setAbsence}
        </Button>

        <Menu position="bottom-end" shadow="md" width={200}>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" size="md">
              <MoreHorizontal size={16} />
            </ActionIcon>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item onClick={() => setEditProfileOpen(true)}>
              Redigera profil
            </Menu.Item>
            <Menu.Item onClick={() => setReassignOpen(true)}>
              Hantera kundportfölj
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color="red"
              onClick={() => setArchiveOpen(true)}
            >
              Arkivera
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>

      <CMEditProfileDialog
        open={editProfileOpen}
        onOpenChange={setEditProfileOpen}
        cmId={member.id}
        initialValues={{
          name: member.name,
          email: member.email || '',
          phone: member.phone ?? '',
          city: member.city ?? '',
          bio: member.bio ?? '',
          avatar_url: member.avatar_url ?? '',
          commission_rate_pct: Math.round((member.commission_rate ?? 0) * 100),
          role: member.role,
        }}
      />
      <CMReassignCustomersDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        fromCmId={member.id}
        fromCmName={member.name}
        customers={member.customers.map((customer) => ({
          id: customer.id,
          business_name: customer.business_name,
          monthly_price: customer.monthly_price,
        }))}
      />
      <CMArchiveDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        cmId={member.id}
        cmName={member.name}
        activeCustomerCount={member.customers.length}
      />
    </div>
  );
}
