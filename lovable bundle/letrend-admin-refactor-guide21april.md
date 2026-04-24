# LeTrend Admin — Customer & Billing Refactor Guide

> Målgrupp: en Codex-agent som ska bocka av punkterna sekventiellt.
> Scope: filerna i Bundle 01 (kundlistan, CustomerDetailView, fakturor,
> prisändring, CM-byte, manuell faktura, rabatt, invite + tillhörande
> `/api/admin/customers/[id]/route.ts`).
> Designspråk att hålla: samma som befintlig admin (`bg-card`, `border-border`,
> `text-muted-foreground`, `bg-secondary/30`, `rounded-lg`/`rounded-md`,
> `font-heading`, runda `StatusPill`/`MetricCard`, `Dialog` med
> `sm:max-w-{md|lg|2xl|3xl}`). Ingen ny färgpalett, inga nya font-stackar.

---

## 0. Lägesbild (varför det är spretigt och långsamt)

Sammanfattning av problem som de uppladdade filerna bevisar:

1. **Megakomponent.** `CustomerDetailView.tsx` är 1 408 rader och blandar
   datahämtning, TikTok-verifiering, attention-snooze, billing-mutationer,
   onboarding-derivering, modal-state och layout. Allt ligger i ett enda
   client-komponentträd → varje knapptryck triggar re-render av hela vyn.
2. **`invalidate()` = sprängdeg.** Funktionen i `CustomerDetailView` (rad
   172–183) invaliderar **9 query keys** efter varje mutation, inklusive
   `['admin','customers']`, `['admin','billing','subscriptions']`,
   `['admin','billing','invoices']` och `['admin','overview']`. Detta orsakar
   en kaskad av nätverksanrop efter triviala edits (t.ex. att markera en
   snooze) och är en huvudkälla till latency.
3. **Pseudo-routing via query params.** `?focus=invoices&invoice=<id>` läses
   av en `useEffect` som öppnar en modal (`CustomerDetailView` rad 124–141).
   Det är icke-delbart, går inte att djuplänka tillförlitligt och hindrar
   server-rendering.
4. **Modal-driven UX.** Faktura-, pris-, CM-byte- och rabatt-flöden bor i
   `Dialog`-modaler som alla håller egen `useState`, egen `fetch`, eget
   `setError`. Ingen återanvändbar mutation-helper finns → samma
   `try/catch/setLoading/setError`-mönster är duplicerat 8+ gånger.
5. **Fat API route.** `app/api/admin/customers/[id]/route.ts` är 1 503 rader
   och hanterar 11+ olika `body.action`-grenar (`send_invite`, `activate`,
   `resend_invite`, `reactivate_archive`, `set_temporary_coverage`,
   `cancel_subscription`, `pause_subscription`, `resume_subscription`,
   `change_subscription_price`, `change_account_manager`, …) plus PATCH för
   profildata och DELETE för arkivering. Stripe-anrop sker direkt inne i
   handlern (`stripe.products.create`, `stripe.prices.create`,
   `stripe.subscriptions.create` rad 444–504) utan idempotency keys och utan
   transaktionellt skydd när Supabase-uppdateringen misslyckas → spöken
   av Stripe-objekt vid partial failures.
6. **Skuggad typing.** Route-filen castar Supabase-klienten till `never` och
   bygger om sin egen typ-shape (rad 252–294 m.fl.) för `v_customer_buffer`,
   `attention_snoozes`, `cm_assignments`. Det betyder att dessa tabeller/views
   **inte är genererade i `database.types`** — typgenereringen är ur synk.
7. **Stripe-sync läcker till klient.** `SubscriptionPriceChangeModal` POSTar
   till `/subscription-preview`, sedan PATCHar `/customers/[id]` med
   `change_subscription_price`. Två endpoints, två validations, ingen
   "execute the previewed plan"-kontrakt → race conditions om priset
   ändras mellan preview och commit.
8. **Onboarding-derivering körs på klienten varje render** (`page.tsx` rad
   193–276 itererar `enrichedCustomers` och beräknar `blocking`,
   `onboardingState`, `bufferStatus` för varje kund vid varje filter-/sök-
   tangenttryck). På 25 kunder är det ok, på 500+ blir det märkbart.
9. **Säkerhetslucker.** PATCH-handlern litar på `body.action` utan
   per-action `requireAdminScope` förutom på `cancel_subscription` (rad
   922–927). Övriga billing-actions (pause/resume/price change) kan triggas
   av vilken admin som helst.
10. **TikTok profile-fetch är synkron i UI.** `handleFetchTikTokProfile` (rad
    288–323) blockar knappen, ingen optimistic state, ingen progress.
    Användaren ser bara "Hämtar...".

Detta dokument bryter ned åtgärden i **9 faser**. Varje fas är en checkpoint:
ingen fas ska påbörjas innan föregående är committad och appen builder grönt.

---

## Faspolicy (gäller alla faser)

- **En fas = en PR.** Inga blandade refaktoreringar.
- **Inga visuella förändringar** i fas 1–4 utöver flytt av redan existerande
  markup. Designtokens, färger, spacing och kopia ska vara identiska efter
  diff. Visuell polering sker först i **fas 7**.
- Efter varje fas: kör `pnpm typecheck && pnpm lint && pnpm build` (eller
  motsvarande). Kör `next build` minst en gång per fas för att fånga
  server/client-boundary-fel.
- Skriv **inga nya `useEffect` som synkar URL ↔ state** — använd Next.js
  App Router segment och `parallel routes` istället (se fas 3).
- Alla nya filer i `src/lib/admin/billing/**` är **server-only** (`import
  'server-only'` på toppen). Klientkomponenter får aldrig importera dem.

---

## Fas 1 — Stabilisera typgenerering och delade kontrakt

**Mål:** Få bort `as never`-castningar och centralisera schema-validering.

1. Kör `supabase gen types typescript --linked > src/types/database.ts`
   (eller motsvarande befintligt skript). Säkerställ att följande tabeller/
   views finns i outputen: `v_customer_buffer`, `attention_snoozes`,
   `cm_assignments`, `cm_absences`, `customer_profiles`,
   `subscription_mirror`, `invoices`, `invoice_line_items`, `credit_notes`,
   `refunds`. Om någon saknas → lägg till den i Supabase-migreringen
   (det är bevis på att view/table inte är committad i schemat).
2. Skapa `src/lib/admin/schemas/customer-actions.ts` och flytta in **alla**
   Zod-scheman från `route.ts` rad 49–104 (pause, cancel, change price,
   change CM, resend invite, reactivate, set temporary coverage). Exportera
   en discriminated union:
   ```ts
   export const customerActionSchema = z.discriminatedUnion('action', [
     pauseSubscriptionActionSchema,
     cancelSubscriptionActionSchema,
     changeSubscriptionPriceActionSchema,
     changeAccountManagerActionSchema,
     resendInviteActionSchema,
     reactivateArchiveActionSchema,
     setTemporaryCoverageActionSchema,
     // ... + send_invite, activate, send_reminder, resume_subscription
   ]);
   export type CustomerAction = z.infer<typeof customerActionSchema>;
   ```
3. Importera samma schema i klienten (modaler) så payloaden valideras innan
   `fetch`. Tag bort fritextade `body: JSON.stringify({ action: 'X', ... })`
   till förmån för `customerActionSchema.parse(...)`.
4. Skapa `src/lib/admin/api-client.ts` med:
   ```ts
   export async function callCustomerAction(
     id: string,
     payload: CustomerAction,
   ): Promise<CustomerActionResult> { /* fetch + parse + typed errors */ }
   ```
   Returnera `{ ok: true, profile } | { ok: false, error, status }` så
   modaler slipper egen `try/catch`.

**Acceptance:** Inga `as never` kvar i `route.ts`. Alla modaler kallar
`callCustomerAction` istället för rå `fetch`.

---

## Fas 2 — Bryt upp API-routen i action-handlers

**Mål:** Ersätt 1 503-radig `route.ts` med tunna routers + en handler per
action.

1. Skapa katalog `src/lib/admin/customer-actions/` med en fil per action:
   `send-invite.ts`, `resend-invite.ts`, `activate.ts`, `reactivate.ts`,
   `pause-subscription.ts`, `resume-subscription.ts`,
   `cancel-subscription.ts`, `change-subscription-price.ts`,
   `change-account-manager.ts`, `set-temporary-coverage.ts`. Varje fil
   exporterar:
   ```ts
   export async function handleX(ctx: AdminActionContext, input: XInput):
     Promise<XResult> { ... }
   ```
   där `AdminActionContext = { user, supabaseAdmin, stripe, beforeProfile, id }`.
2. Skapa `src/lib/admin/customer-actions/dispatcher.ts`:
   ```ts
   export async function dispatchCustomerAction(ctx, body) {
     const parsed = customerActionSchema.safeParse(body);
     if (!parsed.success) return validationError(parsed.error);
     switch (parsed.data.action) {
       case 'send_invite': return handleSendInvite(ctx, parsed.data);
       case 'change_subscription_price':
         requireAdminScope(ctx.user, 'admin'); // se fas 8
         return handleChangeSubscriptionPrice(ctx, parsed.data);
       // ...
     }
   }
   ```
3. Refaktorera `app/api/admin/customers/[id]/route.ts` till **endast**:
   - `GET`: behåll, men flytta data-aggregation (profile + buffer + snoozes
     + coverage) till `src/lib/admin/customer-detail/load.ts`.
   - `PATCH`: bygg `ctx`, kalla `dispatchCustomerAction`. Maxlängd: 60 rader.
   - `DELETE`: behåll arkiveringslogik som idag men flytta logiken till
     `src/lib/admin/customer-actions/archive.ts`.
4. **Stripe-säkerhet.** I `handleSendInvite` (motsvarar nuvarande rad
   379–633), gör om sekvensen till en idempotent saga:
   - Generera `idempotencyKey = `invite:${customerProfileId}:${attemptNonce}``
     från en kolumn `customer_profiles.invite_attempt_nonce` (skapa
     migration). Skicka som `idempotencyKey` till varje `stripe.*.create`.
   - Om `subscription`-skapet kastar: rulla tillbaka **både** product och
     customer (idag rullas bara customer tillbaka, rad 509–516).
   - Om Supabase-`update` på `customer_profiles` failar efter att Stripe
     skapats: persistera Stripe-IDn i en `pending_stripe_attachments`-tabell
     så vi inte blir av med dem. Logga `admin.invite.partial_failure` i
     audit-loggen.
5. Lägg till `requireAdminScope(user, 'admin')` på **alla** mutationsvägar
   som idag bara har `validateApiRequest(request, ['admin'])`. Behåll
   `'super_admin'` på cancel/credit-flöden.

**Acceptance:** `route.ts` < 200 rader. Varje action-handler ≤ 200 rader,
har egen unit-test (lägg under `src/lib/admin/customer-actions/__tests__/`).

---

## Fas 3 — Riktiga subroutes istället för `?focus=&invoice=`

**Mål:** Ersätt query-param-baserad pseudo-navigation med Next.js App Router
segments + parallel routes. Det löser scroll, deep-link och prefetch.

1. Ny struktur (under `app/admin/customers/[id]/`):
   ```
   layout.tsx           // header (namn, status pill, "Tillbaka") + tabs
   page.tsx             // overview = TikTok + Operativ status
   contract/page.tsx    // Avtal & Prissättning + ContractEditForm
   billing/page.tsx     // Fakturahistorik + nästkommande faktura
   billing/[invoiceId]/page.tsx  // ersätter InvoiceOperationsModal
   subscription/page.tsx         // pris/paus/cancel actions
   subscription/price/page.tsx   // ersätter SubscriptionPriceChangeModal
   team/page.tsx                 // CM, coverage, change CM
   team/change/page.tsx          // ersätter ChangeCMModal
   activity/page.tsx             // audit + activity log
   ```
2. Tabbarna i `layout.tsx`:
   ```tsx
   const tabs = [
     { href: '', label: 'Översikt' },
     { href: '/contract', label: 'Avtal' },
     { href: '/billing', label: 'Fakturor' },
     { href: '/subscription', label: 'Abonnemang' },
     { href: '/team', label: 'Team' },
     { href: '/activity', label: 'Aktivitet' },
   ];
   ```
   Använd samma pill-stil som `customerStatusConfig` så det matchar admin-
   designspråket. Ingen ny komponent — återanvänd existerande `StatusPill`/
   knappstilar.
3. Modaler blir **subroutes** med `parallel routes` så att djuplänk
   `/admin/customers/abc/billing/inv_123` öppnar fakturadetaljen som en
   side-panel/sheet ovanpå listan (intercepting routes pattern):
   `app/admin/customers/[id]/billing/@modal/(.)[invoiceId]/page.tsx`.
   Använd `<Sheet>`-varianten av befintlig `Dialog`-stil (samma rounding,
   samma `bg-card`).
4. Tag bort `searchParams` `focus`, `invoice`, `from` från
   `CustomerDetailView`. Backknappen i layouten använder router historia,
   med fallback till `/admin/customers`.
5. Migrationsskript: lägg till en tillfällig `/admin/customers/[id]/page.tsx`
   redirect: om `?focus=X` eller `?invoice=Y` finns i URL, redirecta till
   motsvarande subroute. Tag bort efter en sprint.

**Acceptance:** Inga `useEffect` som lyssnar på `searchParams` i
customer-detail. Hard reload på `/admin/customers/abc/billing/inv_123`
öppnar både listan, kunddetaljen och fakturapanelen.

---

## Fas 4 — Bryt upp `CustomerDetailView` per sektion

**Mål:** Gå från 1 408 rader till ≤ 200 rader per komponent.

1. Skapa `src/components/admin/customers/sections/`:
   - `TikTokStatsSection.tsx` (rad 590–683)
   - `ContractSection.tsx` (rad 685–733)
   - `UpcomingInvoiceSection.tsx` (rad 735–757)
   - `InvoiceHistorySection.tsx` (rad 759–815)
   - `OperationalStatusSection.tsx` (rad 819–~990)
   - `AccountManagerSection.tsx`
   - `AttentionPanel.tsx` (snooze, planerad paus, klistermärken)
2. Varje sektion:
   - Tar emot `customerId` (string), inte hela `customer`-objektet.
   - Hämtar **endast sin egen data** via `useSuspenseQuery` med eget queryKey.
   - Har `<Suspense fallback={<SectionSkeleton/>}>`-wrapper i förälder.
   - Har egen `errorBoundary` som visar samma `bg-destructive/5`-kort som
     idag.
3. **Server Components där möjligt.** Sektioner som inte kräver klientstate
   (TikTok-statistik, fakturahistorik) ska bli `async function` Server
   Components som kallar `loadX()` direkt med `supabaseAdmin` (kör i
   `app/admin/customers/[id]/.../page.tsx`). Modaler/edit-vyer förblir
   `'use client'`.
4. Centralisera "derive"-logiken (blocking, onboarding, buffer) till
   `src/lib/admin-derive/index.server.ts` och kalla i Server Components.
   Tag bort den client-side beräkningen i `page.tsx` rad 193–276 (se fas 5).

**Acceptance:** `CustomerDetailView` finns inte längre. Layouten i
`app/admin/customers/[id]/layout.tsx` består av header + tabs + `{children}`.

---

## Fas 5 — Kundlistan: server-side sök/filter/sort + virtualisering

**Mål:** Sluta beräkna `enrichedCustomers` i klienten varje render.

1. Flytta `enrichedCustomers`-pipelinen (rad 193–276 i `page.tsx`) till en
   PostgreSQL-vy `v_admin_customer_list`:
   ```sql
   create or replace view v_admin_customer_list as
   select
     cp.*,
     b.last_published_at,
     b.latest_planned_publish_date,
     -- ...derive blocking_state, onboarding_state, buffer_status här
   from customer_profiles cp
   left join v_customer_buffer b on b.customer_id = cp.id;
   ```
   Eller om Postgres-derivering är för komplex: gör derivering i en
   server-action `loadAdminCustomers({ search, filter, sort, page })` som
   returnerar **redan paginerad** data + `total`.
2. Skapa `app/admin/customers/page.tsx` som **Server Component**. Läs
   `searchParams` direkt på servern och anropa `loadAdminCustomers`. Ingen
   `useCustomers`-hook längre på klienten.
3. Klienten får en liten `<CustomersTable rows={...} total={...}>` som
   virtualiserar med `@tanstack/react-virtual` (krävs när >200 rader).
   Filter/sök/sort uppdateras via `<form>` + `router.replace` (samma
   pattern men nu serverdrivet).
4. CSV-export: gör om till en server route `app/api/admin/customers/export/
   route.ts` som streamar CSV (`Response` med `text/csv`-stream). Klienten
   triggar bara nedladdningen — slipper hålla 500+ rader i minnet.
5. Tag bort `SCROLL_STATE_PREFIX` och `sessionStorage`-pattern (rad 23, 174–
   191). Next.js bevarar scroll automatiskt i App Router när man använder
   `<Link scroll={false}>` på listraderna.

**Acceptance:** Filter- och sökändring genererar **noll** klient-side
fetch utöver navigeringen. Time-to-interactive på `/admin/customers`
under 600 ms på cold cache enligt Lighthouse.

---

## Fas 6 — Centraliserad mutation- och cache-strategi

**Mål:** Få bort den "alla query-keys invalideras"-bomben i
`CustomerDetailView.invalidate()`.

1. Skapa `src/hooks/admin/useCustomerMutation.ts`:
   ```ts
   export function useCustomerMutation<TInput, TOutput>(
     action: CustomerAction['action'],
     options?: { invalidates?: QueryKey[] }
   ) {
     const qc = useQueryClient();
     return useMutation({
       mutationFn: (input) => callCustomerAction(customerId, { action, ...input }),
       onSuccess: (_data, _input, ctx) => {
         (options?.invalidates ?? defaultInvalidatesFor(action)).forEach(
           (key) => qc.invalidateQueries({ queryKey: key }),
         );
       },
     });
   }
   ```
2. Definiera `defaultInvalidatesFor` i `src/hooks/admin/cache-keys.ts` så
   varje action **bara** invaliderar det den faktiskt påverkar:
   - `change_subscription_price` → `['customer', id]`,
     `['customer', id, 'invoices']`, `['customer', id, 'subscription']`.
     **Inte** `['admin','customers']` (priset är inte i listan), **inte**
     `['admin','overview']` (overview hämtas via separat SSR-revalidate).
   - `pause_subscription` → `['customer', id]`,
     `['customer', id, 'subscription']`.
   - `change_account_manager` → `['customer', id]`, `['admin','customers']`
     (för CM-kolumnen i listan).
   - `attention_snooze_*` → `['customer', id, 'attention']` only.
3. Lägg till `router.refresh()` (Next.js) **istället för**
   query-invalidation när data hämtas via Server Components (fas 4).
4. För realtids-uppdatering av Stripe-events: lägg till en Supabase realtime-
   prenumeration i `app/admin/customers/[id]/layout.tsx` på
   `subscription_mirror` och `invoices`-tabellerna **för aktuell kund**
   (filter `customer_profile_id=eq.${id}`). När en webhook har skrivit klart
   triggas `router.refresh()` automatiskt → ingen polling, ingen
   query-spam.
5. Ersätt all `setLoading/setError`-state i modaler med `useMutation`s
   `isPending`/`error`. Tag bort duplicerad pattern i `DiscountModal`,
   `ManualInvoiceModal`, `ChangeCMModal`, `SubscriptionPriceChangeModal`,
   `InvoiceOperationsModal`, `InviteCustomerModal`.

**Acceptance:** `grep -r "invalidateQueries" src/components/admin` ger
0 träffar. All invalidation går via `useCustomerMutation`.

---

## Fas 7 — UI-stramning (designspråk-trogen polering)

**Mål:** Tightare admin-känsla utan att bryta nuvarande visuella språk.

Regler för bibehållet språk:
- Behåll `font-heading` på rubriker, `text-foreground` / `text-muted-foreground`.
- Behåll `bg-card` korten med `border-border` och `rounded-lg`.
- Behåll `bg-secondary/30` för sekundära paneler.
- Behåll pill-stilen `rounded-full px-3 py-1.5 text-xs font-semibold`.
- Behåll Dialog-storlekar (`sm:max-w-md|2xl|3xl`).
- **Inga nya färger.** Tona inte upp success/warning/destructive på nya
  ställen utan att de finns i `customerStatusConfig` redan.

Konkreta poleringar:

1. **Header-zon i kunddetaljen.** Lägg pill-statusen i en sticky topbar med
   `border-b border-border bg-background/80 backdrop-blur` när tabs scrollar
   förbi. Samma toolbar-pattern som `/admin`. Ingen ny färg behövs.
2. **Fakturarader.** I `InvoiceOperationsModal`-ersättaren (nu route),
   konvertera radio-listan (rad 240–270) till en `Table` (`@/components/ui/
   table`) med kolumner Beskrivning / Period / Belopp / Val. Behåll
   `border-border`, `bg-card`. Borttag av "klickbar hela raden"-pattern →
   tydligare hit target.
3. **Pris-preview.** I subscription/price-route, visa diff (gammalt → nytt)
   som en `<div className="flex items-baseline gap-2">` med strikethrough
   på gammalt pris och `text-success`/`text-warning` på nytt beroende av
   delta-tecken. Använd existerande tokens.
4. **Empty states.** Lägg en delad `<EmptyState icon=… title=… hint=… />`
   i `src/components/admin/EmptyState.tsx`. Använd den i fakturahistorik,
   pending items, audit log. Idag är det en `<p className="text-sm
   text-muted-foreground">Inga fakturor ännu.</p>` på 3+ ställen.
5. **Skeletons istället för "Laddar…"-text** på alla sektioner. Behåll
   ordet "Laddar…" som fallback för error-cases bara. Använd `<Skeleton/>`
   från `components/ui/skeleton`.
6. **Bekräftelser inline istället för modaler** för låg-risk-actions
   (snooze, planerad paus). Använd en liten popover med "Är du säker?"
   pattern istället för full Dialog.
7. **Action-grupper i kunddetaljen.** Idag finns "Skicka inbjudan",
   "Återaktivera", "Ändra CM", "Pris", "Paus", "Avsluta" som lösa knappar.
   Gruppera i en `Card` med rubrik "Snabbåtgärder" och en sekundär `Card`
   "Faroområde" (cancel, archive) — samma `border-destructive/30`-pattern
   som redan används i error states.

---

## Fas 8 — Behörigheter, audit och idempotency

**Mål:** Få in kontroller som krävs för prod.

1. Lägg till `src/lib/auth/admin-scopes.ts` med en explicit policy-tabell:
   ```ts
   export const adminActionPolicy = {
     send_invite:                'admin',
     resend_invite:              'admin',
     activate:                   'admin',
     reactivate_archive:         'admin',
     change_account_manager:     'admin',
     set_temporary_coverage:     'admin',
     pause_subscription:         'admin',
     resume_subscription:        'admin',
     change_subscription_price:  'super_admin', // pris berör Stripe
     cancel_subscription:        'super_admin',
     archive_customer:           'super_admin',
   } as const;
   ```
   I `dispatcher.ts`: `requireAdminScope(ctx.user, adminActionPolicy[parsed.data.action])`.
2. Lägg till `recordAuditLog` på **alla** PATCH-actions (idag saknas det
   bl.a. på `pause_subscription`-grenen baserat på radspannet jag granskat).
   Standardisera metadata: `{ stripe_event_id?, idempotency_key?,
   customer_profile_id }`.
3. Lägg till idempotency på alla Stripe-mutationer:
   ```ts
   await stripe.subscriptions.update(subId, { ... }, {
     idempotencyKey: `cust-${id}:price-change:${requestId}`,
   });
   ```
   `requestId` kommer från en `x-request-id`-header som klienten genererar
   när modal öppnas (UUIDv4) och skickas med PATCH. Förhindrar dubbla
   debiteringar vid double-click.
4. Lägg till en serverside lock per kund-action genom Postgres advisory
   lock (`pg_try_advisory_xact_lock(hashtext('cust:'||id||':billing'))`)
   inuti `handleChangeSubscriptionPrice`, `handlePauseSubscription`,
   `handleCancelSubscription`. Returnera 409 om låset inte tas → klienten
   får visa "En annan ändring pågår, försök igen om en stund."

---

## Fas 9 — Latency-jakt (mätbara mål för prod)

**Mål:** Time-to-interactive på `/admin/customers` och
`/admin/customers/[id]` < 800 ms p75.

Konkreta åtgärder, prioriterad ordning:

1. **N+1 i GET `/api/admin/customers/[id]`.** Idag körs `Promise.all` med
   4 parallella queries (rad 245–300) — bra. Men `listEnrichedCmAbsences`
   kör en egen kedja som troligen är ytterligare 2–3 queries. Ersätt med
   en enda RPC `admin_get_customer_detail(p_id uuid)` som returnerar JSON.
2. **TikTok-data lazy.** Flytta TikTok-anrop bakom `<Suspense>` så
   resterande sektioner renderas direkt även om TikTok är långsam.
3. **`/api/admin/customers/[id]/subscription-preview`** caches inte. Lägg
   `Cache-Control: private, max-age=10` när inputen (price + mode) är
   stabil. Ger snabb feedback om användaren klickar "Förhandsvisa" två ggr.
4. **Stripe-anrop i bakgrunden.** I `change_account_manager`-flödet kallas
   `syncCustomerAssignmentFromProfile` + `syncOperationalSubscriptionState`
   sekventiellt efter Supabase-update. Lägg dem i en bakgrundsjobb-kö
   (Inngest, Trigger.dev, eller en enkel `setTimeout`+redis-lock). UI
   behöver inte vänta på Stripe för att ge OK på CM-byte.
5. **Prefetch hover.** På kundlist-raden, `<Link prefetch>` till
   `/admin/customers/[id]` så hover-pause känns instant.
6. **React Query stale-times.** Sätt `staleTime: 30_000` på
   `['admin','customer', id, 'tiktok']` (data ändras max 1 ggr/dygn) och
   `staleTime: 60_000` på `['admin','customers']` (lista). Idag är det
   troligen `0` → onödiga refetches på fokusbyte.
7. **Bundla Stripe.js bara på sidor som behöver det.** Importera dynamiskt
   i de subroutes som kör betalningsförfaranden. Lyft inte Stripe SDK i
   admin-shell.
8. **Postgres-index-check.** Kör `EXPLAIN ANALYZE` på:
   - `select * from customer_profiles order by created_at desc limit 25`
   - join mot `v_customer_buffer`
   - `attention_snoozes where subject_id = $1 and released_at is null`
   Säkerställ index på `customer_profiles(created_at desc)`,
   `attention_snoozes(subject_id, released_at)`,
   `cm_assignments(customer_id) where valid_to is null`.

---

## Bilaga A — Migrations-skiss (Supabase)

Lägg under `supabase/migrations/<ts>_admin_refactor.sql`:

```sql
-- Idempotency-stöd för invite/billing
alter table customer_profiles
  add column if not exists invite_attempt_nonce uuid default gen_random_uuid();

create table if not exists pending_stripe_attachments (
  id uuid primary key default gen_random_uuid(),
  customer_profile_id uuid not null references customer_profiles(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_product_id text,
  stripe_price_id text,
  reason text not null,
  created_at timestamptz not null default now()
);

-- Index för listsidan
create index if not exists customer_profiles_created_at_desc
  on customer_profiles (created_at desc);

create index if not exists attention_snoozes_subject_active
  on attention_snoozes (subject_id) where released_at is null;

-- View för listsidan (om derivering ska ligga i Postgres)
create or replace view v_admin_customer_list as
select
  cp.id, cp.business_name, cp.contact_email, cp.status,
  cp.account_manager, cp.account_manager_profile_id,
  cp.monthly_price, cp.subscription_interval, cp.pricing_status,
  cp.tiktok_handle, cp.next_invoice_date, cp.created_at,
  cp.paused_until, cp.agreed_at, cp.onboarding_state,
  cp.onboarding_state_changed_at, cp.expected_concepts_per_week,
  b.last_published_at, b.latest_planned_publish_date
from customer_profiles cp
left join v_customer_buffer b on b.customer_id = cp.id;
```

---

## Bilaga B — Filmappning (vad blir vad)

| Idag | Efter refaktor |
|------|----------------|
| `app/admin/customers/page.tsx` (Client) | `app/admin/customers/page.tsx` (Server) + `customers-table.client.tsx` |
| `components/admin/customers/CustomerDetailView.tsx` | `app/admin/customers/[id]/layout.tsx` + 6 section-komponenter |
| `components/admin/customers/InviteCustomerModal.tsx` | `app/admin/customers/invite/page.tsx` (route med Sheet) |
| `components/admin/customers/modals/ChangeCMModal.tsx` | `app/admin/customers/[id]/team/change/page.tsx` |
| `components/admin/customers/modals/DiscountModal.tsx` | `app/admin/customers/[id]/billing/discount/page.tsx` |
| `components/admin/customers/modals/ManualInvoiceModal.tsx` | `app/admin/customers/[id]/billing/new-invoice/page.tsx` |
| `components/admin/billing/InvoiceOperationsModal.tsx` | `app/admin/customers/[id]/billing/[invoiceId]/page.tsx` |
| `components/admin/billing/SubscriptionPriceChangeModal.tsx` | `app/admin/customers/[id]/subscription/price/page.tsx` |
| `app/api/admin/customers/[id]/route.ts` (1503 rader) | `route.ts` (~150 rader) + `lib/admin/customer-actions/*` (10 filer) |

---

## Bilaga C — Test-checklista per fas

Varje fas ska verifieras manuellt + automatiskt:

- **Fas 1:** `pnpm typecheck` ger 0 fel. Modaler kompilerar utan
  `as never`.
- **Fas 2:** `vitest run src/lib/admin/customer-actions` har minst en test
  per action. Manuellt: kör invite, resend, activate, pause, resume,
  cancel, change price, change CM mot stagingdata.
- **Fas 3:** Hard reload på `/admin/customers/<id>/billing/<invoiceId>`
  visar fakturapanelen. Browser-back stänger panelen utan att tappa lista.
- **Fas 4:** `wc -l src/components/admin/customers/sections/*.tsx` visar
  ingen fil > 250 rader.
- **Fas 5:** Lighthouse på `/admin/customers` (med 500 mock-kunder)
  TTI < 600 ms, INP < 200 ms vid filterklick.
- **Fas 6:** Network-tab efter en `change_subscription_price`-action
  visar **bara** GET för `customer/[id]` och `customer/[id]/subscription`
  — inte hela admin-overview.
- **Fas 7:** Visuell diff mot baseline screenshots — inga oavsiktliga
  färgförändringar, samma typografi, samma spacing.
- **Fas 8:** En icke-super-admin får 403 vid försök till
  `change_subscription_price`. Dubbelklick på "Spara pris" skapar bara
  **en** subscription update i Stripe (verifieras via Stripe Dashboard
  events).
- **Fas 9:** P75 latency-mål uppnådda i Vercel Analytics / egen RUM.

---

## Sammanfattning för Codex

Bocka av faserna i ordning. Varje fas är en självständig PR. Varje fas
**får inte** påbörjas innan föregående är committad och buildar grönt.
Visuell polering (fas 7) kommer **efter** den strukturella refaktoren —
försök inte göra båda samtidigt, då blir diffar omöjliga att granska.

Designspråket från `/admin` och `/admin/customers` är källan till sanning:
återanvänd existerande tokens (`bg-card`, `border-border`,
`text-muted-foreground`, `bg-secondary/30`, `font-heading`, pill-stilen,
Dialog-storlekarna). Inga nya färgvariabler, inga nya font-imports.

Slutmål: prod-redo admin-shell där en mutation = ett API-anrop =
en idempotent Stripe-operation = en riktad cache-invalidation =
en server-rerender, utan klient-side derive-loopar och utan
megamodaler.
