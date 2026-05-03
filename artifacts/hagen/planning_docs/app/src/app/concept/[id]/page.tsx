"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import {
  Container,
  Title,
  Text,
  Button,
  Stack,
  Group,
  Paper,
  Badge,
  Grid,
  Divider,
  List,
  ThemeIcon,
  Progress,
  Card,
} from "@mantine/core";
import {
  IconCheck,
  IconUsers,
  IconClock,
  IconCamera,
  IconArrowLeft,
  IconShoppingCart,
  IconSparkles,
} from "@tabler/icons-react";
import { mockConcepts } from "@/mocks/data";

interface PageProps {
  params: Promise<{ id: string }>;
}

function TrendIndicator({ level }: { level: number }) {
  return (
    <Group gap={4}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} size="lg" c={i <= level ? undefined : "dimmed"}>
          {i <= level ? "🔥" : "○"}
        </Text>
      ))}
    </Group>
  );
}

export default function ConceptDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();

  // Find concept from mock data
  const concept = mockConcepts.find((c) => c.id === id) || mockConcepts[0];

  const handlePurchase = () => {
    // TODO: Navigate to checkout
    console.log("Purchase:", concept.id);
    router.push(`/checkout/${concept.id}`);
  };

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Back button */}
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => router.back()}
          w="fit-content"
        >
          Back to dashboard
        </Button>

        {/* Header */}
        <div>
          <Group gap="sm" mb="xs">
            <Text size="2rem">{concept.originFlag}</Text>
            <Badge color="gray" variant="light">
              {concept.originCountry}
            </Badge>
            {concept.isNew && (
              <Badge color="pink" variant="filled">
                NEW
              </Badge>
            )}
          </Group>

          <Title order={1} size="h2" mb="md">
            {concept.headline}
          </Title>

          {/* Trend indicator */}
          <Group gap="md">
            <TrendIndicator level={concept.trendLevel} />
            <Text size="sm" c="dimmed">
              {concept.trendLevel >= 4
                ? "Trending hot right now"
                : concept.trendLevel >= 2
                ? "Steady performer"
                : "Evergreen classic"}
            </Text>
          </Group>
        </div>

        <Grid gutter="xl">
          {/* Left column - Details */}
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Stack gap="lg">
              {/* Match breakdown */}
              <Paper p="lg" radius="md" withBorder>
                <Group justify="space-between" mb="md">
                  <Text fw={600} size="lg">
                    Match for your café
                  </Text>
                  <Badge
                    size="xl"
                    color={
                      concept.matchPercentage >= 90
                        ? "green"
                        : concept.matchPercentage >= 80
                        ? "blue"
                        : "gray"
                    }
                  >
                    {concept.matchPercentage}%
                  </Badge>
                </Group>

                <Progress
                  value={concept.matchPercentage}
                  color={
                    concept.matchPercentage >= 90
                      ? "green"
                      : concept.matchPercentage >= 80
                      ? "blue"
                      : "gray"
                  }
                  size="lg"
                  radius="xl"
                  mb="md"
                />

                <Text fw={500} mb="sm">
                  Why it fits:
                </Text>
                <List
                  spacing="xs"
                  size="sm"
                  icon={
                    <ThemeIcon color="green" size={20} radius="xl">
                      <IconCheck size={12} />
                    </ThemeIcon>
                  }
                >
                  {concept.whyItFits.map((reason, i) => (
                    <List.Item key={i}>{reason}</List.Item>
                  ))}
                </List>
              </Paper>

              {/* What you'll need */}
              <Paper p="lg" radius="md" withBorder>
                <Text fw={600} size="lg" mb="md">
                  What you&apos;ll need
                </Text>

                <Grid>
                  <Grid.Col span={4}>
                    <Stack align="center" gap="xs">
                      <ThemeIcon size="xl" variant="light" radius="xl">
                        <IconUsers size={20} />
                      </ThemeIcon>
                      <Text size="sm" ta="center" fw={500}>
                        {concept.peopleNeeded}
                      </Text>
                      <Text size="xs" c="dimmed">
                        People
                      </Text>
                    </Stack>
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <Stack align="center" gap="xs">
                      <ThemeIcon size="xl" variant="light" radius="xl">
                        <IconClock size={20} />
                      </ThemeIcon>
                      <Text size="sm" ta="center" fw={500}>
                        {concept.filmTime}
                      </Text>
                      <Text size="xs" c="dimmed">
                        To film
                      </Text>
                    </Stack>
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <Stack align="center" gap="xs">
                      <ThemeIcon size="xl" variant="light" radius="xl">
                        <IconCamera size={20} />
                      </ThemeIcon>
                      <Text size="sm" ta="center" fw={500}>
                        {concept.difficulty}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Difficulty
                      </Text>
                    </Stack>
                  </Grid.Col>
                </Grid>
              </Paper>

              {/* What's included (teaser) */}
              <Paper p="lg" radius="md" bg="gray.0">
                <Group gap="sm" mb="sm">
                  <IconSparkles size={20} />
                  <Text fw={600}>What you get after purchase</Text>
                </Group>
                <List size="sm" spacing="xs">
                  <List.Item>Full video with subtitles in your language</List.Item>
                  <List.Item>Step-by-step script and scene breakdown</List.Item>
                  <List.Item>Plain-language filming guide</List.Item>
                  <List.Item>Interactive prep checklist</List.Item>
                  <List.Item>Casting and timing tips</List.Item>
                </List>
              </Paper>
            </Stack>
          </Grid.Col>

          {/* Right column - Purchase */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Card shadow="md" radius="md" withBorder p="xl" pos="sticky" top={20}>
              <Stack gap="md">
                <div>
                  <Text size="sm" c="dimmed">
                    Price
                  </Text>
                  <Title order={2}>${concept.price}</Title>
                </div>

                {concept.remaining && concept.remaining <= 3 && (
                  <Badge color="orange" size="lg" variant="light" fullWidth>
                    Only {concept.remaining} left in your market
                  </Badge>
                )}

                {concept.purchasedBy && (
                  <Text size="sm" c="dimmed">
                    {concept.purchasedBy} cafés already got this
                  </Text>
                )}

                <Divider />

                <Button
                  size="lg"
                  fullWidth
                  leftSection={<IconShoppingCart size={20} />}
                  onClick={handlePurchase}
                >
                  Get this concept
                </Button>

                <Text size="xs" c="dimmed" ta="center">
                  Film your version → get some back
                </Text>

                <Divider />

                <Stack gap="xs">
                  <Group gap="xs">
                    <IconCheck size={14} color="green" />
                    <Text size="xs">Instant access after purchase</Text>
                  </Group>
                  <Group gap="xs">
                    <IconCheck size={14} color="green" />
                    <Text size="xs">Keep forever, film anytime</Text>
                  </Group>
                  <Group gap="xs">
                    <IconCheck size={14} color="green" />
                    <Text size="xs">Subtitles in your language</Text>
                  </Group>
                </Stack>
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
