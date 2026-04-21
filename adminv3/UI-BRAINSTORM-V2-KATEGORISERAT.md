# LeTrend Admin — Brainstorm V2: Kategoriserat scenario-bibliotek

> **Syfte:** Detta dokument är en uppgradering av `UI-BRAINSTORM-PROMPT.md`. Där V1 listar scenarier ad hoc per UI-yta, organiserar V2 alla cases (V1 + 7 blinda fläckar + ~80 nya edge cases) i **10 tematiska kategorier**. Varje kategori har:
>
> 1. En beskrivning av domänen och varför den hänger ihop
> 2. Den fullständiga listan av scenarier (med stabila ID:n så agent kan korsreferera)
> 3. En **agent-prompt** som agenten kör för just den kategorin
> 4. **Implementationsguide** — konkreta filer, tabeller, helpers att skapa/ändra
> 5. **Sökstrategi** — vad agenten ska greppa i `originalrepot/` innan den föreslår patchar
> 6. **Leverans-format** — vad agenten ska producera (SQL, TS, MD, diff)
>
> Dokumentet är skrivet för att en AI-agent (Claude Sonnet 4.5 eller motsv.) ska kunna **köras sekventiellt kategori för kategori** utan att tappa kontext.

---

## Hur agenten ska arbeta med detta dokument

**Steg 0 — Kontextladdning (obligatoriskt en gång):**
Läs in följande filer i exakt denna ordning innan kategori 1 påbörjas:

1. `00-README-och-leveransöversikt.md` — leveransöversikt
2. `07-operativ-modell-och-koncept.md` — normativa definitioner (buffer, tempo, CM-puls)
3. `01-supabase-schema-rls-triggers.md` — nuvarande schema
4. `02-stripe-byok-sync-webhooks.md` — Stripe-spegel-arkitektur
5. `08-schema-patchar-och-tabeller.md` — patchade tabeller
6. `09-grafik-och-berakningslogik.md` — derivationer
7. Detta dokument (V2) — kategori-strukturen

**Steg 1–10 — En kategori per sekventiell körning:**
Agenten kör en kategori i taget, levererar artefakterna, och stannar för review innan nästa kategori. Varje kategori är **självförsörjande** — agenten ska kunna återupptas på kategori N utan att ha kategori N-1:s output i kontext (allt skrivs till disk).

**Output-konvention:**
Allt agentens output sparas under `originalrepot/docs/audit/` med filnamn:
```
audit-<kategori-id>-<kort-titel>.md       (analys)
audit-<kategori-id>-patches.sql           (DB-migrationer)
audit-<kategori-id>-patches.ts            (TS-helpers/komponentpatchar, om relevant)
audit-<kategori-id>-acceptance.md         (acceptanskriterier + test-cases)
```

**Severity-skala (gäller alla scenarier):**
- 🔴 **MUST FIX** — datakorruption, säkerhetshål, betalningsfel, irreversibel skada
- 🟠 **SHOULD FIX** — förvirrande UX, tysta fel, dataluckor som ackumuleras
- 🟢 **NICE TO HAVE** — förbättringar utan akut problem

---

## Kategori-översikt

| ID  | Kategori                                              | # cases | Primär domän                       |
| --- | ----------------------------------------------------- | ------- | ---------------------------------- |
| K01 | Lifecycle & state machines                            | ~14     | Customer/Subscription/CM-övergångar |
| K02 | Stripe-spegel & reconciliation                        | ~18     | Webhooks, sync-job, divergens      |
| K03 | Invite & onboarding-flödet                            | ~17     | Från invite till active            |
| K04 | TikTok-integration                                    | ~9      | OAuth, sync, datakvalitet          |
| K05 | CM-arbete, tilldelning & överlämning                  | ~14     | Team-flow, handover, frånvaro      |
| K06 | Concurrency, race conditions & realtime               | ~7      | Multi-admin, webhook-races         |
| K07 | Notifikationer, alerts & eskalering                   | ~9      | Admin awareness, snooze            |
| K08 | Audit, säkerhet & RLS                                 | ~10     | Logging, sessions, role checks     |
| K09 | Email & extern kommunikation                          | ~8      | Resend, Stripe-mail, deliverability|
| K10 | Infrastruktur, miljöer & dataintegritet               | ~12     | Deployments, timezones, exports    |

Totalt: **~118 distinkta scenarier** (V1 hade ~50, V2 lägger till ~70 från blinda fläckar och dina kompletteringar).

---

# K01 — Lifecycle & state machines

**Domän:** Varje kärn-entitet (Customer, Subscription, CM, Invite) har en livscykel med distinkta states. Idag hanterar UI ofta bara nuläget, inte övergångarna. När en entitet rör sig mellan states finns ofta sidoeffekter (CM-tilldelning, åtkomst, fakturering) som inte är explicit modellerade.

**Varför det hänger ihop:** Alla dessa scenarier kräver att vi först ritar upp **state diagrams** och sedan validerar att UI + backend hanterar varje övergång + rollback.

## Cases

| ID       | Scenario                                                                                              | Severity |
| -------- | ----------------------------------------------------------------------------------------------------- | -------- |
| K01-01   | Kund `invited → pending` men inbjudningsmail bouncar — vem äger kunden, CM-tilldelning oklar          | 🟠       |
| K01-02   | Subscription `active → past_due → unpaid → canceled` — UI/CM/access per steg odefinierat              | 🔴       |
| K01-03   | Kund avslutar och vill tillbaka — nytt `stripe_customer_id` eller återaktivering?                     | 🟠       |
| K01-04   | Subscription `at_period_end`-cancel — kund är `active` men slutar snart, CM ovetande                  | 🟠       |
| K01-05   | Kund pausas manuellt — CM får ingen notis, fortsätter arbeta                                          | 🟠       |
| K01-06   | Arkiverad CM med kvarstående `user_roles`-rad kan logga in i 24h tills session expirear              | 🔴       |
| K01-07   | Soft-delete vs hard-delete (GDPR) — vad händer med `cm_interactions`, `feedplan_concepts`, FK?        | 🔴       |
| K01-08   | Invite-länk expirear — kund klickar dag 31 → silent fail/limbo-account                                | 🟠       |
| K01-09   | Kund pending → stänger fliken mitt i onboarding → `pending` för evigt                                | 🟠       |
| K01-10   | Restaurang byter ägare — ägarskiftes-flöde saknas, manuell e-postbyte i Supabase                      | 🟠       |
| K01-11   | Kund `blocked` p.g.a. obetald faktura — CM ser inte detta, fortsätter arbeta                          | 🔴       |
| K01-12   | `expected_concepts_7d` aldrig satt för ny kund → progressbar div-by-zero/render-fel                  | 🟠       |
| K01-13   | CM-konto skapas med fel roll (`customer` istället för `content_manager`) — fel UI, ingen guidning     | 🟠       |
| K01-14   | Active customer utan CM (admin glömde tilldela) — ingen daglig check lyfter detta                     | 🟠       |

## Agent-prompt (kopiera in i agent-sessionen)

````
Du arbetar med kategori K01 — Lifecycle & state machines för LeTrend admin-dashboarden.

Förutsättningar (läs in om de inte redan är i kontext):
- 07-operativ-modell-och-koncept.md
- 01-supabase-schema-rls-triggers.md
- 08-schema-patchar-och-tabeller.md

Uppgift:
1. Rita state machines (Mermaid-diagram) för:
   a. Customer (invited, pending, active, paused, blocked, archived, churned, reactivated)
   b. Subscription (incomplete, trialing, active, past_due, unpaid, canceled, paused)
   c. CM (active, on_leave, archived, pending_email_change)
   d. Invite (sent, opened, accepted, expired, revoked)
2. För varje övergång, ange:
   - Trigger (admin-action, webhook, cron, user-action)
   - Sidoeffekter på relaterade entiteter
   - UI-uppdatering som måste ske (vilken komponent, vilken färg/badge)
   - Notifikation som ska genereras (om någon)
3. Korsreferera mot K01-01 till K01-14. För varje case, ange exakt vilken övergång som inte hanteras idag och föreslå patch.
4. Producera:
   - audit-K01-state-machines.md (Mermaid + transition-tabell)
   - audit-K01-patches.sql (eventuella nya kolumner som `customer.lifecycle_state`, triggers för auto-block, FK ON DELETE-strategier)
   - audit-K01-acceptance.md (acceptanstest per case, inkl. "active customer utan CM"-cron)

Sökstrategi i originalrepot:
- grep efter `status:` i src/types/customer.ts och src/types/subscription.ts
- grep efter `setStatus`, `updateStatus` i src/lib/customers/, src/lib/subscriptions/
- läs alla filer i supabase/migrations/ som innehåller "status" eller "state"
- läs supabase/functions/stripe-webhook/ för status-transitioner
- leta efter cron-job i supabase/functions/cron/ — finns "active customers without CM"-checken?

Severity: prioritera 🔴 (K01-02, K01-06, K01-07, K01-11) först.
````

## Implementationsguide

**Tabeller att skapa/utöka:**
- `customer_lifecycle_events` (audit-trail för alla state-övergångar; se K08 också)
- `customers.lifecycle_state` (enum, separat från Stripe-status)
- `cm_absences` (start_date, end_date, type: sick/vacation/other) — krävs för K05 också

**Triggers:**
- `on subscription.status update → if 'unpaid' for >X days then customers.lifecycle_state := 'blocked'`
- `on customer hard-delete → block om beroenden finns; istället tvinga archive`

**Cron:**
- `daily_orphan_check` — listar `customers where status='active' and assigned_cm_id is null`
- `daily_invite_expiry_check` — markerar invites äldre än 30d som `expired` och triggar admin-alert

---

# K02 — Stripe-spegel & reconciliation

**Domän:** Stripe är källan till sanning, vår DB är spegel. När de divergerar (webhook missas, admin redigerar i Stripe Dashboard, BYOK-nyckel roteras) måste vi ha en plan.

**Varför det hänger ihop:** Alla dessa cases handlar om att **anta att webhook alltid kommer fram och behandlas korrekt** — vilket inte är sant. Lösningen är reconciliation-job + idempotens + observability.

## Cases

| ID       | Scenario                                                                                              | Severity |
| -------- | ----------------------------------------------------------------------------------------------------- | -------- |
| K02-01   | Admin ändrar pris direkt i Stripe Dashboard — spegeln vet inget                                       | 🔴       |
| K02-02   | Kund cancelar via Stripe-mail-länk — UI lag tills webhook anländer                                    | 🟠       |
| K02-03   | Edge function nere 40 min — 12 webhooks tappas, inget reconciliation-job                              | 🔴       |
| K02-04   | Manuell faktura skapad i både LeTrend och Stripe Dashboard → duplicat                                 | 🔴       |
| K02-05   | Webhook idempotens — `stripe_events`-tabell + `event.id`-dedup saknas                                 | 🔴       |
| K02-06   | Två webhooks parallellt (`invoice.paid` + `subscription.updated` µs isär) → race i UPDATE             | 🔴       |
| K02-07   | `invoice.payment_failed` uppdaterar `stripe_invoices` men inte `customers.status` om edge fn kraschar | 🔴       |
| K02-08   | BYOK-nyckel roteras — pågående webhook-signaturer fail:as utan larm                                   | 🔴       |
| K02-09   | TEST vs LIVE-miljö-blandning — riktig kund faktureras                                                 | 🔴       |
| K02-10   | Staging-DB kopierad från prod med riktiga `stripe_customer_id` → test-webhook → riktig charge         | 🔴       |
| K02-11   | Subscription skapas utan att `stripe_customer_id` finns → silent fail                                 | 🟠       |
| K02-12   | Stripe-customer skapas med fel e-post (admin-typo) — Stripe & DB osynk från dag 1                     | 🟠       |
| K02-13   | Pro-rata vid plan-byte (månads → års) visas inte före bekräftelse                                     | 🟠       |
| K02-14   | Coupon med `duration=once` upphör — ingen "rabatt upphör snart"-indikator                             | 🟠       |
| K02-15   | Partial refund i Stripe — UI visar fortfarande faktura som `paid` med fullt belopp                    | 🔴       |
| K02-16   | `billing_cycle_anchor` 31:a + februari → UI visar fel "nästa faktura"                                 | 🟢       |
| K02-17   | Stripe send_invoice-metod (30d netto) — UI har inget val för betalningsmetod                          | 🟠       |
| K02-18   | Manuell faktura med öre/kr-förvirring → 100x för högt belopp skickat                                  | 🔴       |

## Agent-prompt

````
Du arbetar med kategori K02 — Stripe-spegel & reconciliation.

Förutsättningar:
- 02-stripe-byok-sync-webhooks.md
- 08-schema-patchar-och-tabeller.md
- K01-state machines (om K01 redan körts; annars notera dependency)

Uppgift:
1. Definiera "Stripe-sanning vs DB-spegel"-arkitekturen explicit. Inkludera:
   - Idempotency-strategi (stripe_events-tabell, event.id som unique key)
   - Reconciliation-strategi (nightly job som listar alla aktiva subscriptions från Stripe API och jämför med DB)
   - Dead Letter Queue för failade webhooks
   - Observability (Sentry/Logflare-events när webhook fail:ar 3+ gånger)
2. Producera:
   - audit-K02-spegel-arkitektur.md (sekvensdiagram för normalfall + 4 felfall)
   - audit-K02-patches.sql:
     * stripe_events (id, type, payload jsonb, processed_at, error, retry_count)
     * stripe_reconciliation_runs (started_at, finished_at, drift_count, drifts jsonb)
     * unique constraint på stripe_invoices.stripe_invoice_id
   - audit-K02-edge-functions.ts:
     * stripe-reconcile/index.ts (Deno cron, körs 02:00 CET)
     * stripe-webhook/index.ts patchat med dedup + DLQ
   - audit-K02-acceptance.md (test för K02-03, K02-06, K02-07, K02-15)
3. Korsreferera K02-09/K02-10 — föreslå explicit miljö-guard (env-check + Stripe-account-id assertion).

Sökstrategi i originalrepot:
- supabase/functions/stripe-webhook/index.ts — finns dedup?
- src/lib/stripe/ — alla helpers
- grep efter "stripe.invoices.create", "stripe.subscriptions.update" — alla mutation-points
- leta efter "STRIPE_SECRET_KEY" — kollas environment var live/test?
- finns någon scheduled function i supabase/functions/cron/?

Severity: alla 🔴 i K02 är blockerande för produktionslansering.
````

## Implementationsguide

**Tabeller (utöver `08-schema-patchar`):**
- `stripe_events` — webhook idempotency
- `stripe_reconciliation_runs` — daglig sync-rapport
- `stripe_drift_log` — när Stripe ≠ DB upptäcks

**Edge functions:**
- `stripe-reconcile` — daglig full sync (subscriptions + invoices senaste 90d)
- `stripe-webhook` — utökad med dedup + retry + DLQ

**UI-gates:**
- Modal för manuell faktura: tvinga belopp i `kr` med tydlig label, internt konvertera till öre, visa preview "12 500 kr (= 1 250 000 öre)"
- Banner överst i admin: `if env=test then visa orange banner "TESTMILJÖ"`

---

# K03 — Invite & onboarding-flödet

**Domän:** Hela resan från admin klickar "Bjud in" till kunden är `active` med fungerande TikTok-sync. Idag spridd över invite-modal, onboarding-sidor och Stripe-setup.

## Cases

| ID       | Scenario                                                                                              | Severity |
| -------- | ----------------------------------------------------------------------------------------------------- | -------- |
| K03-01   | "Skicka demo senare" → kund i DB → ingen CTA finns sen                                               | 🟠       |
| K03-02   | Kund öppnar aldrig mail → ingen reminder, ingen "skicka igen"-knapp                                  | 🟠       |
| K03-03   | Invite-länk expiry inte synlig i UI                                                                   | 🟠       |
| K03-04   | Admin skickar invite till fel e-post — ingen "återkalla"-funktion                                     | 🔴       |
| K03-05   | Kund vidarebefordrar mail — fel person loggar in, ingen verifiering                                  | 🔴       |
| K03-06   | Ingen bekräftelse till admin när kunden accepterat                                                    | 🟠       |
| K03-07   | TikTok-koppling oklart placerad i onboarding-flödet                                                   | 🟠       |
| K03-08   | Kund kopplar privat TikTok-konto istället för Business — ingen validering                            | 🟠       |
| K03-09   | TikTok OAuth lyckas men utan analytics-scope → tyst fail                                              | 🟠       |
| K03-10   | OAuth i in-app browser (Instagram/Gmail) — cookies blockas, tyst fail                                 | 🟠       |
| K03-11   | Kund skapar konto med Google SSO — e-post matchar inte invite → dubbla `auth.users`                  | 🔴       |
| K03-12   | Kontaktperson-fält fritext → fel namn i CM-kommunikation                                             | 🟢       |
| K03-13   | Kund loggar in efter onboarding → ser tom app, ingen välkomstvy                                      | 🟠       |
| K03-14   | Invite till `info@restaurang.se` — fem anställda ser, två klickar → "länk redan använd"               | 🟠       |
| K03-15   | Demo-länk utan invite — ingen "jag vill ha detta"-CTA                                                | 🟢       |
| K03-16   | Kund fullföljer onboarding men ingen CM tilldelas — ingen daglig check                               | 🟠       |
| K03-17   | Slug-kollision (två restauranger samma namn) — invite kraschar                                        | 🟠       |

## Agent-prompt

````
Du arbetar med kategori K03 — Invite & onboarding.

Förutsättningar:
- 03-api-routes-och-auth-lager.md
- 04-ui-paritet-komponenter-hooks-sidor.md
- K01-state machines (Customer + Invite)

Uppgift:
1. Rita upp ett **end-to-end onboarding-sekvensdiagram** med tre simultana spår:
   - Admin-spår (vad admin gör/ser)
   - Kund-spår (vad kund gör/ser)
   - System-spår (vad backend/Stripe/TikTok gör)
2. För varje av K03-01 till K03-17, beskriv:
   - Var i flödet det inträffar
   - Vad som idag händer (silent fail / 500 / limbo)
   - Önskat beteende
   - Konkret patch (UI-komponent, API-route, edge function, mail-mall)
3. Producera:
   - audit-K03-onboarding-flow.md (3-spårs sekvensdiagram + invariants-lista)
   - audit-K03-patches.sql:
     * invites-tabell med status, expires_at, accepted_at, accepted_by_user_id, revoked_at
     * unique-index på (slug) + slug-collision-handler (suffix -2, -3)
     * idempotent customer-invite-CTA på arkiverade invites
   - audit-K03-patches.tsx:
     * InviteModal med "skicka igen", "återkalla", "kopiera länk"-actions
     * OnboardingChecklist-komponent som kunden ser
     * E-post-validation (deliverability-API innan invite skickas)
   - audit-K03-acceptance.md (test för K03-04, K03-05, K03-11, K03-16, K03-17)

Sökstrategi:
- src/components/customers/InviteModal.tsx (om finns) eller search "invite" i src/components/
- src/app/(onboarding)/* eller src/pages/onboarding/*
- supabase/functions/send-invite/ eller liknande
- supabase/migrations/ — finns invites-tabell?
- src/lib/auth/ — hur hanteras Google SSO + invite-mismatch?

Specialnot K03-11: Föreslå explicit identity-merging UI eller blockera SSO för pending invites.
````

## Implementationsguide

**Tabeller:**
- `invites` (id, customer_id, email, token_hash, expires_at, sent_at, opened_at, accepted_at, accepted_by_user_id, revoked_at, revoked_reason)
- `customer_onboarding_progress` (customer_id, step, completed_at) — för K03-13 checklist

**Edge functions:**
- `send-invite` — med Resend webhooks för bounce/delivery-tracking
- `invite-tick` (cron daily) — markerar `expired`, skickar reminder dag 7 + dag 21
- `verify-invite-acceptance` — kollar e-post-match mot invite

**UI:**
- `InviteModal` — actions: "skicka igen", "återkalla", "kopiera länk", "byt e-post"
- `CustomerCard` — om `pending`: visa "Inbjuden för X dagar sedan • [Skicka påminnelse]"
- Onboarding-checklist för kund: "1. Verifiera mail ✓ 2. Koppla TikTok ⏳ 3. Möte med din CM bokat"

---

# K04 — TikTok-integration

**Domän:** OAuth, periodisk sync, datakvalitet, token-hantering. Allt som rör `tiktok_*`-tabeller och edge function `tiktok-sync`.

## Cases

| ID       | Scenario                                                                                              | Severity |
| -------- | ----------------------------------------------------------------------------------------------------- | -------- |
| K04-01   | Kund byter lösenord på TikTok → token invalid → ingen notis                                          | 🟠       |
| K04-02   | TikTok-konto privatsatt en dag → API returnerar 0 → tolkas som genuint                                | 🟠       |
| K04-03   | Nystartat konto med 0 följare → viral-trösklar = 0 → varje video flaggas viral                       | 🟢       |
| K04-04   | Edge function timeout 10s vid 500 videos → kraschar halvvägs, ingen resume                            | 🟠       |
| K04-05   | API-gap (ett datum saknas) — gap syns inte i graf, mean räknas på färre punkter utan flagg            | 🟠       |
| K04-06   | Scatter-graf 200+ punkter → ingen sampling/paginering → browser hänger                               | 🟠       |
| K04-07   | TikTok OAuth utan analytics-scope (K03-09 dubbel-listad här)                                          | 🟠       |
| K04-08   | TikTok-token revoked → admin får ingen push                                                          | 🟠       |
| K04-09   | Kund kluster-postar (3 videos samma dag, sen tystnad) — scatter-prickar överlappar                   | 🟢       |

## Agent-prompt

````
Du arbetar med kategori K04 — TikTok-integration.

Förutsättningar:
- 05-tiktok-integration.md
- 09-grafik-och-berakningslogik.md (för K04-05, K04-06, K04-09)

Uppgift:
1. Definiera TikTok-sync-resilience:
   - Resumable sync med checkpoint per video_id
   - Token refresh-flow + revocation-detection
   - Privacy-mode-detection (account_private flag i tiktok_accounts)
   - Gap-tracking (tiktok_sync_gaps tabell)
2. Definiera datakvalitets-regler:
   - Min antal följare för viral-tröskel-aktivering (t.ex. >100)
   - Markera datapunkter som "estimated" om gap finns
   - Sampling-strategi för >100 videos (visa alla men jitter + opacity)
3. Producera:
   - audit-K04-resilience.md (sync-flow + token-flow + gap-handling)
   - audit-K04-patches.sql:
     * tiktok_accounts.scope, account_visibility, last_token_refresh, token_status
     * tiktok_sync_gaps (account_id, gap_start, gap_end, reason)
     * tiktok_sync_checkpoints (account_id, last_video_id, last_synced_at)
   - audit-K04-edge-functions.ts:
     * tiktok-sync med checkpoint + chunking (50 videos/körning)
     * tiktok-token-refresh (cron, 1h innan expiry)
     * tiktok-revocation-detector (på 401-svar)
   - audit-K04-patches.tsx:
     * Scatter-graf med jitter (referens 09-grafik-dokumentet)
     * "Token revoked"-alert i CustomerDetail
     * Gap-indikator i graf (grå zon)
   - audit-K04-acceptance.md

Sökstrategi:
- supabase/functions/tiktok-sync/
- supabase/functions/tiktok-oauth-callback/
- src/components/customers/CustomerDetail/charts/ViewsScatter.tsx
- grep efter "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"
````

---

# K05 — CM-arbete, tilldelning & överlämning

**Domän:** Allt som rör Content Managers — assignment, handover, frånvaro, externt arbete.

## Cases

| ID       | Scenario                                                                                              | Severity |
| -------- | ----------------------------------------------------------------------------------------------------- | -------- |
| K05-01   | CM-byte mitt i veckan — ingen handover-mekanism                                                       | 🔴       |
| K05-02   | Ny CM får aldrig inloggningsmail — invite-flöde för CMs odefinierat                                  | 🟠       |
| K05-03   | CM-konto skapas med fel roll (K01-13 dubbel-listad här)                                              | 🟠       |
| K05-04   | Admin arkiverar CM utan omfördelning — kunder utan CM, ingen "orphaned"-vy (K01-14)                  | 🔴       |
| K05-05   | CM på semester utan `cm_absences`-flagga — felaktig röd status                                       | 🟠       |
| K05-06   | CM jobbar externt (WhatsApp/telefon) — `cm_interactions` = 0, status = needs_action                 | 🟠       |
| K05-07   | CM överbelastad — `watch`-status, ingen "minska kundlista"-CTA                                       | 🟠       |
| K05-08   | CM-bio publik vs intern — odefinierat                                                                | 🟢       |
| K05-09   | Dual-CM-assignment (övergångsperiod) — stöds inte                                                    | 🟢       |
| K05-10   | CM avslutar anställning — `auth.users` aktiv 24h tills session expiry (K01-06)                       | 🔴       |
| K05-11   | CM redigerar koncept medan admin tittar — ingen realtime-banner                                      | 🟠       |
| K05-12   | CM raderar koncept felaktigt — ingen `deleted_concepts`-log                                          | 🟠       |
| K05-13   | CM markerar kund "klar denna vecka" men admin ser thin buffert — vems bedömning gäller              | 🟠       |
| K05-14   | CM laddar upp 10 koncept på en gång — admin agerade just baserat på gammalt läge                     | 🟢       |

## Agent-prompt

````
Du arbetar med kategori K05 — CM-arbete & tilldelning.

Förutsättningar:
- 07-operativ-modell-och-koncept.md (CM-puls)
- 09-grafik-och-berakningslogik.md (cmAggregate, team-flow)
- K01 (CM state machine)

Uppgift:
1. Definiera handover-protokoll:
   - Pre-handover: ingående CM noterar pågående koncept, kontakt-historik, viktiga preferenser
   - Tx: handover-modal med 1-2 obligatoriska fält (notes, blockerare)
   - Post-handover: ny CM får audit-trail + 7d "handover mode"-banner
2. Definiera CM-livscykel inkl. invite, role-assignment, frånvaro, off-boarding:
   - Force-logout vid arkivering (Supabase admin API: signOut all sessions)
   - Frånvaro stänger av needs_action-eskalering för deras kunder
3. Definiera "external work logging":
   - Manuell knapp i CM-app: "Logga extern interaktion" (telefon/whatsapp/möte)
   - Räknas i cm_interactions med type='external'
4. Producera:
   - audit-K05-cm-protocol.md
   - audit-K05-patches.sql:
     * cm_handovers (from_cm, to_cm, customer_id, notes, blockers, completed_at)
     * cm_absences (cm_id, start_date, end_date, type, coverage_cm_id)
     * cm_interactions.type utökad med 'external_call', 'external_meeting'
     * deleted_concepts (audit-tabell, soft-delete + restore-window 7d)
   - audit-K05-patches.tsx:
     * HandoverModal
     * AbsenceCalendar i Team-vyn
     * RealtimeBanner ("Anna redigerar denna kund just nu")
   - audit-K05-edge-functions.ts:
     * force-cm-logout (på archive)
   - audit-K05-acceptance.md

Sökstrategi:
- src/components/team/, src/app/admin/team/
- supabase/migrations/ — finns cm_absences? cm_interactions med type-enum?
- supabase/functions/ — finns någon CM-invite eller force-logout?
````

---

# K06 — Concurrency, race conditions & realtime

**Domän:** Multi-admin-säkerhet, webhook-races, optimistic vs pessimistic locking, Supabase Realtime-leverans.

## Cases

| ID       | Scenario                                                                                              | Severity |
| -------- | ----------------------------------------------------------------------------------------------------- | -------- |
| K06-01   | Två admins redigerar `monthly_price` samtidigt — last-write-wins, förloraren ser ingen indikation     | 🔴       |
| K06-02   | Admin A arkiverar CM medan B omfördelar kunder till samma CM                                          | 🟠       |
| K06-03   | Manuell Stripe-sync triggad medan webhook processas för samma kund                                    | 🔴       |
| K06-04   | Webhook anländer mitt i admin-redigering — sida re-renders inte, gammalt state sparas                 | 🔴       |
| K06-05   | Supabase Realtime tappar connection (mobilnät) — admin tittar på 10 min gammal vy utan indikator     | 🟠       |
| K06-06   | Två Stripe-webhooks parallellt (K02-06 dubbel-listad)                                                | 🔴       |
| K06-07   | Pagination-state i URL saknas — filter nollställs på back-navigation                                  | 🟢       |

## Agent-prompt

````
Du arbetar med kategori K06 — Concurrency & realtime.

Uppgift:
1. Inför optimistic locking på alla muterande forms:
   - Hämta row med updated_at; skicka med vid PATCH; servern svarar 409 om mismatch
   - UI visar "Någon annan har ändrat detta. [Visa skillnad] [Skriv över] [Avbryt]"
2. Inför Realtime connection-status:
   - Wrap Supabase channel i hook som exponerar connected: boolean
   - Banner överst: "Live-uppdateringar pausade. Återansluter…"
3. Inför URL-state för filters/pagination via nuqs eller useSearchParams.
4. Inför advisory locks i Postgres för race-känsliga operationer (CM-archive, manual-sync):
   - SELECT pg_try_advisory_xact_lock(hashtext('cm-archive-' || cm_id))
5. Producera:
   - audit-K06-concurrency.md
   - audit-K06-patches.sql:
     * Lägg till updated_at + version på customers, subscriptions, feedplan_concepts
     * Helper-funktioner för advisory locks
   - audit-K06-patches.tsx:
     * useOptimisticLock hook
     * RealtimeStatusBanner
     * useUrlFilters hook
   - audit-K06-acceptance.md

Sökstrategi:
- src/hooks/useSupabaseRealtime.ts (om finns)
- src/components/customers/CustomerDetail/EditPriceForm.tsx
- supabase/migrations/ — finns updated_at överallt?
````

---

# K07 — Notifikationer, alerts & eskalering

**Domän:** Hur admin (och CM) får reda på saker när de inte tittar. Helt frånvarande i nuvarande plan.

## Cases

| ID       | Scenario                                                                                              | Severity |
| -------- | ----------------------------------------------------------------------------------------------------- | -------- |
| K07-01   | Kund missar betalning kl 03:00 — admin öppnar 09:00, ingen "ny händelse"-indikator                   | 🔴       |
| K07-02   | CM inaktiv 10d — ingen automatisk eskalering                                                         | 🟠       |
| K07-03   | TikTok-token revoked — ingen push (K04-08)                                                           | 🟠       |
| K07-04   | Stripe-fakturamail bouncar — admin ser inte                                                          | 🟠       |
| K07-05   | Resend kvotgräns nådd — alla mail tysta (K09-01)                                                     | 🔴       |
| K07-06   | Coupon `duration=once` snart slut — ingen indikator (K02-14)                                         | 🟢       |
| K07-07   | Edge function fail-rate >5% — ingen larm                                                              | 🟠       |
| K07-08   | Active customer utan CM (K01-14, K03-16) — ingen daglig digest                                       | 🟠       |
| K07-09   | Snooze-mekanism saknas — admin vill skjuta upp en alert i 7 dagar                                    | 🟠       |

## Agent-prompt

````
Du arbetar med kategori K07 — Notifikationer & alerts.

Förutsättningar:
- 08-schema-patchar (cm_notifications, attention_snoozes finns redan)

Uppgift:
1. Designa global admin_alerts-tabell:
   - id, type (enum), severity, title, body, related_entity_type, related_entity_id, created_at, acknowledged_at, snooze_until, resolved_at
2. Definiera alert-types med trigger-källa:
   - payment_failed (stripe webhook)
   - cm_inactive_10d (cron)
   - tiktok_token_revoked (sync error)
   - email_bounce (resend webhook)
   - email_quota_warning (cron + Resend API)
   - coupon_expiring (cron, 7d innan)
   - edge_fn_error_spike (Logflare → cron)
   - orphan_customer (cron)
3. UI: 🔔 i top-bar med badge + dropdown-lista + "snooze 1d/7d/30d"-actions
4. Producera:
   - audit-K07-alerts-design.md
   - audit-K07-patches.sql (admin_alerts + alert_subscriptions per admin)
   - audit-K07-edge-functions.ts (cron-jobs som genererar alerts)
   - audit-K07-patches.tsx (NotificationBell, NotificationsDropdown, NotificationsPage)
   - audit-K07-acceptance.md

Sökstrategi:
- src/components/admin/Header.tsx — finns plats för 🔔?
- supabase/functions/cron/
````

---

# K08 — Audit, säkerhet & RLS

**Domän:** Spårbarhet, role-checks, session-hantering, secret-exponering.

## Cases

| ID       | Scenario                                                                                              | Severity |
| -------- | ----------------------------------------------------------------------------------------------------- | -------- |
| K08-01   | Komprometterat admin-konto gör destruktiva ändringar — ingen audit log                               | 🔴       |
| K08-02   | RLS kollar `has_role()` men inte `is_active` — arkiverad CM kan läsa data                            | 🔴       |
| K08-03   | Service role key läckt via edge function-logg → hela DB exponerad                                    | 🔴       |
| K08-04   | Edge function loggar request-body (`stripe_customer_id`, `monthly_price`) → synligt för alla         | 🔴       |
| K08-05   | Session expirear mitt i kritisk save — UI visar inget felmeddelande                                  | 🟠       |
| K08-06   | Admin glömmer logga ut på delad dator — ingen session-timeout                                        | 🟠       |
| K08-07   | CM navigerar till /admin direkt — om route-guard saknas ser de billing-data                          | 🔴       |
| K08-08   | Admin-konto komprometteras — ingen "tvinga logout alla sessioner"-UI                                 | 🟠       |
| K08-09   | Supabase storage-bucket sätts public av misstag → kundfiler åtkomliga utan auth                      | 🔴       |
| K08-10   | `monthly_price = 0` av misstag — Stripe uppdateras tyst, ingen sanity-check                          | 🟠       |

## Agent-prompt

````
Du arbetar med kategori K08 — Audit, säkerhet & RLS.

Uppgift:
1. Inför `audit_log`-tabell med trigger på alla muterande tabeller:
   - actor_user_id, actor_role, action, entity_type, entity_id, before jsonb, after jsonb, ip, user_agent, created_at
2. Härda alla RLS-policies:
   - Skapa `is_active_role(_user_id, _role)` som kombinerar `has_role` + `cms.archived_at IS NULL`
   - Audit alla policies, byt has_role → is_active_role där relevant
3. Inför sanity-checks i edge functions:
   - monthly_price < 100 SEK → kräv extra confirm
   - service_role-key får aldrig loggas (linter-regel)
4. Inför session-management:
   - 8h max session timeout
   - "Aktiva sessioner"-vy i admin-profil med "logga ut alla"
5. Storage hardening:
   - Default-policy: alla buckets private
   - Signed URLs med 5 min TTL för UI-bilder
6. Producera:
   - audit-K08-audit-log.sql (audit_log + triggers)
   - audit-K08-rls-hardening.sql
   - audit-K08-edge-fn-hygiene.md (PII-redaction-pattern)
   - audit-K08-session-mgmt.tsx (ActiveSessionsView)
   - audit-K08-acceptance.md

Sökstrategi:
- supabase/migrations/ — alla "create policy"
- supabase/functions/*/index.ts — leta efter console.log med secrets
- src/middleware.ts — finns route-guards?
- supabase/storage policies
````

---

# K09 — Email & extern kommunikation

**Domän:** Resend, Stripe-mail, deliverability, branding-konsekvens.

## Cases

| ID       | Scenario                                                                                              | Severity |
| -------- | ----------------------------------------------------------------------------------------------------- | -------- |
| K09-01   | Resend kvotgräns nådd — alla mail tysta (även K07-05)                                                | 🔴       |
| K09-02   | Stripe-mail engelska + Resend svenska → inkonsekvent kund-upplevelse                                 | 🟠       |
| K09-03   | Kund svarar på Stripe-noreply — mail försvinner                                                      | 🟠       |
| K09-04   | CM-välkomstmail med 24h länk — CM öppnar dag 2, ingen "begär ny länk"                                | 🟠       |
| K09-05   | Admin ändrar kund-e-post i UI → `customers`-tabell uppdateras men inte `auth.users.email`            | 🔴       |
| K09-06   | Invite-mail i spam — ingen bounce/delivery-status visas                                              | 🟠       |
| K09-07   | Password reset via Supabase default-mail (engelska, Supabase-branding) → förvirrande för CM          | 🟠       |
| K09-08   | Resend webhooks (delivered/bounced/complained) inte lyssnade på                                       | 🟠       |

## Agent-prompt

````
Du arbetar med kategori K09 — Email & kommunikation.

Uppgift:
1. Inventera alla mail-källor:
   - Resend transaktionella (invite, faktura-notiser, CM-välkomst, password-reset om vi tar över från Supabase)
   - Stripe automatiska (faktura, receipts, dunning)
   - Supabase auth-mail (idealt: stäng av, ersätt med Resend-mallar)
2. Designa unified mail-tracking:
   - email_messages-tabell (id, to, template, subject, sent_at, delivered_at, bounced_at, complained_at, opened_at, clicked_at)
   - Resend webhooks → uppdatera email_messages
3. Brand-konsekvens:
   - Konfigurera Stripe-fakturor med svenska + LeTrend-logga + reply-to=hello@letrend.se
   - Custom email-domain DKIM/SPF
4. E-postbyte-flow för kund:
   - Trigger Supabase auth-update + `email_change_confirmation` flow
   - UI visar "Ny e-post väntar på bekräftelse"
5. Producera:
   - audit-K09-mail-architecture.md
   - audit-K09-patches.sql (email_messages + email_subscriptions)
   - audit-K09-edge-functions.ts (resend-webhook handler)
   - audit-K09-templates/ (alla Resend-mallar i react-email-format)
   - audit-K09-acceptance.md

Sökstrategi:
- supabase/functions/send-* — alla mail-edge-functions
- src/emails/ eller src/templates/email/
- Supabase dashboard → Authentication → Email Templates (ange i MD vad som finns)
- Stripe dashboard → branding (ange i MD vad som är konfigurerat)
````

---

# K10 — Infrastruktur, miljöer & dataintegritet

**Domän:** Deployments, timezones, exports, search, off-line, miljö-isolation.

## Cases

| ID       | Scenario                                                                                              | Severity |
| -------- | ----------------------------------------------------------------------------------------------------- | -------- |
| K10-01   | Next.js (Vercel/Railway) + Lovable/Vite separata deploys — RLS-ändring testas bara i en               | 🔴       |
| K10-02   | Railway zero-downtime fail kl 03:00 — webhooks tappas under nedetid                                  | 🔴       |
| K10-03   | Supabase free tier pausar efter 7d inaktivitet — staging nere vid demo                               | 🟠       |
| K10-04   | UTC-timestamps utan tz-konvertering — UI visar "igår" istället för "idag" för Stockholm-admin         | 🟠       |
| K10-05   | Storage-bucket public av misstag (K08-09 dubbel)                                                      | 🔴       |
| K10-06   | Edge function timeout 10s + 500 videos → halv data sparad utan resume (K04-04)                       | 🟠       |
| K10-07   | pg_cron midnatt → CEST DST → kör 02:00 lokalt + peak-trafik                                          | 🟢       |
| K10-08   | Ingen global "sök"-funktion (kund ringer, admin måste navigera + filtrera)                           | 🟠       |
| K10-09   | Belopp i öre vs kr-fel → 100x för högt belopp (K02-18 dubbel)                                        | 🔴       |
| K10-10   | Ingen "ångra"-funktion + bekräftelsedialog med konsekvens-text                                       | 🟠       |
| K10-11   | Ingen aktivitetslogg per kund (audit + payments + CM-byten + tiktok-events i en samlad vy)           | 🟠       |
| K10-12   | Ingen offline-detektion — admin på tåget tror allt sparas                                            | 🟠       |
| K10-13   | Ingen export-funktion (månads-CSV med MRR till revisor)                                              | 🟠       |

## Agent-prompt

````
Du arbetar med kategori K10 — Infra, miljöer, integritet, UX-grunder.

Uppgift:
1. Definiera miljö-matrix:
   - dev (Lovable preview, Supabase staging, Stripe test)
   - staging (Vercel preview, Supabase staging, Stripe test)
   - prod (Vercel prod, Supabase prod, Stripe live)
   - Env-banner i UI överallt utom prod
2. Definiera deployment-strategi:
   - Webhooks köas i Inngest/QStash så de inte tappas vid downtime
   - Health-check endpoint + Railway/Vercel monitor
3. Bygg cross-cutting features:
   - Global search (cmd-k) — kunder, CMs, fakturor
   - Activity log per kund (vy som unionerar audit_log + stripe_invoices + cm_interactions + tiktok_events)
   - CSV-export (månadsrapport, kundlista, MRR-historik)
   - Offline-banner (window.online)
   - Confirm-dialogs med konsekvens-text för destruktiva actions
   - Belopp-input med tvingad kr-display, intern öre-konvertering
   - DateTime-rendering med dayjs/Intl.DateTimeFormat + Europe/Stockholm
4. Producera:
   - audit-K10-infra.md (miljö-matrix + deployment-flow)
   - audit-K10-patches.tsx:
     * GlobalSearch (cmd-k)
     * CustomerActivityLog
     * ExportButton + /api/export/customers, /api/export/mrr
     * OfflineBanner
     * ConfirmDestructiveDialog
     * AmountInput
   - audit-K10-utils.ts (formatSEK, parseSEK, formatStockholmTime)
   - audit-K10-acceptance.md

Sökstrategi:
- next.config.js / vite.config.ts — env-handling
- src/lib/format.ts — finns SEK/datetime-helpers?
- src/components/ui/ — finns ConfirmDialog?
- vercel.json / railway.toml
````

---

# Sammanfattande körschema för agenten

```
Steg 0:  Kontextladdning (07, 01, 02, 08, 09, V2)
Steg 1:  K01 → audit-K01-* artefakter → review
Steg 2:  K02 → audit-K02-* → review
Steg 3:  K03 → audit-K03-* → review
Steg 4:  K04 → audit-K04-* → review
Steg 5:  K05 → audit-K05-* → review
Steg 6:  K06 → audit-K06-* → review
Steg 7:  K07 → audit-K07-* → review
Steg 8:  K08 → audit-K08-* → review
Steg 9:  K09 → audit-K09-* → review
Steg 10: K10 → audit-K10-* → review
Steg 11: Sammanställ audit-MASTER-changelog.md som listar alla nya tabeller, edge functions, helpers och UI-komponenter — sorterat efter implementationsordning (schema → backend → API → UI).
```

## Vad jag (Lovable) har lagt till med min kunskap om tjänsten

Utöver dina 7 blinda fläckar har jag lagt till följande som inte täcktes av V1 eller dina egna tillägg:

1. **State machines som första-klass-artefakt** (K01) — V1 listade scenarier per UI-yta, inte per entitet. State machines gör det lätt att se *vilka* övergångar som inte hanteras.
2. **Reconciliation som domänkoncept** (K02) — webhook-idempotens var en isolerad punkt; jag lyfter upp det till en arkitektur med daglig nightly reconcile + DLQ + observability.
3. **Onboarding-sekvensdiagram med tre spår** (K03) — admin/kund/system parallellt gör det visuellt vart fel uppstår.
4. **Global `admin_alerts`-tabell** (K07) — dina cases pekade på saknade notifikationer; jag konsoliderar det till ett notification-center med snooze.
5. **Audit log som hörnsten** (K08) — utan audit log kan inget av cases K01–K10 felsökas i efterhand.
6. **Mail-tracking-tabell + Resend webhooks** (K09) — bounce/delivered/complained-events ger admin synlighet i deliverability.
7. **Cross-cutting UX-grunder** (K10) — global search, activity log, exports, offline-detection, confirm-dialogs, AmountInput med kr↔öre-säkerhet.
8. **Optimistic locking + Realtime status-banner** (K06) — explicit pattern för multi-admin-säkerhet.
9. **Handover-protokoll med pre/tx/post-faser** (K05) — istället för bara "byt CM" en strukturerad övergång.
10. **Miljö-matrix med banner överallt utom prod** (K10) — eliminerar TEST/LIVE-blandning.

---

*End of UI-BRAINSTORM-V2-KATEGORISERAT.md*
