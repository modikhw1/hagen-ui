/**
 * Sanity Schema — `concept`
 *
 * Speglar `concepts`-tabellen i Supabase.
 * `concepts` är det redaktionella objektet som en CM skapar och som
 * AI-pipeline (Flöde 3) och MCP-agenten kan berika.
 *
 * Relationen till `customer_concepts` är:
 *   customer_concepts.concept_id → concepts.id  (FK, nullable)
 *
 * I Supabase lagrar `concepts` innehållet i två JSONB-kolumner:
 *   backend_data  — källdata från AI-analysen (analyze_summary, enrich_summary)
 *   overrides     — CM:s manuella ändringar som overridar backend_data vid rendering
 *
 * I Sanity flattenas dessa till konkreta fält för att göra dem
 * observerbara och sökbara via GROQ.
 *
 * Ref: https://www.sanity.io/docs/document-type
 * Ref: https://www.sanity.io/docs/object-type
 */

// import { defineType, defineField } from 'sanity'

/*
export const conceptSchema = defineType({
  name: 'concept',
  title: 'Koncept',
  type: 'document',

  preview: {
    select: {
      title: 'title',
      subtitle: 'status',
    },
  },

  fields: [

    // ── Supabase-nyckel ────────────────────────────────────────────────────
    defineField({
      name: 'supabaseId',
      title: 'Supabase UUID',
      type: 'string',
      readOnly: true,
      description: 'concepts.id i Supabase.',
      validation: (Rule) => Rule.required(),
    }),

    // ── Kärndatan (speglad från backend_data + overrides) ─────────────────

    // Titeln resolvas i UI som: overrides.title ?? backend_data.title
    // I Sanity denormaliseras denna logik till ett enda fält vid bridge-synk.
    defineField({
      name: 'title',
      title: 'Koncepttitel',
      type: 'string',
      description: 'Resolvas som overrides.title → backend_data.title vid synk från Supabase.',
    }),

    // Längre beskrivning av konceptet.
    // Källa: backend_data (AI-genererat) eller overrides (CM-skrivet).
    defineField({
      name: 'brief',
      title: 'Brief',
      type: 'text',
    }),

    // ── Livscykelstatus ────────────────────────────────────────────────────
    // Källa: concepts.is_active + ingest_runs.status kombinerat.
    // 'draft'     → ingest_run.status != 'completed', eller is_active=false
    // 'approved'  → is_active=true, ej publicerat
    // 'published' → kopplat customer_concepts-rad med row_kind='assignment' och publicerat
    // 'archived'  → is_active=false, tidigare aktivt
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      options: {
        list: [
          { title: 'Utkast', value: 'draft' },
          { title: 'Godkänt', value: 'approved' },
          { title: 'Publicerat', value: 'published' },
          { title: 'Arkiverat', value: 'archived' },
        ],
      },
    }),

    // ── Ingest-pipeline-metadata (read-only) ──────────────────────────────
    // Speglar ingest_runs.result.analyze_summary och .enrich_summary.
    // Dessa populeras av Flöde 3 (AI Pipeline) och är read-only för agenten.

    defineField({
      name: 'analyzeSummary',
      title: 'Analyze-summering (AI)',
      type: 'object',
      readOnly: true,
      description: 'Källa: ingest_runs.result.analyze_summary (JSONB). Produceras av AI-analyssteg.',
      fields: [
        // Faktiska fält beror på Hagen-kontraktversion (hagen_contract_version i ingest_runs).
        // Definieras som 'unknown' i v0.1 tills kontraktet stabiliserats.
        { name: 'raw', title: 'Raw JSON', type: 'text' },
      ],
    }),

    defineField({
      name: 'enrichSummary',
      title: 'Enrich-summering (AI)',
      type: 'object',
      readOnly: true,
      description: 'Källa: ingest_runs.result.enrich_summary (JSONB). Produceras av enriching-steget.',
      fields: [
        { name: 'raw', title: 'Raw JSON', type: 'text' },
      ],
    }),

    // ── MCP-agent-skrivbara berikningsfält ────────────────────────────────

    // AI-genererad summering av konceptets potential.
    // Skrivs av MCP-agenten — existerar inte i Supabase, lever bara i Sanity.
    defineField({
      name: 'aiSummary',
      title: 'AI-summering (MCP)',
      type: 'text',
      description: 'Skriven av MCP-agent. Synkas EJ tillbaka till Supabase automatiskt.',
    }),

    // Föreslagna taggar från MCP-agenten. Skiljs från tags (CM-hanterade).
    defineField({
      name: 'suggestedTags',
      title: 'Föreslagna taggar (MCP)',
      type: 'array',
      of: [{ type: 'string' }],
      description: 'Agent-förslag. CM väljer vilka som promoveras till tags[].',
    }),

    // CM-hanterade taggar (godkända av människa).
    // Källa: customer_concepts.tags via association.
    defineField({
      name: 'tags',
      title: 'Taggar (godkända)',
      type: 'array',
      of: [{ type: 'string' }],
    }),

    // ── Feed-positionering (read-only) ────────────────────────────────────
    // customer_concepts.feed_order för den associerade assignment-raden.
    // Negativa värden = historik. 0 = "Nu". Positiva = framtida planering.
    // Agenten läser detta för att förstå var i flödet konceptet befinner sig.
    defineField({
      name: 'feedOrder',
      title: 'Feed-position',
      type: 'number',
      readOnly: true,
      description: 'customer_concepts.feed_order. Negativ=historik, 0=Nu, Positiv=planerad.',
    }),

    // ── Källvideo ──────────────────────────────────────────────────────────
    // Det TikTok-klipp som konceptet är baserat på (om det comes from history).
    // Källa: customer_concepts.reconciled_customer_concept_id → video._id i Sanity.
    defineField({
      name: 'sourceVideo',
      title: 'Källvideo',
      type: 'reference',
      to: [{ type: 'video' }],
      readOnly: true,
      description: 'Länk till det importerade TikTok-klippet som konceptet baseras på.',
    }),

    // ── Relationer ─────────────────────────────────────────────────────────
    defineField({
      name: 'customer',
      title: 'Kund',
      type: 'reference',
      to: [{ type: 'customer' }],
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),

    defineField({
      name: 'ingestRun',
      title: 'AI Ingest-körning',
      type: 'reference',
      to: [{ type: 'ingestRun' }],
      readOnly: true,
      description: 'Den AI-pipeline-körning som producerade detta koncept (Flöde 3).',
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
 * MCP-agent interaktion med concept:
 *
 * Tillåtna skrivoperationer:
 *   - aiSummary         → enrichConcept(conceptId, { aiSummary })
 *   - suggestedTags[]   → enrichConcept(conceptId, { suggestedTags })
 *
 * Förbjudna skrivoperationer (CM eller Supabase äger):
 *   - title, brief, status
 *   - analyzeSummary, enrichSummary (AI-pipeline äger)
 *   - feedOrder, sourceVideo, customer (Supabase äger)
 *   - tags[] (CM äger — agent föreslår via suggestedTags)
 *
 * GROQ-exempel — hämta koncept som saknar AI-summering:
 *
 *   *[_type == "concept"
 *     && status in ["approved", "draft"]
 *     && !defined(aiSummary)
 *     && customer._ref == $customerId
 *   ] {
 *     _id, supabaseId, title, status, tags, feedOrder, analyzeSummary
 *   }
 */
