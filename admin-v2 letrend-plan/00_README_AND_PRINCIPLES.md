# LeTrend Admin Migration Plan — README & Principles

**Mål:** Ta originalrepot `hagen-ui` (Next.js App Router) från dess nuvarande
`/admin`-implementation till samma utseende, interaktionsmönster och
funktionsdjup som Lovable-prototypen (`f39022e0-ec0c-4be8-aee0-cbb5fe185872`),
samtidigt som befintlig backend (Supabase + Stripe) städas upp och solidifieras.

> Prototypen är **mall för UI/UX**. Originalrepot är **källan för data,
> auth, Stripe-integration och produktionsdrift**. Migrationsplanen handlar
> alltså om: (a) byta ut prototypens mock-data mot riktig data, och (b) byta
> ut originalets nuvarande UI mot prototypens UI — utan att förlora någon
> backend-funktionalitet.

---

## Hur planen är uppdelad

Sekventiell — bocka av i ordning. Senare kapitel förutsätter att tidigare är
klara.

| # | Fil | Scope |
|---|-----|-------|
| 00 | `00_README_AND_PRINCIPLES.md` | (denna) — läs först |
| 01 | `01_DESIGN_SYSTEM_AND_LAYOUT.md` | Tailwind-tokens, font, layout-shell, sidebar, ersätt `letrend-design-system.ts` inline-styles |
| 02 | `02_OVERVIEW_PAGE.md` | `/admin` — CM-puls, frequency bars, hover cards, kostnader, attention, MetricCards |
| 03 | `03_CUSTOMERS_LIST_AND_INVITE.md` | `/admin/customers` + InviteCustomerWizard (3-stegs) → 1-vy modal |
| 04 | `04_CUSTOMER_DETAIL_AND_MODALS.md` | `/admin/customers/[id]` + Discount/ManualInvoice/PendingItems-modaler + TikTok-grafer (smoothing) |
| 05 | `05_BILLING_AND_TEAM_PAGES.md` | `/admin/billing` (slå ihop invoices+subs+health i tabs), `/admin/team` (CM-puls, redigera-modal, omfördelning) |
| 06 | `06_BACKEND_SCHEMA_RLS_STRIPE_TIKTOK.md` | Schema-additions, RLS, Stripe webhook hardening, ny `tiktok_stats`-tabell, `cm_activities`-fyllning, edge functions |
| 07 | `07_SQL_MIGRATIONS.sql` | Klar att klistra in i Supabase SQL editor (idempotent) |
| 08 | `08_SEQUENTIAL_CHECKLIST.md` | Master-todolista med beroenden — agenten bockar av här |

---

## Genomgripande principer (gäller ALLA kapitel)

### 1. Tailwind-tokens, INTE `letrend-design-system.ts` inline-styles

Originalets sidor är spaghettifyllda av `style={{ background: LeTrendColors.brownDark, ... }}`.
**Allt sådant ska bort.** Designsystemet flyttas in i `tailwind.config.ts` +
`globals.css` som CSS-variabler i HSL, och komponenter använder semantiska
klasser (`bg-primary`, `text-muted-foreground`, `border-border`).

Den enda tillåtna inline-style i ett komponent-tree efter migrationen är
dynamiska värden som inte kan uttryckas som klass (CM avatar-färg från DB,
chart-bredd, hue-rotation i ActivityBar). I de fallen sätt
`style={{ backgroundColor: cm.color }}` — aldrig hårdkodade hex.

Se kapitel 01 för fullständig token-tabell + diff för `tailwind.config.ts`.

### 2. shadcn/ui som modal- och primitiv-bas

Originalet har handrullade `<div style={{ position:'fixed', inset:0, ... }}>`
modaler. **Ersätt med `@/components/ui/dialog`** (shadcn). Detta ger
focus-trap, ESC-stäng, overlay, accessibility gratis, och designen bli
identisk med prototypen.

Hover-cards (CM-puls, MRR-tooltip): använd `@/components/ui/hover-card`.
Tabs (billing-hub): använd `@/components/ui/tabs`.
Toasts: **anv inte**. Använd inline alerts (se princip 4).

Om shadcn-primitiverna saknas i originalrepot, lägg till dem via
`npx shadcn@latest add dialog hover-card tabs select` och porta in
prototypens `index.css` HSL-variabler (kapitel 01).

### 3. Server state via TanStack Query, INTE handrullad cache

Originalet har en custom `client-cache.ts` med `fetchAndCacheClient`. Detta
fungerar men är unikt för admin-overview. **Ersätt med React Query**
(`@tanstack/react-query`, redan installerad i originalrepot via shadcn-stacken
om inte annan setup). Gör en `<QueryClientProvider>` i `app/admin/layout.tsx`.

Fördelar:
- Stale-while-revalidate gratis
- Refetch on focus/reconnect
- Inga manuella `localStorage`-skrivningar
- Mutationer (rabatt, manuell faktura) invaliderar berörda queries
  → UI uppdateras direkt utan manuell `load()`-anrop

### 4. Inline alerts, ALDRIG toasts/popups

Prototypens designprincip (se `mem://index.md` Core): inga toasts. Fel,
varningar och bekräftelser visas **inline** i samma kort/modal/sektion där
användaren agerade. Använd ett `Alert`-mönster:

```tsx
{error && (
  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
    {error}
  </div>
)}
{successMessage && (
  <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
    {successMessage}
  </div>
)}
```

Originalets `<Toaster />` och `useToast`-anrop ska tas bort i admin-flödet.
(Behåll dem ev. för Studio/Customer-flöden om de används där — påverkas inte
av denna plan.)

### 5. Svensk UI

All copy på svenska, inklusive felmeddelanden, knappetiketter, status-pills.
Datum/valuta: `toLocaleDateString('sv-SE')`, `toLocaleString('sv-SE', { style:'currency', currency:'SEK', minimumFractionDigits:0 })`.
Behåll prototypens `intervalLabel`, `statusConfig`, `statusLabel`-helpers
(kopiera dem 1:1 till en delad fil `src/lib/admin/labels.ts`).

### 6. Ingen `'use client'` ovanpå pages som inte behöver state

Pages som bara hämtar och renderar data ska vara **Server Components** med
`async`. Klienthooks (`useState`, `useEffect`) flyttas ut i barnkomponenter
markerade `'use client'`. Detta sparar bundle-storlek och låter Next streama.

Undantag: prototypens hela `/admin`-yta använder sig av klient-state och
React Query. Pragmatiskt OK att hålla `'use client'` på sidnivå tills vidare
— men markera som teknisk skuld i 08-checklistan.

### 7. Penningenheter

**Stripe arbetar i öre/cents.** Allt internt och i DB lagras som heltal i
öre. UI visar `(amount / 100).toLocaleString('sv-SE') + ' kr'`. Aldrig
`monthly_price * 100` när Stripe-API anropas — gör konverteringen i en
helper:

```ts
// src/lib/admin/money.ts
export const sekToOre = (sek: number) => Math.round(sek * 100);
export const oreToSek = (ore: number) => ore / 100;
export const formatSek = (ore: number) =>
  oreToSek(ore).toLocaleString('sv-SE', { style:'currency', currency:'SEK', minimumFractionDigits:0 });
```

Använd dessa konsekvent. Originalet har spridda `* 100`-beräkningar — sök
upp och ersätt.

### 8. Datum-konvention

Använd `date-fns` (lägg till om saknas). Lagra alltid som `timestamptz` i
DB. UI-helpers:

```ts
// src/lib/admin/time.ts
import { formatDistanceToNow, format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';

export const timeAgoSv = (iso: string | null) =>
  iso ? formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: sv }) : '—';
export const shortDateSv = (iso: string | null) =>
  iso ? format(parseISO(iso), 'd MMM', { locale: sv }) : '—';
```

Plocka bort prototypens hårdkodade `new Date("2026-04-15T12:00:00Z")` —
den existerar bara för att mock-data är frusen i tid. I produktion: `new Date()`.

### 9. Auth & access control oförändrat

Bibehåll originalets `middleware.ts`, `withAuth`, `validateApiRequest`,
`resolveAppRole`. **Lägg inte till nya auth-mönster.** Alla nya API-routes
i denna plan ska wrappas i `withAuth(['admin'])`.

### 10. Säkerhet — kontroller som MÅSTE göras

- Aldrig läs/skriv `customer_profiles` direkt från klient utan RLS-policy
  som kontrollerar `has_role(auth.uid(), 'admin')`. Originalet läser
  customers via `supabase` browser-klient — det fungerar bara om RLS finns.
  Om saknas: lägg till (se kapitel 06).
- Service role key (`SUPABASE_SERVICE_ROLE_KEY`) får ALDRIG nå klienten.
  Endast `src/lib/server/supabase-admin.ts` instansierar admin-klienten.
- Stripe secret key (`STRIPE_SECRET_KEY`) endast i route handlers och
  `src/lib/stripe/*`. Webhook-endpoint måste verifiera signatur (originalet
  gör detta — bekräfta).
- TikTok API-credentials (om sådana används) i edge function, ej i klient.

---

## Kommande agentens arbetsflöde

1. **Läs `00_README` (denna) + `08_SEQUENTIAL_CHECKLIST` först.**
2. För varje kryssruta i 08: öppna motsvarande kapitel, läs hela det
   avsnittet, gör ändringen, kör `npm run build` + `npm run lint`, kryssa av.
3. **Gör inte parallella ändringar mellan kapitel** — beroenden finns
   (t.ex. modaler i kapitel 04 förutsätter token-systemet i kapitel 01).
4. Vid osäkerhet: prototypens komponent är facit för UI, originalets
   API-route är facit för backend-kontrakt. Förlika de två — uppfinn inget
   nytt.
5. Efter varje kapitel: gör en visuell jämförelse mot prototyp-URLen
   (`https://id-preview--f39022e0-ec0c-4be8-aee0-cbb5fe185872.lovable.app`)
   per sida. Skillnader > pixelnivå är OK; layout/avstånd/färger ska matcha.

---

## Nödvändiga npm-paket att verifiera/lägga till

Originalet bör redan ha de flesta. Kör i originalrepot:

```bash
npm ls @tanstack/react-query lucide-react date-fns class-variance-authority clsx tailwind-merge
npm ls @radix-ui/react-dialog @radix-ui/react-hover-card @radix-ui/react-tabs @radix-ui/react-select
```

Saknas något → installera:

```bash
npm i @tanstack/react-query date-fns
npx shadcn@latest add dialog hover-card tabs select alert-dialog
```

---

## Referensfiler i bundlarna

Hela originalkällkoden för admin-flödet är paketerad i bundles 01–10
(uppladdade till denna agent). När planen säger *"se bundle 04 — `DiscountModal.tsx`"*
betyder det att exakt fil finns i `04_customer_detail_and_modals.md` under
sektion `## FILE: src/components/admin/billing/DiscountModal.tsx`.

| Bundle | Innehåller |
|--------|-----------|
| 01 | `middleware.ts`, `AuthContext.tsx`, `letrend-design-system.ts`, `client-cache.ts`, layout, supabase clients, api-auth, roles, app-url helpers |
| 02 | `app/admin/page.tsx` (overview), `app/admin/billing/page.tsx`, små adminkomponenter |
| 03 | `app/admin/customers/page.tsx`, `InviteCustomerWizard.tsx`, `first-invoice.ts`, `customer.ts`-schema, `customers/invite.ts` |
| 04 | `customers/[id]/page.tsx`, `AdminCustomerDetail.tsx`, `DiscountModal.tsx`, `CreateManualInvoiceModal.tsx`, `PendingInvoiceItemsSection.tsx`, `customer-discount.ts` |
| 05 | `app/admin/invoices/page.tsx`, `app/admin/subscriptions/page.tsx`, `app/admin/billing-health/page.tsx` |
| 06 | `app/admin/team/page.tsx`, `lib/onboarding/session.ts` |
| 07 | `api/admin/customers/route.ts`, `api/admin/customers/[id]/route.ts`, `discount/route.ts`, `invoice-items/*` |
| 08 | `api/admin/invoices/route.ts`, `invoices/create/route.ts`, `subscriptions/route.ts`, `billing-health/route.ts`, `test-email/route.ts` |
| 09 | `api/admin/team/*`, `profiles/*`, `migrate-stripe`, `supabase-admin.ts`, `account-manager.ts`, `assign-account-manager.ts`, `activity/logger.ts` |
| 10 | `api/studio/stripe/sync-invoices/route.ts`, `sync-subscriptions/route.ts`, `api/stripe/webhook/route.ts`, `lib/stripe/*` (admin-billing, subscription-pricing, invite, mirror, dynamic-config, environment, config), `types/database.ts` |

Plus: `ADMIN_FLOW-2.md` (textuell teknisk översikt) och `SERVICE_OVERVIEW-2.md`
(vad LeTrend är som tjänst).

---

## Vad som INTE ingår i planen

- `/studio/*` (CM-yta) — bara nämns i passing
- `/customer/*`, `/m/*` — bara nämns i passing
- Auth-flödena (login/signup/password reset) — antas fungera
- Stripe Checkout för slutkund — antas fungera
- Email-templates (Resend) — bara `test-email`-routen ses över
- FeedPlanner / `currentSlotIndex = 4`-logik — utanför admin-scope

Om något av ovan visar sig blockera ett admin-steg: stoppa, dokumentera i
en task-note, och fråga användaren.

---

Klart att börja. Läs `01_DESIGN_SYSTEM_AND_LAYOUT.md` härnäst.
