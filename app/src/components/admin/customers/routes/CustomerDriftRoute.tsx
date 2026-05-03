'use client';

import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Grid,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import {
  IconActivity,
  IconArrowDownRight,
  IconArrowUpRight,
  IconCalendar,
  IconCalendarEvent,
  IconExternalLink,
  IconHeartFilled,
  IconUserCheck,
} from '@tabler/icons-react';

import AdminAvatar from '@/components/admin/AdminAvatar';
import { CustomerActivityTimeline } from '@/components/admin/customers/CustomerActivityTimeline';
import ChangeCMModal from '@/components/admin/customers/modals/ChangeCMModal';
import { PerformanceChart } from '@/components/admin/shared/PerformanceCharts';
import type {
  CustomerOverviewInitialData,
  CustomerPulseInitialData,
} from '@/lib/admin/dtos/customer-drift';
import { shortDateSv } from '@/lib/admin/time';

type DriftRouteProps = {
  customerId: string;
  overview: CustomerOverviewInitialData;
  pulse: CustomerPulseInitialData;
};

const DAY_NAMES: Record<string, string> = {
  '0': 'Mån',
  '1': 'Tis',
  '2': 'Ons',
  '3': 'Tor',
  '4': 'Fre',
  '5': 'Lör',
  '6': 'Sön',
};

function buildViewsWindow(
  videos: NonNullable<CustomerPulseInitialData['tiktok_stats']>['recent_videos'] = [],
  days = 30,
) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const labels = Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (days - 1 - index));
    return date.toISOString().slice(0, 10);
  });
  const buckets = new Map(labels.map((label) => [label, 0]));
  let totalViews = 0;
  let totalLikes = 0;
  for (const video of videos) {
    const key = new Date(video.uploaded_at).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + (video.views ?? 0));
    totalViews += video.views ?? 0;
    totalLikes += video.likes ?? 0;
  }
  return {
    labels,
    values: labels.map((label) => buckets.get(label) ?? 0),
    totalViews,
    likeRate: totalViews > 0 ? (totalLikes / totalViews) * 100 : 0,
    videoCount: videos.length,
  };
}

function commissionLabel(rate: number | null | undefined) {
  if (typeof rate !== 'number' || Number.isNaN(rate)) return null;
  return `${Math.round(rate * 100)}% provision`;
}

export function CustomerDriftRoute({
  customerId,
  overview,
  pulse,
}: DriftRouteProps) {
  const [changeCmOpen, setChangeCmOpen] = useState(false);

  const tiktokStats = pulse.tiktok_stats;
  const viewsWindow = tiktokStats ? buildViewsWindow(tiktokStats.recent_videos ?? []) : null;
  const followerDelta30d = tiktokStats?.follower_delta_30d ?? 0;
  const followerDelta7d = tiktokStats?.follower_delta_7d ?? 0;

  const expected = pulse.expected_concepts_per_week ?? 0;
  const planned = pulse.planned_concepts_this_week ?? 0;
  const deliveryRate = expected > 0 ? Math.min(100, (planned / expected) * 100) : 0;
  const isOnTrack = deliveryRate >= 80;

  const scheduleLabels = (pulse.upload_schedule ?? [])
    .slice()
    .sort()
    .map((day) => DAY_NAMES[day] ?? day)
    .join(', ');

  const currentCommission = commissionLabel(overview.account_manager_commission_rate);

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Visningar 30d
            </Text>
            <IconActivity size={16} color="var(--mantine-color-teal-6)" />
          </Group>
          <Text size="xl" fw={700}>
            {(viewsWindow?.totalViews ?? 0).toLocaleString('sv-SE')}
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            {viewsWindow?.videoCount ?? 0} klipp publicerade
          </Text>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Likes / view
            </Text>
            <IconHeartFilled size={14} color="var(--mantine-color-pink-6)" />
          </Group>
          <Text size="xl" fw={700}>
            {(viewsWindow?.likeRate ?? 0).toFixed(1)}%
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            Engagement-takt
          </Text>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Följare
            </Text>
            {followerDelta30d >= 0 ? (
              <IconArrowUpRight size={16} color="var(--mantine-color-green-6)" />
            ) : (
              <IconArrowDownRight size={16} color="var(--mantine-color-red-6)" />
            )}
          </Group>
          <Text size="xl" fw={700}>
            {(tiktokStats?.current_followers ?? 0).toLocaleString('sv-SE')}
          </Text>
          <Group gap={6} mt={2}>
            <Text size="xs" c={followerDelta30d >= 0 ? 'green' : 'red'} fw={600}>
              {followerDelta30d >= 0 ? '+' : ''}
              {followerDelta30d} (30d)
            </Text>
            <Text size="xs" c="dimmed">
              · {followerDelta7d >= 0 ? '+' : ''}
              {followerDelta7d} (7d)
            </Text>
          </Group>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Planeringstakt
            </Text>
            <IconCalendar size={16} color="var(--mantine-color-blue-6)" />
          </Group>
          <Text size="xl" fw={700}>
            {planned} / {expected}
          </Text>
          <Progress
            value={deliveryRate}
            color={isOnTrack ? 'green' : 'orange'}
            size="xs"
            radius="xl"
            mt={6}
          />
          {scheduleLabels ? (
            <Text size="xs" c="dimmed" mt={4}>
              {scheduleLabels}
            </Text>
          ) : null}
        </Paper>
      </SimpleGrid>

      {tiktokStats && tiktokStats.history.length > 0 ? (
        <Card withBorder padding="md">
          <Text size="sm" fw={600} mb="md" c="dimmed" tt="uppercase">
            Resultat-trend (30d)
          </Text>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Paper withBorder p="md" bg="gray.0">
              <Group justify="space-between" mb="sm">
                <div>
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                    Följartillväxt
                  </Text>
                  <Text size="xl" fw={700}>
                    {tiktokStats.current_followers.toLocaleString('sv-SE')}
                  </Text>
                </div>
                <Badge
                  color={tiktokStats.follower_delta_30d >= 0 ? 'green' : 'red'}
                  variant="filled"
                  size="lg"
                >
                  {tiktokStats.follower_delta_30d >= 0 ? '+' : ''}
                  {tiktokStats.follower_delta_30d}
                </Badge>
              </Group>
              <PerformanceChart
                data={tiktokStats.history.map((point) => point.followers)}
                labels={tiktokStats.history.map((point) => point.snapshot_date)}
                color="var(--mantine-color-blue-6)"
                height={80}
              />
            </Paper>

            <Paper withBorder p="md" bg="gray.0">
              <Group justify="space-between" mb="sm">
                <div>
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                    Visningar (30d)
                  </Text>
                  <Text size="xl" fw={700}>
                    {(viewsWindow?.totalViews || 0).toLocaleString('sv-SE')}
                  </Text>
                </div>
                <div className="text-right">
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                    Likes/view
                  </Text>
                  <Text size="sm" fw={700}>
                    {(viewsWindow?.likeRate || 0).toFixed(1)}%
                  </Text>
                  <Text size="xs" c="dimmed">
                    {viewsWindow?.videoCount || 0} klipp
                  </Text>
                </div>
              </Group>
              <PerformanceChart
                data={viewsWindow?.values || []}
                labels={viewsWindow?.labels}
                color="var(--mantine-color-teal-6)"
                height={80}
                scale="sqrt"
                baselineZero
                videos={tiktokStats.recent_videos || []}
              />
            </Paper>
          </SimpleGrid>
        </Card>
      ) : null}

      <Grid grow>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder padding="md" h="100%" id="cm">
            <Group justify="space-between" mb="xs">
              <Group gap={6}>
                <IconUserCheck size={16} />
                <Text size="sm" c="dimmed" fw={700} tt="uppercase">
                  Content manager
                </Text>
              </Group>
              <Button variant="light" size="compact-sm" onClick={() => setChangeCmOpen(true)}>
                Byt / täck tillfälligt
              </Button>
            </Group>

            {overview.account_manager_name ? (
              <Stack gap="sm" mt="sm">
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <AdminAvatar
                    name={overview.account_manager_name}
                    avatarUrl={overview.account_manager_avatar_url}
                    size="lg"
                  />
                  <Stack gap={4} style={{ minWidth: 0 }}>
                    <Text size="lg" fw={600} truncate>
                      {overview.account_manager_name}
                    </Text>
                    {overview.account_manager_email || overview.account_manager_city ? (
                      <Text size="xs" c="dimmed" truncate>
                        {overview.account_manager_city ?? overview.account_manager_email}
                      </Text>
                    ) : null}
                  </Stack>
                </Group>
                <Group gap="xs">
                  {currentCommission ? (
                    <Badge variant="light" color="blue">
                      {currentCommission}
                    </Badge>
                  ) : null}
                  {overview.account_manager_since ? (
                    <Badge variant="light" color="gray">
                      CM sedan {shortDateSv(overview.account_manager_since)}
                    </Badge>
                  ) : null}
                </Group>

                <Paper withBorder p="xs" radius="md" bg="gray.0">
                  <Group gap={6} mb={4}>
                    <IconActivity size={14} />
                    <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                      Senaste aktivitet
                    </Text>
                  </Group>
                  <Text size="sm">
                    {pulse.last_cm_action_at ? (
                      <>
                        <Text component="span" fw={600}>
                          {formatDistanceToNow(new Date(pulse.last_cm_action_at), {
                            addSuffix: true,
                            locale: sv,
                          })}
                        </Text>
                        {pulse.last_cm_action_type ? <> · {pulse.last_cm_action_type}</> : null}
                      </>
                    ) : (
                      'Ingen aktivitet registrerad'
                    )}
                  </Text>
                  <Text size="xs" c="dimmed" mt={2}>
                    {pulse.delivered_concepts_this_week} klipp publicerade senaste 7d
                  </Text>
                </Paper>

                {overview.scheduled_cm_change ? (
                  <Group gap="xs" wrap="nowrap">
                    <ThemeIcon size="sm" variant="light" color="orange">
                      <IconCalendarEvent size={12} />
                    </ThemeIcon>
                    <Text size="xs" c="dimmed">
                      Schemalagt byte till{' '}
                      {overview.scheduled_cm_change.next_cm_name ?? 'ingen CM'}{' '}
                      {shortDateSv(overview.scheduled_cm_change.effective_date)}
                    </Text>
                  </Group>
                ) : null}
              </Stack>
            ) : (
              <Stack gap="sm" mt="sm" align="flex-start">
                <Text size="sm" c="dimmed">
                  Ingen CM tilldelad.
                </Text>
                <Button size="xs" onClick={() => setChangeCmOpen(true)}>
                  Tilldela CM
                </Button>
              </Stack>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder padding="md" h="100%">
            <Group gap={6} mb="sm">
              <Text size="sm" c="dimmed" fw={700} tt="uppercase">
                Senaste publiceringar
              </Text>
            </Group>
            {pulse.recent_publications.length === 0 ? (
              <Box p="md" ta="center">
                <Text size="sm" c="dimmed" fs="italic">
                  Inga publiceringar registrerade.
                </Text>
              </Box>
            ) : (
              <Stack gap="xs">
                {pulse.recent_publications.slice(0, 6).map((publication) => (
                  <Group
                    key={publication.id}
                    justify="space-between"
                    wrap="nowrap"
                    gap="sm"
                    align="flex-start"
                  >
                    <Box style={{ minWidth: 0, flex: 1 }}>
                      <Text size="sm" fw={500} lineClamp={1}>
                        {publication.title || 'Utan titel'}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {format(new Date(publication.published_at), "d MMM yyyy 'kl' HH:mm", {
                          locale: sv,
                        })}
                      </Text>
                    </Box>
                    {publication.url ? (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        component="a"
                        href={publication.url}
                        target="_blank"
                        rightSection={<IconExternalLink size={12} />}
                      >
                        Öppna
                      </Button>
                    ) : null}
                  </Group>
                ))}
              </Stack>
            )}
          </Card>
        </Grid.Col>
      </Grid>

      <Divider />

      <CustomerActivityTimeline
        customerId={customerId}
        title="Tidslinje & anteckningar"
        enableNotes
        limit={20}
        showFooter
      />

      <ChangeCMModal
        open={changeCmOpen}
        customerId={customerId}
        customerName={overview.business_name}
        currentAccountManagerId={overview.account_manager_id}
        currentAccountManagerName={overview.account_manager_name}
        currentAccountManagerAvatarUrl={overview.account_manager_avatar_url}
        currentAccountManagerEmail={overview.account_manager_email}
        currentAccountManagerCity={overview.account_manager_city}
        currentAccountManagerCommissionRate={overview.account_manager_commission_rate}
        currentAccountManagerSince={overview.account_manager_since}
        currentCmId={overview.account_manager_member_id}
        onClose={() => setChangeCmOpen(false)}
      />
    </Stack>
  );
}
