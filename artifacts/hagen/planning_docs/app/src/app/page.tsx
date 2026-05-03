"use client";

import { Container, Title, Text, Button, Stack, Group, Card, Badge } from "@mantine/core";
import Link from "next/link";

export default function Home() {
  return (
    <Container size="md" py="xl">
      <Stack gap="xl" align="center" ta="center">
        <div>
          <Title order={1} size="3rem" fw={700}>
            letrend
          </Title>
          <Text size="xl" c="dimmed" mt="md">
            Proven video concepts for your business&apos;s social media
          </Text>
        </div>

        <Text size="lg" maw={500}>
          We watch hundreds of videos and pick the ones that fit your business—so you don&apos;t have to.
        </Text>

        <Button component={Link} href="/start" size="lg" radius="md">
          Get Started
        </Button>

        {/* Sample concept card to verify Mantine works */}
        <Card shadow="sm" padding="lg" radius="md" withBorder w="100%" maw={400} mt="xl">
          <Group justify="space-between" mb="xs">
            <Text fw={500}>Sample Concept</Text>
            <Badge color="green">94% match</Badge>
          </Group>

          <Text size="sm" c="dimmed">
            Employee dreads telling kitchen about mistake—gets calm response
          </Text>

          <Group mt="md" gap="xs">
            <Badge variant="light">Easy</Badge>
            <Badge variant="light">Just you</Badge>
            <Badge variant="light">15 min</Badge>
          </Group>

          <Button fullWidth mt="md" radius="md" variant="light">
            $24
          </Button>
        </Card>
      </Stack>
    </Container>
  );
}
