# Kapitel 08 — Sequential Migration Checklist

**Hur du använder denna fil:** Bocka av varje task i ordning. Block med
**"BLOCKERAR"** måste vara klart innan nästa block startar. Inom ett block
kan tasks parallelliseras om olika personer arbetar.

Vid varje task: kör `npm run build && npm run lint` lokalt; commit:a
isolerat per task så det är enkelt att rulla tillbaka.

---

## Block 0 — Förberedelser (BLOCKERAR allt nedan)

- [ ] Pull senaste `main` i `hagen-ui`-repot
- [ ] Skapa branch: `git checkout -b feat/admin-redesign-from-prototype`
- [ ] Verifiera dev-environment startar: `npm run dev` → `/admin` laddar
- [ ] Skapa `.env.local`-checklista — se till att dessa finns:
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `STRIPE_SECRET_KEY` (test)
  - [ ] `STRIPE_WEBHOOK_SECRET`
  - [ ] `RESEND_API_KEY`
- [ ] Backup av production-DB (Supabase → Database → Backups → Create snapshot)
- [ ] Läs `00_README_AND_PRINCIPLES.md` i sin helhet

---

## Block 1 — Designsystem & Layout (BLOCKERAR Block 2–5)

Källa: **`01_DESIGN_SYSTEM_AND_LAYOUT.md`**

- [ ] 1.1 Ersätt `globals.css` med HSL-variabel-blocket
- [ ] 1.2 Ersätt `tailwind.config.ts` med token-mappning
- [ ] 1.3 Verifiera `npm run build` lyckas
- [ ] 1.4 Lägg `@deprecated`-kommentar överst i `letrend-design-system.ts`
- [ ] 1.5 Installera shadcn-primitiver: `npx shadcn@latest add dialog hover-card tabs select alert-dialog button card`
- [ ] 1.6 Installera React Query om saknas: `npm i @tanstack/react-query`
- [ ] 1.7 Installera date-fns om saknas: `npm i date-fns`
- [ ] 1.8 Skapa `src/lib/admin/labels.ts` (status configs + intervalLabel)
- [ ] 1.9 Skapa `src/lib/admin/money.ts` (`sekToOre`, `oreToSek`, `formatSek`)
- [ ] 1.10 Skapa `src/lib/admin/time.ts` (`timeAgoSv`, `shortDateSv`)
- [ ] 1.11 Skapa `src/components/admin/AdminLayout.tsx` enligt mall
- [ ] 1.12 Ersätt `app/admin/layout.tsx` med auth-shell + `<QueryClientProvider>`
- [ ] 1.13 Ta bort `<Toaster />` från admin-träd (om finns)
- [ ] 1.14 Visuell QA: öppna `/admin`, jämför sidebar mot prototypen

---

## Block 2 — Backend Schema & RLS (BLOCKERAR Block 3, 5; kan ske parallellt med Block 4)

Källa: **`06_BACKEND_SCHEMA_RLS_STRIPE_TIKTOK.md`** + **`07_SQL_MIGRATIONS.sql`**

- [ ] 2.1 Granska `07_SQL_MIGRATIONS.sql` — identifiera ev. konflikter med befintligt schema
- [ ] 2.2 Kör migration mot **dev/staging** Supabase först
- [ ] 2.3 Verifiera med queries i bottnen av SQL-filen
- [ ] 2.4 Regenerera TypeScript-types: `supabase gen types typescript --project-id <id> > src/types/database.ts`
- [ ] 2.5 Verifiera `npm run typecheck` — fixa ev. nya type-errors
- [ ] 2.6 Skapa testanvändare för varje roll (admin/CM/customer); verifiera RLS ger förväntade resultat
- [ ] 2.7 Manuell sanity check: admin via klient-Supabase kan läsa `customer_profiles` med RLS aktivt
- [ ] 2.8 Kör samma migration mot **production** efter QA på staging

---

## Block 3 — API-endpoints som saknas

Källa: **`06_BACKEND_SCHEMA_RLS_STRIPE_TIKTOK.md` § 6.6**

- [ ] 3.1 Skapa `app/api/admin/customers/[id]/tiktok-stats/route.ts`
- [ ] 3.2 Skapa `app/api/admin/billing-health/log/route.ts`
- [ ] 3.3 Skapa `app/api/admin/tiktok-summary/route.ts`
- [ ] 3.4 Skapa `app/api/admin/service-costs/route.ts`
- [ ] 3.5 Skapa `app/api/admin/demos/route.ts` (kan returnera `{sent:0,converted:0}` initialt)
- [ ] 3.6 Lägg till `customer_profile_id`-filter i `app/api/admin/invoices/route.ts`
- [ ] 3.7 Lägg till `environment`-filter i `invoices` och `subscriptions` routes
- [ ] 3.8 Uppdatera `POST /api/admin/customers` för `send_invite_now`, `phone`
- [ ] 3.9 Uppdatera Zod-schemat `src/lib/schemas/customer.ts`
- [ ] 3.10 Verifiera alla endpoints svarar med rätt status och payload via curl/Postman

---

## Block 4 — Stripe Hardening (kan parallelliseras med Block 3)

Källa: **`06_BACKEND_SCHEMA_RLS_STRIPE_TIKTOK.md` § 6.3, 6.4**

- [ ] 4.1 Bekräfta `stripe.webhooks.constructEvent` används i `app/api/stripe/webhook/route.ts`
- [ ] 4.2 Lägg till idempotens-check via `stripe_processed_events`
- [ ] 4.3 Skriv till `stripe_sync_log` (success + failure) för varje event
- [ ] 4.4 Härda `sync-invoices`/`sync-subscriptions`: pagination + log-rad per körning
- [ ] 4.5 Sök upp alla `* 100`-konverteringar i `lib/stripe/*` → ersätt med `Math.round(x * 100)` eller `sekToOre()`
- [ ] 4.6 Testa webhook lokalt med `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- [ ] 4.7 Skicka samma event-ID två gånger → bekräfta idempotens
- [ ] 4.8 Skicka fel signatur → bekräfta 400

---

## Block 5 — UI-migrationer (en sida i taget; tasks inom en sida sekventiellt)

### 5.A — Overview `/admin`

Källa: **`02_OVERVIEW_PAGE.md`**

- [ ] 5.A.1 Skapa `src/hooks/admin/useOverviewData.ts`
- [ ] 5.A.2 Skapa `src/lib/admin/overview-derive.ts` (+ unit test om vitest finns)
- [ ] 5.A.3 Ersätt `app/admin/page.tsx` med ny komponent
- [ ] 5.A.4 Verifiera CM-puls renderar för ≥1 CM med riktig data
- [ ] 5.A.5 Verifiera HoverCard öppnas och visar tempo
- [ ] 5.A.6 Verifiera attention-sektion visas vid open invoices
- [ ] 5.A.7 Verifiera att `serviceCosts`/`demos` returnerar tomt utan att UI kraschar
- [ ] 5.A.8 Visuell jämförelse mot prototyp

### 5.B — Customers list & Invite

Källa: **`03_CUSTOMERS_LIST_AND_INVITE.md`**

- [ ] 5.B.1 Skapa `src/hooks/admin/useCustomers.ts`
- [ ] 5.B.2 Ersätt `app/admin/customers/page.tsx`
- [ ] 5.B.3 Skapa `src/components/admin/customers/InviteCustomerModal.tsx`
- [ ] 5.B.4 Verifiera filter (Alla/Aktiva/Pipeline/Arkiverade) fungerar
- [ ] 5.B.5 Sökning matchar både business_name och contact_email
- [ ] 5.B.6 Klick på rad navigerar till `/admin/customers/[id]`
- [ ] 5.B.7 Skapa testkund via modalen → syns i listan
- [ ] 5.B.8 Inbjudan skickas (kontrollera Resend-loggen) när `send_invite_now=true`
- [ ] 5.B.9 Stripe customer skapas (logga in på Stripe Dashboard test-miljö)

### 5.C — Customer Detail + Modaler

Källa: **`04_CUSTOMER_DETAIL_AND_MODALS.md`**

- [ ] 5.C.1 Skapa hooks: `useCustomerDetail`, `useCustomerInvoices`, `useTikTokStats`
- [ ] 5.C.2 Skapa `ChartSVG` + `smoothData`
- [ ] 5.C.3 Skapa `app/admin/customers/[id]/page.tsx` (wrapper)
- [ ] 5.C.4 Skapa `CustomerDetailView.tsx` med två-kolumns layout
- [ ] 5.C.5 Skapa `ContractEditForm.tsx`, `ContactEditForm.tsx`
- [ ] 5.C.6 Skapa `PendingInvoiceItems.tsx`
- [ ] 5.C.7 Skapa `DiscountModal.tsx` (shadcn Dialog-baserad)
- [ ] 5.C.8 Skapa `ManualInvoiceModal.tsx`
- [ ] 5.C.9 Skapa `ChangeCMModal.tsx`
- [ ] 5.C.10 Skapa `SubscriptionActions.tsx`-helper
- [ ] 5.C.11 Verifiera TikTok-sektion göms när `useTikTokStats` returnerar null
- [ ] 5.C.12 Verifiera kontraktredigering PATCH:ar och refetchar
- [ ] 5.C.13 Skapa rabatt → bekräfta i Stripe + `customer_profiles.discount_*`
- [ ] 5.C.14 Skapa manuell faktura → finalize → bekräfta i `invoices`-tabellen
- [ ] 5.C.15 Pausa subscription → status uppdateras både i Stripe och spegel
- [ ] 5.C.16 Byt CM → `account_manager_profile_id` uppdateras

### 5.D — Billing Hub

Källa: **`05_BILLING_AND_TEAM_PAGES.md` § 5.1**

- [ ] 5.D.1 Skapa `src/components/admin/billing/BillingHub.tsx`
- [ ] 5.D.2 Skapa `tabs/InvoicesTab.tsx`
- [ ] 5.D.3 Skapa `tabs/SubscriptionsTab.tsx`
- [ ] 5.D.4 Skapa `tabs/HealthTab.tsx`
- [ ] 5.D.5 Uppdatera fyra route-filer att rendera `<BillingHub initialTab=...>`
- [ ] 5.D.6 Environment-toggle (Alla/Test/Live) skickar queryparam korrekt
- [ ] 5.D.7 Manuell sync triggar route + visar spinner + refetchar
- [ ] 5.D.8 Failure-fall i sync → inline alert
- [ ] 5.D.9 Health-tab visar sync-log med korrekta tidsstämplar

### 5.E — Team-sidan

Källa: **`05_BILLING_AND_TEAM_PAGES.md` § 5.2**

- [ ] 5.E.1 Skapa `src/hooks/admin/useTeam.ts` (full aggregering)
- [ ] 5.E.2 Ersätt `app/admin/team/page.tsx`
- [ ] 5.E.3 Skapa `src/components/admin/team/CMEditDialog.tsx`
- [ ] 5.E.4 Skapa `src/components/admin/team/AddCMDialog.tsx`
- [ ] 5.E.5 ActivityBar visar hue-rotation baserat på ratio
- [ ] 5.E.6 WorkflowDots renderar korrekt antal aktiva
- [ ] 5.E.7 Klick på kund i CM-kortet → kunddetalj
- [ ] 5.E.8 CMEditDialog: spara namn/e-post/telefon/ort/bio → DB uppdateras
- [ ] 5.E.9 CMEditDialog: omfördela alla kunder → batchade PATCH:ar lyckas
- [ ] 5.E.10 AddCMDialog: skapa CM → invite-mail skickas, profil + team_members + user_roles uppdateras

---

## Block 6 — Cleanup & verifiering

- [ ] 6.1 Sök i admin-katalogen efter kvarvarande `LeTrendColors` — bör vara 0 träffar
- [ ] 6.2 Sök efter `useToast` i admin-flödet — bör vara 0 träffar
- [ ] 6.3 Sök efter handrullade modal-overlays (`position: 'fixed', inset: 0`) i admin — bör vara 0 träffar
- [ ] 6.4 Sök efter inline `style={{ background:` i admin — endast tillåtna kvar är dynamiska CM-färger
- [ ] 6.5 Sök efter `style={{ color:` i admin — endast tillåtna kvar är dynamiska
- [ ] 6.6 Verifiera att `localStorage`-baserade caches (`client-cache.ts`) inte används i admin
- [ ] 6.7 `npm run build` rent
- [ ] 6.8 `npm run lint` rent
- [ ] 6.9 `npm run typecheck` rent
- [ ] 6.10 Manuell genomgång av alla 5 admin-sidor i Chrome + Safari + Firefox
- [ ] 6.11 Mobile responsivitet — sidebaren ska kollapsa eller döljas på <1024px (om scope tillåter; annars dokumentera)
- [ ] 6.12 Lighthouse-körning på `/admin`: prestanda > 80, accessibility > 90

---

## Block 7 — Driftsättning

- [ ] 7.1 Code review av hela diffen (eller branch-by-branch om möjligt)
- [ ] 7.2 Merge till `main`
- [ ] 7.3 Deploy till staging först
- [ ] 7.4 Smoke test på staging: alla 5 admin-routes laddar; en testtransaktion (skapa kund → bjud in → skapa rabatt → skapa manuell faktura → arkivera)
- [ ] 7.5 Deploy till production
- [ ] 7.6 Övervaka `stripe_sync_log` första 24h för anomalier
- [ ] 7.7 Övervaka Sentry/error-tracking (om finns) första 48h

---

## Beroenden — visuell karta

```
Block 0 (förberedelser)
   │
   ▼
Block 1 (designsystem)  ◄── BLOCKERAR alla UI-block
   │
   ├──► Block 2 (DB + RLS)  ◄── BLOCKERAR Block 3, 5
   │       │
   │       └──► Block 3 (API endpoints)  ◄── BLOCKERAR Block 5
   │
   ├──► Block 4 (Stripe)        (parallell med 3)
   │
   ▼
Block 5 (UI-sidor)
   │
   ▼
Block 6 (cleanup)
   │
   ▼
Block 7 (deploy)
```

---

## Vid blockering

Om någon task inte går att slutföra:
1. Lägg en `// TODO(letrend-plan): <kapitel.X> — <orsak>` i koden
2. Notera i denna fil med `[BLOCKED] <task-id> — <kort orsak>`
3. Fortsätt med nästa task i samma block om möjligt
4. Återrapportera till användaren innan deploy

---

## Definition of Done

Migrationen är klar när:

- Alla checkboxar i Block 0–7 är markerade
- Visuell jämförelse `/admin`, `/admin/customers`, `/admin/customers/[id]`,
  `/admin/billing` (alla 3 tabs), `/admin/team` mot prototyp-URLen
  matchar layout/färg/typografi
- Inga regressioner i Stripe-flödet (skapa kund → invite → checkout → faktura)
- RLS verifierad med 3 testkonton
- `stripe_sync_log` har endast `status='success'` rader för senaste 24h
- Production-deploy är live och övervakad utan rollback
