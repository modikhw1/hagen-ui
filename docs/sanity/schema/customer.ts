/**
 * Sanity Schema — `customer`
 *
 * Speglar `customer_profiles` i Supabase.
 * Denna typ är READ-ONLY för MCP-agenten — mutationer sker alltid via Supabase.
 * Sanity-dokumentet skapas vid onboarding och hålls i synk via bridge (se bridge/supabase-to-sanity.ts).
 *
 * Ref: https://www.sanity.io/docs/document-type
 * Ref: https://www.sanity.io/docs/string-type
 */

// import { defineType, defineField } from 'sanity'

/*
export const customerSchema = defineType({
  name: 'customer',
  title: 'Kund',
  type: 'document',

  // ── Sanity Studio-konfiguration ──────────────────────────────────────────
  // preview: vilka fält som visas i listvyn i Sanity Studio
  preview: {
    select: {
      title: 'displayName',
      subtitle: 'tiktokHandle',
    },
  },

  fields: [

    // ── Identitet (från Supabase customer_profiles.id) ─────────────────────
    // Används som nyckel vid bridge-synk. Inte Sanity's inbyggda _id.
    defineField({
      name: 'supabaseId',
      title: 'Supabase UUID',
      type: 'string',
      description: 'customer_profiles.id — primärnyckeln i Supabase. Används för referensuppslagning.',
      readOnly: true,
      validation: (Rule) => Rule.required(),
    }),

    // ── Visningsdata ───────────────────────────────────────────────────────
    defineField({
      name: 'displayName',
      title: 'Kundnamn',
      type: 'string',
      readOnly: true,
    }),

    // ── TikTok-koppling ────────────────────────────────────────────────────
    // Normaliserat utan @-prefix. Används av bridge för att matcha
    // video.sourceUsername vid import från båda ingest-flödena.
    defineField({
      name: 'tiktokHandle',
      title: 'TikTok Handle',
      type: 'string',
      description: 'Utan @-prefix. Källa: customer_profiles.tiktok_handle',
      readOnly: true,
    }),

    // ── Account Manager ────────────────────────────────────────────────────
    // Denormaliserat display-namn (enriched från team_members-join).
    // Se account_manager_display_name i admin-overlay.
    defineField({
      name: 'accountManager',
      title: 'Account Manager',
      type: 'string',
      readOnly: true,
    }),

    // ── Synkstatus (observerbarhet) ────────────────────────────────────────
    // Populeras från customer_profiles.last_sync_error.
    // null = senaste synk lyckades.
    defineField({
      name: 'lastSyncError',
      title: 'Senaste synkfel',
      type: 'string',
      readOnly: true,
    }),

    // ── Tidsstämplar ───────────────────────────────────────────────────────
    defineField({
      name: 'bridgeSyncedAt',
      title: 'Senast synkad från Supabase',
      type: 'datetime',
      readOnly: true,
      description: 'Tidpunkt då bridge senast uppdaterade detta dokument.',
    }),

  ],
})
*/

/**
 * MCP-agent interaktion med customer:
 *
 * Tillåtna operationer:
 *   - Läsa: getAllowed
 *
 * Förbjudna operationer (hanteras av Supabase):
 *   - Skapa ny kund
 *   - Ändra tiktokHandle, displayName, accountManager
 *
 * GROQ-exempel för att hämta alla kunder med aktiv TikTok-handle:
 *
 *   *[_type == "customer" && defined(tiktokHandle)] {
 *     _id, supabaseId, displayName, tiktokHandle, accountManager, lastSyncError
 *   }
 */
