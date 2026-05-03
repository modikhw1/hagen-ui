'use client';

import { useState } from 'react';
import { Alert, Box, Button, Group, Modal, Radio, Stack, Text } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconAlertTriangle, IconPlayerPause } from '@tabler/icons-react';
import { toast } from 'sonner';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';

export interface PauseSubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName?: string;
  resumeMode?: boolean;
  pausedUntil?: string | null;
  nextInvoiceDate?: string | null;
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
        toast.success('Abonnemang aterupptaget.');
      } else {
        const pauseUntilIso =
          duration === 'until_date' && untilDate ? untilDate.toISOString().slice(0, 10) : null;

        if (duration === 'until_date' && !pauseUntilIso) {
          setErrorMessage('Valj ett datum for aterupptagning.');
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
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Nagot gick fel. Forsok igen.',
      );
    }
  };

  return (
    <Modal
      opened={open}
      onClose={handleClose}
      title={
        <Stack gap={2}>
          <Text fw={700}>{resumeMode ? 'Ateruppta abonnemang' : 'Pausa abonnemang'}</Text>
          {customerName ? (
            <Text size="sm" c="dimmed">
              {customerName}
            </Text>
          ) : null}
        </Stack>
      }
      size="md"
    >
      <Stack gap="md">
        {resumeMode ? (
          <Alert color="blue" icon={<IconPlayerPause size={16} />}>
            <Text size="sm">
              Kunden atergar till aktivt abonnemang. Stripe fortsatter fakturering enligt
              nuvarande pris.
            </Text>
            {pausedUntil ? (
              <Text size="xs" c="dimmed" mt={4}>
                Pausad till och med: {pausedUntil}
              </Text>
            ) : null}
          </Alert>
        ) : (
          <>
            <Alert color="orange" icon={<IconPlayerPause size={16} />}>
              <Text size="sm">
                Pausning stoppar fakturering tills abonnemanget aterupptas. Kunden
                forlorar inte sin Stripe-koppling.
              </Text>
              {nextInvoiceDate ? (
                <Text size="xs" c="dimmed" mt={6}>
                  Nasta planerade faktura{' '}
                  <strong>{new Date(nextInvoiceDate).toLocaleDateString('sv-SE')}</strong>
                  {typeof nextInvoiceAmountOre === 'number' && nextInvoiceAmountOre > 0 ? (
                    <>
                      {' '}pa{' '}
                      <strong>
                        {Math.round(nextInvoiceAmountOre / 100).toLocaleString('sv-SE')} kr
                      </strong>
                    </>
                  ) : null}{' '}
                  hoppas over.
                </Text>
              ) : null}
            </Alert>

            <Radio.Group
              label="Hur lange?"
              value={duration}
              onChange={(value) => setDuration(value as 'indefinite' | 'until_date')}
            >
              <Stack gap="xs" mt="xs">
                <Radio
                  value="indefinite"
                  label={<Text size="sm">Tills vidare (manuell aterupptagning)</Text>}
                />
                <Radio
                  value="until_date"
                  label={<Text size="sm">Ateruppta automatiskt pa datum</Text>}
                />
              </Stack>
            </Radio.Group>

            {duration === 'until_date' ? (
              <Box>
                <DatePickerInput
                  label="Ateruppta datum"
                  placeholder="Valj datum"
                  value={untilDate}
                  onChange={(value) => setUntilDate(value ? new Date(value) : null)}
                  minDate={new Date()}
                />
              </Box>
            ) : null}
          </>
        )}

        {errorMessage ? (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            <Text size="sm">{errorMessage}</Text>
          </Alert>
        ) : null}

        <Group justify="flex-end" mt="md">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Avbryt
          </Button>
          <Button onClick={handleSubmit} loading={isPending} color={resumeMode ? 'blue' : 'orange'}>
            {resumeMode ? 'Ateruppta' : 'Bekrafta paus'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
