# Codebase Cleanup Plan

## Objective
Iteratively clean up the codebase by identifying and removing unused files, code, and dependencies, and verifying the database schema.

## Steps

1.  **Identify Unused Files**: Scan `src/` and `scripts/` for files that are not referenced.
2.  **Identify Unused Exports**: Check for exported functions/components that are not used.
3.  **Check for Deprecated Code**: Look for code marked as deprecated or related to the "legacy" rating interface.
4.  **Verify Database Schema**: Ensure the database schema matches the code.
5.  **Clean up `scripts/`**: Check if any scripts are obsolete.
6.  **Verify Dependencies**: Check `package.json` for unused dependencies.

## Findings

### Unused Files / Code to Remove
Based on references to dropped tables (`ratings_v2`, `discovered_criteria`, `learned_patterns`):
- `src/lib/services/patterns/discovery.ts`
- `src/lib/services/patterns/gpt.ts` (Used by discovery)
- `src/app/api/predict-v2/route.ts`
- `src/app/api/extract-criteria/route.ts`
- `src/app/api/patterns/discover/route.ts`
- `src/lib/services/extraction/criteria.ts`

### Potential Legacy/Backup Files
- `src/app/analyze-rate-v1/`
- `src/app/brand-analysis-v1/`
- `src/app/rate/` (Legacy rating page, keep for now but note it)

### Unused Scripts
- `scripts/migrate-to-video-signals.js` (Superseded by `.ts` version)

### Unused Dependencies
- None found so far (all major deps seem used)

## Execution Summary

### Removed Files
The following files were removed as they were part of the "limitless schema" experiment or superseded:
- `src/lib/services/patterns/discovery.ts`
- `src/lib/services/patterns/gpt.ts`
- `src/app/api/predict-v2/route.ts`
- `src/app/api/extract-criteria/route.ts`
- `src/app/api/patterns/discover/route.ts`
- `src/lib/services/extraction/criteria.ts`
- `scripts/migrate-to-video-signals.js`

### Code Updates
- **ServiceRegistry**: Removed `PatternDiscoveryProvider` and related methods.
- **types.ts**: Removed `PatternDiscoveryProvider` interface and related types.
- **GeminiVideoAnalyzer**: Added missing `name` property to satisfy interface.
- **API Routes**: Fixed type errors in `src/app/api/profile/route.ts`, `src/app/api/videos/analyze/batch/route.ts`, `src/app/api/videos/analyze/deep/route.ts`, and `src/app/library/page.tsx`.

### Build Status
- Build verified and passing (after fixing type errors).
