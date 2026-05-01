// app/src/components/admin/customers/PendingInvoiceItems.tsx

'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  IconLoader2,
  IconAlertCircle,
  IconCalculator,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import {
  Card,
  Text,
  Badge,
  Alert,
  Stack,
  Group,
  Paper,
  Box,
} from '@mantine/core';

import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { qk } from '@/lib/admin/queryKeys';
import {
  LineItemEditor,
  type LineItem,
} from '@/components/admin/ui/form/LineItemEditor';
import { COMMON_INVOICE_TEMPLATES } from '@/lib/admin/billing/line-item-templates';
import { formatSek, oreToSek } from '@/lib/admin/money';

interface StripeInvoiceItem {
  id: string;
  amount_ore: number;
  amount_sek?: number;
  unit_amount_ore?: number;
  unit_amount_sek?: number;
  quantity?: number;
  currency: string;
  description: string;
  metadata: {
    internal_note?: string;
  };
}

interface PendingItemsResponse {
  items: StripeInvoiceItem[];
  warning?: {
    type: string;
    message: string;
    details?: string;
  };
}

interface Props {
  customerId: string;
  basePriceOre?: number;
  nextInvoiceDate?: string | null;
  canManageItems?: boolean;
  hasStripeCustomer?: boolean;
}

function trimNote(value?: string) {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : undefined;
}

function isCompleteItem(item: LineItem) {
  return item.description.trim().length > 0 && item.amount_ore > 0;
}

function itemsEqual(left: LineItem, right: LineItem) {
  return (
    left.description.trim() === right.description.trim() &&
    left.amount_ore === right.amount_ore &&
    Math.max(1, left.quantity || 1) === Math.max(1, right.quantity || 1) &&
    trimNote(left.internal_note) === trimNote(right.internal_note)
  );
}

export default function PendingInvoiceItems({
  customerId,
  basePriceOre = 0,
  nextInvoiceDate,
  canManageItems = false,
  hasStripeCustomer = true,
}: Props) {
  const queryKey = qk.customers.pendingItems(customerId);

  const { data, isLoading, error } = useQuery<PendingItemsResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/admin/customers/${customerId}/invoice-items`);
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }
      return res.json();
    },
    staleTime: 10_000,
    retry: false,
  });

  const baseRefresh = useAdminRefresh();
  const refresh = useCallback(
    () =>
      baseRefresh([
        { type: 'pending-invoice-items', customerId },
        { type: 'customer-billing', customerId },
      ]),
    [baseRefresh, customerId],
  );

  const [pendingMutations, setPendingMutations] = useState(0);
  const updatingIdsRef = useRef<Set<string>>(new Set());
  const stripeWarning = data?.warning?.message ?? null;
  const canEditItems = canManageItems && hasStripeCustomer && !stripeWarning;

  const savedItems = useMemo<LineItem[]>(
    () =>
      (data?.items ?? []).map((item) => {
        const quantity = Math.max(1, item.quantity || 1);
        const unitAmountOre =
          typeof item.unit_amount_ore === 'number'
            ? item.unit_amount_ore
            : Math.round(item.amount_ore / quantity);

        return {
          id: item.id,
          description: item.description,
          amount_ore: unitAmountOre,
          quantity,
          internal_note: item.metadata?.internal_note,
        };
      }),
    [data?.items],
  );

  const savedItemsById = useMemo(
    () =>
      new Map(
        savedItems
          .filter(
            (item): item is LineItem & { id: string } =>
              typeof item.id === 'string',
          )
          .map((item) => [item.id, item]),
      ),
    [savedItems],
  );

  const [localItems, setLocalItems] = useState<LineItem[]>([]);

  useEffect(() => {
    setLocalItems(savedItems);
  }, [savedItems]);

  const beginMutation = () => setPendingMutations((current) => current + 1);
  const endMutation = () =>
    setPendingMutations((current) => (current > 0 ? current - 1 : 0));

  const createPendingItem = useCallback(
    async (newItem: LineItem) => {
      if (!canEditItems || !isCompleteItem(newItem)) {
        return false;
      }

      beginMutation();
      try {
        const res = await fetch(`/api/admin/customers/${customerId}/invoice-items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: newItem.description.trim(),
            unit_amount: oreToSek(newItem.amount_ore),
            quantity: Math.max(1, newItem.quantity || 1),
            internal_note: trimNote(newItem.internal_note),
            currency: 'sek',
          }),
        });

        if (!res.ok) {
          throw new Error('Kunde inte spara');
        }

        setLocalItems((items) => items.filter((item) => item !== newItem));
        toast.success('Post tillagd i kön.');
        await refresh();
        return true;
      } catch {
        toast.error('Kunde inte lägga till posten.');
        return false;
      } finally {
        endMutation();
      }
    },
    [canEditItems, customerId, refresh],
  );

  const updatePendingItem = useCallback(
    async (item: LineItem) => {
      if (!canEditItems || !item.id || !isCompleteItem(item)) {
        return false;
      }

      if (updatingIdsRef.current.has(item.id)) {
        return false;
      }

      updatingIdsRef.current.add(item.id);
      beginMutation();

      try {
        const res = await fetch(
          `/api/admin/customers/${customerId}/invoice-items/${encodeURIComponent(item.id)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              description: item.description.trim(),
              unit_amount: oreToSek(item.amount_ore),
              quantity: Math.max(1, item.quantity || 1),
              internal_note: trimNote(item.internal_note),
            }),
          },
        );

        if (!res.ok) {
          throw new Error('Kunde inte uppdatera');
        }

        toast.success('Post uppdaterad.');
        await refresh();
        return true;
      } catch {
        toast.error('Kunde inte uppdatera posten.');
        return false;
      } finally {
        updatingIdsRef.current.delete(item.id);
        endMutation();
      }
    },
    [canEditItems, customerId, refresh],
  );

  const handleItemsChange = useCallback((nextItems: LineItem[]) => {
    setLocalItems(nextItems);
  }, []);

  const handleItemCommit = useCallback(
    async (item: LineItem) => {
      if (!canEditItems) return;

      if (item.id) {
        const persistedItem = savedItemsById.get(item.id);
        if (!persistedItem) return;

        if (!isCompleteItem(item)) {
          setLocalItems((items) =>
            items.map((current) =>
              current.id === item.id ? persistedItem : current,
            ),
          );
          toast.error('Beskrivning och belopp krävs för en sparad rad.');
          return;
        }

        if (!itemsEqual(item, persistedItem)) {
          await updatePendingItem(item);
        }
        return;
      }

      if (isCompleteItem(item)) {
        await createPendingItem(item);
      }
    },
    [canEditItems, createPendingItem, savedItemsById, updatePendingItem],
  );

  const handleDelete = async (itemId: string) => {
    if (!canEditItems) return;

    beginMutation();
    try {
      const res = await fetch(
        `/api/admin/customers/${customerId}/invoice-items/${encodeURIComponent(itemId)}`,
        {
          method: 'DELETE',
        },
      );
      if (!res.ok) throw new Error('Kunde inte ta bort');
      toast.success('Posten borttagen.');
      await refresh();
    } catch {
      toast.error('Kunde inte ta bort posten.');
    } finally {
      endMutation();
    }
  };

  const extrasTotal = localItems.reduce(
    (sum, item) => sum + item.amount_ore * Math.max(1, item.quantity || 1),
    0,
  );
  const totalOre = basePriceOre + extrasTotal;

  return (
    <Stack gap="md" id="pending-invoice-section">
      <Paper
        withBorder
        p="md"
        radius="md"
        bg="blue.0"
        style={{ borderColor: 'var(--mantine-color-blue-2)' }}
      >
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <IconCalculator size={20} className="text-blue-600" />
            <div>
              <Text size="sm" fw={700} c="blue.9">
                Nästkommande faktura (estimerad)
              </Text>
              <Text size="xs" c="blue.7">
                {nextInvoiceDate
                  ? `Beräknas dras ${new Date(nextInvoiceDate).toLocaleDateString('sv-SE')}`
                  : 'Abonnemanget löper på'}
              </Text>
            </div>
          </Group>
          <Badge
            size="lg"
            variant="filled"
            color="blue"
            h={32}
            px="md"
            radius="sm"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatSek(totalOre)}
          </Badge>
        </Group>
      </Paper>

      <Card withBorder padding="md">
        <Stack gap="sm">
          <Box>
            <Text size="md" fw={600}>
              Väntande poster på nästa faktura
            </Text>
            <Text size="xs" c="dimmed">
              Poster här läggs automatiskt till nästa månadsfaktura som skapas
              i Stripe.
            </Text>
          </Box>

          {isLoading ? (
            <Box py="xl" className="flex items-center justify-center">
              <IconLoader2 className="animate-spin text-muted-foreground" />
            </Box>
          ) : error ? (
            <Alert color="red" icon={<IconAlertCircle />} title="Fel vid laddning">
              {error instanceof Error
                ? error.message
                : 'Kunde inte hämta väntande poster'}
            </Alert>
          ) : (
            <>
              {data?.warning && (
                <Alert
                  color="yellow"
                  icon={<IconAlertCircle />}
                  title="Stripe-koppling behöver kontrolleras"
                >
                  {data.warning.message}
                </Alert>
              )}
              {!data?.warning && !hasStripeCustomer && (
                <Alert
                  color="yellow"
                  icon={<IconAlertCircle />}
                  title="Stripe-koppling saknas"
                >
                  Kunden saknar Stripe customer i aktiv miljö. Väntande poster
                  kan inte hanteras än.
                </Alert>
              )}
              <LineItemEditor
                items={localItems}
                onChange={handleItemsChange}
                onItemCommit={handleItemCommit}
                onRemove={canEditItems ? handleDelete : undefined}
                templates={canEditItems ? COMMON_INVOICE_TEMPLATES : undefined}
                fixedHeader={
                  basePriceOre > 0
                    ? {
                        description: 'Månadsabonnemang',
                        amount_ore: basePriceOre,
                      }
                    : undefined
                }
                editable={canEditItems}
                isPending={pendingMutations > 0}
              />
            </>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
