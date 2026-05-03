'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconCoins,
  IconMoon,
  IconRepeat,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import { toast } from 'sonner';

import AdminAvatar from '@/components/admin/AdminAvatar';
import {
  useAvailableAccountManagers,
  type AccountManagerOption,
} from '@/hooks/admin/useAvailableAccountManagers';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { usePreviewCmChange } from '@/hooks/admin/usePreviewCmChange';
import type {
  CmChangePreviewInput,
  CmChangePreviewMode,
  CmCoverageCompensationMode,
} from '@/lib/admin/cm-change-preview';
import { formatSek } from '@/lib/admin/money';
import { dateInputSv, longDateSv, todayDateInput } from '@/lib/admin/time';

export interface ChangeCMModalProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  customerId: string;
  customerName?: string;
  currentAccountManagerId?: string | null;
  currentAccountManagerName?: string | null;
  currentAccountManagerAvatarUrl?: string | null;
  currentAccountManagerEmail?: string | null;
  currentAccountManagerCity?: string | null;
  currentAccountManagerCommissionRate?: number | null;
  currentAccountManagerSince?: string | null;
  currentCmId?: string | null;
  onSaved?: () => void;
}

type ModeDefinition = {
  value: CmChangePreviewMode;
  label: string;
  description: string;
  icon: typeof IconRepeat;
  submitLabel: string;
};

type DisplayCm = AccountManagerOption & {
  full_name: string;
};

const MODE_DEFINITIONS: ModeDefinition[] = [
  {
    value: 'now',
    label: 'Byt idag',
    description: 'Stanger nuvarande assignment och flyttar kunden direkt.',
    icon: IconRepeat,
    submitLabel: 'Byt idag',
  },
  {
    value: 'scheduled',
    label: 'Schemalagt byte',
    description: 'Planera ett permanent byte for ett kommande datum.',
    icon: IconCalendarEvent,
    submitLabel: 'Schemalagg byte',
  },
  {
    value: 'temporary',
    label: 'Temporar tackning',
    description: 'Lat en annan CM tacks under en begransad period.',
    icon: IconMoon,
    submitLabel: 'Skapa tackning',
  },
];

function parseDateValue(value: string) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

function toPreviewMember(cm: DisplayCm | null | undefined) {
  if (!cm) return null;
  return {
    id: cm.id,
    name: cm.full_name,
    commission_rate: cm.commission_rate ?? 0,
  };
}

function commissionLabel(rate: number | null | undefined) {
  if (typeof rate !== 'number' || Number.isNaN(rate)) return null;
  return `${Math.round(rate * 100)}% provision`;
}

function resolveCurrentDisplayCm(props: ChangeCMModalProps, items: AccountManagerOption[]) {
  if (props.currentCmId) {
    const matched = items.find((item) => item.id === props.currentCmId);
    if (matched) {
      return matched;
    }
  }

  if (props.currentAccountManagerName) {
    const normalized = props.currentAccountManagerName.trim().toLowerCase();
    const matched = items.find((item) => {
      const name = item.full_name.trim().toLowerCase();
      const email = item.email?.trim().toLowerCase();
      return name === normalized || email === normalized;
    });
    if (matched) {
      return matched;
    }
  }

  if (!props.currentAccountManagerName && !props.currentCmId) {
    return null;
  }

  return {
    id: props.currentCmId ?? props.currentAccountManagerId ?? 'current',
    full_name: props.currentAccountManagerName ?? 'Ordinarie CM',
    email: props.currentAccountManagerEmail ?? null,
    city: props.currentAccountManagerCity ?? null,
    avatar_url: props.currentAccountManagerAvatarUrl ?? null,
    commission_rate: props.currentAccountManagerCommissionRate ?? null,
    start_date: props.currentAccountManagerSince ?? null,
    active_customer_count: 0,
    on_absence: false,
  } satisfies DisplayCm;
}

function CmCandidateCard({
  cm,
  selected,
  current,
  onSelect,
}: {
  cm: DisplayCm;
  selected: boolean;
  current: boolean;
  onSelect: (id: string) => void;
}) {
  const commission = commissionLabel(cm.commission_rate);
  return (
    <Paper
      withBorder
      radius="md"
      p="md"
      onClick={() => onSelect(cm.id)}
      style={{
        cursor: 'pointer',
        borderColor: selected
          ? 'var(--mantine-color-blue-5)'
          : 'var(--mantine-color-default-border)',
        backgroundColor: selected
          ? 'var(--mantine-color-blue-0)'
          : 'var(--mantine-color-body)',
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <AdminAvatar
            name={cm.full_name}
            avatarUrl={cm.avatar_url}
            size="lg"
          />
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Group gap={6}>
              <Text fw={600} size="sm" truncate>
                {cm.full_name}
              </Text>
              {current && (
                <Badge size="xs" variant="light" color="gray">
                  Nuvarande
                </Badge>
              )}
              {cm.on_absence && (
                <Badge size="xs" variant="light" color="orange">
                  Franvarande
                </Badge>
              )}
            </Group>
            {(cm.city || cm.email) && (
              <Text size="xs" c="dimmed" truncate>
                {cm.city ?? cm.email}
              </Text>
            )}
          </Stack>
        </Group>
        {selected && (
          <ThemeIcon size="sm" radius="xl" color="blue" variant="filled">
            <IconCheck size={12} />
          </ThemeIcon>
        )}
      </Group>

      <Group gap="xs" mt="sm">
        <Badge variant="light" color="gray" leftSection={<IconUsers size={10} />}>
          {cm.active_customer_count} kunder
        </Badge>
        {commission && (
          <Badge variant="light" color="blue">
            {commission}
          </Badge>
        )}
      </Group>
    </Paper>
  );
}

function PayoutRow({
  label,
  days,
  amountOre,
  color,
}: {
  label: string;
  days: number;
  amountOre: number;
  color: 'gray' | 'blue' | 'orange';
}) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text size="xs" c="dimmed">
            {label}
          </Text>
          <Text size="sm" fw={600}>
            {formatSek(amountOre, { unit: 'ore' })}
          </Text>
        </div>
        <Badge variant="light" color={color}>
          {days} dagar
        </Badge>
      </Group>
    </Paper>
  );
}

export default function ChangeCMModal(props: ChangeCMModalProps) {
  const {
    open,
    onOpenChange,
    onClose,
    customerId,
    customerName,
    currentCmId,
    currentAccountManagerName,
    onSaved,
  } = props;

  const refresh = useAdminRefresh();

  const [mode, setMode] = useState<CmChangePreviewMode>('now');
  const [selectedCmId, setSelectedCmId] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState(todayDateInput());
  const [coverageEndDate, setCoverageEndDate] = useState('');
  const [compensationMode, setCompensationMode] =
    useState<CmCoverageCompensationMode>('covering_cm');
  const [handoverNote, setHandoverNote] = useState('');

  const { data: availableCms = [], isLoading: cmsLoading } =
    useAvailableAccountManagers({ enabled: open });
  const currentCm = useMemo(
    () => resolveCurrentDisplayCm(props, availableCms),
    [props, availableCms],
  );
  const selectableCms = useMemo(
    () => availableCms.filter((cm) => cm.id !== currentCm?.id),
    [availableCms, currentCm],
  );
  const selectedCm =
    selectableCms.find((cm) => cm.id === selectedCmId) ?? null;

  const previewInput: CmChangePreviewInput | null = useMemo(() => {
    const resolvedEffectiveDate =
      mode === 'now' ? todayDateInput() : effectiveDate;

    if (!selectedCm || !resolvedEffectiveDate) {
      return null;
    }

    if (mode === 'temporary' && !coverageEndDate) {
      return null;
    }

    return {
      mode,
      effective_date: resolvedEffectiveDate,
      coverage_end_date: mode === 'temporary' ? coverageEndDate || null : null,
      compensation_mode: compensationMode,
      current_monthly_price: null,
      current: toPreviewMember(currentCm),
      next: toPreviewMember(selectedCm),
    };
  }, [compensationMode, coverageEndDate, currentCm, effectiveDate, mode, selectedCm]);

  const previewQuery = usePreviewCmChange(customerId, previewInput);
  const changeMutation = useCustomerMutation(customerId, 'change_account_manager');
  const temporaryMutation = useCustomerMutation(customerId, 'set_temporary_coverage');

  function resetFormState() {
    setMode('now');
    setSelectedCmId('');
    setEffectiveDate(todayDateInput());
    setCoverageEndDate('');
    setCompensationMode('covering_cm');
    setHandoverNote('');
  }

  function handleClose() {
    resetFormState();
    onClose?.();
    onOpenChange?.(false);
  }

  const selectedMode = MODE_DEFINITIONS.find((item) => item.value === mode)!;
  const canSubmit =
    Boolean(selectedCmId) &&
    (mode === 'now' || Boolean(effectiveDate)) &&
    (mode !== 'temporary' ||
      (Boolean(effectiveDate) &&
        Boolean(coverageEndDate) &&
        coverageEndDate >= effectiveDate));

  async function handleSubmit() {
    if (!selectedCmId) {
      toast.error('Valj en content manager.');
      return;
    }

    try {
      if (mode === 'temporary') {
        if (!effectiveDate || !coverageEndDate) {
          toast.error('Valj start- och slutdatum for tackningen.');
          return;
        }

        await temporaryMutation.mutateAsync({
          covering_cm_id: selectedCmId,
          starts_on: effectiveDate,
          ends_on: coverageEndDate,
          note: handoverNote.trim() || undefined,
          compensation_mode: compensationMode,
        });
      } else {
        await changeMutation.mutateAsync({
          cm_id: selectedCmId,
          effective_date: mode === 'now' ? todayDateInput() : effectiveDate,
          handover_note: handoverNote.trim() || undefined,
        });
      }

      toast.success(
        mode === 'now'
          ? 'Content manager byttes.'
          : mode === 'scheduled'
            ? 'CM-byte schemalagt.'
            : 'Temporar tackning skapad.',
      );
      await refresh([
        'overview',
        'team',
        { type: 'customer', customerId },
        { type: 'customer-assignment', customerId },
      ]);
      onSaved?.();
      handleClose();
    } catch {
      // useCustomerMutation handles error toasts.
    }
  }

  const preview = previewQuery.data;
  const currentCommission = commissionLabel(
    currentCm?.commission_rate ?? props.currentAccountManagerCommissionRate,
  );
  const isSaving = changeMutation.isPending || temporaryMutation.isPending;

  return (
    <Modal
      opened={open}
      onClose={handleClose}
      size="xl"
      title={
        <Stack gap={2}>
          <Text fw={700}>Byt Content Manager</Text>
          {customerName && (
            <Text size="sm" c="dimmed">
              {customerName}
            </Text>
          )}
        </Stack>
      }
    >
      <Stack gap="lg">
        <Paper withBorder radius="md" p="md">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              {currentCm ? (
                <AdminAvatar
                  name={currentCm.full_name}
                  avatarUrl={currentCm.avatar_url}
                  size="lg"
                />
              ) : (
                <ThemeIcon variant="light" size="lg" color="gray">
                  <IconUser size={18} />
                </ThemeIcon>
              )}
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Text size="xs" c="dimmed">
                  Nuvarande ansvarig
                </Text>
                <Text fw={600} truncate>
                  {currentCm?.full_name ?? currentAccountManagerName ?? 'Ingen CM tilldelad'}
                </Text>
                {(currentCm?.email || currentCm?.city) && (
                  <Text size="xs" c="dimmed" truncate>
                    {currentCm?.city ?? currentCm?.email}
                  </Text>
                )}
              </Stack>
            </Group>
            <Group gap="xs">
              {currentCommission && (
                <Badge variant="light" color="blue">
                  {currentCommission}
                </Badge>
              )}
              {props.currentAccountManagerSince && (
                <Badge variant="light" color="gray">
                  CM sedan {longDateSv(props.currentAccountManagerSince)}
                </Badge>
              )}
            </Group>
          </Group>
        </Paper>

        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Vad ska handa?
          </Text>
          <SegmentedControl
            fullWidth
            value={mode}
            onChange={(value) => setMode(value as CmChangePreviewMode)}
            data={MODE_DEFINITIONS.map((item) => ({
              label: item.label,
              value: item.value,
            }))}
          />
          <Alert variant="light" color="gray" icon={<selectedMode.icon size={16} />}>
            {selectedMode.description}
          </Alert>
        </Stack>

        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text size="sm" fw={600}>
              Vem tar over kunden?
            </Text>
            <Text size="xs" c="dimmed">
              {selectableCms.length} valbara CMs
            </Text>
          </Group>
          {cmsLoading ? (
            <Text size="sm" c="dimmed">
              Laddar content managers...
            </Text>
          ) : selectableCms.length === 0 ? (
            <Alert color="orange" icon={<IconAlertTriangle size={16} />} variant="light">
              Inga andra aktiva content managers gick att hitta.
            </Alert>
          ) : (
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
              {selectableCms.map((cm) => (
                <CmCandidateCard
                  key={cm.id}
                  cm={cm}
                  selected={selectedCmId === cm.id}
                  current={cm.id === currentCmId}
                  onSelect={setSelectedCmId}
                />
              ))}
            </SimpleGrid>
          )}
        </Stack>

        <SimpleGrid cols={{ base: 1, md: mode === 'temporary' ? 2 : 1 }} spacing="sm">
          {mode !== 'now' && (
            <DatePickerInput
              label={mode === 'scheduled' ? 'Bytet galler fran' : 'Tackning startar'}
              value={parseDateValue(effectiveDate)}
              onChange={(value) => setEffectiveDate(dateInputSv(value))}
              placeholder="Valj datum"
              valueFormat="YYYY-MM-DD"
              clearable={false}
            />
          )}
          {mode === 'temporary' && (
            <DatePickerInput
              label="Tackning slutar"
              value={parseDateValue(coverageEndDate)}
              onChange={(value) => setCoverageEndDate(dateInputSv(value))}
              placeholder="Valj slutdatum"
              valueFormat="YYYY-MM-DD"
              clearable={false}
              minDate={parseDateValue(effectiveDate) ?? undefined}
            />
          )}
        </SimpleGrid>

        {mode === 'temporary' && (
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              Hur ska provisionen hanteras?
            </Text>
            <SegmentedControl
              fullWidth
              value={compensationMode}
              onChange={(value) =>
                setCompensationMode(value as CmCoverageCompensationMode)
              }
              data={[
                {
                  value: 'covering_cm',
                  label: 'Ersattare far payout',
                },
                {
                  value: 'primary_cm',
                  label: 'Ordinarie CM behaller payout',
                },
              ]}
            />
          </Stack>
        )}

        <Textarea
          label="Handover-notering"
          description="Intern kontext till assignmentet och eventuell coverage."
          minRows={3}
          value={handoverNote}
          onChange={(event) => setHandoverNote(event.currentTarget.value)}
          placeholder="Ex. overlapp i tre dagar, fortsatter pa planerat manadstema."
        />

        <Divider label="Konsekvens" labelPosition="center" />

        {!selectedCm ? (
          <Alert variant="light" color="gray" icon={<IconArrowRight size={16} />}>
            Valj en content manager for att se hur assignment och payout fordelas.
          </Alert>
        ) : previewQuery.isLoading || previewQuery.isFetching ? (
          <Text size="sm" c="dimmed">
            Raknar payout och periodeffekt...
          </Text>
        ) : preview ? (
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="sm" fw={600}>
                  Aktiv period
                </Text>
                <Text size="xs" c="dimmed">
                  {preview.period.label}
                </Text>
              </div>
              <Badge variant="light" color="gray" leftSection={<IconClock size={10} />}>
                {preview.period.total_days} dagar
              </Badge>
            </Group>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
              <PayoutRow
                label={preview.current.name}
                days={preview.current.days}
                amountOre={preview.current.payout_ore}
                color="gray"
              />
              <PayoutRow
                label={preview.next.name}
                days={preview.next.days}
                amountOre={preview.next.payout_ore}
                color="blue"
              />
            </SimpleGrid>

            {preview.retained_payout_ore > 0 && (
              <Paper withBorder radius="md" p="sm">
                <Group justify="space-between">
                  <Group gap="xs">
                    <ThemeIcon size="sm" variant="light" color="orange">
                      <IconCoins size={12} />
                    </ThemeIcon>
                    <Text size="sm">Retained payout till ordinarie CM</Text>
                  </Group>
                  <Text size="sm" fw={600}>
                    {formatSek(preview.retained_payout_ore, { unit: 'ore' })}
                  </Text>
                </Group>
              </Paper>
            )}

            {preview.warnings.length > 0 && (
              <Alert
                color="orange"
                variant="light"
                icon={<IconAlertTriangle size={16} />}
              >
                <Stack gap={4}>
                  {preview.warnings.map((warning) => (
                    <Text key={warning} size="sm">
                      {warning}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            )}
          </Stack>
        ) : (
          <Alert
            color="orange"
            variant="light"
            icon={<IconAlertTriangle size={16} />}
          >
            Preview kunde inte raknas. Kontrollera att kunden har ett pris och en aktiv CM-koppling.
          </Alert>
        )}

        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            Assignment-logiken och previewn bygger pa samma backendregler som payout-berakningen.
          </Text>
          <Group>
            <Button variant="default" onClick={handleClose}>
              Avbryt
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={isSaving}
            >
              {selectedMode.submitLabel}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
