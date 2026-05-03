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
  TextInput,
  Textarea,
  Badge,
  Card,
  Progress,
  Divider,
  ActionIcon,
  ThemeIcon,
  TagsInput,
  Switch,
  Modal,
} from "@mantine/core";
import {
  IconBrandTiktok,
  IconBrandInstagram,
  IconCheck,
  IconLink,
  IconUnlink,
  IconRefresh,
  IconEdit,
  IconDeviceFloppy,
  IconX,
} from "@tabler/icons-react";
import { mockUserProfile } from "@/mocks/data";

interface SocialConnection {
  platform: "tiktok" | "instagram";
  connected: boolean;
  handle?: string;
  lastSynced?: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncPlatform, setSyncPlatform] = useState<"tiktok" | "instagram" | null>(null);

  // Form state
  const [businessName, setBusinessName] = useState(mockUserProfile.businessName);
  const [businessDescription, setBusinessDescription] = useState(
    mockUserProfile.businessDescription
  );
  const [goals, setGoals] = useState<string[]>(mockUserProfile.goals);
  const [constraints, setConstraints] = useState<string[]>(mockUserProfile.constraints);

  // Social connections
  const [socials, setSocials] = useState<SocialConnection[]>([
    {
      platform: "tiktok",
      connected: !!mockUserProfile.socialLinks?.tiktok,
      handle: mockUserProfile.socialLinks?.tiktok,
      lastSynced: "2024-01-20",
    },
    {
      platform: "instagram",
      connected: !!mockUserProfile.socialLinks?.instagram,
      handle: mockUserProfile.socialLinks?.instagram,
      lastSynced: mockUserProfile.socialLinks?.instagram ? "2024-01-18" : undefined,
    },
  ]);

  const profileCompleteness = mockUserProfile.profileCompleteness;

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleCancel = () => {
    // Reset to original values
    setBusinessName(mockUserProfile.businessName);
    setBusinessDescription(mockUserProfile.businessDescription);
    setGoals(mockUserProfile.goals);
    setConstraints(mockUserProfile.constraints);
    setIsEditing(false);
  };

  const handleConnect = (platform: "tiktok" | "instagram") => {
    setSyncPlatform(platform);
    setSyncModalOpen(true);
  };

  const handleDisconnect = (platform: "tiktok" | "instagram") => {
    setSocials((prev) =>
      prev.map((s) =>
        s.platform === platform
          ? { ...s, connected: false, handle: undefined, lastSynced: undefined }
          : s
      )
    );
  };

  const handleResync = async (platform: "tiktok" | "instagram") => {
    // Simulate resync
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setSocials((prev) =>
      prev.map((s) =>
        s.platform === platform
          ? { ...s, lastSynced: new Date().toISOString().split("T")[0] }
          : s
      )
    );
  };

  const confirmConnect = async () => {
    if (!syncPlatform) return;
    // Simulate OAuth flow
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setSocials((prev) =>
      prev.map((s) =>
        s.platform === syncPlatform
          ? {
              ...s,
              connected: true,
              handle: syncPlatform === "tiktok" ? "@austincoffee" : "@austin_coffee_co",
              lastSynced: new Date().toISOString().split("T")[0],
            }
          : s
      )
    );
    setSyncModalOpen(false);
    setSyncPlatform(null);
  };

  const getSocialIcon = (platform: "tiktok" | "instagram") => {
    return platform === "tiktok" ? IconBrandTiktok : IconBrandInstagram;
  };

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1} size="h2">
              Profile Settings
            </Title>
            <Text c="dimmed">
              Manage your business info and social connections
            </Text>
          </div>

          {!isEditing ? (
            <Button
              variant="light"
              leftSection={<IconEdit size={16} />}
              onClick={() => setIsEditing(true)}
            >
              Edit profile
            </Button>
          ) : (
            <Group gap="xs">
              <Button variant="subtle" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                leftSection={<IconDeviceFloppy size={16} />}
                onClick={handleSave}
                loading={isSaving}
              >
                Save changes
              </Button>
            </Group>
          )}
        </Group>

        {/* Profile completeness */}
        <Paper p="lg" radius="md" withBorder>
          <Group justify="space-between" mb="md">
            <div>
              <Text fw={600}>Profile completeness</Text>
              <Text size="sm" c="dimmed">
                The more we know, the better your recommendations
              </Text>
            </div>
            <Badge
              size="lg"
              color={profileCompleteness >= 80 ? "green" : profileCompleteness >= 50 ? "yellow" : "orange"}
            >
              {profileCompleteness}%
            </Badge>
          </Group>
          <Progress
            value={profileCompleteness}
            color={profileCompleteness >= 80 ? "green" : profileCompleteness >= 50 ? "yellow" : "orange"}
            size="lg"
            radius="xl"
          />
        </Paper>

        {/* Business info */}
        <Paper p="lg" radius="md" withBorder>
          <Text fw={600} mb="md">
            Business Information
          </Text>

          <Stack gap="md">
            <TextInput
              label="Business name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              disabled={!isEditing}
            />

            <Textarea
              label="Description"
              description="What does your business do? What makes it unique?"
              value={businessDescription}
              onChange={(e) => setBusinessDescription(e.target.value)}
              disabled={!isEditing}
              minRows={3}
            />

            <TagsInput
              label="Goals"
              description="What do you want to achieve with your content?"
              value={goals}
              onChange={setGoals}
              disabled={!isEditing}
              placeholder={isEditing ? "Add a goal..." : ""}
            />

            <TagsInput
              label="Constraints"
              description="Any limitations for filming?"
              value={constraints}
              onChange={setConstraints}
              disabled={!isEditing}
              placeholder={isEditing ? "Add a constraint..." : ""}
            />
          </Stack>
        </Paper>

        {/* Social connections */}
        <Paper p="lg" radius="md" withBorder>
          <Text fw={600} mb="xs">
            Connected Accounts
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            Connect your social accounts to analyze your existing content and improve recommendations
          </Text>

          <Stack gap="md">
            {socials.map((social) => {
              const Icon = getSocialIcon(social.platform);
              return (
                <Card key={social.platform} withBorder p="md" radius="md">
                  <Group justify="space-between">
                    <Group gap="md">
                      <ThemeIcon
                        size="lg"
                        variant={social.connected ? "filled" : "light"}
                        color={social.platform === "tiktok" ? "dark" : "pink"}
                        radius="xl"
                      >
                        <Icon size={20} />
                      </ThemeIcon>
                      <div>
                        <Text fw={500} tt="capitalize">
                          {social.platform}
                        </Text>
                        {social.connected ? (
                          <Group gap="xs">
                            <Text size="sm" c="dimmed">
                              {social.handle}
                            </Text>
                            <Badge size="xs" color="green" variant="light">
                              Connected
                            </Badge>
                          </Group>
                        ) : (
                          <Text size="sm" c="dimmed">
                            Not connected
                          </Text>
                        )}
                      </div>
                    </Group>

                    <Group gap="xs">
                      {social.connected ? (
                        <>
                          <Text size="xs" c="dimmed">
                            Synced {social.lastSynced}
                          </Text>
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            onClick={() => handleResync(social.platform)}
                            title="Resync"
                          >
                            <IconRefresh size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => handleDisconnect(social.platform)}
                            title="Disconnect"
                          >
                            <IconUnlink size={16} />
                          </ActionIcon>
                        </>
                      ) : (
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconLink size={14} />}
                          onClick={() => handleConnect(social.platform)}
                        >
                          Connect
                        </Button>
                      )}
                    </Group>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        </Paper>

        {/* Danger zone */}
        <Paper p="lg" radius="md" withBorder style={{ borderColor: "var(--mantine-color-red-3)" }}>
          <Text fw={600} c="red" mb="xs">
            Danger Zone
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            Irreversible actions
          </Text>

          <Group>
            <Button variant="outline" color="red" size="sm">
              Delete all data
            </Button>
          </Group>
        </Paper>
      </Stack>

      {/* Connect modal */}
      <Modal
        opened={syncModalOpen}
        onClose={() => {
          setSyncModalOpen(false);
          setSyncPlatform(null);
        }}
        title={`Connect ${syncPlatform}`}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Connect your {syncPlatform} account to help us analyze your existing content style
            and improve your recommendations.
          </Text>

          <Paper p="md" radius="md" bg="gray.0">
            <Stack gap="xs">
              <Group gap="xs">
                <IconCheck size={14} color="green" />
                <Text size="sm">Analyze your top performing content</Text>
              </Group>
              <Group gap="xs">
                <IconCheck size={14} color="green" />
                <Text size="sm">Understand your audience demographics</Text>
              </Group>
              <Group gap="xs">
                <IconCheck size={14} color="green" />
                <Text size="sm">Match concepts to your style</Text>
              </Group>
            </Stack>
          </Paper>

          <Text size="xs" c="dimmed">
            We only read public data. We never post on your behalf.
          </Text>

          <Divider />

          <Group justify="flex-end" gap="sm">
            <Button
              variant="subtle"
              onClick={() => {
                setSyncModalOpen(false);
                setSyncPlatform(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={confirmConnect}>
              Connect {syncPlatform}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
