# Lovable migration

## Goal

Make `hagen-opus` the clean GitHub sync target that Lovable can read, reason about, and edit safely.

## What changed

- Replaced the Lovable starter Vite app with the real Next.js application from `hagen-ui/app`
- Moved the app to repository root
- Kept one app, one `src`, one `public`, one `supabase`, one test surface
- Added root-level agent instructions in `AGENTS.md`
- Rewrote `README.md` to describe the repository as the Lovable-facing working copy

## Why this layout works better

- Lovable sees the real codebase immediately from root
- The repository no longer competes with a starter scaffold for context
- The app is no longer nested under `app/`, which reduces path ambiguity in prompts and edits
- Supabase migrations live beside the application instead of in a separate outer workspace

## How to operate this repo with Lovable

1. Connect the Lovable project to this exact GitHub repository.
2. Keep `main` as the default branch unless you intentionally change both GitHub and Lovable behavior.
3. Put architectural rules in Lovable Project Knowledge and keep `AGENTS.md` as the repository-level execution guide.
4. Ask Lovable to modify files in this repo directly instead of referencing the older nested workspace.

## Recommended Lovable Project Knowledge

Paste a concise version of this into Project Knowledge:

- This is the production application repository for Hagen UI.
- Use Next.js App Router patterns already present in `src/app`.
- Keep API routes thin and move business logic into `src/lib`.
- Respect the existing role-routing model in `src/middleware.ts`, `src/hooks/useLoginForm.ts`, and `src/app/auth/callback/page.tsx`.
- Do not introduce a second frontend scaffold or move the app under a nested folder.
- Prefer lint, typecheck, unit tests, and Playwright depending on change scope.

## Immediate next steps

1. Review the diff locally.
2. Push this repository state to `main` on `hagen-opus`.
3. Connect the Lovable project to `modikhw1/hagen-opus`.
4. Add Project Knowledge in Lovable using the routing and architecture notes above.
5. Start with a narrow task in Lovable, for example a small dashboard or onboarding fix, and verify that it edits the expected files.

## Known caveats

- This repo is a Lovable-facing copy, so you need to decide whether `hagen-ui` or `hagen-opus` is the long-term primary development repo.
- If both repos keep evolving independently, drift will become the main failure mode.
- Lovable sync depends on a stable repository path, owner, and default branch.
