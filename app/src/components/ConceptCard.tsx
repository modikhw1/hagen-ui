"use client";

import { Card, Text, Badge, Group, Stack, Button } from "@mantine/core";
import { Concept } from "@/types";
import { display } from "@/lib/display";

interface ConceptCardProps {
  concept: Concept;
  onClick?: () => void;
  variant?: 'desktop' | 'mobile';
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

/**
 * Responsive ConceptCard component
 * Works for both desktop and mobile layouts
 */
export function ConceptCard({ concept, onClick, variant = 'desktop' }: ConceptCardProps) {
  // Get display values from category keys
  const marketDisplay = display.market(concept.market);
  const difficultyDisplay = display.difficulty(concept.difficulty);
  const peopleDisplay = display.peopleNeeded(concept.peopleNeeded);
  const filmTimeDisplay = display.filmTime(concept.filmTime);

  const isMobile = variant === 'mobile';

  return (
    <Card
      shadow="sm"
      padding={isMobile ? "sm" : "md"}
      radius="md"
      withBorder
      style={{
        cursor: "pointer",
        minWidth: isMobile ? 260 : 280,
        maxWidth: isMobile ? 300 : 320,
        width: isMobile ? '100%' : 'auto'
      }}
      onClick={onClick}
    >
      <Stack gap="xs">
        {/* Origin flag and badges */}
        <Group justify="space-between" align="flex-start">
          <Text size={isMobile ? "lg" : "xl"}>{marketDisplay.flag}</Text>
          <Group gap={4}>
            {concept.isNew && (
              <Badge style={{ backgroundColor: "#6B4423" }} size="sm" variant="filled">
                NEW
              </Badge>
            )}
            {concept.remaining && concept.remaining <= 3 && (
              <Badge style={{ backgroundColor: "#8B6914" }} size="sm" variant="filled">
                {concept.remaining} left
              </Badge>
            )}
          </Group>
        </Group>

        {/* Headline */}
        <Text fw={500} size="sm" lineClamp={2} style={{ minHeight: isMobile ? 36 : 40 }}>
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
          style={{
            backgroundColor: concept.matchPercentage >= 90 ? "rgba(90, 143, 90, 0.15)" : concept.matchPercentage >= 80 ? "rgba(74, 47, 24, 0.1)" : "rgba(157, 142, 125, 0.15)",
            color: concept.matchPercentage >= 90 ? "#5A8F5A" : concept.matchPercentage >= 80 ? "#4A2F18" : "#7D6E5D"
          }}
          size={isMobile ? "md" : "lg"}
          variant="light"
          fullWidth
        >
          {concept.matchPercentage}% match for your café
        </Badge>

        {/* Quick facts */}
        <Group gap="xs">
          <Badge variant="outline" size="sm" color="gray">
            👥 {peopleDisplay.label}
          </Badge>
          <Badge variant="outline" size="sm" color="gray">
            ⏱ {filmTimeDisplay.label}
          </Badge>
          <Badge variant="outline" size="sm" color="gray">
            {difficultyDisplay.label}
          </Badge>
        </Group>

        {/* Price */}
        <Button fullWidth variant="filled" radius="md" mt="xs" style={{ backgroundColor: "#4A2F18" }}>
          ${concept.price}
        </Button>
      </Stack>
    </Card>
  );
}
