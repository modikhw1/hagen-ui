'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import {
  Card,
  Button,
  Badge,
  Divider,
  Group,
  Text,
  Stack,
  Grid,
  Avatar,
  RingProgress,
  Center,
  Tooltip,
  ThemeIcon,
} from '@mantine/core';
import {
  IconExternalLink,
  IconAlertTriangle,
  IconCheck,
  IconBrandStripe,
  IconSparkles,
  IconMail,
  IconCopy,
  IconCircleCheck,
  IconCalendarEvent,
  IconClock,
  IconCoins,
} from '@tabler/icons-react';
import { toast } from 'sonner';

import AdminAvatar from '@/components/admin/AdminAvatar';
import ChangeCMModal from '@/components/admin/customers/modals/ChangeCMModal';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { shortDateSv } from '@/lib/admin/time';
import type { CustomerPulseInitialData } from './CustomerPulseRoute';
import type { DerivedCustomerStatus } from '@/lib/admin/customer-status';

export interface CustomerOverviewInitialData {
  business_name: string;
  status:
    | 'active'
    | 'paused'
    | 'archived'
    | 'prospect'
    | 'invited'
    | 'pending';
  derived_status?: DerivedCustomerStatus | string | null;
  invited_at?: string | null;
  paused_until: string | null;
  monthly_price_ore: number;
  account_manager_id: string | null;
  account_manager_member_id: string | null;
  account_manager_name: string | null;
  account_manager_avatar_url: string | null;
  account_manager_email: string | null;
  account_manager_city: string | null;
  account_manager_commission_rate: number | null;
  account_manager_since: string | null;
  scheduled_cm_change?: {
    effective_date: string;
    next_cm_name: string | null;
  } | null;
  next_invoice_estimate_ore: number;
  next_invoice_date: string | null;
  last_activity_at: string | null;
  last_activity_summary: string | null;
  stripe_customer_id: string | null;
  tiktok_handle: string | null;
  tiktok_profile_pic_url: string | null;
}

export interface CustomerOverviewRouteProps {
  customerId: string;
  initialData: CustomerOverviewInitialData;
  pulseData?: CustomerPulseInitialData;
}

function commissionLabel(rate: number | null) {
  if (typeof rate !== 'number' || Number.isNaN(rate)) return null;
  return `${Math.round(rate * 100)}% provision`;
}

export function CustomerOverviewRoute({
  customerId,
  initialData,
  pulseData,
}: CustomerOverviewRouteProps) {
  const router = useRouter();
  const [changeCmOpen, setChangeCmOpen] = useState(false);

  const pauseMutation = useCustomerMutation(customerId, 'pause_subscription');
  const resumeMutation = useCustomerMutation(customerId, 'resume_subscription');
  const refresh = useAdminRefresh();

  const handleStatusToggle = async () => {
    const isPaused = initialData.status === 'paused';
    const mutation = isPaused ? resumeMutation : pauseMutation;

    try {
      await mutation.mutateAsync({});
      toast.success(isPaused ? 'Kund återupptagen.' : 'Kund pausad.');
      await refresh([{ type: 'customer', customerId }, 'customers']);
    } catch {
      // Hook handles error toast.
    }
  };

  const copyInviteLink = () => {
    const url = `${window.location.origin}/onboarding/welcome?id=${customerId}`;
    navigator.clipboard.writeText(url);
    toast.success('Inbjudningslänk kopierad till urklipp.');
  };

  const expected = pulseData?.expected_concepts_per_week ?? 0;
  const planned = pulseData?.planned_concepts_this_week ?? 0;
  const bufferHealth = expected > 0 ? planned / expected : 1;
  const isUnderplanned = expected > 0 && planned < expected;
  const dStatus = initialData.derived_status;
  const currentCommission = commissionLabel(
    initialData.account_manager_commission_rate,
  );

  return (
    <Stack gap="md">
      {dStatus === 'prospect' && (
        <Card
          withBorder
          padding="md"
          bg="blue.0"
          style={{ borderColor: 'var(--mantine-color-blue-2)' }}
        >
          <Group justify="space-between">
            <Group gap="md">
              <IconSparkles size={24} className="text-blue-600" />
              <div>
                <Text size="sm" fw={700} c="blue.9">
                  Shadow-profil (Demo)
                </Text>
                <Text size="xs" c="blue.8">
                  Denna kund är i demo-stadiet. Förbered deras Studio-vy innan
                  du konverterar till skarp kund.
                </Text>
              </div>
            </Group>
            <Button
              size="xs"
              variant="white"
              color="blue"
              leftSection={<IconExternalLink size={14} />}
              component="a"
              href={`/studio/customers/${customerId}`}
              target="_blank"
            >
              Öppna Studio
            </Button>
          </Group>
        </Card>
      )}

      {(dStatus === 'invited_new' || dStatus === 'invited_stale') && (
        <Card
          withBorder
          padding="md"
          bg="orange.0"
          style={{ borderColor: 'var(--mantine-color-orange-2)' }}
        >
          <Group justify="space-between">
            <Group gap="md">
              <IconMail size={24} className="text-orange-600" />
              <div>
                <Text size="sm" fw={700} c="orange.9">
                  Inbjudan skickad
                </Text>
                <Text size="xs" c="orange.8">
                  Väntar på att kunden ska acceptera och sätta upp betalning.
                  {initialData.invited_at &&
                    ` Skickades ${format(new Date(initialData.invited_at), 'd MMM', {
                      locale: sv,
                    })}.`}
                </Text>
              </div>
            </Group>
            <Button
              size="xs"
              variant="white"
              color="orange"
              leftSection={<IconCopy size={14} />}
              onClick={copyInviteLink}
            >
              Kopiera inbjudningslänk
            </Button>
          </Group>
        </Card>
      )}

      {dStatus === 'stripe_error' && (
        <Card
          withBorder
          padding="md"
          bg="red.0"
          style={{ borderColor: 'var(--mantine-color-red-2)' }}
        >
          <Group gap="md">
            <IconAlertTriangle size={24} className="text-red-600" />
            <div>
              <Text size="sm" fw={700} c="red.9">
                Stripe-synk saknas
              </Text>
              <Text size="xs" c="red.8">
                Kunden är inbjuden men har ingen koppling till Stripe. Detta
                kan bero på att konverteringen avbröts.
              </Text>
            </div>
          </Group>
        </Card>
      )}

      {dStatus === 'live_underfilled' && (
        <Card
          withBorder
          padding="md"
          bg="yellow.0"
          style={{ borderColor: 'var(--mantine-color-yellow-2)' }}
        >
          <Group justify="space-between">
            <Group gap="md">
              <IconAlertTriangle size={24} className="text-yellow-600" />
              <div>
                <Text size="sm" fw={700} c="yellow.9">
                  Behöver planeras
                </Text>
                <Text size="xs" c="yellow.8">
                  Kundens planeringsbuffert är låg ({planned} av {expected}{' '}
                  koncept). Fyll på Feed Plannern för att säkra rutinen.
                </Text>
              </div>
            </Group>
            <Button
              size="xs"
              variant="white"
              color="yellow"
              leftSection={<IconExternalLink size={14} />}
              component="a"
              href={`/studio/customers/${customerId}`}
              target="_blank"
            >
              Planera i Studio
            </Button>
          </Group>
        </Card>
      )}

      {dStatus === 'live_healthy' && (
        <Card
          withBorder
          padding="md"
          bg="green.0"
          style={{ borderColor: 'var(--mantine-color-green-2)' }}
        >
          <Group gap="md">
            <IconCircleCheck size={24} className="text-green-600" />
            <div>
              <Text size="sm" fw={700} c="green.9">
                Produktion rullar
              </Text>
              <Text size="xs" c="green.8">
                Allt ser bra ut. Bufferten är godkänd och senaste aktiviteten
                var {initialData.last_activity_summary}.
              </Text>
            </div>
          </Group>
        </Card>
      )}

      <Card withBorder padding="md">
        <Group justify="space-between">
          <Group gap="lg">
            <Avatar src={initialData.tiktok_profile_pic_url} size={60} radius="md" />
            <div>
              <Text size="xl" fw={700}>
                {initialData.business_name}
              </Text>
              <Group gap="xs" mt={4}>
                <Badge
                  color={
                    initialData.status === 'active'
                      ? 'blue'
                      : initialData.status === 'paused'
                        ? 'gray'
                        : 'red'
                  }
                  variant="light"
                >
                  {initialData.status === 'active' && 'Aktiv'}
                  {initialData.status === 'paused' && 'Pausad'}
                  {initialData.status === 'archived' && 'Arkiverad'}
                  {initialData.status === 'prospect' && 'Prospect'}
                  {initialData.status === 'invited' && 'Inbjuden'}
                </Badge>
                {initialData.tiktok_handle && (
                  <Text
                    size="xs"
                    c="dimmed"
                    component="a"
                    href={`https://tiktok.com/@${initialData.tiktok_handle.replace('@', '')}`}
                    target="_blank"
                    className="hover:underline"
                  >
                    @{initialData.tiktok_handle.replace('@', '')}
                  </Text>
                )}
              </Group>
            </div>
          </Group>
          <Group gap="xs">
            {initialData.stripe_customer_id && (
              <Tooltip label="Öppna i Stripe">
                <Button
                  variant="subtle"
                  color="gray"
                  component="a"
                  href={`https://dashboard.stripe.com/customers/${initialData.stripe_customer_id}`}
                  target="_blank"
                  leftSection={<IconBrandStripe size={16} />}
                >
                  Stripe
                </Button>
              </Tooltip>
            )}
            {initialData.status !== 'archived' &&
              initialData.status !== 'prospect' && (
                <Button
                  variant="light"
                  color={initialData.status === 'paused' ? 'blue' : 'gray'}
                  onClick={handleStatusToggle}
                  loading={pauseMutation.isPending || resumeMutation.isPending}
                >
                  {initialData.status === 'paused' ? 'Återuppta' : 'Pausa'}
                </Button>
              )}
          </Group>
        </Group>
      </Card>

      <Grid grow>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder padding="md" h="100%">
            <Text size="sm" fw={500} c="dimmed" mb="md">
              Planeringsbuffert
            </Text>
            <Group justify="center" align="center">
              <RingProgress
                size={120}
                thickness={12}
                roundCaps
                sections={[
                  {
                    value: Math.min(bufferHealth * 100, 100),
                    color: isUnderplanned ? 'red' : 'green',
                  },
                ]}
                label={
                  <Center>
                    {isUnderplanned ? (
                      <IconAlertTriangle
                        style={{ width: 30, height: 30 }}
                        color="red"
                      />
                    ) : (
                      <IconCheck
                        style={{ width: 30, height: 30 }}
                        color="green"
                      />
                    )}
                  </Center>
                }
              />
              <Stack gap={0}>
                <Text size="xl" fw={700}>
                  {planned} / {expected}
                </Text>
                <Text size="xs" c="dimmed">
                  koncept denna vecka
                </Text>
                {isUnderplanned && (
                  <Text size="xs" c="red" fw={500} mt={4}>
                    Underplanerad
                  </Text>
                )}
              </Stack>
            </Group>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder padding="md" h="100%">
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500} c="dimmed">
                Content manager
              </Text>
              <Button
                variant="subtle"
                size="compact-sm"
                onClick={() => setChangeCmOpen(true)}
              >
                Byt
              </Button>
            </Group>
            {initialData.account_manager_name ? (
              <Stack gap="sm" mt="sm">
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <AdminAvatar
                    name={initialData.account_manager_name}
                    avatarUrl={initialData.account_manager_avatar_url}
                    size="lg"
                  />
                  <Stack gap={4} style={{ minWidth: 0 }}>
                    <Text size="lg" fw={600} truncate>
                      {initialData.account_manager_name}
                    </Text>
                    {(initialData.account_manager_email ||
                      initialData.account_manager_city) && (
                      <Text size="xs" c="dimmed" truncate>
                        {initialData.account_manager_city ??
                          initialData.account_manager_email}
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
                  {initialData.account_manager_since && (
                    <Badge variant="light" color="gray">
                      CM sedan {shortDateSv(initialData.account_manager_since)}
                    </Badge>
                  )}
                </Group>
                {initialData.scheduled_cm_change && (
                  <Group gap="xs" wrap="nowrap">
                    <ThemeIcon size="sm" variant="light" color="orange">
                  <IconCalendarEvent size={12} />
                    </ThemeIcon>
                    <Text size="xs" c="dimmed">
                      Schemalagt byte till{' '}
                      {initialData.scheduled_cm_change.next_cm_name ??
                        'ingen CM'}{' '}
                      {shortDateSv(
                        initialData.scheduled_cm_change.effective_date,
                      )}
                    </Text>
                  </Group>
                )}
                {initialData.last_activity_at && (
                  <Group gap="xs" wrap="nowrap">
                    <ThemeIcon size="sm" variant="light" color="gray">
                      <IconClock size={12} />
                    </ThemeIcon>
                    <Text size="xs" c="dimmed">
                      Senast aktiv:{' '}
                      {format(new Date(initialData.last_activity_at), 'd MMM HH:mm', {
                        locale: sv,
                      })}
                    </Text>
                  </Group>
                )}
              </Stack>
            ) : (
              <Stack gap="xs" mt="sm">
                <Text size="sm" fw={500}>
                  Ingen CM tilldelad
                </Text>
                <Text size="xs" c="dimmed">
                  Välj en content manager för att ge kunden tydligt ägarskap och
                  korrekt payout-fördelning.
                </Text>
              </Stack>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder padding="md" h="100%">
            <Group justify="space-between" mb="xs">
              <Text size="sm" fw={500} c="dimmed">
                Nästa faktura (est.)
              </Text>
              <Button
                variant="subtle"
                size="compact-sm"
                onClick={() => router.push(`/admin/customers/${customerId}/billing`)}
              >
                Detaljer
              </Button>
            </Group>
            <Stack gap="xs" mt="sm">
              <Group gap="xs" align="center">
                <ThemeIcon size="lg" variant="light" color="blue">
                  <IconCoins size={18} />
                </ThemeIcon>
                <Text
                  size="xl"
                  fw={700}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {(initialData.next_invoice_estimate_ore / 100).toLocaleString(
                    'sv-SE',
                    {
                      style: 'currency',
                      currency: 'SEK',
                      maximumFractionDigits: 0,
                    },
                  )}
                </Text>
              </Group>
              {initialData.next_invoice_date && (
                <Text size="xs" c="dimmed">
                  Dras{' '}
                  {format(new Date(initialData.next_invoice_date), 'd MMM yyyy', {
                    locale: sv,
                  })}
                </Text>
              )}
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      <Divider label="Senaste operativa händelser" labelPosition="center" />

      <Card withBorder padding="md">
        <Group justify="space-between" mb="md">
          <Text size="sm" fw={600}>
            Händelselogg
          </Text>
          <Button
            variant="subtle"
            size="compact-sm"
            onClick={() => router.push(`/admin/customers/${customerId}/pulse`)}
            rightSection={<IconExternalLink size={14} />}
          >
            Fullständig puls
          </Button>
        </Group>
        {initialData.last_activity_at ? (
          <Stack gap="xs">
            <div className="flex items-start gap-3 rounded-md bg-secondary/20 p-3">
              <div className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
              <div className="flex-1">
                <Text size="sm" fw={500}>
                  {initialData.last_activity_summary}
                </Text>
                <Text size="xs" c="dimmed">
                  {format(new Date(initialData.last_activity_at), "d MMMM 'kl' HH:mm", {
                    locale: sv,
                  })}
                </Text>
              </div>
            </div>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed" fs="italic">
            Ingen aktivitet registrerad nyligen.
          </Text>
        )}
      </Card>

      <ChangeCMModal
        open={changeCmOpen}
        onOpenChange={setChangeCmOpen}
        customerId={customerId}
        customerName={initialData.business_name}
        currentAccountManagerId={initialData.account_manager_id}
        currentAccountManagerName={initialData.account_manager_name}
        currentAccountManagerAvatarUrl={initialData.account_manager_avatar_url}
        currentAccountManagerEmail={initialData.account_manager_email}
        currentAccountManagerCity={initialData.account_manager_city}
        currentAccountManagerCommissionRate={
          initialData.account_manager_commission_rate
        }
        currentAccountManagerSince={initialData.account_manager_since}
        currentCmId={initialData.account_manager_member_id}
      />
    </Stack>
  );
}
