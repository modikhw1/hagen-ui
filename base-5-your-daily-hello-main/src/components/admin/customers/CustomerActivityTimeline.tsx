'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  Card,
  Stack,
  Group,
  Text,
  Badge,
  Skeleton,
  Alert,
  ScrollArea,
  Box,
  ThemeIcon,
  Textarea,
  Button,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconClockHour4,
  IconAlertTriangle,
  IconShieldCheck,
  IconUserCircle,
  IconReceipt,
  IconBrandStripe,
  IconNotes,
  IconPin,
  IconPinFilled,
  IconTrash,
  IconNote,
} from '@tabler/icons-react';

import { useCustomerActivity } from '@/hooks/admin/useCustomerActivity';
import {
  useCreateAdminCustomerNote,
  useUpdateAdminCustomerNote,
  useDeleteAdminCustomerNote,
} from '@/hooks/admin/useAdminCustomerNotes';
import type { CustomerActivityEntry } from '@/lib/admin/dtos/customer';

export interface CustomerActivityTimelineProps {
  customerId: string;
  /** Begränsa antal poster (default: 12) */
  limit?: number;
  showFooter?: boolean;
  title?: string;
  /** Visa input för ny admin-anteckning ovanför listan. */
  enableNotes?: boolean;
}

function iconFor(entry: CustomerActivityEntry) {
  if (entry.kind === 'admin_note') return entry.pinned ? IconPinFilled : IconNote;
  if (entry.entityType === 'invoice') return IconReceipt;
  if (entry.entityType === 'subscription') return IconBrandStripe;
  if (entry.kind === 'cm_activity') return IconUserCircle;
  if (entry.kind === 'game_plan' || entry.kind === 'concept') return IconNotes;
  return IconShieldCheck;
}

function colorFor(entry: CustomerActivityEntry) {
  if (entry.kind === 'admin_note') return entry.pinned ? 'yellow' : 'gray';
  const t = entry.title.toLowerCase();
  if (t.includes('avslutat')) return 'red';
  if (t.includes('paus')) return 'orange';
  if (t.includes('skapad') || t.includes('aktiverad')) return 'green';
  return 'blue';
}

export function CustomerActivityTimeline({
  customerId,
  limit = 12,
  showFooter = false,
  title = 'Tidslinje',
  enableNotes = false,
}: CustomerActivityTimelineProps) {
  const { data, isLoading, error } = useCustomerActivity(customerId);
  const [draft, setDraft] = useState('');
  const create = useCreateAdminCustomerNote(customerId);
  const update = useUpdateAdminCustomerNote(customerId);
  const remove = useDeleteAdminCustomerNote(customerId);

  // Sortera så att fästa anteckningar alltid hamnar överst.
  const entries = (data?.activities ?? []).slice().sort((a, b) => {
    const ap = a.kind === 'admin_note' && a.pinned ? 1 : 0;
    const bp = b.kind === 'admin_note' && b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return +new Date(b.at) - +new Date(a.at);
  });

  const visible = entries.slice(0, limit);

  const handleSubmit = async () => {
    const body = draft.trim();
    if (!body) return;
    await create.mutateAsync({ body });
    setDraft('');
  };

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group gap={6}>
          <IconClockHour4 size={16} />
          <Text size="sm" fw={700} tt="uppercase" c="dimmed">
            {title}
          </Text>
        </Group>

        {enableNotes && (
          <Stack gap={6}>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              placeholder="Anteckning… t.ex. 'Pratat med kunden 12 maj, vill öka pris från juni'"
              autosize
              minRows={2}
              maxRows={6}
              disabled={create.isPending}
            />
            <Group justify="flex-end" gap="xs">
              <Button
                size="xs"
                variant="light"
                onClick={handleSubmit}
                loading={create.isPending}
                disabled={!draft.trim()}
              >
                Spara anteckning
              </Button>
            </Group>
          </Stack>
        )}

        {isLoading && (
          <Stack gap="xs">
            <Skeleton height={48} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </Stack>
        )}

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />}>
            <Text size="xs">Kunde inte hämta tidslinjen.</Text>
          </Alert>
        )}

        {data && visible.length === 0 && (
          <Text size="sm" c="dimmed">
            Inga händelser ännu.
          </Text>
        )}

        {visible.length > 0 && (
          <ScrollArea.Autosize mah={500}>
            <Stack gap="xs">
              {visible.map((entry) => {
                const Icon = iconFor(entry);
                const tone = colorFor(entry);
                const isNote = entry.kind === 'admin_note';
                return (
                  <Group key={entry.id} align="flex-start" gap="sm" wrap="nowrap">
                    <ThemeIcon variant="light" color={tone} size="md" radius="xl">
                      <Icon size={14} />
                    </ThemeIcon>
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group justify="space-between" gap={4} wrap="nowrap">
                        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600} lineClamp={1}>
                            {entry.title}
                          </Text>
                          {isNote && entry.pinned && (
                            <Badge size="xs" variant="filled" color="yellow">
                              Fäst
                            </Badge>
                          )}
                        </Group>
                        <Group gap={4} wrap="nowrap">
                          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                            {formatDistanceToNow(new Date(entry.at), {
                              addSuffix: true,
                              locale: sv,
                            })}
                          </Text>
                          {isNote && entry.noteId && (
                            <>
                              <Tooltip label={entry.pinned ? 'Lossa' : 'Fäst'}>
                                <ActionIcon
                                  size="xs"
                                  variant="subtle"
                                  color="gray"
                                  onClick={() =>
                                    update.mutate({
                                      noteId: entry.noteId!,
                                      pinned: !entry.pinned,
                                    })
                                  }
                                >
                                  <IconPin size={12} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label="Ta bort">
                                <ActionIcon
                                  size="xs"
                                  variant="subtle"
                                  color="red"
                                  onClick={() => {
                                    if (confirm('Ta bort anteckningen?')) {
                                      remove.mutate(entry.noteId!);
                                    }
                                  }}
                                >
                                  <IconTrash size={12} />
                                </ActionIcon>
                              </Tooltip>
                            </>
                          )}
                        </Group>
                      </Group>
                      {entry.description && entry.description !== entry.title && (
                        <Text
                          size="xs"
                          c={isNote ? 'dark' : 'dimmed'}
                          lineClamp={isNote ? 6 : 2}
                          style={isNote ? { whiteSpace: 'pre-wrap' } : undefined}
                        >
                          {entry.description}
                        </Text>
                      )}
                      {entry.actorLabel && (
                        <Group gap={4} mt={2}>
                          <Badge size="xs" variant="light" color="gray">
                            {entry.actorLabel}
                          </Badge>
                          {entry.actorRole && (
                            <Text size="xs" c="dimmed">
                              {entry.actorRole}
                            </Text>
                          )}
                        </Group>
                      )}
                    </Box>
                  </Group>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        )}

        {showFooter && data && entries.length > limit && (
          <Text size="xs" c="dimmed" ta="center">
            Visar {limit} av {entries.length} händelser
          </Text>
        )}
      </Stack>
    </Card>
  );
}
