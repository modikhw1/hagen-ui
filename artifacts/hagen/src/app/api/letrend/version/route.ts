/**
 * GET /api/letrend/version
 *
 * Lightweight version handshake so api-server / letrend can confirm which
 * hagen build Railway is actually running. Use this to detect route drift —
 * if a proxy route in api-server points at a path that has been renamed or
 * removed in this hagen build, the version endpoint still answers and the
 * mismatch can be diagnosed without SSHing into Railway.
 */

import { NextResponse } from 'next/server'

const SCHEMA_VERSION = 1

// Captured at module load so it reflects the process start time, not the
// per-request "now" — useful for spotting unexpectedly fresh restarts on
// Railway when debugging route drift.
const PROCESS_STARTED_AT = new Date().toISOString()

function readGitSha(): string {
  return (
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.SOURCE_VERSION ||
    'unknown'
  )
}

function readGitBranch(): string {
  return (
    process.env.RAILWAY_GIT_BRANCH ||
    process.env.GIT_BRANCH ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    'unknown'
  )
}

export async function GET() {
  return NextResponse.json({
    service: 'hagen',
    git_sha: readGitSha(),
    git_branch: readGitBranch(),
    schema_version: SCHEMA_VERSION,
    node_env: process.env.NODE_ENV ?? 'unknown',
    started_at: PROCESS_STARTED_AT,
    now: new Date().toISOString(),
    routes: {
      letrend_concept_prepare: '/api/letrend/concept/prepare',
      letrend_library: '/api/letrend/library',
      letrend_reprocess: '/api/letrend/reprocess',
      letrend_video: '/api/letrend/video/:id',
      videos_analyze_deep: '/api/videos/analyze/deep',
      videos_library: '/api/videos/library',
      videos_create: '/api/videos/create',
      studio_concepts_analyze: '/api/studio/concepts/analyze',
      studio_concepts_enrich: '/api/studio/concepts/enrich',
      admin_concepts_translate_vertex: '/api/admin/concepts/translate-vertex',
    },
  })
}
