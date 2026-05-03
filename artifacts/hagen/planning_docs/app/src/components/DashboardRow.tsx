"use client";

import { Box, Group, Text, ScrollArea, ActionIcon } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import { ConceptCard } from "./ConceptCard";
import { DashboardRowData } from "@/types";

interface DashboardRowProps {
  row: DashboardRowData;
  onConceptClick?: (conceptId: string) => void;
  onSeeAll?: () => void;
}

export function DashboardRow({ row, onConceptClick, onSeeAll }: DashboardRowProps) {
  if (row.concepts.length === 0) return null;

  return (
    <Box mb="xl">
      {/* Row header */}
      <Group justify="space-between" mb="sm">
        <div>
          <Text fw={600} size="lg">
            {row.title}
          </Text>
          {row.subtitle && (
            <Text size="sm" c="dimmed">
              {row.subtitle}
            </Text>
          )}
        </div>
        {onSeeAll && (
          <ActionIcon variant="subtle" size="lg" onClick={onSeeAll}>
            <IconChevronRight size={20} />
          </ActionIcon>
        )}
      </Group>

      {/* Scrollable concept cards */}
      <ScrollArea scrollbarSize={8} type="hover" offsetScrollbars>
        <Group gap="md" wrap="nowrap" pb="sm">
          {row.concepts.map((concept) => (
            <ConceptCard
              key={concept.id}
              concept={concept}
              onClick={() => onConceptClick?.(concept.id)}
            />
          ))}
        </Group>
      </ScrollArea>
    </Box>
  );
}
