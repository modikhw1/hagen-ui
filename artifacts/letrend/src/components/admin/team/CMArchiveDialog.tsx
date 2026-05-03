// app/src/components/admin/team/CMArchiveDialog.tsx

'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import {
  Modal,
  Button,
  Alert,
  TextInput,
  Text,
  Group,
} from '@mantine/core';

import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';

export interface CMArchiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cmId: string;
  cmName: string;
  activeCustomerCount: number;
}

export function CMArchiveDialog({
  open,
  onOpenChange,
  cmId,
  cmName,
  activeCustomerCount,
}: CMArchiveDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const refresh = useAdminRefresh();

  const canArchive =
    activeCustomerCount === 0 && confirmText.trim() === cmName.trim();

  const handleArchive = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/team/${cmId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Kunde inte arkivera (${res.status})`);
        return;
      }
      toast.success(`${cmName} arkiverad.`);
      await refresh(['team', 'customers']);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nätverksfel');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={open}
      onClose={() => onOpenChange(false)}
      title={
        <div className="flex items-center gap-2 font-semibold text-lg">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          Arkivera {cmName}?
        </div>
      }
    >
      <div className="space-y-4">
        <Text size="sm" c="dimmed">
          Arkivering deaktiverar inloggning och tar bort CM:en från
          tilldelningar. Historisk data behålls.
        </Text>

        {activeCustomerCount > 0 ? (
          <Alert color="red" icon={<AlertTriangle className="h-4 w-4" />}>
            {cmName} har {activeCustomerCount} aktiva kunder. Flytta dem till
            en annan CM via &quot;Hantera kundportfölj&quot; innan arkivering.
          </Alert>
        ) : (
          <div className="space-y-2">
            <TextInput
              label={
                <Text size="sm">
                  Skriv <strong>{cmName}</strong> för att bekräfta:
                </Text>
              }
              id="confirm-name"
              value={confirmText}
              onChange={(e) => setConfirmText(e.currentTarget.value)}
              placeholder={cmName}
              autoComplete="off"
            />
          </div>
        )}

        <Group justify="flex-end" mt="xl">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Avbryt
          </Button>
          <Button
            color="red"
            onClick={handleArchive}
            disabled={!canArchive || submitting}
            loading={submitting}
          >
            Arkivera permanent
          </Button>
        </Group>
      </div>
    </Modal>
  );
}
