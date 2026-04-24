import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { DemoCardDto, DemoStatus, DemosBoardDto } from '@/lib/admin/schemas/demos';

type DemoRow = Database['public']['Tables']['demos']['Row'];

export function getNextDemoStatus(status: DemoStatus): DemoStatus | null {
  switch (status) {
    case 'draft':
      return 'sent';
    case 'sent':
      return 'opened';
    case 'opened':
      return 'responded';
    default:
      return null;
  }
}

export function mapDemoRowToDto(
  row: DemoRow,
  ownerNameById: Map<string, string>,
): DemoCardDto {
  return {
    id: row.id,
    companyName: row.company_name,
    contactEmail: row.contact_email,
    tiktokHandle: row.tiktok_handle,
    proposedConceptsPerWeek: row.proposed_concepts_per_week,
    proposedPriceOre: row.proposed_price_ore,
    status: row.status,
    statusChangedAt: row.status_changed_at,
    ownerName: row.owner_admin_id ? ownerNameById.get(row.owner_admin_id) ?? null : null,
    lostReason: row.lost_reason,
    nextStatus: getNextDemoStatus(row.status),
  };
}

export async function buildDemosBoard(
  supabase: SupabaseClient<Database>,
  days = 30,
): Promise<DemosBoardDto> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const previousSince = new Date(Date.now() - days * 2 * 86_400_000).toISOString();

  const [
    { data: demos, error: demosError },
    { count: sentCount, error: sentError },
    { count: sentPrevCount, error: sentPrevError },
    { count: openedCount, error: openedError },
    { count: openedPrevCount, error: openedPrevError },
    { count: convertedCount, error: convertedError },
    { count: convertedPrevCount, error: convertedPrevError },
  ] = await Promise.all([
    supabase.from('demos').select('*').order('status_changed_at', { ascending: false }),
    supabase
      .from('demos')
      .select('id', { count: 'exact', head: true })
      .in('status', ['sent', 'opened', 'responded', 'won', 'lost'])
      .gte('status_changed_at', since),
    supabase
      .from('demos')
      .select('id', { count: 'exact', head: true })
      .in('status', ['sent', 'opened', 'responded', 'won', 'lost'])
      .gte('status_changed_at', previousSince)
      .lt('status_changed_at', since),
    supabase
      .from('demos')
      .select('id', { count: 'exact', head: true })
      .in('status', ['opened', 'responded', 'won', 'lost'])
      .gte('status_changed_at', since),
    supabase
      .from('demos')
      .select('id', { count: 'exact', head: true })
      .in('status', ['opened', 'responded', 'won', 'lost'])
      .gte('status_changed_at', previousSince)
      .lt('status_changed_at', since),
    supabase
      .from('demos')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'won')
      .gte('resolved_at', since),
    supabase
      .from('demos')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'won')
      .gte('resolved_at', previousSince)
      .lt('resolved_at', since),
  ]);

  if (demosError || sentError || sentPrevError || openedError || openedPrevError || convertedError || convertedPrevError) {
    throw new Error(
      demosError?.message ??
        sentError?.message ??
        sentPrevError?.message ??
        openedError?.message ??
        openedPrevError?.message ??
        convertedError?.message ??
        convertedPrevError?.message ??
        'Kunde inte hämta demos',
    );
  }

  const rows = demos ?? [];
  const ownerIds = Array.from(
    new Set(
      rows
        .map((row) => row.owner_admin_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const ownerNameById = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: owners, error: ownersError } = await supabase
      .from('team_members')
      .select('id, name')
      .in('id', ownerIds);

    if (ownersError) {
      throw new Error(ownersError.message || 'Kunde inte hämta demoägare');
    }

    for (const owner of owners ?? []) {
      ownerNameById.set(owner.id, owner.name || 'Okänd ägare');
    }
  }

  const cards = rows.map((row) => mapDemoRowToDto(row, ownerNameById));

  return {
    sentLast30: sentCount ?? 0,
    sentPrev30: sentPrevCount ?? 0,
    openedLast30: openedCount ?? 0,
    openedPrev30: openedPrevCount ?? 0,
    convertedLast30: convertedCount ?? 0,
    convertedPrev30: convertedPrevCount ?? 0,
    totalOnBoard: cards.length,
    columns: {
      draft: cards.filter((card) => card.status === 'draft'),
      sent: cards.filter((card) => card.status === 'sent'),
      opened: cards.filter((card) => card.status === 'opened'),
      responded: cards.filter((card) => card.status === 'responded'),
      closed: cards.filter(
        (card) =>
          card.status === 'won' || card.status === 'lost' || card.status === 'expired',
      ),
    },
    schemaWarnings: [],
  };
}
