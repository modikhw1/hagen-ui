# 05 - TikTok-integration

> Detta dokument beskriver den valda och faktiska integrationsriktningen:
> profil-URL + extern provider/RapidAPI + historiksync.
> Ingen del av denna kedja bygger pa officiell TikTok OAuth per kund.

## Princip

Malkedjan ar:

1. Spara `tiktok_profile_url` pa kunden.
2. Verifiera profilen innan den sparas eller uppdateras.
3. Derivera och spara `tiktok_handle`.
4. Hamta historik och statistik via provider.
5. Synca om historik schemalagt for live-kunder.
6. Visa data i admin/studio med tydlig fallback nar providerdata saknas.

Detta innebar ocksa att vissa falt ar opportunistiska:

- `tiktok_handle` kan ofta deriveras stabilt.
- `tiktok_user_id` kan saknas eller forandras beroende pa provider-svar.
- statistik och metadata kan vara null, ofullstandig eller tillfalligt otillganglig utan att integrationen ska betraktas som trasig.

## Krav

- `RAPIDAPI_KEY`
- `CRON_SECRET` eller `VERCEL_CRON_SECRET`
- kundkolumner i `customer_profiles`:
  - `tiktok_profile_url`
  - `tiktok_handle`
  - `tiktok_user_id`
  - `last_history_sync_at`
  - `pending_history_advance_at`
  - `operation_lock_until`
- tabeller for visning och sync:
  - `tiktok_stats`
  - `tiktok_videos`
  - `tiktok_publications`
  - `sync_runs`

Legacy-tabellen `tiktok_oauth_tokens` hor inte till malbilden och ska inte anvandas i ny kod eller ny dokumentation.

## Faktiska routes

### 1. Verifiera profil

Admin eller CM verifierar en profil innan den sparas:

- `GET /api/admin/tiktok/profile-preview?input=<url-eller-handle>`
- `GET /api/studio-v2/customers/[customerId]/profile-preview?input=<url-eller-handle>`

Input kan vara profil-URL eller handle. Svaret normaliseras via `fetchTikTokProfilePreview(...)`.

### 2. Spara profil pa kund

- `GET /api/studio-v2/customers/[customerId]/profile`
- `PATCH /api/studio-v2/customers/[customerId]/profile`

Vid patch:

- `tiktok_profile_url` canonicaliseras
- `tiktok_handle` deriveras fran URL om mojligt
- `tiktok_user_id` nollstallts tills en senare sync eventuellt fyller den

Ogiltig profil ska ge inline-fel, inte toast och inte tyst fallback.

### 3. Hamta profilhistorik manuellt

- `POST /api/studio-v2/customers/[customerId]/fetch-profile-history`

Detta flode:

- laser kundens `tiktok_profile_url` och `tiktok_handle`
- stoppar om handle inte kan deriveras
- anropar `syncCustomerHistory(...)` i manuellt lage
- importerar nya klipp
- uppdaterar statistik
- returnerar `fetched`, `imported`, `stats_updated`, `reconciled`, `has_more`, `cursor`

### 4. Schemalagd sync

- `POST /api/tiktok/sync`
- `POST /api/studio-v2/internal/sync-history-all`

Cron-routen ska skyddas med `CRON_SECRET` och bara behandla kunder som:

- ar `active` eller `agreed`
- har `tiktok_handle`
- saknar `last_history_sync_at` eller ar stale

Den schemalagda syncen ska:

- hoppa over kunder utan handle
- respektera lockning via historiksyncen
- fortsatta till nasta kund vid providerfel eller rate limits
- returnera summering over `processed`, `new_clips`, `stats_updated`, `reconciled`, `nudges_created`, `errors`

## Datamodell

### Kundniva

`customer_profiles` ar sann kassa for kopplingen:

- `tiktok_profile_url`: sparad profil-URL
- `tiktok_handle`: normaliserad handle utan ledande `@`
- `tiktok_user_id`: valfri provideridentifierare
- `last_history_sync_at`: senaste lyckade eller stampade historiksync
- `pending_history_advance_at`: signal for senare forflyttning i arbetsflode
- `operation_lock_until`: skydd mot parallella importer

### Statistik och historik

- `tiktok_stats` innehaller snapshots for trend/kort
- `tiktok_videos` innehaller importerade videor
- `tiktok_publications` knyter publiceringar till kund/CM-operativ modell

## UI-kontrakt

### Kunddetalj

Kunddetaljen ska beskriva verkligheten:

- ingen "Koppla TikTok via OAuth"-knapp
- tydlig forklaring om profil-URL + provider
- inline-fel om profil inte kan verifieras
- tydlig markering att viss metadata kan saknas eller variera mellan syncar

### Admin och team

Oversikt/team ska kunna lasa statistik och publikationer utan att forutsatta att varje fält alltid finns.

Graceful fallback ar korrekt beteende nar:

- provider inte svarar
- statistik saknas for dagen
- vissa videometadata inte returneras

## Fellagen

| Lage | Beteende |
|------|----------|
| `RAPIDAPI_KEY` saknas | route returnerar 503 |
| `CRON_SECRET` saknas | cron-route returnerar 503 |
| profil-URL ar ogiltig | verifiering/patch returnerar 400 |
| handle kan inte deriveras | historikroute returnerar 400 |
| provider svarar 429 | sync loggar/rappporterar felet och gar vidare |
| providerdata saknar falt | statistik/video sparas med null eller delmangd, inte hard fail |
| tabell saknas i aldre miljo | route ska ge tydligt fel eller schema-warning, inte anta OAuth |

## Checklista

- [ ] Verifiera att `customer_profiles` har TikTok-falten enligt ovan
- [ ] Verifiera att `RAPIDAPI_KEY` finns i miljo
- [ ] Verifiera att `CRON_SECRET` eller `VERCEL_CRON_SECRET` finns i miljo
- [ ] Verifiera att profil-preview fungerar med URL och `@handle`
- [ ] Verifiera att `PATCH /profile` canonicaliserar URL och sparar handle
- [ ] Verifiera att manuell `fetch-profile-history` importerar klipp och uppdaterar stats
- [ ] Verifiera att `POST /api/tiktok/sync` bara tar live/agreed-kunder och returnerar summering
- [ ] Verifiera att kunddetaljen visar inline-fel och inga OAuth-antaganden
- [ ] Verifiera att admin/team-vyer tolererar saknad eller delvis providerdata

Klart? Ga vidare till `06-implementationsordning-och-acceptanstester.md`.
