'use client';

import { useState } from 'react';
import { Modal, Button, Stack, Group, Text, Alert, Radio, Box } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconPlayerPause, IconAlertTriangle } from '@tabler/icons-react';
import { toast } from 'sonner';

import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';

export interface PauseSubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName?: string;
  /** Visa som "Återuppta" istället för "Pausa" */
  resumeMode?: boolean;
  pausedUntil?: string | null;
  /** Nästa kommande fakturadatum (ISO) — visas som "skippas" vid paus */
  nextInvoiceDate?: string | null;
  /** Belopp som skulle ha fakturerats nästa gång (öre) */
  nextInvoiceAmountOre?: number | null;
}

export function PauseSubscriptionModal({
  open,
  onOpenChange,
  customerId,
  customerName,
  resumeMode = false,
  pausedUntil,
  nextInvoiceDate,
  nextInvoiceAmountOre,
}: PauseSubscriptionModalProps) {
  const [duration, setDuration] = useState<'indefinite' | 'until_date'>('indefinite');
  const [untilDate, setUntilDate] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pauseMutation = useCustomerMutation(customerId, 'pause_subscription');
  const resumeMutation = useCustomerMutation(customerId, 'resume_subscription');
  const refresh = useAdminRefresh();

  const isPending = pauseMutation.isPending || resumeMutation.isPending;

  const handleClose = () => {
    if (isPending) return;
    setErrorMessage(null);
    setDuration('indefinite');
    setUntilDate(null);
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    try {
      if (resumeMode) {
        await resumeMutation.mutateAsync(undefined as never);
        toast.success('Abonnemang återupptaget.');
      } else {
        const pauseUntilIso =
          duration === 'until_date' && untilDate
            ? untilDate.toISOString().slice(0, 10)
            : null;

        if (duration === 'until_date' && !pauseUntilIso) {
          setErrorMessage('Välj ett datum för återupptagning.');
          return;
        }

        await pauseMutation.mutateAsync({ pause_until: pauseUntilIso });
        toast.success('Abonnemang pausat.');
      }
      await refresh([
        { type: 'customer', customerId },
        { type: 'customer-billing', customerId },
        'customers',
      ]);
      handleClose();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Något gick fel. Försök igen.';
      setErrorMessage(msg);
    }
  };

  return (
    <Modal
      opened={open}
      onClose={handleClose}
      title={
        <Stack gap={2}>
          <Text fw={700}>
            {resumeMode ? 'Återuppta abonnemang' : 'Pausa abonnemang'}
          </Text>
          {customerName && (
            <Text size="sm" c="dimmed">
              {customerName}
            </Text>
          )}
        </Stack>
      }
      size="md"
    >
      <Stack gap="md">
        {resumeMode ? (
          <Alert color="blue" icon={<IconPlayerPause size={16} />}>
            <Text size="sm">
              Kunden återgår till aktivt abonnemang. Stripe kommer att återuppta
              fakturering enligt nuvarande pris.
              {pausedUntil && (
                <Text size="xs" c="dimmed" mt={4}>
                  Pausad till och med: {pausedUntil}
                </Text>
              )}
            </Text>
          </Alert>
        ) : (
          <>
            <Alert color="orange" icon={<IconPlayerPause size={16} />}>
              <Text size="sm">
                Pausning stoppar fakturering tills abonnemanget återupptas. Kunden
                förlorar inte sin Stripe-koppling.
              </Text>
              {nextInvoiceDate && (
                <Text size="xs" c="dimmed" mt={6}>
                  Nästa planerade faktura{' '}
                  <strong>{new Date(nextInvoiceDate).toLocaleDateString('sv-SE')}</strong>
                  {typeof nextInvoiceAmountOre === 'number' && nextInvoiceAmountOre > 0 && (
                    <>
                      {' '}på{' '}
                      <strong>
                        {Math.round(nextInvoiceAmountOre / 100).toLocaleString('sv-SE')} kr
                      </strong>
                    </>
                  )}{' '}
                  hoppas över.
                </Text>
              )}
            </Alert>

            <Radio.Group
              label="Hur länge?"
              value={duration}
              onChange={(val) => setDuration(val as 'indefinite' | 'until_date')}
            >
              <Stack gap="xs" mt="xs">
                <Radio
                  value="indefinite"
                  label={<Text size="sm">Tills vidare (manuell återupptagning)</Text>}
                />
                <Radio
                  value="until_date"
                  label={<Text size="sm">Återuppta automatiskt på datum</Text>}
                />
              </Stack>
            </Radio.Group>

            {duration === 'until_date' && (
              <Box>
                <DatePickerInput
                  label="Återuppta datum"
                  placeholder="Välj datum"
                  value={untilDate}
                  onChange={(val) => setUntilDate(val ? new Date(val) : null)}
                  minDate={new Date()}
                />
              </Box>
            )}
          </>
        )}

        {errorMessage && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            <Text size="sm">{errorMessage}</Text>
          </Alert>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Avbryt
          </Button>
          <Button
            onClick={handleSubmit}
            loading={isPending}
            color={resumeMode ? 'blue' : 'orange'}
          >
            {resumeMode ? 'Återuppta' : 'Bekräfta paus'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
