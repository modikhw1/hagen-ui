# LeTrend Admin - Implementationsplan

**Riktning:** Lovable-prototypen (denna app) -> Next.js-originalrepot.  
**Detaljniva:** Maximal - full kod for filer.  
**Leverans:** Flera tematiska dokument, sekventiellt avbockbara.  
**Stripe:** BYOK med test/live-toggling (befintlig modell).  
**TikTok:** Profil-URL + provider/RapidAPI-sync, inte officiell OAuth per kund.

> Den har mappen ges till en agent som arbetar i Next.js-repot (`app/src/...`
> enligt bundles ADMIN_COMBINED_01..10). Varje dokument ar sjalvstandigt
> avbockbart och innehaller fardig kod, SQL och atomiska taskar.
> Originalrepots befintliga filer anvands som baseline; planen beskriver vad
> som behover laggas till, bytas ut eller kompletteras for att na paritet med
> Lovable-prototypen och solidifiera backend.

---

## Mappinnehall (las i denna ordning)

| # | Dokument | Vad det gor |
|---|----------|-------------|
| 00 | `00-README-och-leveransoversikt.md` (denna fil) | Karta, konventioner, prerequisites |
| 01 | `01-supabase-schema-rls-triggers.md` | Komplett SQL: enums, tabeller, index, triggers, `has_role`, RLS for alla tabeller, realtime-config |
| 02 | `02-stripe-byok-sync-webhooks.md` | `lib/stripe/*`, `api/studio/stripe/*`, webhook-route och sync-lager |
| 03 | `03-api-routes-och-auth-lager.md` | `lib/auth/api-auth.ts`, route handlers, Zod-scheman, fellagen |
| 04 | `04-ui-paritet-komponenter-hooks-sidor.md` | UI-paritet Lovable -> Next, inklusive `lib/admin/*`, hooks och modaler |
| 05 | `05-tiktok-integration.md` | TikTok via verifierad profil-URL, provider-normalisering och sync-jobb till `tiktok_stats`/`tiktok_videos` |
| 06 | `06-implementationsordning-och-acceptanstester.md` | Sekventiell checklista, smoke tests per fas, gotchas |
| 07 | `07-operativ-modell-och-koncept.md` | Normativ operativ modell. Vinner mot 01-06 vid konflikt |
| 08 | `08-schema-patchar-och-tabeller.md` | Schemapatchar ovanpa 01 for customers/feedplan/cm_interactions/demos/attention m.m. |
| 09 | `09-grafik-och-berakningslogik.md` | All berakningslogik bakom UI: metric-kort, buffer, CM-puls, attention, blocking, onboarding |
| ^ | `AGENT-PROMPT.md` | Fardig prompt for implementations-agenten, uppdaterad for faktisk kodbas, migrationssanning och TikTok-riktning |

---

## Konventioner som galler alla dokument

### Sokvagar
Alla sokvagar ar relativa till `app/src/` (Next.js App Router). Exempel:
`app/src/app/api/admin/customers/route.ts`.

### Migrationssanning
- `supabase/migrations` ar kanonisk migrationskedja for nytt arbete.
- `app/supabase/migrations` ar legacy-/referensspar och ska inte byggas vidare pa.
- Nar aldre filer i `app/supabase/migrations` motsager nyare root-migrationer vinner root-kedjan, och korrigeringar ska laggas som nya patchar i `supabase/migrations`.

### Penningenheter
- Databas/Stripe-API: ore (`integer`, t.ex. `350000` = 3 500 kr).
- UI-input fran admin: kronor (`number`).
- Konvertering sker i `lib/admin/money.ts` (`sekToOre`, `oreToSek`, `formatSek`).
- Aldrig konvertera till ore i komponenter - alltid via lib.

### Datum/tid
- Kontraktsdatum: `YYYY-MM-DD` (date).
- Timestamps: ISO-8601 i UTC (`timestamptz`).
- All UI-formattering via `lib/admin/time.ts` (`shortDateSv`, `timeAgoSv`).

### Roller
- `admin`
- `content_manager`
- `customer`
- `user`

Roller lagras i tva tabeller:
1. `profiles.role` + `profiles.is_admin` - legacy-lager som klient och auth fortfarande laser.
2. `user_roles(user_id, role)` - saker kalla via `has_role()` SECURITY DEFINER.

> Ny RLS-policy ska alltid anvanda `has_role(auth.uid(), 'role')`, aldrig
> `profiles.role` direkt. `profiles` ska hallas i sync via trigger eller
> serverlogik, men `user_roles` ar den kanoniska RBAC-kallan.

### Stripe-miljo (test vs live)
Hela appen foljer en enda env-variabel:

```bash
STRIPE_ENV=test
STRIPE_TEST_SECRET_KEY=sk_test_...
STRIPE_TEST_PUBLISHABLE_KEY=pk_test_...
STRIPE_TEST_WEBHOOK_SECRET=whsec_...
STRIPE_LIVE_SECRET_KEY=sk_live_...
STRIPE_LIVE_PUBLISHABLE_KEY=pk_live_...
STRIPE_LIVE_WEBHOOK_SECRET=whsec_...
```

`lib/stripe/environment.ts` exponerar `getStripeEnvironment()` som laser
`STRIPE_ENV` (default `test`). `lib/stripe/dynamic-config.ts` exporterar en
`stripe`-singleton och `stripeEnvironment`. Mirror-tabeller ska ha
`environment` sa att test- och live-data lever sida vid sida utan att blandas.

### Felhantering och inline-meddelanden
- Inga toasts i admin.
- Backend returnerar i normalfallet `{ error: string, details?: ... }`.
- Fel som visas direkt for admin ska vara pa svenska.

### Sprak
Hela admin-UI:t ar pa svenska. Loggning kan vara pa engelska.

### Sakerhet
- Service role anvands endast i serverkod (`lib/server/supabase-admin.ts`).
- `withAuth` kraver giltig session och rollkontroll innan service-role-klient skapas.
- Inga raw SQL-strangar mot Supabase RPC fran klienten.
- RLS maste vara pa for alla tabeller med anvandardata.

---

## Prerequisites innan agenten borjar

1. Bundles ADMIN_COMBINED_01..10 lasta.
2. Repo har `next`, `react`, `@supabase/supabase-js`, `@supabase/ssr`, `stripe`, `zod`, `@tanstack/react-query`, `date-fns`, `lucide-react`, `@radix-ui/*`, `tailwindcss`.
3. `.env.local` (eller motsvarande) har:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `STRIPE_ENV`, `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET` (och live-motsvarigheter)
   - `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
   - `NEXT_PUBLIC_APP_URL`
   - `MIGRATION_SECRET` (valfri)

---

## Hur agenten ska arbeta

For varje dokument 01-06:
1. Las hela dokumentet forst.
2. Bocka av varje numrerad task i checklistan i slutet.
3. Nar en kodfil tillhandahalls i full form - skriv den exakt.
4. Nar en kodfil tillhandahalls som patch/diff - applicera ovanpa befintlig fil.
5. Kor smoke tests per fas (definierade i 06).
6. Migrationer ska sparas under `supabase/migrations/<timestamp>_<namn>.sql` och appliceras innan kod som beror pa dem deployas.

---

## Vad som finns i bundlen vs vad som saknas

### Finns i bundlen
Alla centrala admin-routes, admin-komponenter, hooks, schemas, Stripe-lib,
mirror-routes, auth-lager, billing-modaler, generated `types/database.ts`,
`globals.css` och `AuthContext`.

### Saknas / maste byggas

| Saknas | Var det specas i denna plan |
|--------|-----------------------------|
| Supabase migrations (SQL) - bundlen visar bara genererade typer | **01** |
| Stripe webhook receiver (`api/stripe/webhook/route.ts`) | **02** |
| Delar av `lib/stripe/*` | **02** |
| Fullt auth-/API-lager med konsekventa felkontrakt | **03** |
| Samlad admin-derive-/UI-paritet | **04** |
| TikTok profil-URL-flode, provider-sync till `tiktok_stats`/`tiktok_videos`, verifiering och fetch-job | **05** |
| `service_costs` schema | **01** |

---

Klart att borja. Ga till `01-supabase-schema-rls-triggers.md`.
