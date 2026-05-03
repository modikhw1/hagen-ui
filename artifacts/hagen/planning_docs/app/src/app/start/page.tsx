"use client";

import { useRouter } from "next/navigation";
import { Container, Title, Text, Stack, Grid, Paper, List, ThemeIcon } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { OnboardingChat } from "@/components/OnboardingChat";
import { UserProfile } from "@/types";

export default function StartPage() {
  const router = useRouter();

  const handleComplete = (profile: Partial<UserProfile>) => {
    console.log("Profile completed:", profile);
    // In real app: save to state/localStorage/API
    // For now, just redirect to dashboard
    setTimeout(() => {
      router.push("/dashboard");
    }, 1500);
  };

  return (
    <Container size="lg" py="xl" style={{ height: "100vh" }}>
      <Grid gutter="xl" style={{ height: "calc(100% - 40px)" }}>
        {/* Left side - Info */}
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="lg">
            <div>
              <Title order={1} size="h2">
                Let&apos;s find your perfect concepts
              </Title>
              <Text c="dimmed" mt="sm">
                A quick chat to understand your business and what you&apos;re looking for.
              </Text>
            </div>

            <Paper p="lg" radius="md" withBorder>
              <Text fw={500} mb="sm">What we&apos;ll figure out:</Text>
              <List
                spacing="sm"
                size="sm"
                icon={
                  <ThemeIcon color="green" size={20} radius="xl">
                    <IconCheck size={12} />
                  </ThemeIcon>
                }
              >
                <List.Item>Your business type and industry</List.Item>
                <List.Item>Your content style and tone</List.Item>
                <List.Item>What you want to achieve</List.Item>
                <List.Item>Any constraints (time, team, budget)</List.Item>
              </List>
            </Paper>

            <Paper p="lg" radius="md" bg="blue.0">
              <Text size="sm" c="dimmed">
                <strong>Pro tip:</strong> Connect your TikTok or Instagram and we&apos;ll
                automatically understand your brand&apos;s vibe.
              </Text>
            </Paper>
          </Stack>
        </Grid.Col>

        {/* Right side - Chat */}
        <Grid.Col span={{ base: 12, md: 7 }} style={{ height: "100%" }}>
          <div style={{ height: "100%", minHeight: 500 }}>
            <OnboardingChat onComplete={handleComplete} />
          </div>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
