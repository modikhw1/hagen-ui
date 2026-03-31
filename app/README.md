# App (Source of Truth)

Detta ar huvudapplikationen for hagen-ui.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Supabase (auth + data)
- Stripe (billing)
- Mantine

## Kora lokalt

```bash
npm install
npm run dev
```

## Viktiga scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run test:smoke
npm run migrate:concepts
```

## Huvudstruktur

- `src/app` - pages och API-routes
- `src/components` - UI-komponenter
- `src/lib` - integrations och helpers
- `src/contexts` - auth/profile-context
- `src/hooks` - route/login/dashboard-hooks
- `supabase/migrations` - SQL-migrationer
- `tests` - Playwright smoke + auth flows

## Nuvarande routingmodell

- `/` ar customer huvuddashboard (desktop)
- `/login` och `/m/login` ar inloggningssidor
- `/m` ar mobil root som routar vidare beroende pa auth/roll
- `/auth/callback` hanterar invite/recovery + password setup
- onboarding/betalning: `/welcome` -> `/onboarding` -> `/checkout` -> `/checkout/complete`
- customer feed finns i separat flode:
  - `/customer/feed`
  - `/customer/concept/[id]`
  - mobil: `/m/customer/feed`, `/m/customer/concept/[id]`
- content manager: `/studio/*`
- admin: `/admin/*`

## Hur routes binds ihop

- `src/proxy.ts` gor role-based route protection och mobil/desktop redirects.
- `src/hooks/useLoginForm.ts` avgor post-login destination per roll.
- `src/app/auth/callback/page.tsx` avgor destination efter invite/password setup.
- `src/app/api/admin/profiles/setup/route.ts` kopplar profile <-> customer_profile.

## Domänupplägg för produktion

Rekommenderat upplägg:

- `letrend.se` = marknadssajt / Lovable
- `app.letrend.se` = denna Next-app

Auth bör bo i appen, inte i marknadssajten. Det betyder att produktionens login och callback ska vara:

- `https://app.letrend.se/login`
- `https://app.letrend.se/auth/callback`

Miljövariabler för detta finns i `env.example`:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_MARKETING_URL`
- `ALLOWED_PUBLIC_ORIGINS`

Supabase bör konfigureras med redirect URLs som täcker minst:

- `https://app.letrend.se/auth/callback`
- `https://app.letrend.se/**`

## Publikt kontaktformulär

Det finns en publik route för kontaktformulär:

- `POST /api/contact`

Den är tänkt att anropas från marknadssajten på `letrend.se` och skickar mail via Resend till `hej@letrend.se`.

Förväntad payload:

```json
{
  "name": "Anna Andersson",
  "email": "anna@exempel.se",
  "company": "Cafe Exempel",
  "phone": "0701234567",
  "message": "Vi vill veta mer om LeTrend.",
  "honeypot": ""
}
```

Miljövariabler som styr detta:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `CONTACT_FORM_TO_EMAIL`
- `ALLOWED_PUBLIC_ORIGINS`

## Kvalitetsmal

- Hall `src/app/api` tunn; flytta affarslogik till `src/lib/services`.
- Hall types och validering nara API-granser.
- Undvik att vaxa fler mega-pages; bryt ut feature-komponenter tidigt.
