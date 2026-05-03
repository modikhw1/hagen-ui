"use client";

import { Paper, Text, Progress, Group, Badge, Stack, Button } from "@mantine/core";
import { IconUser, IconBrandTiktok } from "@tabler/icons-react";
import { UserProfile } from "@/types";

interface ProfileMeterProps {
  profile: UserProfile;
  onImprove?: () => void;
}

export function ProfileMeter({ profile, onImprove }: ProfileMeterProps) {
  const completeness = profile.profileCompleteness;

  const getColor = () => {
    if (completeness >= 80) return "green";
    if (completeness >= 50) return "yellow";
    return "orange";
  };

  const getMessage = () => {
    if (completeness >= 80) return "Great! We know you well";
    if (completeness >= 50) return "Good start, tell us more";
    return "Help us find better matches";
  };

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text size="sm" c="dimmed">
              How well we know you
            </Text>
            <Text fw={600} size="lg">
              {completeness}%
            </Text>
          </div>
          <Badge color={getColor()} variant="light">
            {getMessage()}
          </Badge>
        </Group>

        <Progress value={completeness} color={getColor()} size="md" radius="xl" />

        <Group gap="xs">
          <Badge
            leftSection={<IconUser size={12} />}
            variant={profile.businessDescription ? "filled" : "outline"}
            color={profile.businessDescription ? "green" : "gray"}
            size="sm"
          >
            Business info
          </Badge>
          <Badge
            leftSection={<IconBrandTiktok size={12} />}
            variant={profile.socialLinks?.tiktok ? "filled" : "outline"}
            color={profile.socialLinks?.tiktok ? "green" : "gray"}
            size="sm"
          >
            TikTok synced
          </Badge>
        </Group>

        {completeness < 80 && (
          <Button variant="light" size="xs" onClick={onImprove}>
            Improve recommendations
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
