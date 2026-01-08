'use client';

import { useState } from 'react';
import {
  Box,
  Text,
  Button,
  Textarea,
  Badge,
  Paper,
  Group,
  Stack,
  ActionIcon,
  Loader,
  Transition,
  Avatar,
} from '@mantine/core';
import {
  IconArrowRight,
  IconChevronDown,
  IconChevronRight,
  IconTrendingUp,
} from '@tabler/icons-react';

// ============================================
// COLOR PALETTE
// ============================================
const colors = {
  cream: '#FAF8F5',
  brownDark: '#4A2F18',
  brownMedium: '#5D3A1A',
  brownLight: '#6B4423',
  textPrimary: '#1A1612',
  textSecondary: '#7D6E5D',
  textMuted: '#9D8E7D',
  textPlaceholder: '#B5A99A',
  surface: '#F5F2EE',
  surfaceLight: '#F0EBE4',
  border: 'rgba(74, 47, 24, 0.08)',
  borderLight: 'rgba(74, 47, 24, 0.06)',
  success: '#5A8F5A',
};

// ============================================
// TYPES
// ============================================
interface Profile {
  type: string;
  location: string;
  style: string;
}

interface ConceptStats {
  filmed: number;
  succeeded: number;
}

interface WorkingConcept {
  title: string;
  subtitle: string;
  stats: ConceptStats;
  market: string;
}

interface ChatSuggestion {
  title: string;
  match: string;
}

interface ChatResponse {
  input: string;
  analysis: string;
  suggestions: ChatSuggestion[];
}

// ============================================
// CONSTANTS
// ============================================
const TYPE_OPTIONS = ['café', 'restaurant', 'bar', 'salon', 'retail', 'hotel'];
const LOCATION_OPTIONS = ['Sweden', 'Germany', 'France', 'Spain', 'UK', 'Netherlands'];
const STYLE_OPTIONS = [
  'cozy, sometimes absurdist',
  'chaotic, high energy',
  'dry, deadpan',
  'warm, wholesome',
  'edgy, dark humor',
  'clean, minimal',
];

const VIBES = [
  { label: 'Service frustration', count: 23 },
  { label: 'Cozy moments', count: 18 },
  { label: 'Kitchen chaos', count: 15 },
  { label: 'Customer absurdity', count: 21 },
  { label: 'Staff dynamics', count: 12 },
];

const WORKING_CONCEPTS: WorkingConcept[] = [
  {
    title: 'The Overtime Smile',
    subtitle: 'Exaggerated positivity during exhausting shift',
    stats: { filmed: 6, succeeded: 4 },
    market: 'SE',
  },
  {
    title: 'Misheard Order Spiral',
    subtitle: 'Small misunderstanding escalates absurdly',
    stats: { filmed: 8, succeeded: 5 },
    market: 'DE',
  },
];

// ============================================
// MAIN COMPONENT
// ============================================
export default function Dashboard2Page() {
  const [profile, setProfile] = useState<Profile>({
    type: 'café',
    location: 'Sweden',
    style: 'cozy, sometimes absurdist',
  });

  const [editingField, setEditingField] = useState<keyof Profile | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState<ChatResponse | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  const handleFieldClick = (field: keyof Profile) => {
    setEditingField(editingField === field ? null : field);
  };

  const handleOptionSelect = (field: keyof Profile, value: string) => {
    setProfile({ ...profile, [field]: value });
    setEditingField(null);
  };

  const getOptionsForField = (field: keyof Profile): string[] => {
    switch (field) {
      case 'type':
        return TYPE_OPTIONS;
      case 'location':
        return LOCATION_OPTIONS;
      case 'style':
        return STYLE_OPTIONS;
      default:
        return [];
    }
  };

  const handleChatSubmit = () => {
    if (!chatInput.trim()) return;
    setChatLoading(true);

    setTimeout(() => {
      setChatResponse({
        input: chatInput,
        analysis:
          "This clip uses situational irony — the staff's exaggerated positivity contrasts with clearly exhausting work. The humor mechanism is subversion through hyperbole. It's relatable for service workers and plays well with your absurdist lean.",
        suggestions: [
          { title: 'The Overtime Smile', match: 'Same mechanism' },
          { title: 'Customer From Hell, Service From Heaven', match: 'Similar contrast' },
        ],
      });
      setChatLoading(false);
      setChatInput('');
    }, 1500);
  };

  return (
    <Box style={{ minHeight: '100vh', background: colors.cream }}>
      {/* Header */}
      <Box
        component="header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${colors.borderLight}`,
          padding: '20px 24px',
        }}
      >
        <Group gap="sm">
          <Avatar
            size={36}
            radius="xl"
            style={{
              background: `linear-gradient(145deg, ${colors.brownLight} 0%, ${colors.brownDark} 100%)`,
            }}
          >
            <Text size="xs" fw={700} fs="italic" c="white">
              Le
            </Text>
          </Avatar>
          <Text size="md" fw={600} c={colors.textPrimary} style={{ letterSpacing: '-0.02em' }}>
            LeTrend
          </Text>
        </Group>
      </Box>

      {/* Main Content */}
      <Box component="main" style={{ padding: '24px 20px 40px' }}>
        {/* Profile Summary */}
        <Box component="section" style={{ marginBottom: 28 }}>
          <Text
            size="xs"
            fw={600}
            tt="uppercase"
            style={{ letterSpacing: '0.08em', color: colors.textMuted, marginBottom: 12 }}
          >
            Finding sketches for
          </Text>

          <Text size="lg" c={colors.textPrimary} style={{ lineHeight: 1.6 }}>
            A{' '}
            <ProfileToken
              value={profile.type}
              active={editingField === 'type'}
              onClick={() => handleFieldClick('type')}
            />{' '}
            in{' '}
            <ProfileToken
              value={profile.location}
              active={editingField === 'location'}
              onClick={() => handleFieldClick('location')}
            />{' '}
            with{' '}
            <ProfileToken
              value={profile.style}
              active={editingField === 'style'}
              onClick={() => handleFieldClick('style')}
            />{' '}
            humor.
          </Text>

          {/* Dropdown for editing */}
          <Transition mounted={!!editingField} transition="fade" duration={150}>
            {(styles) => (
              <Paper
                style={{
                  ...styles,
                  marginTop: 12,
                  padding: 8,
                  border: `1px solid ${colors.border}`,
                }}
                radius="md"
              >
                <Group gap="xs" wrap="wrap">
                  {editingField &&
                    getOptionsForField(editingField).map((option) => (
                      <Button
                        key={option}
                        size="xs"
                        radius="xl"
                        style={{
                          background: profile[editingField] === option ? colors.brownDark : colors.surface,
                          color: profile[editingField] === option ? colors.cream : colors.textSecondary,
                        }}
                        onClick={() => handleOptionSelect(editingField, option)}
                      >
                        {option}
                      </Button>
                    ))}
                </Group>
              </Paper>
            )}
          </Transition>
        </Box>

        {/* Pick For Me - Primary CTA */}
        <Box component="section" style={{ marginBottom: 24 }}>
          <Button
            fullWidth
            size="xl"
            radius="md"
            style={{
              background: `linear-gradient(145deg, ${colors.brownMedium} 0%, #3D2510 100%)`,
              height: 'auto',
              padding: '22px 20px',
            }}
            styles={{
              inner: { justifyContent: 'space-between', width: '100%' },
              label: { width: '100%' },
            }}
          >
            <Group justify="space-between" w="100%">
              <Stack gap={4} align="flex-start">
                <Text size="md" fw={600} c="white">
                  Pick for me
                </Text>
                <Text size="sm" c="rgba(250, 248, 245, 0.65)">
                  Best match for your profile right now
                </Text>
              </Stack>
              <ActionIcon
                variant="subtle"
                size="xl"
                radius="xl"
                style={{ background: 'rgba(255,255,255,0.12)' }}
              >
                <IconArrowRight size={20} color="white" />
              </ActionIcon>
            </Group>
          </Button>
        </Box>

        {/* Working Right Now */}
        <Box component="section" style={{ marginBottom: 28 }}>
          <Group justify="space-between" style={{ marginBottom: 14 }}>
            <Text
              size="xs"
              fw={600}
              tt="uppercase"
              style={{ letterSpacing: '0.08em', color: colors.textMuted }}
            >
              Working right now
            </Text>
            <Group gap={6}>
              <IconTrendingUp size={14} color={colors.success} />
              <Text size="xs" fw={500} c={colors.success}>
                From users this week
              </Text>
            </Group>
          </Group>

          <Paper
            radius="md"
            style={{ border: `1px solid ${colors.border}`, overflow: 'hidden' }}
            p={0}
          >
            {WORKING_CONCEPTS.map((concept, index) => (
              <Box key={concept.title}>
                <WorkingConceptRow concept={concept} />
                {index < WORKING_CONCEPTS.length - 1 && (
                  <Box style={{ height: 1, background: colors.borderLight, margin: '0 16px' }} />
                )}
              </Box>
            ))}
          </Paper>
        </Box>

        {/* Browse by Vibe */}
        <Box component="section" style={{ marginBottom: 32 }}>
          <Text
            size="xs"
            fw={600}
            tt="uppercase"
            style={{ letterSpacing: '0.08em', color: colors.textMuted, marginBottom: 14 }}
          >
            Browse by vibe
          </Text>

          <Group gap="sm" wrap="wrap">
            {VIBES.map((vibe) => (
              <VibePill key={vibe.label} label={vibe.label} count={vibe.count} />
            ))}
          </Group>
        </Box>

        {/* Have Something in Mind */}
        <Box component="section">
          <Text
            size="xs"
            fw={600}
            tt="uppercase"
            style={{ letterSpacing: '0.08em', color: colors.textMuted, marginBottom: 14 }}
          >
            Have something in mind?
          </Text>

          <Paper radius="md" style={{ border: `1px solid ${colors.border}`, padding: 16 }}>
            <Textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.currentTarget.value)}
              placeholder={`Paste a TikTok link, or describe what you're looking for...\n\ne.g. 'I like how @salongwoar does their content — absurd but cozy'\ne.g. 'Something about difficult customers but not mean-spirited'`}
              minRows={4}
              autosize
              variant="unstyled"
              styles={{
                input: {
                  fontSize: 15,
                  color: colors.textPrimary,
                  '&::placeholder': { color: colors.textPlaceholder },
                },
              }}
            />

            <Group justify="flex-end" mt="md">
              <Button
                radius="xl"
                disabled={!chatInput.trim() || chatLoading}
                onClick={handleChatSubmit}
                style={{
                  background: chatInput.trim() && !chatLoading ? colors.brownDark : '#E5E0D9',
                  color: chatInput.trim() && !chatLoading ? colors.cream : '#A99D8F',
                }}
                leftSection={chatLoading ? <Loader size={14} color="gray" /> : undefined}
              >
                {chatLoading ? 'Analyzing' : 'Find similar'}
              </Button>
            </Group>
          </Paper>

          {/* Chat Response */}
          <Transition mounted={!!chatResponse} transition="slide-up" duration={200}>
            {(styles) => (
              <Paper
                style={{ ...styles, marginTop: 16, padding: 18, background: colors.surface }}
                radius="md"
              >
                <Text size="sm" c={colors.textSecondary} style={{ marginBottom: 8 }}>
                  Based on your input:
                </Text>
                <Text size="sm" c="#3D3229" style={{ lineHeight: 1.6, marginBottom: 16 }}>
                  {chatResponse?.analysis}
                </Text>

                <Text
                  size="xs"
                  fw={600}
                  tt="uppercase"
                  style={{ letterSpacing: '0.05em', color: colors.textMuted, marginBottom: 10 }}
                >
                  Similar concepts
                </Text>

                <Stack gap="xs">
                  {chatResponse?.suggestions.map((suggestion) => (
                    <Paper
                      key={suggestion.title}
                      radius="sm"
                      style={{
                        padding: '12px 14px',
                        background: '#FFFFFF',
                        cursor: 'pointer',
                      }}
                    >
                      <Group justify="space-between">
                        <Box>
                          <Text size="sm" fw={500} c={colors.textPrimary}>
                            {suggestion.title}
                          </Text>
                          <Text size="xs" c={colors.textMuted}>
                            {suggestion.match}
                          </Text>
                        </Box>
                        <IconChevronRight size={16} color={colors.textMuted} />
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </Paper>
            )}
          </Transition>
        </Box>
      </Box>
    </Box>
  );
}

// ============================================
// PROFILE TOKEN COMPONENT
// ============================================
interface ProfileTokenProps {
  value: string;
  active: boolean;
  onClick: () => void;
}

function ProfileToken({ value, active, onClick }: ProfileTokenProps) {
  return (
    <Button
      variant="subtle"
      size="compact-md"
      radius="sm"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 12px',
        background: active ? colors.brownDark : colors.surfaceLight,
        color: active ? colors.cream : colors.brownDark,
        fontSize: 20,
        fontWeight: 500,
        verticalAlign: 'baseline',
        lineHeight: 1.4,
      }}
      rightSection={
        <IconChevronDown
          size={14}
          style={{
            opacity: 0.6,
            transform: active ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
          }}
        />
      }
    >
      {value}
    </Button>
  );
}

// ============================================
// WORKING CONCEPT ROW COMPONENT
// ============================================
interface WorkingConceptRowProps {
  concept: WorkingConcept;
}

function WorkingConceptRow({ concept }: WorkingConceptRowProps) {
  return (
    <Box
      style={{
        padding: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      <Box style={{ flex: 1 }}>
        <Group gap="xs" style={{ marginBottom: 4 }}>
          <Text size="sm" fw={600} c={colors.textPrimary}>
            {concept.title}
          </Text>
          <Badge
            size="xs"
            variant="light"
            style={{
              background: colors.surfaceLight,
              color: colors.textSecondary,
              fontWeight: 600,
            }}
          >
            {concept.market}
          </Badge>
        </Group>
        <Text size="xs" c={colors.textSecondary}>
          {concept.subtitle}
        </Text>
      </Box>

      <Box style={{ textAlign: 'right', marginLeft: 16 }}>
        <Text size="sm" fw={600} c={colors.success}>
          {concept.stats.succeeded}/{concept.stats.filmed} hit
        </Text>
        <Text size="xs" c={colors.textMuted}>
          this week
        </Text>
      </Box>
    </Box>
  );
}

// ============================================
// VIBE PILL COMPONENT
// ============================================
interface VibePillProps {
  label: string;
  count: number;
}

function VibePill({ label, count }: VibePillProps) {
  return (
    <Button
      variant="default"
      radius="xl"
      size="sm"
      style={{
        background: '#FFFFFF',
        border: `1px solid ${colors.border}`,
        color: '#4A3A2A',
        fontWeight: 400,
      }}
      rightSection={
        <Text size="xs" c={colors.textMuted}>
          {count}
        </Text>
      }
    >
      {label}
    </Button>
  );
}
