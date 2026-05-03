'use client';

import React from 'react';
import { 
  Table, 
  TextInput, 
  NumberInput, 
  ActionIcon, 
  Button, 
  Group, 
  Stack, 
  Text, 
  Badge, 
  Box
} from '@mantine/core';
import { Plus, Trash2, Info, MessageSquare } from 'lucide-react';
import { formatSek, sekToOre, oreToSek } from '@/lib/admin/money';
import { LineItemTemplate } from '@/lib/admin/billing/line-item-templates';

export type LineItem = {
  id?: string;
  description: string;
  amount_ore: number;
  quantity: number;
  internal_note?: string;
};

type Props = {
  items: LineItem[];
  onChange: (next: LineItem[]) => void;
  onItemCommit?: (item: LineItem, index: number) => void;
  onRemove?: (id: string) => void;
  editable?: boolean;
  isPending?: boolean;
  fixedHeader?: { description: string; amount_ore: number };
  showTotal?: boolean;
  maxItems?: number;
  templates?: LineItemTemplate[];
  emptyHint?: string;
  addLabel?: string;
};

export function LineItemEditor({
  items,
  onChange,
  onItemCommit,
  onRemove,
  editable = true,
  isPending = false,
  fixedHeader,
  showTotal = true,
  maxItems,
  templates,
  emptyHint = 'Inga rader än — lägg till en rad eller välj från snabbmallar nedan.',
  addLabel = 'Lägg till rad',
}: Props) {
  const update = (idx: number, patch: Partial<LineItem>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  
  const remove = (idx: number, id?: string) => {
    if (id && onRemove) {
      onRemove(id);
    } else {
      onChange(items.filter((_, i) => i !== idx));
    }
  };
  
  const add = (init?: Partial<LineItem>) => {
    if (maxItems !== undefined && items.length >= maxItems) return;
    onChange([...items, { description: '', amount_ore: 0, quantity: 1, internal_note: '', ...init }]);
  };

  const totalOre =
    (fixedHeader?.amount_ore ?? 0) +
    items.reduce((s, it) => s + (it.amount_ore || 0) * (it.quantity || 1), 0);

  return (
    <Stack gap="xs" style={{ opacity: isPending ? 0.75 : 1, transition: 'opacity 0.2s' }}>
      <Box className="rounded-lg border border-border bg-card overflow-hidden">
        <Table verticalSpacing="xs" horizontalSpacing="md">
          <Table.Thead className="bg-secondary/40">
            <Table.Tr>
              <Table.Th className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Beskrivning</Table.Th>
              <Table.Th className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[100px]">Antal</Table.Th>
              <Table.Th className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-[140px] text-right">Belopp (kr)</Table.Th>
              <Table.Th className="w-[40px]"></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {/* Fixed header row */}
            {fixedHeader && (
              <Table.Tr className="bg-secondary/10">
                <Table.Td>
                  <Text size="sm" fw={500}>{fixedHeader.description}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" ta="center">1</Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Text size="sm" className="tabular-nums">{formatSek(fixedHeader.amount_ore)}</Text>
                </Table.Td>
                <Table.Td></Table.Td>
              </Table.Tr>
            )}

            {/* Editable rows */}
            {items.length === 0 && !fixedHeader ? (
              <Table.Tr>
                <Table.Td colSpan={4} className="py-8 text-center">
                  <Text size="xs" c="dimmed">{emptyHint}</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              items.map((it, idx) => (
                <React.Fragment key={it.id ?? idx}>
                  <Table.Tr
                    onBlur={(event) => {
                      const nextTarget = event.relatedTarget as Node | null;
                      if (nextTarget && event.currentTarget.contains(nextTarget)) {
                        return;
                      }
                      onItemCommit?.(it, idx);
                    }}
                  >
                    <Table.Td>
                      <Stack gap={4}>
                        <TextInput
                          variant="unstyled"
                          size="sm"
                          placeholder="Beskrivning"
                          value={it.description}
                          onChange={(e) => update(idx, { description: e.currentTarget.value })}
                          disabled={!editable}
                          styles={{ input: { padding: 0, minHeight: 'unset' } }}
                        />
                        <TextInput
                          variant="unstyled"
                          size="xs"
                          placeholder="Intern anteckning (syns ej för kund)..."
                          value={it.internal_note ?? ''}
                          onChange={(e) => update(idx, { internal_note: e.currentTarget.value })}
                          disabled={!editable}
                          leftSection={<MessageSquare size={12} className="text-muted-foreground" />}
                          styles={{ 
                            input: { 
                              padding: 0, 
                              minHeight: 'unset', 
                              color: 'var(--mantine-color-dimmed)',
                              fontSize: '10px'
                            },
                            section: { width: 20 }
                          }}
                        />
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <NumberInput
                        variant="unstyled"
                        size="sm"
                        min={1}
                        value={it.quantity}
                        onChange={(v) => update(idx, { quantity: Number(v) })}
                        disabled={!editable}
                        hideControls
                        ta="center"
                        styles={{ input: { padding: 0, minHeight: 'unset', textAlign: 'center' } }}
                      />
                    </Table.Td>
                    <Table.Td ta="right">
                      <NumberInput
                        variant="unstyled"
                        size="sm"
                        value={oreToSek(it.amount_ore)}
                        onChange={(v) => update(idx, { amount_ore: sekToOre(Number(v)) })}
                        disabled={!editable}
                        hideControls
                        decimalScale={2}
                        fixedDecimalScale
                        className="tabular-nums"
                        styles={{ input: { padding: 0, minHeight: 'unset', textAlign: 'right' } }}
                      />
                    </Table.Td>
                    <Table.Td>
                      {editable && (
                        <ActionIcon 
                          variant="subtle" 
                          color="red" 
                          onClick={() => remove(idx, it.id)}
                          size="sm"
                        >
                          <Trash2 size={14} />
                        </ActionIcon>
                      )}
                    </Table.Td>
                  </Table.Tr>
                </React.Fragment>
              ))
            )}
          </Table.Tbody>
        </Table>

        {/* Footer: add + templates */}
        <Box className="border-t border-border bg-secondary/20 px-4 py-3">
          <Group justify="space-between" align="flex-start">
            <Stack gap="xs">
              <Button
                variant="dashed"
                size="xs"
                leftSection={<Plus size={14} />}
                onClick={() => add()}
                disabled={!editable || (maxItems !== undefined && items.length >= maxItems)}
                color="gray"
              >
                {addLabel}
              </Button>
              
              {templates && templates.length > 0 && (
                <Group gap={6}>
                  <Text size="xs" c="dimmed" fw={500}>Snabbmallar:</Text>
                  {templates.map((tpl) => (
                    <Badge
                      key={tpl.label}
                      variant="flat"
                      color="gray"
                      size="sm"
                      className="cursor-pointer hover:bg-secondary-hover"
                      onClick={() => add({ description: tpl.description, amount_ore: tpl.amount_ore })}
                      style={{ textTransform: 'none', fontWeight: 500 }}
                    >
                      + {tpl.label}
                    </Badge>
                  ))}
                </Group>
              )}
            </Stack>

            {showTotal && (
              <Stack gap={2} align="flex-end">
                <Text size="xs" c="dimmed" fw={500} tt="uppercase">Totalbelopp</Text>
                <Text fw={700} size="lg" className="tabular-nums">
                  {formatSek(totalOre)}
                </Text>
              </Stack>
            )}
          </Group>
        </Box>
      </Box>
      
      <Group gap={4} c="dimmed">
        <Info size={12} />
        <Text size="xs">Alla belopp anges exklusive moms.</Text>
      </Group>
    </Stack>
  );
}
