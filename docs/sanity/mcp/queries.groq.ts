/**
 * MCP Queries — GROQ
 *
 * Samling av de GROQ-queries en extern MCP-agent skulle köra mot
 * Sanity-projektet (projectId=9a8dudi5, dataset=production).
 *
 * Alla queries är READ-ONLY. De är parametriserade med $-variabler
 * enligt Sanity's query-API.
 *
 * Ref: https://www.sanity.io/docs/groq
 * Ref: https://www.sanity.io/docs/js-client#performing-queries
 * Ref: https://www.sanity.io/docs/query-cheat-sheet
 *
 * Körning via @sanity/client:
 *
 *   import { createClient } from '@sanity/client'
 *   const client = createClient({
 *     projectId: '9a8dudi5',
 *     dataset: 'production',
 *     apiVersion: '2024-01-01',
 *     token: process.env.SANITY_API_TOKEN,
 *     useCdn: false,   // MCP-agenten behöver alltid färsk data
 *   })
 *   const result = await client.fetch(QUERY, params)
 */

// ── 1. Kundöversikt ──────────────────────────────────────────────────────────

/**
 * Alla kunder med TikTok-handle + senaste synkfelstatus.
 * Används som startpunkt för agenten — identifiera vilka kunder som behöver åtgärd.
 */
/*
export const ALL_CUSTOMERS_QUERY = `
  *[_type == "customer" && defined(tiktokHandle)] | order(displayName asc) {
    _id,
    supabaseId,
    displayName,
    tiktokHandle,
    accountManager,
    lastSyncError,
    bridgeSyncedAt
  }
`
*/

/**
 * Hämta en specifik kund via Supabase UUID.
 * Params: { supabaseId: string }
 */
/*
export const CUSTOMER_BY_SUPABASE_ID_QUERY = `
  *[_type == "customer" && supabaseId == $supabaseId][0] {
    _id,
    supabaseId,
    displayName,
    tiktokHandle,
    accountManager,
    lastSyncError,
    bridgeSyncedAt
  }
`
*/

// ── 2. Video-queries ─────────────────────────────────────────────────────────

/**
 * Alla ohanterade klipp för en kund — historik-imports som saknar koncept och
 * fortfarande har status 'history_import'. Det primära arbetsflödet för agenten.
 *
 * Params: { customerId: string }  ← Sanity _id (inte supabaseId)
 */
/*
export const UNPROCESSED_VIDEOS_QUERY = `
  *[_type == "video"
    && customer._ref == $customerId
    && status == "history_import"
    && !defined(concept)
  ] | order(publishedAt desc) {
    _id,
    supabaseId,
    tiktokUrl,
    sourceUsername,
    publishedAt,
    views,
    likes,
    comments,
    description,
    thumbnailUrl,
    tags,
    historySource,
    lastSyncedAt
  }
`
*/

/**
 * Klipp importerade via specifik källa (flöde-filtrering).
 * Params: { customerId: string, historySource: "tiktok_profile" | "hagen_library" }
 */
/*
export const VIDEOS_BY_SOURCE_QUERY = `
  *[_type == "video"
    && customer._ref == $customerId
    && historySource == $historySource
  ] | order(publishedAt desc) {
    _id,
    supabaseId,
    tiktokUrl,
    status,
    tags,
    historySource,
    publishedAt,
    views,
    likes,
    comments,
    "hasAiDescription": defined(aiDescription)
  }
`
*/

/**
 * Klipp med flest visningar som saknar taggar — kandidater för klassificering.
 * Params: { customerId: string, limit: number }
 */
/*
export const HIGH_REACH_UNTAGGED_VIDEOS_QUERY = `
  *[_type == "video"
    && customer._ref == $customerId
    && count(tags) == 0
    && defined(views)
  ] | order(views desc)[0..$limit] {
    _id,
    supabaseId,
    tiktokUrl,
    views,
    likes,
    comments,
    description,
    publishedAt,
    status,
    historySource
  }
`
*/

/**
 * Hämta ett specifikt klipp via normaliserad TikTok URL.
 * Params: { tiktokUrl: string }
 *
 * OBS: tiktokUrl är normaliserad via normalizeTikTokUrl() vid ingest.
 * Agenten måste normalisera URL:en innan sökning.
 */
/*
export const VIDEO_BY_TIKTOK_URL_QUERY = `
  *[_type == "video" && tiktokUrl == $tiktokUrl][0] {
    _id,
    supabaseId,
    tiktokUrl,
    sourceUsername,
    publishedAt,
    status,
    tags,
    aiDescription,
    description,
    views,
    likes,
    comments,
    historySource,
    customer->{ _id, supabaseId, displayName, tiktokHandle },
    concept->{ _id, supabaseId, title, status }
  }
`
*/

// ── 3. Koncept-queries ───────────────────────────────────────────────────────

/**
 * Alla aktiva koncept för en kund som saknar AI-summering.
 * Primärt use-case: agenten berikar koncept som CM godkänt.
 * Params: { customerId: string }
 */
/*
export const CONCEPTS_NEEDING_ENRICHMENT_QUERY = `
  *[_type == "concept"
    && customer._ref == $customerId
    && status in ["approved", "draft"]
    && !defined(aiSummary)
  ] | order(_createdAt desc) {
    _id,
    supabaseId,
    title,
    brief,
    status,
    tags,
    feedOrder,
    analyzeSummary,
    enrichSummary,
    sourceVideo->{ _id, tiktokUrl, views, description }
  }
`
*/

/**
 * Planerade koncept i feed-ordning (feedOrder > 0 = framtida).
 * Params: { customerId: string }
 */
/*
export const UPCOMING_CONCEPTS_QUERY = `
  *[_type == "concept"
    && customer._ref == $customerId
    && feedOrder > 0
    && status in ["approved", "draft"]
  ] | order(feedOrder asc) {
    _id,
    supabaseId,
    title,
    status,
    feedOrder,
    tags,
    suggestedTags,
    aiSummary,
    sourceVideo->{ _id, tiktokUrl, publishedAt }
  }
`
*/

// ── 4. Ingest-observerbarhet ─────────────────────────────────────────────────

/**
 * Senaste AI-pipeline-körningar per kund (Flöde 3).
 * Params: { customerId: string }
 */
/*
export const RECENT_INGEST_RUNS_QUERY = `
  *[_type == "ingestRun"
    && runType == "ingest_pipeline"
    && customer._ref == $customerId
  ] | order(startedAt desc)[0..9] {
    _id,
    supabaseId,
    status,
    stage,
    source,
    sourceUrl,
    errorCode,
    errorMessage,
    startedAt,
    finishedAt,
    hagenContractVersion,
    concept->{ _id, title, status }
  }
`
*/

/**
 * Misslyckade AI-körningar globalt (admin-vy).
 * Agenten kan använda detta för att identifiera systemiska problem.
 */
/*
export const FAILED_INGEST_RUNS_GLOBAL_QUERY = `
  *[_type == "ingestRun"
    && runType == "ingest_pipeline"
    && status in ["failed", "canceled"]
    && dateTime(startedAt) > dateTime(now()) - 60*60*24*7
  ] | order(startedAt desc) {
    _id,
    supabaseId,
    status,
    stage,
    errorCode,
    errorMessage,
    startedAt,
    hagenContractVersion,
    customer->{ _id, displayName, tiktokHandle }
  }
`
*/

/**
 * TikTok-profilsynkar med API-budget per kund (Flöde 1).
 * Agenten kan observera callsUsed för att undvika budget-överskridning.
 * Params: { customerId: string }
 */
/*
export const TIKTOK_SYNC_BUDGET_QUERY = `
  *[_type == "ingestRun"
    && runType == "tiktok_profile_sync"
    && customer._ref == $customerId
    && dateTime(startedAt) > dateTime(now()) - 60*60*24
  ] {
    _id,
    status,
    syncMode,
    fetchedCount,
    importedCount,
    callsUsed,
    startedAt,
    finishedAt,
    errorMessage
  }
`
// OBS: sync_runs.calls_used summeras i tiktok-sync.ts för daglig budget-kontroll.
// Agenten bör kontrollera detta innan den triggar en manuell synk.
*/

// ── 5. Aggregerade vyer ──────────────────────────────────────────────────────

/**
 * Videoinventarier per kund — räknare per status och källa.
 * Ger agenten en snabb overview utan att ladda alla dokument.
 * Params: { customerId: string }
 */
/*
export const VIDEO_INVENTORY_QUERY = `
  {
    "total": count(*[_type == "video" && customer._ref == $customerId]),
    "byStatus": {
      "history_import": count(*[_type == "video" && customer._ref == $customerId && status == "history_import"]),
      "active":         count(*[_type == "video" && customer._ref == $customerId && status == "active"]),
      "rejected":       count(*[_type == "video" && customer._ref == $customerId && status == "rejected"]),
      "pending_review": count(*[_type == "video" && customer._ref == $customerId && status == "pending_review"])
    },
    "bySource": {
      "tiktok_profile": count(*[_type == "video" && customer._ref == $customerId && historySource == "tiktok_profile"]),
      "hagen_library":  count(*[_type == "video" && customer._ref == $customerId && historySource == "hagen_library"])
    },
    "untagged": count(*[_type == "video" && customer._ref == $customerId && count(tags) == 0]),
    "withConcept": count(*[_type == "video" && customer._ref == $customerId && defined(concept)])
  }
`
*/
