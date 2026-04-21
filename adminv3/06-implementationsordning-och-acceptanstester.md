# 06 - Implementationsordning och acceptanstester

> Sekventiell checklista. Bocka av i ordning.
> Varje fas ska passera sin smoke-test innan nasta fas fortsatter.

## Fas 1 - Schema och auth

1. Applicera faktisk migrationskedja med `supabase/migrations` som sann kalla.
2. Regenerera `app/src/types/database.ts`.
3. Verifiera `lib/auth/api-auth.ts`, `lib/server/supabase-admin.ts`, `lib/url/public.ts`.

**Smoke test 1**

- signup som `admin@letrend.se`, tilldela admin-roll
- `select public.has_role('<din-uuid>', 'admin')` -> `true`
- logga in i UI och oppna `/admin` utan redirect-loop

## Fas 2 - Stripe-lib och webhook

1. Verifiera `lib/stripe/*`.
2. Verifiera `app/api/stripe/webhook/route.ts`.
3. Satt `STRIPE_ENV=test` och motsvarande testnycklar.
4. Lokalt: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

**Smoke test 2**

- `stripe trigger invoice.payment_succeeded` -> rad i `invoices` med `status='paid'`
- sync-logg visar `status='success'`
- `stripe trigger customer.subscription.updated` -> rad i `subscriptions`

## Fas 3 - Admin API-routes

1. Verifiera att admin-routes gar via `createSupabaseAdmin()` och delade `jsonError/jsonOk`.
2. Verifiera schemas och billing/helpers som routes bygger pa.

**Smoke test 3**

- `GET /api/admin/customers` -> 200 som admin
- `POST /api/admin/customers` med `send_invite_now: true` -> Stripe customer/sub skapas
- invite-mail skickas eller loggas enligt aktuell miljo

## Fas 4 - UI-paritet

1. Verifiera designtokens och `lib/admin/{overview-derive,money,time,labels}.ts`.
2. Verifiera att overview, kunder, billing och team anvander samma derive- och API-sanning.
3. Verifiera att kunddetaljen renderar sina sektioner utan toast-floden.

**Smoke test 4**

- oversikt visar MRR, CM-aktivitet, kostnader och attention
- kundlista visar derive-signaler och oppnar detalj
- kunddetalj visar avtal, blockeringssignal, historik och atgarder
- billing-tabbar fungerar och env-toggle filtrerar
- team-sidan visar CM-balansering och aktivitet
- inga toaster: endast inline-band och inline-fel

## Fas 5 - TikTok profil-URL och provider-sync

1. Verifiera `RAPIDAPI_KEY` och `CRON_SECRET`.
2. Verifiera profil-preview och profil-save.
3. Verifiera manuell historikimport.
4. Verifiera schemalagd sync.

**Smoke test 5**

- verifiera en testkund via profil-URL eller `@handle`
- spara `tiktok_profile_url` pa kunden och kontrollera att `tiktok_handle` deriveras
- kor `POST /api/studio-v2/customers/[customerId]/fetch-profile-history` -> klipp importeras och stats uppdateras
- kor `POST /api/tiktok/sync` med korrekt bearer secret -> summering returneras och bara live/agreed-kunder behandlas
- kunddetaljens TikTok-sektion fylls utan OAuth-redirect eller callback-parametrar

## Fas 6 - Slutgiltig verifiering

- logga in som CM -> kan se kunder, kan inte se billing
- logga in som customer -> kan inte komma at `/admin`
- logga in som anonym -> redirect till login
- testa prisandring pa kund med aktiv subscription -> ny Stripe price + uppdaterad `subscriptions`-rad
- testa `Pausa abonnemang` -> `pause_collection` satts
- testa snooze/release i attention-flodet fran overview och detalj

## Kanda gotchas

| Symtom | Losning |
|--------|---------|
| `Migration 040 saknas` i UI | schema ar inte uppdaterat till Stripe-spegeln |
| `column "environment" does not exist` | samma grundorsak som ovan |
| `tiktok_stats` ar tom | kund saknar profilkoppling, sync har inte kort eller providerdata saknas |
| historiksync returnerar handle-fel | `tiktok_profile_url` ar ogiltig eller handle kunde inte deriveras |
| `withAuth` returnerar 401 trots inloggning | cookie skickas inte; anvand `credentials: 'include'` |
| webhook signature failed | fel `STRIPE_*_WEBHOOK_SECRET` eller body har parsats innan verify |
| Stripe-sub-prisandring slar inte igenom | kontrollera `proration_behavior` och aktiv Stripe-miljo |
| profile har fel roll efter signup | trigger/sync mellan `profiles` och `user_roles` ar fel |
| inline-fel syns inte i UI | sok efter kvarvarande toast/notifications i klientkod |

## Checklista - total

- [ ] Fas 1 - Schema och auth
- [ ] Fas 2 - Stripe-lib och webhook
- [ ] Fas 3 - Admin API-routes
- [ ] Fas 4 - UI-paritet
- [ ] Fas 5 - TikTok profil-URL och provider-sync
- [ ] Fas 6 - Rollvalidering och slutgiltig verifiering

Klart!
