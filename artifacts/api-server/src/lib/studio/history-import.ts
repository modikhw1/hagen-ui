// ─────────────────────────────────────────────────────────────────────────────
// history-import.ts (api-server)
//
// Server-side copy of renumberImportedRows from artifacts/letrend/src/lib/studio/history-import.ts.
// Only this function is needed by the API server (EP-4 mark-produced, EP-6 auto-reconcile).
// The full importClipsForCustomer / updateClipStats pipeline lives on the letrend side.
//
// Keep in sync with the letrend original when the renumber logic changes.
// ─────────────────────────────────────────────────────────────────────────────

import { createSupabaseAdmin } from '../supabase.js';

type SupabaseAdmin = ReturnType<typeof createSupabaseAdmin>;

type ImportedHistoryRow = {
  id: string;
  feed_order: number | null;
  published_at: string | null;
  tiktok_url: string | null;
};

/**
 * Re-reads all unreconciled imported-history rows for a customer and assigns
 * sequential feed_orders below the deepest LeTrend historik row, sorted by
 * published_at DESC.
 *
 * Rows with `reconciled_customer_concept_id IS NOT NULL` are excluded — they
 * have already been linked to an assignment card and removed from the grid.
 *
 * Non-throwing: always returns, even if a DB error occurs. Caller is responsible
 * for treating this as non-fatal (log a warning, do not fail the parent operation).
 */
export async function renumberImportedRows(
  supabase: SupabaseAdmin,
  customerId: string,
): Promise<void> {
  const { data: allImported } = await supabase
    .from('customer_concepts')
    .select('id, feed_order, published_at, tiktok_url')
    .eq('customer_profile_id', customerId)
    .is('concept_id', null)
    .is('reconciled_customer_concept_id', null);

  const { data: letrEndHistorikRows } = await supabase
    .from('customer_concepts')
    .select('feed_order')
    .eq('customer_profile_id', customerId)
    .not('concept_id', 'is', null)
    .lt('feed_order', 0)
    .order('feed_order', { ascending: true })
    .limit(1);

  const letrEndFloor = (letrEndHistorikRows?.[0]?.feed_order as number | undefined) ?? 0;
  const renumberOffset = letrEndFloor < 0 ? Math.abs(letrEndFloor) : 0;

  const chronological = ((allImported ?? []) as ImportedHistoryRow[]).sort((a, b) => {
    const dateA = a.published_at ? new Date(a.published_at).getTime() : 0;
    const dateB = b.published_at ? new Date(b.published_at).getTime() : 0;
    if (dateB !== dateA) return dateB - dateA;
    return (a.tiktok_url ?? '').localeCompare(b.tiktok_url ?? '');
  });

  const renumberUpdates = chronological
    .map((row, i) => ({
      id: row.id,
      from: typeof row.feed_order === 'number' ? row.feed_order : null,
      to: -(renumberOffset + i + 1),
    }))
    .filter((u) => u.from !== u.to);

  if (renumberUpdates.length > 0) {
    await Promise.all(
      renumberUpdates.map((u) =>
        supabase
          .from('customer_concepts')
          .update({ feed_order: u.to })
          .eq('id', u.id),
      ),
    );
  }
}
