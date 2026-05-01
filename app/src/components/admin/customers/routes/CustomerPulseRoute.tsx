'use client';

import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  IconActivity,
  IconAlertTriangle,
  IconArrowDownRight,
  IconArrowUpRight,
  IconCalendar,
  IconCash,
  IconCircleCheckFilled,
  IconExternalLink,
  IconHeartFilled,
  IconPlayerPause,
  IconPlus,
  IconReceipt,
  IconUserCircle,
  IconUsers,
} from '@tabler/icons-react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import Link from 'next/link';
import { PerformanceChart } from '@/components/admin/shared/PerformanceCharts';
import type { CustomerOverviewInitialData } from './CustomerOverviewRoute';

type TikTokPulseHistoryPoint = {
  snapshot_date: string;
  followers: number;
  total_videos: number;
  videos_last_24h: number;
  total_views_24h: number;
  engagement_rate: number;
};

type TikTokPulseVideo = {
  video_id: string;
  uploaded_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  share_url: string | null;
  cover_image_url: string | null;
  description?: string | null;
};

export interface CustomerPulseInitialData {
  last_cm_action_at: string | null;
  last_cm_action_type: string | null;
  last_cm_action_by: string | null;
  planned_concepts_this_week: number;
  expected_concepts_per_week: number;
  delivered_concepts_this_week: number;
  recent_publications: Array<{
    id: string;
    title: string | null;
    description?: string | null;
    published_at: string;
    platform: string;
    url: string | null;
  }>;
  tiktok_stats?: {
    history: TikTokPulseHistoryPoint[];
    current_followers: number;
    follower_delta_7d: number;
    follower_delta_30d: number;
    avg_engagement: number;
    recent_videos?: TikTokPulseVideo[];
  } | null;
  upload_schedule?: string[] | null;
}

const DAY_NAMES: Record<string, string> = {
  '0': 'Man',
  '1': 'Tis',
  '2': 'Ons',
  '3': 'Tor',
  '4': 'Fre',
  '5': 'Lor',
  '6': 'Son',
};

type ViewsWindowSummary = {
  labels: string[];
  values: number[];
  totalViews: number;
  totalLikes: number;
  aggregateLikeRate: number;
  videoCount: number;
};

function toUtcDayKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function truncateText(value: string | null | undefined, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildViewsWindow(videos: TikTokPulseVideo[], days = 30): ViewsWindowSummary {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);

  const labels = Array.from({ length: days }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (days - 1 - index));
    return date.toISOString().slice(0, 10);
  });

  const buckets = new Map(
    labels.map((label) => [
      label,
      {
        views: 0,
        interactions: 0,
      },
    ]),
  );

  let totalViews = 0;
  let totalLikes = 0;

  for (const video of videos) {
    const dayKey = toUtcDayKey(video.uploaded_at);
    const bucket = buckets.get(dayKey);
    if (!bucket) {
      continue;
    }

    const interactions = (video.likes ?? 0) + (video.comments ?? 0) + (video.shares ?? 0);
    bucket.views += video.views ?? 0;
    bucket.interactions += interactions;
    totalViews += video.views ?? 0;
    totalLikes += video.likes ?? 0;
  }

  return {
    labels,
    values: labels.map((label) => buckets.get(label)?.views ?? 0),
    totalViews,
    totalLikes,
    aggregateLikeRate: totalViews > 0 ? (totalLikes / totalViews) * 100 : 0,
    videoCount: videos.length,
  };
}

export interface CustomerPulseRouteProps {
  customerId: string;
  initialData: CustomerPulseInitialData;
  overview?: CustomerOverviewInitialData;
}

function formatOre(ore: number | null | undefined): string {
  if (typeof ore !== 'number' || Number.isNaN(ore)) return '–';
  return `${Math.round(ore / 100).toLocaleString('sv-SE')} kr`;
}

function computeHealth(args: {
  isOnTrack: boolean;
  followerDelta30d: number;
  scheduledChange: boolean;
  noActivityDays: number | null;
}): { label: string; color: 'green' | 'orange' | 'red'; reason: string } {
  const reasons: string[] = [];
  let level: 'green' | 'orange' | 'red' = 'green';

  if (args.noActivityDays !== null && args.noActivityDays >= 14) {
    level = 'red';
    reasons.push(`Ingen CM-aktivitet på ${args.noActivityDays}d`);
  } else if (args.noActivityDays !== null && args.noActivityDays >= 7) {
    if (level === 'green') level = 'orange';
    reasons.push(`Lugnt senaste ${args.noActivityDays}d`);
  }

  if (!args.isOnTrack) {
    if (level === 'green') level = 'orange';
    reasons.push('Planeringen ligger efter');
  }

  if (args.followerDelta30d < 0) {
    if (level === 'green') level = 'orange';
    reasons.push('Föjlartappet senaste 30d');
  }

  if (args.scheduledChange) {
    reasons.push('CM-byte planerat');
  }

  return {
    label: level === 'green' ? 'Frisk' : level === 'orange' ? 'Bevaka' : 'Risk',
    color: level,
    reason: reasons.length === 0 ? 'Allt rullar enligt plan.' : reasons.join(' · '),
  };
}

export function CustomerPulseRoute({ customerId, initialData, overview }: CustomerPulseRouteProps) {
  const data = initialData;
  const [renderedAt] = useState(() => Date.now());

  const deliveryRate =
    data.expected_concepts_per_week > 0
      ? Math.min(100, (data.planned_concepts_this_week / data.expected_concepts_per_week) * 100)
      : 0;

  const isOnTrack = deliveryRate >= 80;
  const tStats = data.tiktok_stats;
  const viewsWindow = tStats ? buildViewsWindow(tStats.recent_videos || []) : null;

  const scheduleLabels = (data.upload_schedule ?? [])
    .sort()
    .map((day) => DAY_NAMES[day] || day)
    .join(', ');

  const noActivityDays = data.last_cm_action_at
    ? Math.floor(
        (renderedAt - new Date(data.last_cm_action_at).getTime()) / (1000 * 60 * 60 * 24),
      )
    : null;

  const followerDelta30d = tStats?.follower_delta_30d ?? 0;
  const followerDelta7d = tStats?.follower_delta_7d ?? 0;
  const totalViews = viewsWindow?.totalViews ?? 0;
  const likeRate = viewsWindow?.aggregateLikeRate ?? 0;

  const health = computeHealth({
    isOnTrack,
    followerDelta30d,
    scheduledChange: !!overview?.scheduled_cm_change,
    noActivityDays,
  });

  return (
    <Stack gap="lg">
      {/* HEALTH HERO */}
      <Card
        withBorder
        padding="lg"
        style={{
          background:
            health.color === 'green'
              ? 'linear-gradient(135deg, var(--mantine-color-green-0), var(--mantine-color-teal-0))'
              : health.color === 'orange'
                ? 'linear-gradient(135deg, var(--mantine-color-yellow-0), var(--mantine-color-orange-0))'
                : 'linear-gradient(135deg, var(--mantine-color-red-0), var(--mantine-color-pink-0))',
        }}
      >
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="md" align="center" wrap="nowrap">
            {health.color === 'green' ? (
              <IconCircleCheckFilled size={36} color="var(--mantine-color-green-6)" />
            ) : (
              <IconAlertTriangle
                size={36}
                color={health.color === 'orange' ? 'var(--mantine-color-orange-6)' : 'var(--mantine-color-red-6)'}
              />
            )}
            <div>
              <Group gap="xs" align="center">
                <Text size="lg" fw={700}>
                  Status: {health.label}
                </Text>
                <Badge color={health.color} variant="light" size="sm">
                  {isOnTrack ? 'I fas' : 'Efter plan'}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed" mt={2}>
                {health.reason}
              </Text>
            </div>
          </Group>
          <Button
            variant="default"
            size="xs"
            component="a"
            href={`/studio/customers/${customerId}`}
            target="_blank"
            leftSection={<IconExternalLink size={14} />}
          >
            Öppna i Studio
          </Button>
        </Group>
      </Card>

      {/* KPI ROW */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Visningar 30d
            </Text>
            <IconActivity size={16} color="var(--mantine-color-teal-6)" />
          </Group>
          <Text size="xl" fw={700}>
            {totalViews.toLocaleString('sv-SE')}
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
            {likeRate.toFixed(1)}%
          </Text>
          <Text size="xs" c="dimmed" mt={2}>
            Engagement-takt
          </Text>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Föjlare
            </Text>
            {followerDelta30d >= 0 ? (
              <IconArrowUpRight size={16} color="var(--mantine-color-green-6)" />
            ) : (
              <IconArrowDownRight size={16} color="var(--mantine-color-red-6)" />
            )}
          </Group>
          <Text size="xl" fw={700}>
            {(tStats?.current_followers ?? 0).toLocaleString('sv-SE')}
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
            {data.planned_concepts_this_week} / {data.expected_concepts_per_week}
          </Text>
          <Progress
            value={deliveryRate}
            color={isOnTrack ? 'green' : 'orange'}
            size="xs"
            radius="xl"
            mt={6}
          />
          {scheduleLabels && (
            <Text size="xs" c="dimmed" mt={4}>
              {scheduleLabels}
            </Text>
          )}
        </Paper>
      </SimpleGrid>

      {/* QUICK ACTIONS */}
      <Paper withBorder p="sm" radius="md">
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Text size="xs" c="dimmed" fw={600} tt="uppercase" pl={6}>
            Snabbåtgärder
          </Text>
          <Group gap="xs" wrap="wrap">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconCash size={14} />}
              component={Link}
              href={`/admin/customers/${customerId}/subscription/price`}
              scroll={false}
            >
              Ändra abb-pris
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              component={Link}
              href={`/admin/customers/${customerId}/billing/manual-invoice`}
              scroll={false}
            >
              Lägg fakturarad
            </Button>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconUsers size={14} />}
              component={Link}
              href={`/admin/customers/${customerId}/team/change`}
              scroll={false}
            >
              Byt CM
            </Button>
            <Button
              size="xs"
              variant="subtle"
              color="gray"
              leftSection={<IconReceipt size={14} />}
              component={Link}
              href={`/admin/customers/${customerId}/billing`}
            >
              Fakturor
            </Button>
            <Tooltip label="Pausa kunden">
              <ActionIcon
                size="lg"
                variant="subtle"
                color="gray"
                component={Link}
                href={`/admin/customers/${customerId}/operations`}
              >
                <IconPlayerPause size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Paper>

      {tStats && tStats.history.length > 0 && (
        <Card withBorder padding="md">
          <Text size="sm" fw={600} mb="md" c="dimmed" tt="uppercase">
            Resultat-trend (30d)
          </Text>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Paper withBorder p="md" bg="gray.0">
              <Group justify="space-between" mb="sm">
                <div>
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                    Föjlartillväxt
                  </Text>
                  <Text size="xl" fw={700}>
                    {tStats.current_followers.toLocaleString('sv-SE')}
                  </Text>
                </div>
                <Badge
                  color={tStats.follower_delta_30d >= 0 ? 'green' : 'red'}
                  variant="filled"
                  size="lg"
                >
                  {tStats.follower_delta_30d >= 0 ? '+' : ''}
                  {tStats.follower_delta_30d}
                </Badge>
              </Group>
              <PerformanceChart
                data={tStats.history.map((point) => point.followers)}
                labels={tStats.history.map((point) => point.snapshot_date)}
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
                    {(viewsWindow?.aggregateLikeRate || 0).toFixed(1)}%
                  </Text>
                  <Text size="10px" c="dimmed">
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
                videos={tStats.recent_videos || []}
              />
            </Paper>
          </SimpleGrid>
        </Card>
      )}

      {/* CM + ABB-PRIS BREDVID HÄNDELSELOGG */}
      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
        {overview && (
          <Card withBorder padding="md" radius="md">
            <Group gap="xs" mb="sm">
              <IconUserCircle size={16} color="var(--mantine-color-gray-6)" />
              <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                Content Manager
              </Text>
            </Group>
            <Group gap="sm" wrap="nowrap" align="center">
              <Avatar
                src={overview.account_manager_avatar_url}
                size={44}
                radius="xl"
                color="blue"
              >
                {overview.account_manager_name?.[0] ?? '?'}
              </Avatar>
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} truncate>
                  {overview.account_manager_name ?? 'Ingen tilldelad'}
                </Text>
                {overview.account_manager_email && (
                  <Text size="xs" c="dimmed" truncate>
                    {overview.account_manager_email}
                  </Text>
                )}
              </div>
            </Group>
            {overview.scheduled_cm_change && (
              <Paper withBorder p="xs" mt="sm" bg="yellow.0">
                <Text size="xs" fw={600} c="orange.8">
                  Byte planerat
                </Text>
                <Text size="xs" c="dimmed">
                  Till {overview.scheduled_cm_change.next_cm_name ?? '?'} den{' '}
                  {format(new Date(overview.scheduled_cm_change.effective_date), 'd MMM', {
                    locale: sv,
                  })}
                </Text>
              </Paper>
            )}
            <Button
              size="xs"
              variant="subtle"
              mt="sm"
              fullWidth
              component={Link}
              href={`/admin/customers/${customerId}/team/change`}
              scroll={false}
            >
              Byt eller schemalägg
            </Button>
          </Card>
        )}

        {overview && (
          <Card withBorder padding="md" radius="md">
            <Group gap="xs" mb="sm">
              <IconCash size={16} color="var(--mantine-color-gray-6)" />
              <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                Abonnemang
              </Text>
            </Group>
            <Text size="xl" fw={700}>
              {formatOre(overview.monthly_price_ore)}
              <Text component="span" size="xs" c="dimmed" fw={500}>
                {' '}
                / mån
              </Text>
            </Text>
            <Stack gap={2} mt="xs">
              <Text size="xs" c="dimmed">
                Nästa faktura:{' '}
                <Text component="span" size="xs" c="dark" fw={600}>
                  {formatOre(overview.next_invoice_estimate_ore)}
                </Text>
                {overview.next_invoice_date && (
                  <>
                    {' '}
                    ·{' '}
                    {format(new Date(overview.next_invoice_date), 'd MMM', {
                      locale: sv,
                    })}
                  </>
                )}
              </Text>
            </Stack>
            <Group gap="xs" mt="sm">
              <Button
                size="xs"
                variant="light"
                component={Link}
                href={`/admin/customers/${customerId}/subscription/price`}
                scroll={false}
                style={{ flex: 1 }}
              >
                Ändra pris
              </Button>
              <Button
                size="xs"
                variant="subtle"
                component={Link}
                href={`/admin/customers/${customerId}/billing/manual-invoice`}
                scroll={false}
                style={{ flex: 1 }}
              >
                + Rad
              </Button>
            </Group>
          </Card>
        )}

        <Card withBorder padding="md" radius="md">
          <Group gap="xs" mb="sm">
            <IconActivity size={16} color="var(--mantine-color-gray-6)" />
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              CM-aktivitet
            </Text>
          </Group>
          <Text size="xl" fw={700}>
            {data.delivered_concepts_this_week}
          </Text>
          <Text size="xs" c="dimmed">
            klipp publicerade (7d)
          </Text>
          <Divider my="sm" />
          <Text size="xs" c="dimmed">
            {data.last_cm_action_at ? (
              <>
                Senast aktiv{' '}
                <Text component="span" fw={600} c="dark">
                  {formatDistanceToNow(new Date(data.last_cm_action_at), {
                    addSuffix: true,
                    locale: sv,
                  })}
                </Text>
                {data.last_cm_action_type && <> · {data.last_cm_action_type}</>}
              </>
            ) : (
              <>Ingen aktivitet registrerad</>
            )}
          </Text>
        </Card>
      </SimpleGrid>

      <Divider label="Senaste publikationer" labelPosition="center" />

      <Card withBorder padding={0}>
        {data.recent_publications.length === 0 ? (
          <Box p="xl" ta="center">
            <Text size="sm" c="dimmed" fs="italic">
              Inga nyliga publikationer hittades.
            </Text>
          </Box>
        ) : (
          <Stack gap={0}>
            {data.recent_publications.map((publication, index) => (
              <Box
                key={publication.id}
                p="md"
                style={{
                  borderBottom:
                    index === data.recent_publications.length - 1
                      ? 'none'
                      : '1px solid var(--mantine-color-gray-2)',
                }}
              >
                <Group justify="space-between">
                  <Stack gap={2}>
                    <Text size="sm" fw={600}>
                      {truncateText(publication.title, 56) || 'Namnlöst klipp'}
                    </Text>
                    {publication.description && publication.description !== publication.title && (
                      <Text size="xs" c="dimmed" lineClamp={2}>
                        {truncateText(publication.description, 56)}
                      </Text>
                    )}
                    <Group gap="xs">
                      <Badge size="xs" variant="outline">
                        {publication.platform}
                      </Badge>
                      <Text size="xs" c="dimmed">
                        {format(new Date(publication.published_at), 'd MMM yyyy HH:mm', {
                          locale: sv,
                        })}
                      </Text>
                    </Group>
                  </Stack>
                  <Group>
                    {publication.url && (
                      <Text
                        size="xs"
                        c="blue"
                        component="a"
                        href={publication.url}
                        target="_blank"
                        style={{ cursor: 'pointer', textDecoration: 'none' }}
                      >
                        Öppna klipp
                      </Text>
                    )}
                  </Group>
                </Group>
              </Box>
            ))}
          </Stack>
        )}
      </Card>
    </Stack>
  );
}
