/**
 * MCP Mutations — Sanity patch-operationer
 *
 * Dessa funktioner är de enda skrivoperationer en MCP-agent ska utföra
 * mot Sanity. De är strikt begränsade till agent-ägda fält (se ägandeskapsmatris
 * i README.md).
 *
 * VIKTIGT: Mutationer mot Sanity synkas INTE automatiskt tillbaka till Supabase.
 * För fält som ska persisteras i Supabase (t.ex. tags, status på video) behöver
 * bridge/supabase-to-sanity.ts utökas med en omvänd synk-rutin. Det är utanför
 * scope för v0.1.
 *
 * Ref: https://www.sanity.io/docs/http-mutations
 * Ref: https://www.sanity.io/docs/js-client#creating-and-editing-documents
 * Ref: https://www.sanity.io/docs/patch
 */

// import { createClient, SanityClient } from '@sanity/client'

/*
// ── Klient-factory ───────────────────────────────────────────────────────────
// MCP-agenten skapar aldrig en cached klient — tokens kan löpa ut.
// Se @sanity/client docs: https://www.sanity.io/docs/js-client#usage

function getMcpClient(): SanityClient {
  return createClient({
    projectId: '9a8dudi5',
    dataset: 'production',
    apiVersion: '2024-01-01',
    token: process.env.SANITY_API_TOKEN,
    useCdn: false,
  })
}
*/

// ── video-mutationer ─────────────────────────────────────────────────────────

/**
 * Sätt om hela tagg-arrayen på ett video-dokument.
 *
 * Supabase-kolumn: customer_concepts.tags (text[], DEFAULT '{}')
 * Sanity-fält: video.tags
 *
 * OBS v0.1: Skriver bara till Sanity. För att persistera till Supabase
 * behöver PATCH /api/studio-v2/customers/:id/concepts/:conceptId anropas
 * med { tags } i body (se studio-v2.ts PATCH-route, "tags" är i allowed-listan).
 *
 * Params:
 *   documentId  — Sanity _id för video-dokumentet
 *   tags        — ny komplett tagg-array (ersätter befintlig)
 */
/*
export async function patchVideoTags(documentId: string, tags: string[]): Promise<void> {
  const client = getMcpClient()

  await client
    .patch(documentId)
    .set({ tags })                    // set ersätter hela arrayen
    .commit({ autoGenerateArrayKeys: false })

  // v0.1: Logga att en omvänd synk till Supabase behövs
  console.info(`[mcp] video.tags uppdaterade för ${documentId} — kräver bridge-återsynk till Supabase`)
}
*/

/**
 * Uppdatera status på ett video-dokument.
 *
 * Tillåtna värden: 'history_import' | 'active' | 'rejected' | 'pending_review'
 * (definierade i video.status schema ovan)
 *
 * OBS v0.1: Skriver bara till Sanity.
 */
/*
export type VideoStatus = 'history_import' | 'active' | 'rejected' | 'pending_review'

export async function patchVideoStatus(documentId: string, status: VideoStatus): Promise<void> {
  const client = getMcpClient()

  await client
    .patch(documentId)
    .set({ status })
    .commit()
}
*/

/**
 * Lägg till en AI-genererad beskrivning på ett video-dokument.
 * Ersätter inte originaltext (description-fältet ägs av Supabase).
 *
 * Sanity-fält: video.aiDescription
 * Supabase-kolumn: ingen direkt motsvarighet i v0.1
 */
/*
export async function enrichVideoDescription(documentId: string, aiDescription: string): Promise<void> {
  const client = getMcpClient()

  await client
    .patch(documentId)
    .set({ aiDescription })
    .commit()
}
*/

/**
 * Länka ett video-dokument till ett koncept-dokument.
 *
 * Supabase-kolumn: customer_concepts.concept_id (FK till concepts.id)
 * Sanity-fält: video.concept (reference)
 *
 * OBS: I Supabase görs denna koppling via PATCH på customer_concepts.concept_id.
 * Sanity-mutationen är parallell och ska göras efter Supabase-skrivningen.
 *
 * Params:
 *   videoDocumentId   — Sanity _id för video
 *   conceptDocumentId — Sanity _id för concept (INTE supabaseId)
 */
/*
export async function linkVideoToConcept(
  videoDocumentId: string,
  conceptDocumentId: string
): Promise<void> {
  const client = getMcpClient()

  await client
    .patch(videoDocumentId)
    .set({
      concept: {
        _type: 'reference',
        _ref: conceptDocumentId,
      },
    })
    .commit()
}
*/

// ── concept-mutationer ───────────────────────────────────────────────────────

/**
 * Berika ett koncept-dokument med AI-genererad summering och/eller föreslagna taggar.
 * Agenten skriver till agent-ägda fält — CM:s fält (title, brief, tags) påverkas inte.
 *
 * Sanity-fält: concept.aiSummary, concept.suggestedTags
 * Supabase-kolumn: ingen direkt motsvarighet i v0.1
 *
 * Ref: https://www.sanity.io/docs/patch#set-individual-keys
 *
 * Params:
 *   documentId     — Sanity _id för concept
 *   enrichment     — ett eller båda fälten
 */
/*
export interface ConceptEnrichment {
  aiSummary?: string
  suggestedTags?: string[]
}

export async function enrichConcept(
  documentId: string,
  enrichment: ConceptEnrichment
): Promise<void> {
  if (!enrichment.aiSummary && !enrichment.suggestedTags) {
    throw new Error('enrichConcept: minst ett fält (aiSummary eller suggestedTags) krävs')
  }

  const client = getMcpClient()
  const patch = client.patch(documentId)

  // Bygg patch selektivt — ändrar bara de fält som skickas
  const fields: Record<string, unknown> = {}
  if (enrichment.aiSummary !== undefined) {
    fields['aiSummary'] = enrichment.aiSummary
  }
  if (enrichment.suggestedTags !== undefined) {
    fields['suggestedTags'] = enrichment.suggestedTags
  }

  await patch.set(fields).commit()
}
*/

/**
 * Appenda en enskild föreslagen tagg utan att ersätta befintliga.
 * Använder Sanity's append-operation i stället för set.
 *
 * Ref: https://www.sanity.io/docs/patch#insert-items-in-an-array
 */
/*
export async function appendSuggestedTag(documentId: string, tag: string): Promise<void> {
  const client = getMcpClient()

  await client
    .patch(documentId)
    .insert('after', 'suggestedTags[-1]', [tag])   // append till slutet av arrayen
    .commit({ autoGenerateArrayKeys: false })
}
*/

// ── Transaktionsmönster (för framtida v0.2) ──────────────────────────────────

/**
 * Atomisk länkning: video → concept med samtidig statusändring.
 *
 * Använder Sanity-transaktion för att säkerställa att båda
 * dokument uppdateras i samma operation.
 *
 * Ref: https://www.sanity.io/docs/js-client#transactions
 *
 * OBS: Detta är ett v0.2-mönster. I v0.1 görs operationerna sekventiellt.
 */
/*
export async function promoteVideoToConcept(
  videoDocumentId: string,
  conceptDocumentId: string,
): Promise<void> {
  const client = getMcpClient()

  const transaction = client.transaction()

  // 1. Uppdatera video: sätt concept-referens och status
  transaction.patch(videoDocumentId, (patch) =>
    patch.set({
      concept: { _type: 'reference', _ref: conceptDocumentId },
      status: 'active',
    })
  )

  // 2. Uppdatera concept: sätt sourceVideo-referens
  transaction.patch(conceptDocumentId, (patch) =>
    patch.set({
      sourceVideo: { _type: 'reference', _ref: videoDocumentId },
    })
  )

  await transaction.commit()
}
*/
