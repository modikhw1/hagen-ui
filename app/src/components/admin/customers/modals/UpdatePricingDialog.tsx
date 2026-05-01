'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal, Button, TextInput, Stack, Group, Text, Alert, Radio, Box } from '@mantine/core';
import { IconCalendarStats } from '@tabler/icons-react';

import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';

export interface UpdatePricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  currentPriceOre: number;
  upcomingPrice?: {
    price_ore: number;
    effective_date: string;
  } | null;
}

export function UpdatePricingDialog({
  open,
  onOpenChange,
  customerId,
  currentPriceOre,
  upcomingPrice,
}: UpdatePricingDialogProps) {
  const [newPriceKr, setNewPriceKr] = useState(String(Math.round(currentPriceOre / 100)));
  const [effectiveDate, setEffectiveDate] = useState<'next_cycle' | 'immediate'>('next_cycle');

  const { mutateAsync, isPending } = useCustomerMutation(customerId, 'change_subscription_price');
  const refresh = useAdminRefresh();

  const handleSubmit = async () => {
    const num = Number(newPriceKr);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error('Ange ett giltigt pris över 0 kr.');
      return;
    }

    try {
      await mutateAsync({
        monthly_price: num,
        mode: effectiveDate === 'next_cycle' ? 'next_period' : 'now',
      });
      toast.success('Pris uppdaterat.');
      await refresh(['billing', { type: 'customer-billing', customerId }, { type: 'customer', customerId }]);
      onOpenChange(false);
    } catch {
      // Error is handled by the mutation hook.
    }
  };

  const diff = Number(newPriceKr) - currentPriceOre / 100;

  return (
    <Modal
      opened={open}
      onClose={() => onOpenChange(false)}
      title="Hantera prissättning"
      size="md"
    >
      <Stack gap="md">
        {upcomingPrice && (
          <Alert color="orange" icon={<IconCalendarStats size={16} />} title="Schemalagd ändring">
            <Text size="xs">
              Priset ändras till{' '}
              <strong>{(upcomingPrice.price_ore / 100).toLocaleString('sv-SE')} kr</strong>{' '}
              den {upcomingPrice.effective_date}.
            </Text>
          </Alert>
        )}

        <Box>
          <Text size="xs" fw={700} c="dimmed" mb={4} tt="uppercase">
            Abonnemangspris
          </Text>
          <Group grow align="flex-end">
            <TextInput
              label="Månadspris (kr)"
              type="number"
              min="1"
              value={newPriceKr}
              onChange={(e) => setNewPriceKr(e.target.value)}
            />
            <Box pb={4}>
              <Text size="xs" c="dimmed">
                Nuvarande: {(currentPriceOre / 100).toLocaleString('sv-SE')} kr
              </Text>
            </Box>
          </Group>
        </Box>

        <Radio.Group
          label="När ska priset ändras?"
          value={effectiveDate}
          onChange={(val) => setEffectiveDate(val as 'next_cycle' | 'immediate')}
        >
          <Stack gap="xs" mt="xs">
            <Radio value="next_cycle" label={<Text size="sm">Nästa faktureringsperiod</Text>} />
            <Radio value="immediate" label={<Text size="sm">Omedelbart</Text>} />
          </Stack>
        </Radio.Group>

        {diff !== 0 && (
          <Alert color="blue">
            <Text size="sm">
              {diff > 0 ? 'Höjning' : 'Sänkning'} med{' '}
              <strong>{Math.abs(diff).toLocaleString('sv-SE')} kr/mån</strong>
            </Text>
          </Alert>
        )}

        <Group justify="flex-end" mt="xl">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Avbryt
          </Button>
          <Button onClick={handleSubmit} loading={isPending}>
            Spara ändring
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
