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
  Tabs,
  List,
  Checkbox,
  Card,
  ThemeIcon,
  Accordion,
  Box,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconPlayerPlay,
  IconScript,
  IconChecklist,
  IconBulb,
  IconCamera,
  IconUsers,
  IconClock,
} from "@tabler/icons-react";
import { mockConcepts } from "@/mocks/data";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Mock script/scene data
const mockScriptData = {
  concept: "Employee dreads confessing mistake to authority figure, confession is anticlimactic",
  scenes: [
    {
      number: 1,
      timestamp: "0:00-0:03",
      description: "Walk toward kitchen with visible anxiety",
      dialogue: "(No dialogue - facial expression carries the scene)",
      tip: "Really sell the dread. Slow walk, nervous glances.",
    },
    {
      number: 2,
      timestamp: "0:03-0:08",
      description: "Hesitate at kitchen window",
      dialogue: "(Deep breath, maybe a small sigh)",
      tip: "The pause is key. Let it hang for 2-3 seconds.",
    },
    {
      number: 3,
      timestamp: "0:08-0:14",
      description: "Mumble the confession",
      dialogue: '"Hey chef... I uh... I gave table 5 the wrong order"',
      tip: "Start quiet, get slightly louder. Wince as you say it.",
    },
    {
      number: 4,
      timestamp: "0:14-0:18",
      description: "Chef's reaction - deadpan, returns to cooking",
      dialogue: "(Chef just stares, then goes back to work)",
      tip: "The non-reaction IS the punchline. Keep it totally flat.",
    },
  ],
  transcript: `[Text overlay: POV: you have to tell the kitchen you messed up]

(Server walks slowly toward kitchen, visible anxiety)

(Hesitates at window, takes deep breath)

Server: "Hey chef... I uh... I gave table 5 the wrong order"

(Chef stares blankly for 2 seconds)

(Chef returns to cooking without a word)

[End]`,
};

const mockChecklist = [
  { id: "1", label: "Scout location (real or fake kitchen works)", checked: false },
  { id: "2", label: "Find someone to play chef (or film solo with cut)", checked: false },
  { id: "3", label: "Practice the anxious walk", checked: false },
  { id: "4", label: "Set up phone/camera at kitchen window angle", checked: false },
  { id: "5", label: "Film 2-3 takes", checked: false },
  { id: "6", label: "Add text overlay in editing", checked: false },
  { id: "7", label: "Post and tag your business", checked: false },
];

export default function ViewerPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [checklist, setChecklist] = useState(mockChecklist);

  // Find concept from mock data
  const concept = mockConcepts.find((c) => c.id === id) || mockConcepts[0];

  const toggleCheckItem = (itemId: string) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const completedCount = checklist.filter((c) => c.checked).length;

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Button
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => router.push("/dashboard")}
              mb="sm"
              px={0}
            >
              Back to dashboard
            </Button>
            <Title order={1} size="h2">
              {concept.headline}
            </Title>
            <Group gap="xs" mt="xs">
              <Badge color="green">Purchased</Badge>
              <Badge variant="light">{concept.difficulty}</Badge>
              <Badge variant="light">{concept.peopleNeeded}</Badge>
            </Group>
          </div>

          <Button variant="light" onClick={() => router.push("/my-concepts")}>
            My Concepts
          </Button>
        </Group>

        <Grid gutter="xl">
          {/* Left - Main content */}
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Tabs defaultValue="video">
              <Tabs.List mb="md">
                <Tabs.Tab value="video" leftSection={<IconPlayerPlay size={16} />}>
                  Video
                </Tabs.Tab>
                <Tabs.Tab value="script" leftSection={<IconScript size={16} />}>
                  Script
                </Tabs.Tab>
                <Tabs.Tab value="guide" leftSection={<IconBulb size={16} />}>
                  Guide
                </Tabs.Tab>
              </Tabs.List>

              {/* Video tab */}
              <Tabs.Panel value="video">
                <Stack gap="lg">
                  {/* Video placeholder */}
                  <Paper
                    radius="md"
                    bg="dark.7"
                    style={{ aspectRatio: "9/16", maxWidth: 400 }}
                    p="xl"
                  >
                    <Stack align="center" justify="center" h="100%">
                      <ThemeIcon size={60} radius="xl" variant="light">
                        <IconPlayerPlay size={30} />
                      </ThemeIcon>
                      <Text c="white" ta="center">
                        Video player placeholder
                      </Text>
                      <Text c="dimmed" size="sm" ta="center">
                        Original TikTok with subtitles
                      </Text>
                    </Stack>
                  </Paper>

                  {/* Quick info */}
                  <Group gap="xl">
                    <Group gap="xs">
                      <IconClock size={16} />
                      <Text size="sm">18 seconds</Text>
                    </Group>
                    <Group gap="xs">
                      <IconUsers size={16} />
                      <Text size="sm">{concept.peopleNeeded}</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCamera size={16} />
                      <Text size="sm">{concept.filmTime} to film</Text>
                    </Group>
                  </Group>
                </Stack>
              </Tabs.Panel>

              {/* Script tab */}
              <Tabs.Panel value="script">
                <Stack gap="lg">
                  {/* The concept */}
                  <Paper p="lg" radius="md" bg="blue.0">
                    <Text fw={600} mb="xs">The Concept</Text>
                    <Text>{mockScriptData.concept}</Text>
                  </Paper>

                  {/* Full transcript */}
                  <Paper p="lg" radius="md" withBorder>
                    <Text fw={600} mb="md">Full Transcript</Text>
                    <Text
                      size="sm"
                      style={{ whiteSpace: "pre-line", fontFamily: "monospace" }}
                    >
                      {mockScriptData.transcript}
                    </Text>
                  </Paper>

                  {/* Scene breakdown */}
                  <div>
                    <Text fw={600} mb="md">Scene Breakdown</Text>
                    <Accordion variant="separated">
                      {mockScriptData.scenes.map((scene) => (
                        <Accordion.Item key={scene.number} value={`scene-${scene.number}`}>
                          <Accordion.Control>
                            <Group>
                              <Badge variant="light">Scene {scene.number}</Badge>
                              <Text size="sm">{scene.timestamp}</Text>
                              <Text size="sm" c="dimmed" lineClamp={1}>
                                {scene.description}
                              </Text>
                            </Group>
                          </Accordion.Control>
                          <Accordion.Panel>
                            <Stack gap="sm">
                              <div>
                                <Text size="sm" fw={500}>What happens:</Text>
                                <Text size="sm">{scene.description}</Text>
                              </div>
                              <div>
                                <Text size="sm" fw={500}>Dialogue:</Text>
                                <Text size="sm" fs="italic">{scene.dialogue}</Text>
                              </div>
                              <Paper p="sm" radius="sm" bg="yellow.0">
                                <Text size="sm">
                                  <strong>Tip:</strong> {scene.tip}
                                </Text>
                              </Paper>
                            </Stack>
                          </Accordion.Panel>
                        </Accordion.Item>
                      ))}
                    </Accordion>
                  </div>
                </Stack>
              </Tabs.Panel>

              {/* Guide tab */}
              <Tabs.Panel value="guide">
                <Stack gap="lg">
                  {/* What you'll need */}
                  <Paper p="lg" radius="md" withBorder>
                    <Text fw={600} mb="md">What You&apos;ll Need</Text>
                    <List spacing="sm">
                      <List.Item>A phone to film with</List.Item>
                      <List.Item>Kitchen or kitchen-like setting (back of house works)</List.Item>
                      <List.Item>Server/employee outfit (apron helps)</List.Item>
                      <List.Item>Optional: someone to play the chef</List.Item>
                    </List>
                  </Paper>

                  {/* Casting notes */}
                  <Paper p="lg" radius="md" withBorder>
                    <Text fw={600} mb="md">Casting Notes</Text>
                    <Text size="sm">
                      <strong>The server:</strong> Anyone who can look anxious. Exaggerate the
                      hesitation and dread. The comedy comes from overselling the nervousness.
                    </Text>
                    <Text size="sm" mt="sm">
                      <strong>The chef:</strong> Needs to deliver a completely flat, unbothered
                      reaction. The less emotion, the funnier. Can be filmed separately if needed.
                    </Text>
                  </Paper>

                  {/* Flexibility */}
                  <Paper p="lg" radius="md" withBorder>
                    <Text fw={600} mb="md">Make It Your Own</Text>
                    <Text size="sm" mb="sm">
                      This format works for any &quot;dreading confession&quot; scenario:
                    </Text>
                    <List size="sm" spacing="xs">
                      <List.Item>Barista telling manager they broke the espresso machine</List.Item>
                      <List.Item>Retail worker confessing they gave wrong change</List.Item>
                      <List.Item>Salon assistant admitting they double-booked</List.Item>
                    </List>
                  </Paper>
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Grid.Col>

          {/* Right - Checklist */}
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Card shadow="sm" radius="md" withBorder p="lg" pos="sticky" top={20}>
              <Group justify="space-between" mb="md">
                <Group gap="xs">
                  <IconChecklist size={20} />
                  <Text fw={600}>Prep Checklist</Text>
                </Group>
                <Badge color={completedCount === checklist.length ? "green" : "gray"}>
                  {completedCount}/{checklist.length}
                </Badge>
              </Group>

              <Stack gap="sm">
                {checklist.map((item) => (
                  <Checkbox
                    key={item.id}
                    label={item.label}
                    checked={item.checked}
                    onChange={() => toggleCheckItem(item.id)}
                    size="sm"
                  />
                ))}
              </Stack>

              <Divider my="md" />

              <Button
                fullWidth
                variant="light"
                onClick={() => router.push("/my-concepts")}
              >
                Done filming? Submit your link
              </Button>

              <Text size="xs" c="dimmed" ta="center" mt="sm">
                Submit your TikTok link to earn credits
              </Text>
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
