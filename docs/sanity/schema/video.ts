/**
 * Sanity Schema — `video`
 *
 * Speglar `customer_concepts` i Supabase, specifikt rader där
 * row_kind IN ('history_import') — d.v.s. importerade TikTok-klipp.
 *
 * Detta är det primära dokumentet en MCP-agent observerar och muterar.
 * Rader med row_kind = 'assignment' eller 'collaboration' representeras
 * som relationer på `concept`-dokumentet, inte som egna `video`-dokument.
 *
 * Ref: https://www.sanity.io/docs/document-type
 * Ref: https://www.sanity.io/docs/reference-type
 * Ref: https://www.sanity.io/docs/array-type
 */

// import { defineType, defineField } from 'sanity'

/*
export const videoSchema = defineType({
  name: 'video',
  title: 'Video',
  type: 'document',

  preview: {
    select: {
      title: 'tiktokUrl',
      subtitle: 'sourceUsername',
      media: 'thumbnailUrl',
    },
  },

  fields: [

    // ── Supabase-nyckel ────────────────────────────────────────────────────
    // customer_concepts.id — UUIDv4. Används av bridge vid upsert.
    defineField({
      name: 'supabaseId',
      title: 'Supabase UUID',
      type: 'string',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),

    // ── TikTok-identitet ───────────────────────────────────────────────────

    // Normaliserad URL — primär dedupliceringsnyckeln i systemet.
    // normalizeTikTokUrl() i tiktok-sync.ts strippar query-params och
    // normaliserar www/m-subdomäner. Används som unik nyckel vid import.
    // Exempel: "https://www.tiktok.com/@handle/video/7234567890123456789"
    defineField({
      name: 'tiktokUrl',
      title: 'TikTok URL (normaliserad)',
      type: 'url',
      readOnly: true,
      validation: (Rule) => Rule.required().uri({ scheme: ['https'] }),
    }),

    // Utan @-prefix. Matchar mot customer.tiktokHandle vid import.
    // Hagen-klipp har source_username; RapidAPI-klipp deriveras från handle.
    defineField({
      name: 'sourceUsername',
      title: 'TikTok-handle',
      type: 'string',
      readOnly: true,
    }),

    defineField({
      name: 'publishedAt',
      title: 'Publiceringsdatum (TikTok)',
      type: 'datetime',
      readOnly: true,
    }),

    // ── Mätetal (skrivskyddade — källa är TikTok via RapidAPI eller Hagen) ──
    // Uppdateras per synk-körning. Agenten läser, skriver aldrig.

    defineField({
      name: 'views',
      title: 'Visningar',
      type: 'number',
      readOnly: true,
      description: 'customer_concepts.tiktok_views — uppdateras vid varje synk.',
    }),

    defineField({
      name: 'likes',
      title: 'Gilla-markeringar',
      type: 'number',
      readOnly: true,
    }),

    defineField({
      name: 'comments',
      title: 'Kommentarer',
      type: 'number',
      readOnly: true,
    }),

    // ── Innehåll ───────────────────────────────────────────────────────────

    // Orginaltext från TikTok-beskrivningen. Agenten kan komplettera med
    // aiDescription men ersätter inte detta fält.
    defineField({
      name: 'description',
      title: 'Originaltext (TikTok)',
      type: 'text',
      readOnly: true,
    }),

    defineField({
      name: 'thumbnailUrl',
      title: 'Thumbnail URL',
      type: 'url',
      readOnly: true,
      description: 'customer_concepts.tiktok_thumbnail_url',
    }),

    // ── Klassificering (MCP-agent-skrivbar) ───────────────────────────────

    // Källa: customer_concepts.status
    // Tillåtna värden i systemet (studio-v2.ts rad ~820):
    //   'history_import' — initial status vid import
    //   'active'         — godkänd av CM för användning
    //   'rejected'       — avfärdad
    //   'pending_review' — flaggad för granskning
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Importerad', value: 'history_import' },
          { title: 'Aktiv', value: 'active' },
          { title: 'Avvisad', value: 'rejected' },
          { title: 'Väntar granskning', value: 'pending_review' },
        ],
      },
      initialValue: 'history_import',
    }),

    // Tagg-array. Agenten kan lägga till/ta bort taggar.
    // Källa: customer_concepts.tags (text[] i Postgres, DEFAULT '{}').
    // Kolumnen existerade redan i DB — ingen migration behövdes (Task #54).
    defineField({
      name: 'tags',
      title: 'Taggar',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'Hanteras av CM via Studio UI och av MCP-agent.',
    }),

    // AI-genererad beskrivning — komplement till originaltext.
    // Skrivs av MCP-agenten, syns i Sanity Studio men skickas ej tillbaka till
    // Supabase automatiskt (kräver explicit bridge-write om det önskas).
    defineField({
      name: 'aiDescription',
      title: 'AI-summering',
      type: 'text',
      description: 'Skriven av MCP-agent. Ersätter inte originaltext.',
    }),

    // ── Ursprung (read-only) ───────────────────────────────────────────────

    // Skiljer de två ingest-flödena åt (viktigt för observerbarhet).
    // 'tiktok_profile' = Flöde 1 (RapidAPI, via syncCustomerHistory)
    // 'hagen_library'  = Flöde 2 (POST sync-history, via Hagen)
    // 'manual'         = Manuellt tillagd
    defineField({
      name: 'historySource',
      title: 'Ingests-källa',
      type: 'string',
      readOnly: true,
      options: {
        list: [
          { title: 'RapidAPI TikTok Profile', value: 'tiktok_profile' },
          { title: 'Hagen Library', value: 'hagen_library' },
          { title: 'Manuell', value: 'manual' },
        ],
      },
    }),

    // Tidpunkt för senaste data-synk mot TikTok-källan.
    // customer_concepts.tiktok_last_synced_at
    defineField({
      name: 'lastSyncedAt',
      title: 'Senast synkad från TikTok',
      type: 'datetime',
      readOnly: true,
    }),

    // ── Relationer ─────────────────────────────────────────────────────────

    // Ägande kund. Alltid satt.
    defineField({
      name: 'customer',
      title: 'Kund',
      type: 'reference',
      to: [{ type: 'customer' }],
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),

    // Länk till AI-ingest-körningen som producerade detta klipp (om tillämpligt).
    // Null för Flöde 1 (RapidAPI) och Flöde 2 (Hagen Library).
    // Populeras av Flöde 3 (AI Pipeline) via ingest_runs.id.
    defineField({
      name: 'ingestRun',
      title: 'Ingest-körning',
      type: 'reference',
      to: [{ type: 'ingestRun' }],
      readOnly: true,
      description: 'Null för RapidAPI/Hagen-importerade klipp.',
    }),

    // Länk till konceptdokumentet om klippet promoterats till ett koncept.
    // Källa: customer_concepts.concept_id (FK till concepts.id).
    // Agenten kan sätta denna länk men bör inte skapa concept-dokumentet direkt.
    defineField({
      name: 'concept',
      title: 'Kopplat koncept',
      type: 'reference',
      to: [{ type: 'concept' }],
      description: 'Sätts när CM eller pipeline promoverar klippet till koncept.',
    }),

    // ── Synk-metadata ──────────────────────────────────────────────────────
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
 * MCP-agent interaktion med video:
 *
 * Tillåtna skrivoperationer:
 *   - tags[]          → patchVideoTags(videoId, tags[])
 *   - status          → patchVideoStatus(videoId, status)
 *   - aiDescription   → enrichVideoDescription(videoId, text)
 *   - concept (ref)   → linkVideoToConcept(videoId, conceptId)
 *
 * Förbjudna skrivoperationer (Supabase äger):
 *   - tiktokUrl, sourceUsername, publishedAt
 *   - views, likes, comments
 *   - historySource, lastSyncedAt
 *   - customer (relation)
 *
 * GROQ-exempel — hämta alla ohanterade klipp för en kund:
 *
 *   *[_type == "video"
 *     && customer._ref == $customerId
 *     && status == "history_import"
 *     && !defined(concept)
 *   ] | order(publishedAt desc) {
 *     _id, supabaseId, tiktokUrl, sourceUsername, publishedAt,
 *     views, likes, description, tags, historySource
 *   }
 */
