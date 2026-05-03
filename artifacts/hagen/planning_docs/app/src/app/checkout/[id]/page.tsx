"use client";

import { use, useState } from "react";
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
  TextInput,
  Card,
  Loader,
  ThemeIcon,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconLock,
  IconCheck,
  IconCreditCard,
} from "@tabler/icons-react";
import { mockConcepts } from "@/mocks/data";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CheckoutPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Find concept from mock data
  const concept = mockConcepts.find((c) => c.id === id) || mockConcepts[0];

  const handlePurchase = async () => {
    setIsProcessing(true);

    // Simulate payment processing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    setIsProcessing(false);
    setIsComplete(true);

    // Redirect to viewer after delay
    setTimeout(() => {
      router.push(`/viewer/${concept.id}`);
    }, 2000);
  };

  if (isComplete) {
    return (
      <Container size="sm" py="xl">
        <Card shadow="md" radius="lg" p="xl" ta="center">
          <Stack align="center" gap="lg">
            <ThemeIcon size={80} radius="xl" color="green">
              <IconCheck size={40} />
            </ThemeIcon>
            <Title order={2}>You&apos;re in!</Title>
            <Text c="dimmed">
              Taking you to your concept now...
            </Text>
            <Loader size="sm" />
          </Stack>
        </Card>
      </Container>
    );
  }

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
          Back
        </Button>

        <Title order={1} size="h2">
          Checkout
        </Title>

        <Grid gutter="xl">
          {/* Left - Payment form */}
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Stack gap="lg">
              {/* Order summary */}
              <Paper p="lg" radius="md" withBorder>
                <Text fw={600} mb="md">
                  Order summary
                </Text>

                <Group justify="space-between" mb="sm">
                  <div style={{ flex: 1 }}>
                    <Text size="sm" lineClamp={2}>
                      {concept.headline}
                    </Text>
                    <Group gap="xs" mt="xs">
                      <Badge size="sm" variant="light">
                        {concept.matchPercentage}% match
                      </Badge>
                      <Badge size="sm" variant="outline">
                        {concept.difficulty}
                      </Badge>
                    </Group>
                  </div>
                  <Text fw={600}>${concept.price}</Text>
                </Group>
              </Paper>

              {/* Payment form */}
              <Paper p="lg" radius="md" withBorder>
                <Group gap="xs" mb="md">
                  <IconCreditCard size={20} />
                  <Text fw={600}>Payment</Text>
                </Group>

                <Stack gap="md">
                  <TextInput
                    label="Email"
                    placeholder="you@business.com"
                    required
                  />

                  <TextInput
                    label="Card number"
                    placeholder="4242 4242 4242 4242"
                    leftSection={<IconCreditCard size={16} />}
                    required
                  />

                  <Group grow>
                    <TextInput
                      label="Expiry"
                      placeholder="MM / YY"
                      required
                    />
                    <TextInput
                      label="CVC"
                      placeholder="123"
                      required
                    />
                  </Group>

                  <TextInput
                    label="Name on card"
                    placeholder="Full name"
                    required
                  />
                </Stack>
              </Paper>

              {/* Security note */}
              <Group gap="xs" c="dimmed">
                <IconLock size={14} />
                <Text size="xs">
                  Secured by Stripe. We never store your card details.
                </Text>
              </Group>
            </Stack>
          </Grid.Col>

          {/* Right - Order total */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Card shadow="md" radius="md" withBorder p="xl" pos="sticky" top={20}>
              <Stack gap="md">
                <Text fw={600}>Order total</Text>

                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Concept</Text>
                    <Text size="sm">${concept.price}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">Processing fee</Text>
                    <Text size="sm">$0</Text>
                  </Group>
                </Stack>

                <Divider />

                <Group justify="space-between">
                  <Text fw={600}>Total</Text>
                  <Text fw={600} size="xl">${concept.price}</Text>
                </Group>

                <Button
                  size="lg"
                  fullWidth
                  onClick={handlePurchase}
                  loading={isProcessing}
                >
                  {isProcessing ? "Processing..." : `Pay $${concept.price}`}
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
                    <Text size="xs">Full video, script, and guide</Text>
                  </Group>
                  <Group gap="xs">
                    <IconCheck size={14} color="green" />
                    <Text size="xs">Keep forever</Text>
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
