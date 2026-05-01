// app/src/components/admin/customers/AddCustomerButton.tsx

'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@mantine/core';
import InviteCustomerModal from './InviteCustomerModal';
import { useTeamLite } from '@/hooks/admin/useTeamLite';

interface AddCustomerButtonProps {
  onCreated: () => void;
}

export function AddCustomerButton({ onCreated }: AddCustomerButtonProps) {
  const [open, setOpen] = useState(false);
  const { data: team = [] } = useTeamLite('admin');

  return (
    <>
      <Button onClick={() => setOpen(true)} leftSection={<Plus size={16} />}>
        Bjud in kund
      </Button>

      <InviteCustomerModal
        open={open}
        team={team}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          onCreated();
        }}
      />
    </>
  );
}
