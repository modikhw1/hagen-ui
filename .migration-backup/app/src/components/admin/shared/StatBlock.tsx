'use client';

import { Paper, Text, Group, Stack, Badge } from '@mantine/core';
import { IconArrowUpRight, IconArrowDownRight, IconMinus } from '@tabler/icons-react';

export interface StatBlockProps {
  label: string;
  value: string | number;
  compact?: boolean;
  description?: string;
  color?: string;
  delta?: number;
  trend?: 'up' | 'down' | 'flat';
}

export function StatBlock({ 
  label, value, compact, description, color, delta, trend 
}: StatBlockProps) {
  const showDelta = delta !== undefined && delta !== null;

  return (
    <Paper withBorder p={compact ? 'xs' : 'md'} radius="md">
      <Stack gap={4}>
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" lts="0.05em">
          {label}
        </Text>
        <Group align="center" gap="xs" wrap="nowrap">
          <Text size={compact ? 'xl' : '2rem'} fw={700} c={color} style={{ lineHeight: 1 }}>
            {value}
          </Text>
          
          {showDelta && (
            <Badge 
              variant="light" 
              color={delta > 0 ? 'green' : delta < 0 ? 'red' : 'gray'}
              size="sm"
              leftSection={
                trend === 'up' ? <IconArrowUpRight size={12} /> : 
                trend === 'down' ? <IconArrowDownRight size={12} /> : 
                <IconMinus size={12} />
              }
            >
              {Math.abs(delta)}
            </Badge>
          )}

          {description && (
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}
