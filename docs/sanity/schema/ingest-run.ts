/**
 * Sanity Schema — `ingestRun` + `syncRun`
 *
 * Systemet har TWO separata körtabeller i Supabase med olika syften:
 *
 *   ingest_runs  — AI-pipeline-körningar (Flöde 3: analyze/enrich/classify/save)
 *                  En körning per video-koncept som processas av Hagen + AI.
 *
 *   sync_runs    — RapidAPI TikTok-profilsynkar (Flöde 1)
 *                  En körning per kund per synk-session (cron eller manuell).
 *
 * I Sanity samlas dessa i ett dokument med `runType`-diskriminator
 * för att förenkla agent-queries. Båda är STRIKT READ-ONLY för MCP-agenten.
 *
 * Ref: https://www.sanity.io/docs/document-type
 * Ref: https://www.sanity.io/docs/union-types (discriminated via string field)
 */

// import { defineType, defineField } from 'sanity'

/*
export const ingestRunSchema = defineType({
  name: 'ingestRun',
  title: 'Ingest-körning',
  type: 'document',

  preview: {
    select: {
      title: 'runId',
      subtitle: 'status',
    },
    prepare({ title, subtitle }) {
      return { title: `Run: ${title?.slice(0, 8)}...`, subtitle }
    },
  },

  fields: [

    // ── Diskriminator ──────────────────────────────────────────────────────
    // Avgör om detta är ett AI-pipeline-körning (Flöde 3) eller
    // en RapidAPI-profilsynk (Flöde 1). Aldrig Flöde 2 (Hagen Library)
    // — det flödet loggar ej körningar.
    defineField({
      name: 'runType',
      title: 'Körningstyp',
      type: 'string',
      readOnly: true,
      validation: (Rule) => Rule.required(),
      options: {
        list: [
          { title: 'AI Ingest Pipeline', value: 'ingest_pipeline' },   // ingest_runs
          { title: 'TikTok Profile Sync', value: 'tiktok_profile_sync' }, // sync_runs
        ],
      },
    }),

    // ── Supabase-nyckel (skiljer sig per runType) ──────────────────────────
    // runType=ingest_pipeline  → ingest_runs.id
    // runType=tiktok_profile_sync → sync_runs.id
    defineField({
      name: 'supabaseId',
      title: 'Supabase ID',
      type: 'string',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),

    // ── Livscykelstatus ────────────────────────────────────────────────────

    // ingest_runs.status:
    //   queued | running | ready_for_review | completed | failed | canceled
    //   (definierade i IngestRunStatus, ingest-runs.ts)
    //
    // sync_runs.status:
    //   running | ok | error
    //   (definierade i syncCustomerHistory, tiktok-sync.ts)
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      readOnly: true,
      options: {
        list: [
          // ingest_pipeline statuses
          { title: 'Köad', value: 'queued' },
          { title: 'Kör', value: 'running' },
          { title: 'Redo för granskning', value: 'ready_for_review' },
          { title: 'Klar', value: 'completed' },
          { title: 'Misslyckad', value: 'failed' },
          { title: 'Avbruten', value: 'canceled' },
          // sync_run statuses
          { title: 'OK', value: 'ok' },
          { title: 'Fel', value: 'error' },
        ],
      },
    }),

    // ── AI Pipeline-specifika fält (runType = 'ingest_pipeline') ──────────

    // ingest_runs.stage — aktivt steg i pipelinen
    // definierat i IngestRunStage (ingest-runs.ts):
    //   analyzing | enriching | classifying | saving | humor_enriching
    defineField({
      name: 'stage',
      title: 'Aktivt steg (AI Pipeline)',
      type: 'string',
      readOnly: true,
      hidden: ({ document }) => document?.runType !== 'ingest_pipeline',
      options: {
        list: [
          { title: 'Analyserar', value: 'analyzing' },
          { title: 'Berikar', value: 'enriching' },
          { title: 'Klassificerar', value: 'classifying' },
          { title: 'Sparar', value: 'saving' },
          { title: 'Humor-berikar', value: 'humor_enriching' },
        ],
      },
    }),

    // ingest_runs.source — hur körningen startades
    defineField({
      name: 'source',
      title: 'Källa / trigger',
      type: 'string',
      readOnly: true,
      hidden: ({ document }) => document?.runType !== 'ingest_pipeline',
      description: 'ingest_runs.source — t.ex. "hagen", "manual", "api"',
    }),

    // Direkt URL till källvideon (t.ex. TikTok-URL) som triggade körningen.
    defineField({
      name: 'sourceUrl',
      title: 'Käll-URL',
      type: 'url',
      readOnly: true,
      hidden: ({ document }) => document?.runType !== 'ingest_pipeline',
    }),

    // ingest_runs.hagen_video_id — Hagens interna video-ID
    defineField({
      name: 'hagenVideoId',
      title: 'Hagen Video ID',
      type: 'string',
      readOnly: true,
      hidden: ({ document }) => document?.runType !== 'ingest_pipeline',
    }),

    // ingest_runs.hagen_contract_version — API-kontraktversion mot Hagen
    // Viktigt för att tolka result.analyze_summary korrekt vid framtida ändringar.
    defineField({
      name: 'hagenContractVersion',
      title: 'Hagen Kontraktversion',
      type: 'string',
      readOnly: true,
      hidden: ({ document }) => document?.runType !== 'ingest_pipeline',
    }),

    // ingest_runs.result (JSONB) — pipeline-resultat med merge-semantik
    // Shallow-merged per steg: { analyze_summary, enrich_summary, humor_enrich }
    // Se mergeResultInto() i ingest-runs.ts
    defineField({
      name: 'result',
      title: 'Pipeline-resultat (JSONB)',
      type: 'object',
      readOnly: true,
      hidden: ({ document }) => document?.runType !== 'ingest_pipeline',
      description: 'Shallow-merged per steg av AI-pipeline. Speglar ingest_runs.result.',
      fields: [
        { name: 'rawJson', title: 'Raw JSON', type: 'text',
          description: 'Serialiserad JSONB. Parsas vid bridge-synk.' },
      ],
    }),

    // ingest_runs.warnings (JSONB array) — non-fatal varningar från pipelinen
    // Append-only: appendWarningTo() i ingest-runs.ts
    defineField({
      name: 'warnings',
      title: 'Varningar',
      type: 'array',
      readOnly: true,
      hidden: ({ document }) => document?.runType !== 'ingest_pipeline',
      of: [{ type: 'string' }],
      description: 'Append-only lista. Källa: ingest_runs.warnings (JSONB array).',
    }),

    // ── TikTok Profile Sync-specifika fält (runType = 'tiktok_profile_sync') ─

    // sync_runs.mode — hur synken startades
    defineField({
      name: 'syncMode',
      title: 'Synk-läge',
      type: 'string',
      readOnly: true,
      hidden: ({ document }) => document?.runType !== 'tiktok_profile_sync',
      description: 'sync_runs.mode — t.ex. "cron", "manual", "background"',
    }),

    // Räknare (sync_runs)
    defineField({
      name: 'fetchedCount',
      title: 'Hämtade klipp',
      type: 'number',
      readOnly: true,
      hidden: ({ document }) => document?.runType !== 'tiktok_profile_sync',
    }),

    defineField({
      name: 'importedCount',
      title: 'Importerade klipp (nya)',
      type: 'number',
      readOnly: true,
      hidden: ({ document }) => document?.runType !== 'tiktok_profile_sync',
    }),

    defineField({
      name: 'statsUpdatedCount',
      title: 'Uppdaterade statistik-rader',
      type: 'number',
      readOnly: true,
      hidden: ({ document }) => document?.runType !== 'tiktok_profile_sync',
    }),

    // sync_runs.calls_used — antal RapidAPI-anrop förbrukade
    // Används för daglig budget-tracking (max X anrop per 24h per kund).
    defineField({
      name: 'callsUsed',
      title: 'API-anrop förbrukade',
      type: 'number',
      readOnly: true,
      hidden: ({ document }) => document?.runType !== 'tiktok_profile_sync',
    }),

    // ── Gemensamma fält ────────────────────────────────────────────────────

    defineField({
      name: 'errorCode',
      title: 'Felkod',
      type: 'string',
      readOnly: true,
    }),

    defineField({
      name: 'errorMessage',
      title: 'Felmeddelande',
      type: 'text',
      readOnly: true,
    }),

    defineField({
      name: 'startedAt',
      title: 'Startad',
      type: 'datetime',
      readOnly: true,
    }),

    defineField({
      name: 'finishedAt',
      title: 'Avslutad',
      type: 'datetime',
      readOnly: true,
    }),

    // ── Relationer ─────────────────────────────────────────────────────────
    defineField({
      name: 'customer',
      title: 'Kund',
      type: 'reference',
      to: [{ type: 'customer' }],
      readOnly: true,
    }),

    // Länk till det koncept som producerades av denna körning (Flöde 3 only).
    // Källa: ingest_runs.concept_id
    defineField({
      name: 'concept',
      title: 'Producerat koncept',
      type: 'reference',
      to: [{ type: 'concept' }],
      readOnly: true,
      hidden: ({ document }) => document?.runType !== 'ingest_pipeline',
    }),

    defineField({
      name: 'bridgeSyncedAt',
      title: 'Senast synkad från Supabase',
      type: 'datetime',
      readOnly: true,
    }),

  ],
})
*/

/**
 * MCP-agent interaktion med ingestRun / syncRun:
 *
 * STRIKT READ-ONLY. Agenten observerar men muterar aldrig.
 *
 * GROQ-exempel — senaste misslyckade AI-körningar per kund:
 *
 *   *[_type == "ingestRun"
 *     && runType == "ingest_pipeline"
 *     && status in ["failed", "canceled"]
 *     && customer._ref == $customerId
 *   ] | order(startedAt desc)[0..4] {
 *     _id, supabaseId, status, stage, errorCode, errorMessage,
 *     startedAt, finishedAt, hagenContractVersion
 *   }
 *
 * GROQ-exempel — senaste TikTok-profilsynkar med API-budget:
 *
 *   *[_type == "ingestRun"
 *     && runType == "tiktok_profile_sync"
 *     && customer._ref == $customerId
 *   ] | order(startedAt desc)[0..9] {
 *     _id, status, syncMode, fetchedCount, importedCount, callsUsed,
 *     startedAt, finishedAt, errorMessage
 *   }
 */
