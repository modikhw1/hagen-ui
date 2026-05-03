# Admin cost sources audit

Status as of task #9 (cost calculator + 30d projection at bottom of `/admin`).
Goal: be honest about which cost numbers are real, which are estimated, and
which are still completely missing — so the operator UI never lies.

## Status legend

- **Mätt** — every chargeable call writes a row to `service_costs` with a real
  per-unit price. The number on the card is what we actually consumed.
- **Uppskattat** — we count the calls but multiply by a configured per-call
  price in `service_pricing`. Right ballpark, not invoiceable accuracy.
- **Saknar data** — no instrumentation yet. The card renders "Ingen mätning
  ännu" instead of `0 kr` so we don't pretend.

## Per-leverantör

### TikTok fetcher (RapidAPI · `tiktok-scraper7`)

- **Anropas i**: `artifacts/api-server/src/lib/studio/tiktok-sync.ts`
  (`fetchProviderVideos` + `fetchProviderUser`). Kallas av cron-routen
  `/api/studio-v2/internal/sync-history-all`, manuell-routen
  `/api/studio-v2/customers/:id/fetch-profile-history` samt
  `triggerInitialTikTokSyncBackground` vid invite/profile-link.
- **Räknare**: varje `rapidApiFetch`-anrop skriver en rad till `service_costs`
  via `recordRapidApiCall(...)` direkt efter HTTP-svaret (oavsett status —
  RapidAPI debiterar försökta requests). Quota-refresh via
  `/api/admin/costs/refresh` läser dessutom `x-ratelimit-*`-headers och skriver
  in den till `metadata.quota`.
- **Prismodell**: prenumerationsplan + per-call-overage. Default i seed antar
  PRO-planen ≈ 25 USD / 50k requests ≈ 0,005 USD ≈ 5 öre per call.
- **Status**: Mätt (per-call) + Uppskattat månads-flat i prognosen.
- **TODO**: läs faktiska fakturor från RapidAPI dashboard för att verifiera
  per-call-priset; instrumentera även eventuella SPA-side anrop om
  `triggerInitialTikTokSync` (i `artifacts/letrend/src/lib/tiktok/`)
  reaktiveras (idag `'server-only'`-stub).

### Gemini API (gameplan + analys via `@google/genai`)

- **Anropas i**: `artifacts/hagen/src/lib/services/video/gemini.ts` och
  `artifacts/hagen/src/lib/services/brand/brand-analyzer.ts`.
  Letrend triggar via `/api/letrend/concept/prepare` (proxas i api-server
  `routes/letrend.ts`).
- **Räknare**: hagen-proxyn i `artifacts/api-server/src/routes/letrend.ts`
  skriver en rad per `2xx`-svar via `recordGeminiCall(hagenData, …)`. Helpern
  letar efter `usage.input_tokens` / `output_tokens` (eller SDK-namnen
  `usageMetadata.promptTokenCount` / `candidatesTokenCount`) i hagens svar
  och använder dem direkt om de finns (`metadata.data_source = 'measured'`);
  annars faller den tillbaka till en per-route-uppskattning
  (`concept/prepare`/`reprocess` ≈ 2k in / 1k ut; `videos/analyze/deep`
  ≈ 8k in / 3k ut, `metadata.data_source = 'estimated'`).
- **Prismodell**: per 1k input/output-tokens (Gemini 2.5 Flash ≈ 0,075 USD /
  1M input, 0,30 USD / 1M output i april 2026). Default i seed: 1 öre / 1k
  input + 4 öre / 1k output.
- **Status**: Mätt så snart hagen returnerar ett `usage`-fält, annars
  Uppskattat (per-call token-estimat).
- **TODO**: lägg till `usage` i hagens svar (litet jobb i
  `analyzeVideoCombined` och prepare-pipelinen) så att alla rader blir Mätt.

### Google Cloud (Vertex + GCS) — körs via hagen

- **Anropas i**: hagens ingest-pipeline (Vertex video embeddings + GCS-lagring
  av råklipp). Letrend ser bara att jobbet kördes via hagen-proxyn i
  `artifacts/api-server/src/routes/letrend.ts` (`/concept/prepare`,
  `/reprocess`, `/videos/analyze/deep`).
- **Räknare**: ingen idag. Hagen returnerar inte kostnad / GB / requests.
- **Prismodell**: Vertex Multimodal embeddings ≈ 0,001 USD / sekund, GCS
  Standard ≈ 0,02 USD / GB-månad. Default i seed: 50 öre / "deep analyze",
  10 öre / "prepare" + 1 öre / lagrad GB-dag.
- **Status**: Uppskattat (per-call). Skattningen skrivs av hagen-proxyn när
  upstream returnerar 2xx.
- **TODO**: koppla mot Google Cloud Billing Export i BigQuery — för stort
  scope för denna task.

### Stripe (avgifter på inkommande betalningar)

- **Anropas i**: webhooken `artifacts/api-server/src/routes/stripe-webhook.ts`
  hanterar `invoice.paid` / `invoice.payment_succeeded` /
  `charge.succeeded`. Vi kan läsa `invoice.total_excluding_tax` plus stripens
  `application_fee_amount` eller `charge.balance_transaction.fee` för exakt
  avgift.
- **Räknare**: webhooks idag, `balance_transactions.list` för historisk
  bakgrundssumma.
- **Prismodell**: 1,5% + 1,80 SEK per inhemskt kort enligt nuvarande svenska
  Stripe-avtal (default i seed). Faktisk avgift skrivs när vi kan läsa fee
  från objektet, annars uppskattning från beloppet.
- **Status**: Mätt så snart fee finns på eventet, annars Uppskattat.
- **TODO**: backfill-cron som läser `balance_transactions` för senaste dygnet
  och kompletterar webhook-rader (för utebliven webhook eller refunds).

### Supabase

- **Anropas i**: använder vi i alla server-routes; ingen enskild call att
  räkna.
- **Räknare**: Supabase exponerar nyttjande via Management API (Pro-planen
  ger MAU + DB size + bandwidth per projekt) men det kräver en separat
  service token vi inte har idag.
- **Prismodell**: Pro-tier flat 25 USD / månad + overages. Default i seed:
  flat 250 öre / dag (ca 75 kr / månad) tills vi kan läsa faktiska siffror.
- **Status**: Uppskattat (flat). Skrivs av en lättviktig daglig snapshot — om
  cron inte körs renderas "Saknar data".
- **TODO**: integrera mot Supabase Management API.

### Avgränsade leverantörer (ej i panelen)

- **Resend** — explicit filtrerad bort i `aggregateOverviewCosts`.
- **Sentry / PostHog** — utanför scope för denna task.

## Pris-konfiguration

Alla default-priser ligger i tabellen `service_pricing`
(`supabase/migrations/20260503140000_service_pricing.sql`). Kolumner:

| service       | unit              | price_ore | notes                                                |
|---------------|-------------------|-----------|------------------------------------------------------|
| rapidapi      | per_call          | 5         | tiktok-scraper7 PRO ≈ 0,005 USD                      |
| gemini        | per_1k_input_tok  | 1         | gemini-2.5-flash april 2026                          |
| gemini        | per_1k_output_tok | 4         | gemini-2.5-flash april 2026                          |
| vertex        | per_prepare       | 10        | hagen `concept/prepare`                              |
| vertex        | per_deep_analyze  | 50        | hagen `videos/analyze/deep`                          |
| gcs           | per_gb_day        | 1         | grov uppskattning för lagring av video-cache         |
| stripe        | percent_basis     | 150       | 1,50% av belopp (basis points)                       |
| stripe        | fixed_per_charge  | 180       | 1,80 SEK per kortbetalning                           |
| supabase      | per_day_flat      | 250       | Pro-tier flat ≈ 75 kr / mån                          |

Operatören kan justera dessa rader direkt i Supabase studio utan deploy;
`getServicePricing()` cachar i 5 min på api-server-sidan.

## Vad denna task levererar

1. Audit-rapporten (denna fil).
2. `service_pricing`-tabell med default-rader.
3. Helpern `recordServiceUsage()` + `getServicePricing()` i api-server som
   wirar in:
   - Hagen-proxy (`/api/letrend/concept/prepare`, `/reprocess`,
     `/videos/analyze/deep`) → uppskattning per anrop.
   - Stripe-webhook `charge.succeeded` läser riktig fee från
     `balance_transaction.fee` (Mätt). Faller tillbaka till
     percent+fixed-uppskattning om Stripe inte returnerar BT.
     `payment_intent.succeeded` hanteras *inte* för fee-mätning eftersom
     Stripe alltid också skickar `charge.succeeded` per betalning — vi
     undviker dubbelräkning genom att bara lyssna på charge-eventet.
4. `/api/admin/overview/costs` läser nu från `service_costs` och returnerar
   både 30-dagars utfall och prognos för innevarande månad. Projection för
   TikTok inkluderar månads-flat (`rapidapi.monthly_flat`) plus
   `remaining quota × per_call`.
5. `/api/admin/costs/refresh` (POST) invaliderar pricing-cachen, kör en
   RapidAPI-quota-probe (läser `x-ratelimit-*` headers från
   tiktok-scraper7) och skriver kvoten till `service_costs.metadata.quota`
   för senare projection.
6. UI: `CostCard` visar två tal (faktiskt 30 d / prognos månad) plus en
   liten badge ("Mätt" / "Uppskattat" / "Saknar data") och totalraden visar
   båda summorna. Tjänster utan en enda inrapporterad rad renderas som
   "Saknar data — ingen mätning ännu" istället för "Gratis".

## Vad som lämnas som TODO

- Gemini token-usage från hagen (idag estimerat per route i proxyn — byts
  till mätt så snart hagen returnerar `usageMetadata`).
- Stripe `balance_transactions` backfill-cron för utebliven webhook eller
  refunds (idag förlitar vi oss på live webhooks).
- Supabase Management API-integration.
- En `/api/usage/record`-endpoint för SPA-side anrop behövs *inte* idag — alla
  riktiga TikTok-anrop sker server-side i api-server, och letrend-SPA:n gör
  inte själv några Gemini-anrop. Endpointen aktualiseras först om
  `triggerInitialTikTokSync` (`artifacts/letrend/src/lib/tiktok/`) flyttas
  tillbaka till klienten med `VITE_RAPIDAPI_KEY`.
- Daily snapshot-cron är inte schemalagd — refresh-knappen sköter manuell
  trigger tills vi har en cron-runner.
