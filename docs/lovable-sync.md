# Lovable Sync

`hagen-ui` is the source-of-truth repo.

`your-daily-hello` exists only as the Lovable-facing mirror where the app lives at repo root. Changes from Lovable must therefore be imported into `hagen-ui` with path mapping instead of using a direct Git merge between the two repositories.

## Rule

Never push Lovable changes straight into `main`.

Always:

1. Commit and push changes in `your-daily-hello/main`.
2. Import them into a fresh sync branch based on `origin/main`.
3. Run verification in the imported branch.
4. Review and merge that sync branch into `main`.

## Bootstrap Once

The current repo state needs one one-time bootstrap before the scripted flow becomes reliable.

Merge this branch first:

- `feat/lovable-paritet-merged`

Why:

- it contains the current imported Lovable product changes
- it also carries the lint/typecheck baseline that future imports expect

After that branch is in `main`, `.lovable-sync.json` should point at the Lovable commit that is already represented in `main`.

Current baseline:

- `lastImportedCommit = 2cbcbc3db2ab96455be226fe72793b8630db59a9`

## Command

From the `hagen-ui` repo root:

```powershell
npm run lovable:import -- -SourceRepoPath ..\your-daily-hello
```

What the script does:

- fetches the latest `your-daily-hello/main`
- compares it against `.lovable-sync.json:lastImportedCommit`
- creates a new worktree from `origin/main`
- maps Lovable paths into `hagen-ui`
- updates `.lovable-sync.json` with the imported Lovable commit
- runs `npm install` in `app/` if needed
- runs `npm run typecheck` and `npm run lint`
- commits the import on a new sync branch

If verification fails, the script stops before commit/push and leaves the import worktree behind for inspection.

Default branch naming:

- `sync/lovable-YYYYMMDD-HHMMSS`

## Path Mapping

Imported:

- `src/**` -> `app/src/**`
- `public/**` -> `app/public/**`
- `tests/**` -> `app/tests/**`
- `scripts/**` -> `app/scripts/**`
- known app-root config files -> `app/<file>`
- `supabase/**` -> `supabase/**`

Skipped by design:

- `AGENTS.md`
- `docs/**`
- `bun.lock`
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`

Those skipped files are Lovable-side scaffolding or legacy Vite artifacts and should not overwrite `hagen-ui`.

## Normal Flow

1. Work in Lovable.
2. Commit/push in `your-daily-hello/main`.
3. Run the import command in `hagen-ui`.
4. Open a PR from the generated `sync/lovable-*` branch to `main`.
5. Merge the PR.

After the PR merges, `main` contains the updated `.lovable-sync.json` baseline and the next import will only bring newer Lovable commits.

## Notes

- The script uses a separate worktree so your current dirty working copy does not block imports.
- If you want to inspect the imported branch locally, the script prints the created worktree path.
- If `typecheck` passes and `lint` has warnings only, the branch is still considered merge-ready.
