# Sanity MCP — v0.1 Framework

> **Status**: Dokumentation / blueprint — ingen kod är driftsatt.
> Sanity-projektet är konfigurerat: `projectId=9a8dudi5`, `dataset=production`.
> MCP-token är lagrad som `SANITY_API_TOKEN` i Replit Secrets.
>
> Refs:
> - [Sanity Schema Types](https://www.sanity.io/docs/schema-types)
> - [GROQ Query Language](https://www.sanity.io/docs/groq)
> - [Sanity Client (JS)](https://www.sanity.io/docs/js-client)
> - [Mutations API](https://www.sanity.io/docs/http-mutations)

---

## Entitetsöversikt

Vår Supabase-databas har fyra tabeller som är relevanta för video-ingest.
Nedan visas hur de mappar till Sanity-dokumenttyper och vilka som ägs av
vilken part.

```
SUPABASE (source of truth)          SANITY (observation + berikning)
─────────────────────────────       ────────────────────────────────
customer_profiles          ──→      customer          (read-only spegling)
│
├─ sync_runs               ──→      syncRun           (read-only, RapidAPI-flöde)
│
├─ ingest_runs             ──→      ingestRun         (read-only, AI-pipeline)
│
└─ customer_concepts       ──→      video             (delvis muterbart)
        │
        └─ concept_id FK   ──→      concept           (co-owned: CM skapar, agent berikar)
```

### Ägandeskapsmatris

| Dokument    | Supabase skriver | Sanity skriver | MCP-agent läser | MCP-agent skriver |
|-------------|:----------------:|:--------------:|:---------------:|:-----------------:|
| `customer`  | ✅               | ❌             | ✅              | ❌                |
| `video`     | ✅               | ✅ (berikning) | ✅              | `tags`, `status`, `conceptRef` |
| `syncRun`   | ✅               | ❌             | ✅              | ❌                |
| `ingestRun` | ✅               | ❌             | ✅              | ❌                |
| `concept`   | ✅               | ✅             | ✅              | `aiSummary`, `suggestedTags` |

---

## Två distinkta ingest-flöden (viktigt)

Systemet har **två separata vägar** för hur videor hamnar i `customer_concepts`.
Sanity-schemat måste reflektera detta i `video.historySource`.

### Flöde 1 — RapidAPI TikTok Profile Sync
```
cron / manuell trigger
  → syncCustomerHistory() i tiktok-sync.ts
  → RapidAPI TikTok endpoint
  → customer_concepts (history_source = 'tiktok_profile')
  → sync_runs (logg per körning)
```

### Flöde 2 — Hagen Library Sync
```
CM klickar "Synca från hagen" i Studio-UI
  → POST /api/studio-v2/customers/:id/sync-history
  → Hagen GET /api/studio-v2/customers/:id/hagen-clips
  → customer_concepts (history_source = 'hagen_library')
  (ingen sync_runs-rad, ingen cron_run_log)
```

### Flöde 3 — AI Ingest Pipeline (Analyze / Enrich)
```
POST /api/studio/ingest  (eller via Hagen)
  → ingest_runs skapas (status: queued → running → ready_for_review → completed)
  → stages: analyzing → enriching → classifying → saving → humor_enriching
  → concepts skapas / uppdateras
  → ingest_runs.result (JSONB): { analyze_summary, enrich_summary, humor_enrich }
```

---

## Modulstruktur

```
docs/sanity/
  README.md                   ← denna fil
  schema/
    customer.ts               ← Sanity-dokumenttyp: customer
    video.ts                  ← Sanity-dokumenttyp: video (customer_concepts)
    concept.ts                ← Sanity-dokumenttyp: concept
    ingest-run.ts             ← Sanity-dokumenttyp: ingestRun + syncRun
  mcp/
    queries.groq.ts           ← GROQ-queries en MCP-agent skulle köra
    mutations.ts              ← Patch-operationer exponerade via MCP
  bridge/
    supabase-to-sanity.ts     ← Hur data flödar Supabase → Sanity (synk-strategi)
```
