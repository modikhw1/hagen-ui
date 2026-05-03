"use client";

import { Card, Text, Badge, Group, Stack, Button } from "@mantine/core";
import { Concept } from "@/types";

interface ConceptCardProps {
  concept: Concept;
  onClick?: () => void;
}

function TrendIndicator({ level }: { level: number }) {
  const fires = "🔥".repeat(level);
  const empty = "○".repeat(5 - level);
  return (
    <Text size="sm" c="dimmed">
      {fires}{empty}
    </Text>
  );
}

export function ConceptCard({ concept, onClick }: ConceptCardProps) {
  return (
    <Card
      shadow="sm"
      padding="md"
      radius="md"
      withBorder
      style={{ cursor: "pointer", minWidth: 280, maxWidth: 320 }}
      onClick={onClick}
    >
      <Stack gap="xs">
        {/* Origin flag and badges */}
        <Group justify="space-between" align="flex-start">
          <Text size="xl">{concept.originFlag}</Text>
          <Group gap={4}>
            {concept.isNew && (
              <Badge color="pink" size="sm" variant="filled">
                NEW
              </Badge>
            )}
            {concept.remaining && concept.remaining <= 3 && (
              <Badge color="orange" size="sm" variant="filled">
                {concept.remaining} left
              </Badge>
            )}
          </Group>
        </Group>

        {/* Headline */}
        <Text fw={500} size="sm" lineClamp={2} style={{ minHeight: 40 }}>
          {concept.headline}
        </Text>

        {/* Trend indicator */}
        <Group gap="xs" align="center">
          <TrendIndicator level={concept.trendLevel} />
          <Text size="xs" c="dimmed">
            Trending
          </Text>
        </Group>

        {/* Match percentage */}
        <Badge
          color={concept.matchPercentage >= 90 ? "green" : concept.matchPercentage >= 80 ? "blue" : "gray"}
          size="lg"
          variant="light"
          fullWidth
        >
          {concept.matchPercentage}% match for your café
        </Badge>

        {/* Quick facts */}
        <Group gap="xs">
          <Badge variant="outline" size="sm" color="gray">
            👥 {concept.peopleNeeded}
          </Badge>
          <Badge variant="outline" size="sm" color="gray">
            ⏱ {concept.filmTime}
          </Badge>
          <Badge variant="outline" size="sm" color="gray">
            {concept.difficulty}
          </Badge>
        </Group>

        {/* Social proof */}
        {concept.purchasedBy && (
          <Text size="xs" c="dimmed">
            {concept.purchasedBy} cafés got this
          </Text>
        )}

        {/* Price */}
        <Button fullWidth variant="light" radius="md" mt="xs">
          ${concept.price}
        </Button>
      </Stack>
    </Card>
  );
}
