"use client";

import { useState } from "react";
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
  Card,
  TextInput,
  Modal,
  ThemeIcon,
  Divider,
  ActionIcon,
  Tooltip,
} from "@mantine/core";
import {
  IconPlayerPlay,
  IconCheck,
  IconClock,
  IconBrandTiktok,
  IconExternalLink,
  IconCoin,
  IconX,
} from "@tabler/icons-react";

interface PurchasedConcept {
  id: string;
  headline: string;
  purchasedAt: string;
  price: number;
  status: "not_filmed" | "submitted" | "verified";
  submittedUrl?: string;
  cashbackAmount?: number;
}

// Mock purchased concepts
const mockPurchasedConcepts: PurchasedConcept[] = [
  {
    id: "concept-1",
    headline: "Employee dreads telling kitchen about mistake—gets calm response",
    purchasedAt: "2024-01-15",
    price: 24,
    status: "verified",
    submittedUrl: "https://tiktok.com/@austincoffee/video/123",
    cashbackAmount: 2.88,
  },
  {
    id: "concept-3",
    headline: "POV: You're the coffee that's about to change someone's entire day",
    purchasedAt: "2024-01-18",
    price: 26,
    status: "submitted",
    submittedUrl: "https://tiktok.com/@austincoffee/video/456",
  },
  {
    id: "concept-2",
    headline: "Customer asks impossible question, employee responds with dead stare",
    purchasedAt: "2024-01-20",
    price: 22,
    status: "not_filmed",
  },
];

export default function MyConceptsPage() {
  const router = useRouter();
  const [concepts, setConcepts] = useState(mockPurchasedConcepts);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<PurchasedConcept | null>(null);
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const totalCredits = concepts
    .filter((c) => c.status === "verified" && c.cashbackAmount)
    .reduce((sum, c) => sum + (c.cashbackAmount || 0), 0);

  const pendingCredits = concepts
    .filter((c) => c.status === "submitted")
    .reduce((sum, c) => sum + c.price * 0.12, 0);

  const handleOpenSubmit = (concept: PurchasedConcept) => {
    setSelectedConcept(concept);
    setTiktokUrl("");
    setSubmitModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedConcept || !tiktokUrl.trim()) return;

    setIsSubmitting(true);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setConcepts((prev) =>
      prev.map((c) =>
        c.id === selectedConcept.id
          ? { ...c, status: "submitted" as const, submittedUrl: tiktokUrl }
          : c
      )
    );

    setIsSubmitting(false);
    setSubmitModalOpen(false);
  };

  const getStatusBadge = (status: PurchasedConcept["status"]) => {
    switch (status) {
      case "verified":
        return (
          <Badge color="green" leftSection={<IconCheck size={12} />}>
            Credits earned
          </Badge>
        );
      case "submitted":
        return (
          <Badge color="yellow" leftSection={<IconClock size={12} />}>
            Pending review
          </Badge>
        );
      default:
        return (
          <Badge color="gray" variant="outline">
            Not filmed yet
          </Badge>
        );
    }
  };

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1} size="h2">
              My Concepts
            </Title>
            <Text c="dimmed">
              {concepts.length} concepts purchased
            </Text>
          </div>

          <Button variant="light" onClick={() => router.push("/dashboard")}>
            Browse more
          </Button>
        </Group>

        {/* Credits summary */}
        <Paper p="lg" radius="md" withBorder>
          <Group justify="space-between">
            <Group gap="lg">
              <div>
                <Text size="sm" c="dimmed">Available credits</Text>
                <Group gap="xs">
                  <IconCoin size={20} color="green" />
                  <Text fw={600} size="xl">${totalCredits.toFixed(2)}</Text>
                </Group>
              </div>
              {pendingCredits > 0 && (
                <div>
                  <Text size="sm" c="dimmed">Pending</Text>
                  <Text fw={500} c="yellow">${pendingCredits.toFixed(2)}</Text>
                </div>
              )}
            </Group>
            <Text size="xs" c="dimmed" maw={200}>
              Film your concepts and submit your TikTok link to earn credits
            </Text>
          </Group>
        </Paper>

        {/* Concepts list */}
        <Stack gap="md">
          {concepts.map((concept) => (
            <Card key={concept.id} shadow="sm" radius="md" withBorder p="lg">
              <Group justify="space-between" align="flex-start">
                <div style={{ flex: 1 }}>
                  <Group gap="sm" mb="xs">
                    {getStatusBadge(concept.status)}
                    <Text size="xs" c="dimmed">
                      Purchased {concept.purchasedAt}
                    </Text>
                  </Group>

                  <Text fw={500} mb="sm">
                    {concept.headline}
                  </Text>

                  {concept.status === "verified" && concept.cashbackAmount && (
                    <Badge color="green" variant="light" size="lg">
                      +${concept.cashbackAmount.toFixed(2)} earned
                    </Badge>
                  )}

                  {concept.submittedUrl && (
                    <Group gap="xs" mt="xs">
                      <IconBrandTiktok size={14} />
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {concept.submittedUrl}
                      </Text>
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        component="a"
                        href={concept.submittedUrl}
                        target="_blank"
                      >
                        <IconExternalLink size={12} />
                      </ActionIcon>
                    </Group>
                  )}
                </div>

                <Group gap="xs">
                  <Tooltip label="View concept">
                    <ActionIcon
                      variant="light"
                      size="lg"
                      onClick={() => router.push(`/viewer/${concept.id}`)}
                    >
                      <IconPlayerPlay size={18} />
                    </ActionIcon>
                  </Tooltip>

                  {concept.status === "not_filmed" && (
                    <Button
                      size="sm"
                      leftSection={<IconBrandTiktok size={16} />}
                      onClick={() => handleOpenSubmit(concept)}
                    >
                      Submit link
                    </Button>
                  )}
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>

        {/* Empty state */}
        {concepts.length === 0 && (
          <Paper p="xl" radius="md" ta="center" bg="gray.0">
            <Text c="dimmed" mb="md">
              You haven&apos;t purchased any concepts yet
            </Text>
            <Button onClick={() => router.push("/dashboard")}>
              Browse concepts
            </Button>
          </Paper>
        )}
      </Stack>

      {/* Submit modal */}
      <Modal
        opened={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        title="Submit your TikTok"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Paste the link to your TikTok video for:
          </Text>
          <Text fw={500} size="sm" lineClamp={2}>
            {selectedConcept?.headline}
          </Text>

          <Divider />

          <TextInput
            label="TikTok URL"
            placeholder="https://tiktok.com/@yourbusiness/video/..."
            leftSection={<IconBrandTiktok size={16} />}
            value={tiktokUrl}
            onChange={(e) => setTiktokUrl(e.target.value)}
          />

          <Text size="xs" c="dimmed">
            We&apos;ll review your video and credit your account within 24-48 hours.
            You&apos;ll earn ${((selectedConcept?.price || 0) * 0.12).toFixed(2)} in credits.
          </Text>

          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={() => setSubmitModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={!tiktokUrl.trim()}
            >
              Submit for review
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
