/**
 * Bridge — Supabase → Sanity synkstrategi
 *
 * Beskriver hur data flödar från Supabase (source of truth) till Sanity
 * (observation + berikning). Ingen kod här är driftsatt i v0.1.
 *
 * Designprinciper:
 *   1. Supabase äger all affärslogik och skriver alltid först.
 *   2. Sanity är ett observerbart lager — data dras från Supabase, aldrig tvärtom
 *      (undantag: agent-ägda fält som aiSummary, suggestedTags).
 *   3. Bridge-skrivningar är ALDRIG blockerande — ett misslyckat Sanity-write
 *      ska inte rulla tillbaka en Supabase-transaktion.
 *   4. Upsert via supabaseId-fältet — Sanity-dokumentets _id genereras av Sanity,
 *      men supabaseId är den stabila nyckeln för uppdateringar.
 *
 * Triggerpunkter (var bridgen skulle anropas):
 *
 *   Händelse i Express API              → Bridge-funktion
 *   ─────────────────────────────────────────────────────────────────────────
 *   POST /api/onboarding (ny kund)      → upsertCustomer()
 *   GET /api/studio-v2/customers/:id/sync-history (POST, import)
 *                                       → upsertVideoBatch()
 *   syncCustomerHistory() (RapidAPI)    → upsertVideoBatch()
 *   POST /api/studio/ingest (AI)        → upsertIngestRun() + upsertConcept()
 *   PATCH /api/studio-v2/concepts/:id  → syncConceptPatch()
 *
 * Ref: https://www.sanity.io/docs/js-client#creating-and-editing-documents
 * Ref: https://www.sanity.io/docs/http-mutations#createOrReplace
 */

// import { createClient } from '@sanity/client'
// import type { SanityClient } from '@sanity/client'
// import type { SupabaseClient } from '@supabase/supabase-js'

/*

// ── Klient ───────────────────────────────────────────────────────────────────

function getSanityBridgeClient(): SanityClient {
  return createClient({
    projectId: '9a8dudi5',
    dataset: 'production',
    apiVersion: '2024-01-01',
    token: process.env.SANITY_API_TOKEN,  // server-side token med write-scope
    useCdn: false,
  })
}


// ── Hjälpare: hitta befintligt Sanity-dokument via supabaseId ────────────────
//
// Sanity har inte ett unikt index på supabaseId — vi hittar dokumentet
// via GROQ och hämtar dess _id för att sedan köra patch.
// En produktionsklar implementation indexerar supabaseId i Sanity Studio.
//
// Ref: https://www.sanity.io/docs/groq

async function findSanityId(
  client: SanityClient,
  type: string,
  supabaseId: string
): Promise<string | null> {
  const result = await client.fetch<{ _id: string } | null>(
    `*[_type == $type && supabaseId == $supabaseId][0]{ _id }`,
    { type, supabaseId }
  )
  return result?._id ?? null
}


// ── 1. customer ──────────────────────────────────────────────────────────────
//
// Triggas: vid onboarding av ny kund, eller vid ändring av
// customer_profiles.tiktok_handle / account_manager_display_name.
//
// Källa: customer_profiles i Supabase
// Destination: customer-dokument i Sanity

interface SupabaseCustomerRow {
  id: string
  display_name: string | null
  tiktok_handle: string | null
  account_manager_display_name: string | null
  last_sync_error: string | null
}

export async function upsertCustomer(row: SupabaseCustomerRow): Promise<void> {
  const client = getSanityBridgeClient()
  const existingId = await findSanityId(client, 'customer', row.id)

  const doc = {
    _type: 'customer',
    supabaseId: row.id,
    displayName: row.display_name ?? '',
    tiktokHandle: row.tiktok_handle?.replace(/^@/, '') ?? null,
    accountManager: row.account_manager_display_name ?? null,
    lastSyncError: row.last_sync_error ?? null,
    bridgeSyncedAt: new Date().toISOString(),
  }

  if (existingId) {
    // Uppdatera befintligt dokument (patch för att bevara agent-ägda fält)
    await client.patch(existingId).set(doc).commit()
  } else {
    // Skapa nytt dokument
    await client.create(doc)
  }
}


// ── 2. video (customer_concepts → Sanity video) ──────────────────────────────
//
// Triggas: efter POST sync-history (Flöde 2) och syncCustomerHistory (Flöde 1).
// Batch-operation: upsert alla rader i en transaktion.
//
// Källa: customer_concepts WHERE row_kind = 'history_import'
// Destination: video-dokument i Sanity

interface SupabaseConceptRow {
  id: string
  customer_profile_id: string
  tiktok_url: string
  source_username: string | null
  published_at: string | null
  tiktok_views: number | null
  tiktok_likes: number | null
  tiktok_comments: number | null
  description: string | null
  tiktok_thumbnail_url: string | null
  tags: string[]
  status: string
  history_source: 'tiktok_profile' | 'hagen_library' | 'manual'
  tiktok_last_synced_at: string | null
  concept_id: string | null
  ingest_run_id: string | null
}

export async function upsertVideoBatch(
  rows: SupabaseConceptRow[],
  customerSanityId: string   // Sanity _id för customer-dokumentet
): Promise<void> {
  const client = getSanityBridgeClient()

  // Hämta alla befintliga video-dokument för dessa supabaseIds i en enda query
  const supabaseIds = rows.map((r) => r.id)
  const existing = await client.fetch<Array<{ _id: string; supabaseId: string }>>(
    `*[_type == "video" && supabaseId in $ids]{ _id, supabaseId }`,
    { ids: supabaseIds }
  )
  const existingMap = new Map(existing.map((e) => [e.supabaseId, e._id]))

  const transaction = client.transaction()

  for (const row of rows) {
    const sanityId = existingMap.get(row.id)

    // Supabase-ägda fält — alltid överskrivna vid synk
    const supabaseFields = {
      _type: 'video',
      supabaseId: row.id,
      tiktokUrl: row.tiktok_url,
      sourceUsername: row.source_username ?? null,
      publishedAt: row.published_at ?? null,
      views: row.tiktok_views ?? null,
      likes: row.tiktok_likes ?? null,
      comments: row.tiktok_comments ?? null,
      description: row.description ?? null,
      thumbnailUrl: row.tiktok_thumbnail_url ?? null,
      tags: row.tags ?? [],
      status: row.status ?? 'history_import',
      historySource: row.history_source,
      lastSyncedAt: row.tiktok_last_synced_at ?? null,
      customer: { _type: 'reference', _ref: customerSanityId },
      bridgeSyncedAt: new Date().toISOString(),
    }

    if (sanityId) {
      // Patch: uppdatera bara Supabase-ägda fält — bevara agent-ägda (aiDescription etc.)
      transaction.patch(sanityId, (patch) => patch.set(supabaseFields))
    } else {
      // Skapa nytt — agent-ägda fält är null/[] initialt
      transaction.create({ ...supabaseFields, aiDescription: null })
    }
  }

  // Bridge-writes är non-fatal: ett misslyckat commit blockerar inte ingest-flödet
  await transaction.commit().catch((err) => {
    console.error('[bridge] upsertVideoBatch commit failed (non-fatal):', err)
  })
}


// ── 3. ingestRun (ingest_runs → Sanity ingestRun) ────────────────────────────
//
// Triggas: vid statusändring i updateIngestRun() (ingest-runs.ts).
// Synkas inkrementellt — inte en full-tabell-sweep.
//
// Källa: ingest_runs i Supabase
// Destination: ingestRun-dokument i Sanity (runType = 'ingest_pipeline')

interface SupabaseIngestRunRow {
  id: string
  status: string
  stage: string | null
  source: string | null
  source_url: string | null
  error_code: string | null
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  concept_id: string | null
  hagen_video_id: string | null
  hagen_contract_version: string | null
  result: Record<string, unknown> | null
  warnings: unknown[]
  customer_id: string       // FK till customer_profiles
}

export async function upsertIngestRun(
  row: SupabaseIngestRunRow,
  customerSanityId: string
): Promise<void> {
  const client = getSanityBridgeClient()
  const existingId = await findSanityId(client, 'ingestRun', row.id)

  const doc = {
    _type: 'ingestRun',
    runType: 'ingest_pipeline',
    supabaseId: row.id,
    status: row.status,
    stage: row.stage ?? null,
    source: row.source ?? null,
    sourceUrl: row.source_url ?? null,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    hagenVideoId: row.hagen_video_id ?? null,
    hagenContractVersion: row.hagen_contract_version ?? null,
    // result serialiseras som text i v0.1 — GROQ kan inte söka i raw JSONB
    result: row.result ? { rawJson: JSON.stringify(row.result) } : null,
    warnings: (row.warnings ?? []).map(String),
    customer: { _type: 'reference', _ref: customerSanityId },
    bridgeSyncedAt: new Date().toISOString(),
  }

  if (existingId) {
    await client.patch(existingId).set(doc).commit().catch((err) => {
      console.error('[bridge] upsertIngestRun patch failed (non-fatal):', err)
    })
  } else {
    await client.create(doc).catch((err) => {
      console.error('[bridge] upsertIngestRun create failed (non-fatal):', err)
    })
  }
}


// ── 4. syncRun (sync_runs → Sanity ingestRun med runType=tiktok_profile_sync) ─
//
// Triggas: i finally-blocket i syncCustomerHistory() (tiktok-sync.ts)
// efter att sync_runs-raden uppdaterats.

interface SupabaseSyncRunRow {
  id: string
  customer_id: string
  mode: string
  status: 'running' | 'ok' | 'error'
  started_at: string
  finished_at: string | null
  fetched_count: number
  imported_count: number
  stats_updated_count: number
  calls_used: number
  error: string | null
}

export async function upsertSyncRun(
  row: SupabaseSyncRunRow,
  customerSanityId: string
): Promise<void> {
  const client = getSanityBridgeClient()
  const existingId = await findSanityId(client, 'ingestRun', `sync_${row.id}`)

  // Prefix supabaseId med 'sync_' för att undvika kollision med ingest_runs IDs
  const doc = {
    _type: 'ingestRun',
    runType: 'tiktok_profile_sync',
    supabaseId: `sync_${row.id}`,
    status: row.status === 'ok' ? 'completed' : row.status === 'error' ? 'failed' : 'running',
    syncMode: row.mode,
    fetchedCount: row.fetched_count,
    importedCount: row.imported_count,
    statsUpdatedCount: row.stats_updated_count,
    callsUsed: row.calls_used,
    errorMessage: row.error ?? null,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? null,
    customer: { _type: 'reference', _ref: customerSanityId },
    bridgeSyncedAt: new Date().toISOString(),
  }

  if (existingId) {
    await client.patch(existingId).set(doc).commit().catch((err) => {
      console.error('[bridge] upsertSyncRun patch failed (non-fatal):', err)
    })
  } else {
    await client.create(doc).catch((err) => {
      console.error('[bridge] upsertSyncRun create failed (non-fatal):', err)
    })
  }
}

*/

// ── Kvarstående frågor för v0.2 ──────────────────────────────────────────────
//
// 1. OMVÄND SYNK (Sanity → Supabase)
//    Agent-ägda fält (aiSummary, suggestedTags, aiDescription) lever bara i Sanity i v0.1.
//    För att persistera dem i Supabase behövs antingen:
//      a) En Sanity-webhook som triggar ett Express-API-anrop vid dokumentändring
//         Ref: https://www.sanity.io/docs/webhooks
//      b) En periodisk cron-job som pollar Sanity för senast ändrade dokument
//         och skriver till Supabase via apiClient.
//
// 2. INDEXERING AV supabaseId
//    findSanityId() är O(n) i v0.1. I produktion bör ett unikt index
//    sättas på supabaseId via Sanity's document-store configuration.
//
// 3. WEBHOOK-TRIGGER INTEGRATION
//    Istället för att kalla bridge-funktionerna manuellt kan en
//    Supabase Database Webhook (via pg_notify eller Realtime) trigga
//    bridge-körning automatiskt vid INSERT/UPDATE på relevanta tabeller.
//    Ref: https://supabase.com/docs/guides/database/webhooks
//
// 4. DRAFT/PUBLISH-FLÖDE
//    I v0.1 skriver bridgen direkt till published-dokumentet.
//    För CM-granskning av agent-skrivningar bör v0.2 skriva till
//    drafts.* och låta CM publicera via Sanity Studio.
//    Ref: https://www.sanity.io/docs/drafts
