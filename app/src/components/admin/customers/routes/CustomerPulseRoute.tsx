'use client';

import { format, formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import { IconActivity, IconCalendar, IconExternalLink } from '@tabler/icons-react';
import { Badge, Box, Button, Card, Divider, Group, Paper, Progress, SimpleGrid, Stack, Text } from '@mantine/core';
import { PerformanceChart } from '@/components/admin/shared/PerformanceCharts';

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
}

export function CustomerPulseRoute({ customerId, initialData }: CustomerPulseRouteProps) {
  const data = initialData;

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

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Text size="lg" fw={700}>
          Operativ Puls & Resultat
        </Text>
        <Button
          variant="subtle"
          size="xs"
          component="a"
          href={`/studio/customers/${customerId}`}
          target="_blank"
          leftSection={<IconExternalLink size={14} />}
        >
          Oppna i Studio
        </Button>
      </Group>

      {tStats && tStats.history.length > 0 && (
        <Card withBorder padding="md">
          <Text size="sm" fw={600} mb="md" c="dimmed" tt="uppercase">
            TikTok-resultat (30d)
          </Text>
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Paper withBorder p="md" bg="gray.0">
              <Group justify="space-between" mb="sm">
                <div>
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                    Foljartillvaxt
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
                    Engagement (30d)
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

      <Group grow align="stretch">
        <Card withBorder padding="md">
          <Group justify="space-between" mb="xs">
            <Group gap="sm">
              <IconCalendar className="h-4 w-4 text-muted-foreground" />
              <Text size="sm" fw={500} c="dimmed">
                Planeringstakt
              </Text>
            </Group>
            {scheduleLabels && (
              <Badge variant="light" color="blue" size="sm">
                {scheduleLabels}
              </Badge>
            )}
          </Group>
          <Stack gap={4}>
            <Group justify="space-between" align="baseline">
              <Text size="xl" fw={700}>
                {data.planned_concepts_this_week} / {data.expected_concepts_per_week}
              </Text>
              <Text size="xs" c="dimmed">
                koncept planerade
              </Text>
            </Group>
            <Progress value={deliveryRate} color={isOnTrack ? 'green' : 'orange'} size="sm" radius="xl" />
            <Text size="xs" c={isOnTrack ? 'green' : 'orange'} fw={500} mt={4}>
              {isOnTrack ? 'Bufferten ar godkand' : 'Behov av fler koncept i planeringen'}
            </Text>
          </Stack>
        </Card>

        <Card withBorder padding="md">
          <Group gap="sm" mb="xs">
            <IconActivity className="h-4 w-4 text-muted-foreground" />
            <Text size="sm" fw={500} c="dimmed">
              Historisk leverans
            </Text>
          </Group>
          <Stack gap={4}>
            <Text size="xl" fw={700}>
              {data.delivered_concepts_this_week}
            </Text>
            <Text size="xs" c="dimmed">
              publicerade klipp (senaste 7d)
            </Text>
            <Group gap={4} mt={4}>
              {data.last_cm_action_at ? (
                <Text size="xs" c="dimmed">
                  Senaste feed-uppdatering:{' '}
                  {formatDistanceToNow(new Date(data.last_cm_action_at), {
                    addSuffix: true,
                    locale: sv,
                  })}
                </Text>
              ) : (
                <Text size="xs" c="dimmed">
                  Ingen aktivitet registrerad
                </Text>
              )}
            </Group>
          </Stack>
        </Card>
      </Group>

      <Divider label="Handelselogg" labelPosition="center" />

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
                      {truncateText(publication.title, 56) || 'Namnlost klipp'}
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
                        Oppna klipp
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
