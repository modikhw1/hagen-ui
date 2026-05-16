'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Group,
  Modal,
  Radio,
  Stack,
  Text,
} from '@mantine/core';
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

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

// Lokal YYYY-MM-DD (UNDVIK toISOString — den shiftar tillbaka en dag i
// positiva tidszoner; operatören väljer 20 maj men servern fick 19 maj).
// Se AVTAL_AUDIT.md (#A5-D2).
function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatPausedUntil(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('sv-SE');
}

const NEXT_INVOICE_IMMINENT_MS = 2 * 60 * 60 * 1000; // 2h

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
  const [confirmImminent, setConfirmImminent] = useState(false);
  // Idempotency-key per modal-instans (regenereras vid byte av
  // duration/datum). Se AVTAL_AUDIT.md (#A5-D3).
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateUuid());

  const pauseMutation = useCustomerMutation(customerId, 'pause_subscription');
  const resumeMutation = useCustomerMutation(customerId, 'resume_subscription');
  const refresh = useAdminRefresh();

  const isPending = pauseMutation.isPending || resumeMutation.isPending;

  // Återgenerera idempotensnyckel när operatören byter intention
  useEffect(() => {
    setIdempotencyKey(generateUuid());
  }, [duration, untilDate, resumeMode]);

  // Återställ vid öppning
  useEffect(() => {
    if (open) {
      setIdempotencyKey(generateUuid());
      setConfirmImminent(false);
      setErrorMessage(null);
    }
  }, [open]);

  // Defensiv "redan pausad"-guard — modalen ska normalt öppnas med
  // resumeMode=true för pausade kunder, men om förälder är fel ska vi inte
  // skicka ny pause som riskerar att skriva över pause_until.
  // Se AVTAL_AUDIT.md (#A5-D8).
  const alreadyPaused = Boolean(pausedUntil) && !resumeMode;

  // "Faktura inom 2h"-guard. Pausning hinner inte alltid stoppa Stripes
  // auto-advance. Se AVTAL_AUDIT.md (#A5-D5).
  const nextInvoiceImminent = useMemo(() => {
    if (resumeMode || !nextInvoiceDate) return false;
    const parsed = new Date(nextInvoiceDate);
    if (Number.isNaN(parsed.getTime())) return false;
    const delta = parsed.getTime() - Date.now();
    return delta > 0 && delta < NEXT_INVOICE_IMMINENT_MS;
  }, [resumeMode, nextInvoiceDate]);

  const minPauseDate = useMemo(() => {
    // Tillåt inte "pausa till idag" — meningslöst, resumar omedelbart.
    // Se AVTAL_AUDIT.md (#A5-D9).
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }, []);

  const handleClose = () => {
    if (isPending) return;
    setErrorMessage(null);
    setDuration('indefinite');
    setUntilDate(null);
    setConfirmImminent(false);
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    setErrorMessage(null);

    try {
      if (resumeMode) {
        await resumeMutation.mutateAsync({ idempotency_key: idempotencyKey } as never);
        toast.success('Abonnemang aterupptaget.');
      } else {
        if (alreadyPaused) {
          setErrorMessage('Abonnemanget ar redan pausat. Stang och oppna i ateruppta-lage.');
          return;
        }

        const pauseUntilIso =
          duration === 'until_date' && untilDate ? toLocalISODate(untilDate) : null;

        if (duration === 'until_date' && !pauseUntilIso) {
          setErrorMessage('Valj ett datum for aterupptagning.');
          return;
        }

        if (nextInvoiceImminent && !confirmImminent) {
          setErrorMessage(
            'Bekrafta att du forstar att fakturan kan ha skickats redan innan pausen hinner ta effekt.',
          );
          return;
        }

        await pauseMutation.mutateAsync({
          pause_until: pauseUntilIso,
          idempotency_key: idempotencyKey,
        } as never);
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

  const formattedPausedUntil = formatPausedUntil(pausedUntil);

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
            {formattedPausedUntil ? (
              <Text size="xs" c="dimmed" mt={4}>
                Pausad till och med: {formattedPausedUntil}
              </Text>
            ) : null}
          </Alert>
        ) : (
          <>
            {alreadyPaused ? (
              <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
                <Text size="sm">
                  Abonnemanget ar redan pausat
                  {formattedPausedUntil ? ` till ${formattedPausedUntil}` : ''}. Stang
                  modalen och valj &quot;Ateruppta&quot; om du vill avbryta pausen.
                </Text>
              </Alert>
            ) : null}

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

            {nextInvoiceImminent ? (
              <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    Fakturan kan redan ha skickats
                  </Text>
                  <Text size="xs">
                    Stripe processar fakturan inom ca 1 timme fore planerat datum.
                    Pausen kanske inte hinner stoppa denna faktura. Kontrollera i Stripe
                    innan du fortsatter.
                  </Text>
                  <Checkbox
                    label="Jag har kontrollerat och vill anda pausa"
                    checked={confirmImminent}
                    onChange={(event) => setConfirmImminent(event.currentTarget.checked)}
                  />
                </Stack>
              </Alert>
            ) : null}

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
                  minDate={minPauseDate}
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
          <Button
            onClick={handleSubmit}
            loading={isPending}
            color={resumeMode ? 'blue' : 'orange'}
            disabled={!resumeMode && alreadyPaused}
          >
            {resumeMode ? 'Ateruppta' : 'Bekrafta paus'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
