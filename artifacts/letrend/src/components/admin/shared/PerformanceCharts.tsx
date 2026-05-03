'use client';

import { Box, Card, Group, HoverCard, Stack, Text } from '@mantine/core';
import { IconEye, IconHeart, IconMessageCircle, IconPercentage } from '@tabler/icons-react';

type PerformanceChartVideo = {
  uploaded_at: string;
  views: number;
  likes?: number;
  comments?: number;
  shares?: number;
  share_url?: string | null;
  description?: string | null;
};

type DailyVideoPoint = {
  label: string;
  value: number;
  videos: PerformanceChartVideo[];
  interactions: number;
};

interface PerformanceChartProps {
  data: number[];
  labels?: string[];
  height?: number;
  color?: string;
  smoothColor?: string;
  windowSize?: number;
  scale?: 'linear' | 'log' | 'sqrt';
  baselineZero?: boolean;
  videos?: PerformanceChartVideo[];
}

function smoothData(data: number[], windowSize: number): number[] {
  const radius = Math.max(1, Math.floor(windowSize / 2));

  return data.map((_, index) => {
    let weightedSum = 0;
    let totalWeight = 0;

    for (let offset = -radius; offset <= radius; offset += 1) {
      const targetIndex = index + offset;
      if (targetIndex < 0 || targetIndex >= data.length) {
        continue;
      }

      const weight = radius + 1 - Math.abs(offset);
      weightedSum += data[targetIndex] * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : data[index];
  });
}

function toDayKey(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function buildDailyVideoPoints(labels: string[], videos: PerformanceChartVideo[]): DailyVideoPoint[] {
  const grouped = new Map<string, PerformanceChartVideo[]>();

  for (const label of labels) {
    grouped.set(label, []);
  }

  for (const video of videos) {
    const key = toDayKey(video.uploaded_at);
    const bucket = grouped.get(key);
    if (!bucket) {
      continue;
    }
    bucket.push(video);
  }

  return labels
    .map((label) => {
      const dayVideos = (grouped.get(label) ?? []).sort((a, b) => b.views - a.views);
      const value = dayVideos.reduce((sum, video) => sum + Math.max(0, video.views), 0);
      const interactions = dayVideos.reduce(
        (sum, video) => sum + (video.likes ?? 0) + (video.comments ?? 0) + (video.shares ?? 0),
        0,
      );

      return {
        label,
        value,
        videos: dayVideos,
        interactions,
      };
    })
    .filter((point) => point.videos.length > 0);
}

function formatDayLabel(label: string): string {
  const date = new Date(`${label}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return label;
  }

  return date.toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function buildVideoSummary(point: DailyVideoPoint): string {
  return `${point.videos.length} videor`;
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

function likeRate(video: PerformanceChartVideo): number {
  return video.views > 0 ? ((video.likes ?? 0) / video.views) * 100 : 0;
}

function MetricItem(props: {
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
  value: string;
}) {
  const Icon = props.icon;

  return (
    <Group gap={4} wrap="nowrap">
      <Icon size={12} stroke={1.8} />
      <Text size="10px" c="dimmed" fw={600}>
        {props.value}
      </Text>
    </Group>
  );
}

export function PerformanceChart({
  data,
  labels,
  height = 100,
  color = 'var(--mantine-color-blue-6)',
  smoothColor = 'var(--mantine-color-gray-4)',
  windowSize = 5,
  scale = 'linear',
  baselineZero = false,
  videos = [],
}: PerformanceChartProps) {
  if (!data || data.length < 2) {
    return (
      <Box h={height} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text size="xs" c="dimmed">
          Ingen historik tillganglig
        </Text>
      </Box>
    );
  }

  const normalizedLabels =
    labels && labels.length === data.length
      ? labels
      : Array.from({ length: data.length }, (_, index) => {
          const date = new Date();
          date.setUTCDate(date.getUTCDate() - (data.length - 1 - index));
          return date.toISOString().slice(0, 10);
        });
  const dailyVideoPoints = buildDailyVideoPoints(normalizedLabels, videos);
  const smoothed = smoothData(data, windowSize);
  const width = 400;
  const padding = 10;
  const maxValue = Math.max(...data, ...smoothed, 1);
  const paddedMaxValue = maxValue * 1.08;
  const minValue = baselineZero ? 0 : Math.min(...data, ...smoothed);

  const transformValue = (value: number) => {
    const normalized = Math.max(0, value);
    if (scale === 'log') return Math.log10(normalized + 1);
    if (scale === 'sqrt') return Math.sqrt(normalized);
    return normalized;
  };

  const maxTransformed = transformValue(paddedMaxValue);
  const minTransformed = transformValue(minValue);
  const range = maxTransformed - minTransformed || 1;

  const getX = (index: number) => (index / (data.length - 1)) * width;
  const getY = (value: number) =>
    height - ((transformValue(value) - minTransformed) / range) * (height - padding * 2) - padding;

  const toPoints = (values: number[]) =>
    values.map((value, index) => `${getX(index)},${getY(value)}`).join(' ');

  return (
    <Box>
      <Box pos="relative" h={height}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: '100%', height }}
          preserveAspectRatio="none"
        >
          <polyline
            points={toPoints(smoothed)}
            fill="none"
            stroke={smoothColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4 3"
            opacity={0.45}
          />
          <polyline
            points={toPoints(data)}
            fill="none"
            stroke={color}
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {dailyVideoPoints.map((point) => {
          const index = normalizedLabels.indexOf(point.label);
          if (index < 0) {
            return null;
          }

          const leftPercent = (index / Math.max(1, data.length - 1)) * 100;
          const topPercent = (getY(point.value) / height) * 100;
          const primaryUrl = point.videos[0]?.share_url ?? null;
          const totalLikes = point.videos.reduce((sum, video) => sum + (video.likes ?? 0), 0);
          const totalComments = point.videos.reduce((sum, video) => sum + (video.comments ?? 0), 0);
          const aggregateLikeRate = (totalLikes / Math.max(1, point.value)) * 100;

          return (
            <HoverCard
              key={point.label}
              shadow="md"
              radius="md"
              openDelay={80}
              closeDelay={40}
              position="top"
              withinPortal
            >
              <HoverCard.Target>
                <Box
                  component={primaryUrl ? 'a' : 'button'}
                  href={primaryUrl ?? undefined}
                  target={primaryUrl ? '_blank' : undefined}
                  rel={primaryUrl ? 'noreferrer' : undefined}
                  type={primaryUrl ? undefined : 'button'}
                  aria-label={formatDayLabel(point.label)}
                  style={{
                    position: 'absolute',
                    left: `${leftPercent}%`,
                    top: `${topPercent}%`,
                    width: 12,
                    height: 12,
                    transform: 'translate(-50%, -50%)',
                    borderRadius: '9999px',
                    background: color,
                    border: '2px solid white',
                    boxShadow: '0 6px 18px rgba(15, 23, 42, 0.18)',
                    cursor: primaryUrl ? 'pointer' : 'default',
                  }}
                />
              </HoverCard.Target>
              <HoverCard.Dropdown p={0} style={{ border: 'none', background: 'transparent' }}>
                <Card withBorder radius="md" shadow="sm" padding="md" w={300}>
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                          {formatDayLabel(point.label)}
                        </Text>
                        {point.videos.length > 1 && (
                          <Text size="sm" fw={700}>
                            {buildVideoSummary(point)}
                          </Text>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <Text size="lg" fw={800}>
                          {point.value.toLocaleString('sv-SE')}
                        </Text>
                        <Text size="10px" c="dimmed" fw={700} tt="uppercase">
                          visningar
                        </Text>
                      </div>
                    </Group>

                    <Group gap="lg">
                      <div>
                        <Text size="10px" c="dimmed" fw={700} tt="uppercase">
                          Like rate
                        </Text>
                        <Text size="sm" fw={700}>
                          {aggregateLikeRate.toFixed(1)}%
                        </Text>
                      </div>
                      <div>
                        <Text size="10px" c="dimmed" fw={700} tt="uppercase">
                          Likes
                        </Text>
                        <Text size="sm" fw={700}>
                          {totalLikes.toLocaleString('sv-SE')}
                        </Text>
                      </div>
                      <div>
                        <Text size="10px" c="dimmed" fw={700} tt="uppercase">
                          Kommentarer
                        </Text>
                        <Text size="sm" fw={700}>
                          {totalComments.toLocaleString('sv-SE')}
                        </Text>
                      </div>
                    </Group>

                    {point.videos.length === 1 ? (
                      <Box
                        component={point.videos[0]?.share_url ? 'a' : 'div'}
                        href={point.videos[0]?.share_url ?? undefined}
                        target={point.videos[0]?.share_url ? '_blank' : undefined}
                        rel={point.videos[0]?.share_url ? 'noreferrer' : undefined}
                        style={{
                          display: 'block',
                          textDecoration: 'none',
                          color: 'inherit',
                          padding: '10px 12px',
                          borderRadius: 12,
                          background:
                            'linear-gradient(180deg, var(--mantine-color-gray-0), var(--mantine-color-white))',
                          border: '1px solid var(--mantine-color-gray-2)',
                        }}
                      >
                        <Stack gap={6}>
                          <Group justify="space-between" align="flex-start" gap="sm">
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <Text size="sm" fw={700}>
                                {truncateText(point.videos[0]?.description, 42) ?? 'Publicerat klipp'}
                              </Text>
                            </div>
                            <Text size="10px" c="dimmed">
                              {new Date(point.videos[0].uploaded_at).toLocaleTimeString('sv-SE', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </Text>
                          </Group>
                          <Group gap="md">
                            <MetricItem
                              icon={IconEye}
                              value={point.videos[0].views.toLocaleString('sv-SE')}
                            />
                            <MetricItem
                              icon={IconHeart}
                              value={(point.videos[0].likes ?? 0).toLocaleString('sv-SE')}
                            />
                            <MetricItem
                              icon={IconMessageCircle}
                              value={(point.videos[0].comments ?? 0).toLocaleString('sv-SE')}
                            />
                            <MetricItem
                              icon={IconPercentage}
                              value={`${likeRate(point.videos[0]).toFixed(1)}%`}
                            />
                          </Group>
                        </Stack>
                      </Box>
                    ) : (
                      <Stack gap={6}>
                        {point.videos.map((video, index) => (
                          <Box
                            key={`${point.label}-${video.share_url ?? index}`}
                            component={video.share_url ? 'a' : 'div'}
                            href={video.share_url ?? undefined}
                            target={video.share_url ? '_blank' : undefined}
                            rel={video.share_url ? 'noreferrer' : undefined}
                            style={{
                              display: 'block',
                              textDecoration: 'none',
                              color: 'inherit',
                              padding: '8px 10px',
                              borderRadius: 10,
                              background: 'var(--mantine-color-gray-0)',
                              border: '1px solid var(--mantine-color-gray-2)',
                            }}
                          >
                            <Group justify="space-between" align="flex-start" gap="sm">
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <Text size="11px" fw={700}>
                                  {`Klipp ${index + 1}`}
                                </Text>
                                {video.description && (
                                  <Text size="10px" c="dimmed" lineClamp={1}>
                                    {truncateText(video.description, 24)}
                                  </Text>
                                )}
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <Group gap={8} justify="flex-end">
                                  <MetricItem
                                    icon={IconEye}
                                    value={video.views.toLocaleString('sv-SE')}
                                  />
                                  <MetricItem
                                    icon={IconHeart}
                                    value={(video.likes ?? 0).toLocaleString('sv-SE')}
                                  />
                                  <MetricItem
                                    icon={IconMessageCircle}
                                    value={(video.comments ?? 0).toLocaleString('sv-SE')}
                                  />
                                  <MetricItem
                                    icon={IconPercentage}
                                    value={`${likeRate(video).toFixed(1)}%`}
                                  />
                                </Group>
                              </div>
                            </Group>
                          </Box>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </Card>
              </HoverCard.Dropdown>
            </HoverCard>
          );
        })}
      </Box>

      <Group justify="space-between" mt={4}>
        <Text size="10px" c="dimmed" fw={700}>
          30 DAGAR SEDAN
        </Text>
        <Text size="10px" c="dimmed" fw={700}>
          IDAG
        </Text>
      </Group>
    </Box>
  );
}
