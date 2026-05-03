"use client";

import { useRouter } from "next/navigation";
import { Container, Title, Text, Group, Stack, Grid, Paper } from "@mantine/core";
import { DashboardRow, ProfileMeter, MiniChat } from "@/components";
import { mockUserProfile, mockDashboardRows } from "@/mocks/data";

export default function DashboardPage() {
  const router = useRouter();
  const profile = mockUserProfile;
  const rows = mockDashboardRows;

  const handleConceptClick = (conceptId: string) => {
    router.push(`/concept/${conceptId}`);
  };

  const handleImproveProfile = () => {
    console.log("Improve profile clicked");
    // TODO: Open chat or profile page
  };

  const handleChatMessage = (message: string) => {
    console.log("Chat message:", message);
    // TODO: Process refinement
  };

  return (
    <>
      <Container size="xl" py="xl">
        <Stack gap="xl">
          {/* Header */}
          <div>
            <Title order={1} size="h2">
              Concepts for {profile.businessName}
            </Title>
            <Text c="dimmed" size="lg">
              Curated for your café based on what we know about you
            </Text>
          </div>

          {/* Top section: Profile meter */}
          <Grid>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <ProfileMeter profile={profile} onImprove={handleImproveProfile} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 8 }}>
              <Paper p="md" radius="md" withBorder h="100%">
                <Stack gap="xs">
                  <Text fw={500}>Your profile</Text>
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">Business:</Text>
                    <Text size="sm">{profile.businessDescription}</Text>
                  </Group>
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">Goals:</Text>
                    <Text size="sm">{profile.goals.join(", ")}</Text>
                  </Group>
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">Constraints:</Text>
                    <Text size="sm">{profile.constraints.join(", ")}</Text>
                  </Group>
                  {profile.socialLinks?.tiktok && (
                    <Group gap="xs">
                      <Text size="sm" c="dimmed">TikTok:</Text>
                      <Text size="sm">{profile.socialLinks.tiktok}</Text>
                    </Group>
                  )}
                </Stack>
              </Paper>
            </Grid.Col>
          </Grid>

          {/* Concept rows */}
          {rows.map((row) => (
            <DashboardRow
              key={row.id}
              row={row}
              onConceptClick={handleConceptClick}
            />
          ))}
        </Stack>
      </Container>

      {/* Mini chat widget */}
      <MiniChat onSendMessage={handleChatMessage} />
    </>
  );
}
