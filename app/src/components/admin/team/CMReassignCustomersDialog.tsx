'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import {
  Modal,
  Button,
  Text,
  Select,
  Checkbox,
  Alert,
  ScrollArea,
  Stack,
  Group,
  Box,
} from '@mantine/core';
import { useAvailableAccountManagers } from '@/hooks/admin/useAvailableAccountManagers';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';

interface CustomerSummary {
  id: string;
  business_name: string;
  monthly_price: number | null;
}

export interface CMReassignCustomersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fromCmId: string;
  fromCmName: string;
  customers: CustomerSummary[];
}

export function CMReassignCustomersDialog({
  open,
  onOpenChange,
  fromCmId,
  fromCmName,
  customers,
}: CMReassignCustomersDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetCmId, setTargetCmId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { data: availableCms, isLoading: cmsLoading } = useAvailableAccountManagers({
    excludeId: fromCmId,
    enabled: open,
  });
  const refresh = useAdminRefresh();

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(customers.map((customer) => customer.id)));
      setTargetCmId(null);
    }
  }, [customers, open]);

  const toggleAll = () => {
    if (selectedIds.size === customers.length) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(customers.map((customer) => customer.id)));
  };

  const handleSubmit = async () => {
    if (!targetCmId) {
      toast.error('Välj mottagande CM.');
      return;
    }
    if (selectedIds.size === 0) {
      toast.error('Välj minst en kund att flytta.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/team/${fromCmId}/reassign-customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetCmId,
          customerIds: Array.from(selectedIds),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Kunde inte flytta (${res.status})`);
        return;
      }

      toast.success(`${selectedIds.size} kunder flyttade.`);
      await refresh(['team', 'customers']);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nätverksfel');
    } finally {
      setSubmitting(false);
    }
  };

  const targetCmName = availableCms?.find((cm) => cm.id === targetCmId)?.full_name;
  const selectData = (availableCms ?? []).map((cm) => ({
    value: cm.id,
    label: `${cm.full_name} (${cm.active_customer_count} kunder)`,
  }));

  return (
    <Modal
      opened={open}
      onClose={() => onOpenChange(false)}
      title="Flytta kundportfölj"
      size="lg"
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          Flytta kunder från <strong>{fromCmName}</strong> till en annan CM.
        </Text>

        <Box>
          <Select
            label="Mottagande CM"
            placeholder="Välj CM"
            data={selectData}
            value={targetCmId}
            onChange={setTargetCmId}
            disabled={cmsLoading || submitting}
          />
        </Box>

        <Box>
          <Group justify="space-between" mb="xs">
            <Text size="sm" fw={500}>
              Kunder att flytta ({selectedIds.size}/{customers.length})
            </Text>
            <Button variant="subtle" size="xs" onClick={toggleAll}>
              {selectedIds.size === customers.length ? 'Avmarkera alla' : 'Markera alla'}
            </Button>
          </Group>
          <ScrollArea h={288} offsetScrollbars className="rounded-md border">
            <Box p="xs">
              {customers.map((customer) => {
                const checked = selectedIds.has(customer.id);
                return (
                  <Group
                    key={customer.id}
                    wrap="nowrap"
                    gap="sm"
                    p="xs"
                    className="cursor-pointer rounded-md hover:bg-accent"
                    onClick={() => {
                      setSelectedIds((previous) => {
                        const next = new Set(previous);
                        if (checked) {
                          next.delete(customer.id);
                        } else {
                          next.add(customer.id);
                        }
                        return next;
                      });
                    }}
                  >
                    <Checkbox checked={checked} readOnly tabIndex={-1} />
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Text size="sm" fw={500} truncate>
                        {customer.business_name}
                      </Text>
                      {customer.monthly_price ? (
                        <Text size="xs" color="dimmed">
                          {customer.monthly_price.toLocaleString('sv-SE')} kr/mån
                        </Text>
                      ) : null}
                    </Box>
                  </Group>
                );
              })}
              {customers.length === 0 ? (
                <Text size="sm" color="dimmed" ta="center" p="xl">
                  Inga kunder att flytta.
                </Text>
              ) : null}
            </Box>
          </ScrollArea>
        </Box>

        {selectedIds.size > 0 && targetCmName ? (
          <Alert color="blue" icon={<ArrowRight size={16} />}>
            <Text size="sm">
              {selectedIds.size} kunder flyttas från <strong>{fromCmName}</strong> till{' '}
              <strong>{targetCmName}</strong>
            </Text>
          </Alert>
        ) : null}

        <Group justify="flex-end" mt="md">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Avbryt
          </Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={!targetCmId || selectedIds.size === 0}
          >
            Flytta {selectedIds.size > 0 ? `${selectedIds.size} kunder` : ''}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
