'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  Radio,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconAlertTriangle, IconCalendarStats, IconReceipt } from '@tabler/icons-react';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { useSubscriptionPricePreview } from '@/hooks/admin/useSubscriptionPricePreview';

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

function formatKr(ore: number) {
  const sign = ore < 0 ? '-' : '';
  return `${sign}${Math.abs(Math.round(ore / 100)).toLocaleString('sv-SE')} kr`;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('sv-SE');
  } catch {
    return iso;
  }
}

export function UpdatePricingDialog({
  open,
  onOpenChange,
  customerId,
  currentPriceOre,
  upcomingPrice,
}: UpdatePricingDialogProps) {
  const [newPriceKr, setNewPriceKr] = useState(String(Math.round(currentPriceOre / 100)));
  const [effectiveDate, setEffectiveDate] = useState<'next_cycle' | 'immediate'>(
    'next_cycle',
  );

  const { mutateAsync, isPending } = useCustomerMutation(
    customerId,
    'change_subscription_price',
  );
  const refresh = useAdminRefresh();

  const numericPriceKr = Number(newPriceKr);
  const { preview, loading: previewLoading, error: previewError } =
    useSubscriptionPricePreview({
      enabled: open,
      customerId,
      newMonthlyPriceKr: Number.isFinite(numericPriceKr) ? numericPriceKr : null,
      currentPriceOre,
      mode: effectiveDate === 'next_cycle' ? 'next_period' : 'now',
      debounceMs: 500,
    });

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
      await refresh([
        'billing',
        { type: 'customer-billing', customerId },
        { type: 'customer', customerId },
      ]);
      onOpenChange(false);
    } catch {
      // Mutation hook handles error rendering.
    }
  };

  const diff = Number(newPriceKr) - currentPriceOre / 100;

  if (!open) {
    return null;
  }

  return (
    <Modal opened={open} onClose={() => onOpenChange(false)} title="Hantera prissättning" size="lg">
      <Stack gap="md">
        {upcomingPrice ? (
          <Alert color="orange" icon={<IconCalendarStats size={16} />} title="Schemalagd ändring">
            <Text size="xs">
              Priset ändras till{' '}
              <strong>{(upcomingPrice.price_ore / 100).toLocaleString('sv-SE')} kr</strong>{' '}
              den {upcomingPrice.effective_date}.
            </Text>
          </Alert>
        ) : null}

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
              onChange={(event) => setNewPriceKr(event.target.value)}
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
          onChange={(value) => setEffectiveDate(value as 'next_cycle' | 'immediate')}
        >
          <Stack gap="xs" mt="xs">
            <Radio value="next_cycle" label={<Text size="sm">Nästa faktureringsperiod</Text>} />
            <Radio
              value="immediate"
              label={<Text size="sm">Omedelbart (proportionerlig fakturering)</Text>}
            />
          </Stack>
        </Radio.Group>

        {diff !== 0 ? (
          <Alert color="blue">
            <Text size="sm">
              {diff > 0 ? 'Höjning' : 'Sänkning'} med{' '}
              <strong>{Math.abs(diff).toLocaleString('sv-SE')} kr/mån</strong>
            </Text>
          </Alert>
        ) : null}

        {previewError ? (
          <Alert
            color="red"
            icon={<IconAlertTriangle size={16} />}
            title="Kunde inte hämta förhandsgranskning"
          >
            <Text size="xs">{previewError}</Text>
          </Alert>
        ) : null}

        {previewLoading ? (
          <Box>
            <Skeleton height={20} mb={6} />
            <Skeleton height={16} mb={4} />
            <Skeleton height={16} />
          </Box>
        ) : null}

        {preview && !previewLoading ? (
          <Box>
            <Divider mb="sm" />
            <Group gap={6} mb={6}>
              <IconReceipt size={14} />
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                Stripe-förhandsgranskning
              </Text>
            </Group>

            {preview.mode === 'next_period' ? (
              <Alert color="green" variant="light">
                <Text size="sm">
                  Ingen direkt fakturering. Nytt pris{' '}
                  <strong>{formatKr(preview.new_price_ore)}/mån</strong> börjar gälla{' '}
                  <strong>{formatDate(preview.effective_date)}</strong>.
                </Text>
              </Alert>
            ) : (
              <Stack gap={4}>
                {preview.line_items.map((line) => (
                  <Group key={line.id} justify="space-between" wrap="nowrap">
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {line.description}
                    </Text>
                    <Text size="xs" fw={500}>
                      {formatKr(line.amount_ore)}
                    </Text>
                  </Group>
                ))}
                <Divider my={4} />
                <Group justify="space-between">
                  <Text size="sm" fw={700}>
                    Faktureras nu
                  </Text>
                  <Text size="sm" fw={700} c={preview.invoice_total_ore >= 0 ? 'red' : 'green'}>
                    {formatKr(preview.invoice_total_ore)}
                  </Text>
                </Group>
                {preview.invoice_total_ore < 0 ? (
                  <Text size="xs" c="dimmed">
                    Negativt belopp = kreditnota till kunden.
                  </Text>
                ) : null}
              </Stack>
            )}
          </Box>
        ) : null}

        <Group justify="flex-end" mt="md">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Avbryt
          </Button>
          <Button onClick={() => void handleSubmit()} loading={isPending}>
            Spara ändring
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
