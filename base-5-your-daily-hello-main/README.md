# Hagen Opus

This repository is the Lovable-facing working copy of the Hagen UI application.

It exists so Lovable can work against a clean root-level Next.js codebase instead of a nested `app/` directory inside a larger monorepo-like workspace.

## Purpose

- Let Lovable read the real application code from the repository root
- Keep GitHub sync predictable on the default branch
- Give the agent a single source of truth for app code, tests, and Supabase migrations

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Supabase
- Stripe
- Mantine
- Playwright
- Vitest

## Project layout

- `src/app` - routes and API handlers
- `src/components` - UI and feature components
- `src/lib` - business logic, integrations, and helpers
- `src/contexts` - auth and profile context
- `src/hooks` - route, dashboard, and form hooks
- `supabase/migrations` - database migrations
- `tests` - browser and audit flows
- `scripts` - one-off maintenance and migration helpers

## Local commands

```bash
npm install
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
npm run test:unit
```

## Environment

Example variables live in `env.example`.

Important groups:

- Supabase
- Stripe
- Resend
- public app and marketing URLs
- Hagen backend URL
- scheduled job secret

## Lovable notes

- Keep the application at repository root
- Do not reintroduce Vite starter files
- Treat this repository as the editable sync target for Lovable
- Prefer changes on the default branch when you need Lovable to see them immediately

See [docs/lovable-migration.md](/C:/Users/praiseworthy/Desktop/hagen-opus/docs/lovable-migration.md) for the migration rationale and operating rules.
