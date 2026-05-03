# AGENTS

These instructions are for Lovable and any other repository-aware coding agent working in this project.

## Repository role

- This repository is the Lovable-ready working copy of the Hagen UI app.
- The real application lives at the repository root. Do not move it back under `app/`.
- Do not add a parallel Vite starter, demo app, or secondary frontend shell.
- Treat `main` as the sync branch unless the user explicitly changes the default branch in GitHub and Lovable.

## Stack and runtime

- Framework: Next.js 16 App Router
- Language: TypeScript
- UI: React 19 + Mantine
- Backend: Next route handlers + Supabase
- Billing: Stripe
- Email: Resend
- Testing: Playwright and Vitest

## Source of truth

- App routes and API endpoints: `src/app`
- Shared business logic: `src/lib`
- Reusable UI and feature components: `src/components`
- Auth and profile state: `src/contexts`
- Route and form behavior: `src/hooks`
- Database migrations: `supabase/migrations`
- Browser and audit tests: `tests`

If two files appear to solve the same problem, prefer the path already used by the route or feature instead of creating a third variant.

## Guardrails

- Keep `src/app/api` thin. Put domain logic in `src/lib` whenever possible.
- Prefer extending existing feature folders over creating new top-level architectural patterns.
- Do not introduce a second database integration layer.
- Do not move authentication out of the app.
- Do not rename or relocate the repository without coordinating the GitHub connection, because Lovable sync depends on the stable repo path.
- Do not commit secrets. Use `env.example` as the schema reference only.

## Routing model

- `/feed` is the primary desktop customer feed
- `/concept/[id]` is the desktop concept detail route
- `/m` routes mobile users according to auth and role
- `/m/feed` and `/m/concept/[id]` are mobile customer routes
- `/login` and `/m/login` are login surfaces
- `/auth/callback` handles invite, recovery, and password setup flow
- `/welcome` -> `/onboarding` -> `/checkout` -> `/checkout/complete` is the onboarding and billing funnel
- `/studio/*` is the content manager area
- `/admin/*` is the admin area

## Files that affect navigation and access

- `src/middleware.ts` controls route protection and mobile or desktop redirects
- `src/hooks/useLoginForm.ts` determines post-login destination by role
- `src/app/auth/callback/page.tsx` determines destination after invite or password setup

Review these before changing auth, role routing, redirects, or onboarding flow.

## Integration assumptions

- `NEXT_PUBLIC_APP_URL` is the app domain
- `NEXT_PUBLIC_MARKETING_URL` is the external marketing site
- `ALLOWED_PUBLIC_ORIGINS` controls public cross-origin access such as contact form calls
- Supabase redirect URLs must include the app callback route
- Stripe keys are selected by `STRIPE_ENV`

## Verification

Run the smallest relevant check after changes:

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test`

For user-visible regressions, prefer browser-level verification.

## Preferred change style

- Make focused edits instead of broad rewrites
- Reuse existing patterns before introducing new abstractions
- Keep code comments brief and only where they remove real ambiguity
- Preserve Swedish business wording where it already exists in user-facing copy unless the user asks for a language pass
