#!/usr/bin/env ts-node
/**
 * test-ingest.ts
 *
 * End-to-end smoke test for the Hagen studio ingest pipeline.
 * Tests the full create → analyze → enrich flow for a real video URL.
 *
 * Usage:
 *   HAGEN_URL=https://your-hagen.up.railway.app ts-node scripts/test-ingest.ts
 *   HAGEN_URL=http://localhost:3001 ts-node scripts/test-ingest.ts
 *
 * The VIDEO_URL env var overrides the default test URL.
 */

const HAGEN_URL = (process.env['HAGEN_URL'] ?? 'http://localhost:3001').replace(/\/$/, '')
const VIDEO_URL =
  process.env['VIDEO_URL'] ??
  'https://www.tiktok.com/@letrend.se/video/7306189234782937377'

// ── Helpers ────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function ok(label: string, detail?: string): void {
  console.log(`  ✅ PASS  ${label}${detail ? `  (${detail})` : ''}`)
  passed++
}

function fail(label: string, detail: string): void {
  console.error(`  ❌ FAIL  ${label}  — ${detail}`)
  failed++
}

async function httpPost(
  path: string,
  body: unknown,
  timeoutMs = 10_000,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(`${HAGEN_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timerId)
    let parsed: unknown = null
    try {
      parsed = await resp.json()
    } catch {
      parsed = null
    }
    return { status: resp.status, body: parsed }
  } catch (err) {
    clearTimeout(timerId)
    throw err
  }
}

async function httpGet(path: string): Promise<{ status: number; body: unknown }> {
  const resp = await fetch(`${HAGEN_URL}${path}`, { headers: { Accept: 'application/json' } })
  const body = await resp.json().catch(() => null)
  return { status: resp.status, body }
}

function getPath(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

// ── Tests ──────────────────────────────────────────────────────────────────

async function testVersion(): Promise<void> {
  console.log('\n1. GET /api/letrend/version — route manifest')
  const { status, body } = await httpGet('/api/letrend/version')
  if (status !== 200) {
    fail('status 200', `got ${status}`)
    return
  }
  ok('HTTP 200')
  const analyzeRoute = getPath(body, 'routes', 'studio_concepts_analyze')
  if (analyzeRoute === '/api/studio/concepts/analyze') {
    ok('studio_concepts_analyze declared', String(analyzeRoute))
  } else {
    fail('studio_concepts_analyze declared', `got ${JSON.stringify(analyzeRoute)}`)
  }
  const enrichRoute = getPath(body, 'routes', 'studio_concepts_enrich')
  if (enrichRoute === '/api/studio/concepts/enrich') {
    ok('studio_concepts_enrich declared', String(enrichRoute))
  } else {
    fail('studio_concepts_enrich declared', `got ${JSON.stringify(enrichRoute)}`)
  }
}

async function testAnalyzeValidation(): Promise<void> {
  console.log('\n2. POST /api/studio/concepts/analyze — input validation')

  const noBody = await httpPost('/api/studio/concepts/analyze', {})
  if (noBody.status === 400) {
    ok('empty body → 400')
  } else {
    fail('empty body → 400', `got ${noBody.status}`)
  }

  const badUrl = await httpPost('/api/studio/concepts/analyze', { videoUrl: 'not-a-url' })
  if (badUrl.status === 400) {
    ok('invalid URL → 400')
  } else {
    fail('invalid URL → 400', `got ${badUrl.status}`)
  }
}

async function testEnrichValidation(): Promise<void> {
  console.log('\n3. POST /api/studio/concepts/enrich — input validation')

  const noBody = await httpPost('/api/studio/concepts/enrich', {})
  if (noBody.status === 400) {
    ok('missing backend_data → 400')
  } else {
    fail('missing backend_data → 400', `got ${noBody.status}`)
  }

  const arrayBody = await httpPost('/api/studio/concepts/enrich', { backend_data: [] })
  if (arrayBody.status === 400) {
    ok('array backend_data → 400')
  } else {
    fail('array backend_data → 400', `got ${arrayBody.status}`)
  }
}

async function testEnrichMinimalPayload(): Promise<void> {
  console.log('\n4. POST /api/studio/concepts/enrich — minimal payload → overrides')

  const payload = {
    backend_data: {
      script: {
        conceptCore: 'Restaurangpersonalen testar maten',
        hasScript: true,
        transcript: 'Vi testar rätterna idag.',
        humor: { isHumorous: false },
        replicability: { requiredElements: ['kamera', 'tallrik'] },
        structure: { hook: 'Snabb start', setup: 'Vi testar', payoff: 'Reaktion' },
      },
      content: { keyMessage: 'Bakom kulisserna på restaurangen', format: 'talking head' },
      audio: { hasVoiceover: true },
      technical: { pacing: 6 },
      visual: { textOverlays: [] },
    },
  }

  const { status, body } = await httpPost('/api/studio/concepts/enrich', payload, 35_000)
  if (status !== 200) {
    fail('HTTP 200', `got ${status}, body=${JSON.stringify(body).slice(0, 200)}`)
    return
  }
  ok('HTTP 200')

  const headline = getPath(body, 'overrides', 'headline_sv')
  if (typeof headline === 'string' && headline.length > 0) {
    ok('overrides.headline_sv present', `"${headline.slice(0, 50)}"`)
  } else {
    fail('overrides.headline_sv present', `got ${JSON.stringify(headline)}`)
  }

  const businessTypes = getPath(body, 'overrides', 'businessTypes')
  if (Array.isArray(businessTypes) && businessTypes.length > 0) {
    ok('overrides.businessTypes present', JSON.stringify(businessTypes))
  } else {
    fail('overrides.businessTypes present', `got ${JSON.stringify(businessTypes)}`)
  }

  const difficulty = getPath(body, 'overrides', 'difficulty')
  if (['easy', 'medium', 'advanced'].includes(String(difficulty))) {
    ok('overrides.difficulty valid enum', String(difficulty))
  } else {
    fail('overrides.difficulty valid enum', `got ${JSON.stringify(difficulty)}`)
  }

  const hasScript = getPath(body, 'overrides', 'hasScript')
  if (typeof hasScript === 'boolean') {
    ok('overrides.hasScript is boolean', String(hasScript))
  } else {
    fail('overrides.hasScript is boolean', `got ${JSON.stringify(hasScript)}`)
  }
}

async function testFullPipeline(): Promise<void> {
  console.log(`\n5. Full pipeline — analyze + enrich for ${VIDEO_URL}`)
  console.log('   ⏳  This step takes 30-60s (download + Gemini File API + analysis)…')

  // ── analyze ──────────────────────────────────────────────────────────────
  let analyzeBody: unknown = null
  try {
    const { status, body } = await httpPost(
      '/api/studio/concepts/analyze',
      { videoUrl: VIDEO_URL },
      90_000,
    )
    analyzeBody = body
    if (status !== 200) {
      fail('analyze HTTP 200', `got ${status}, error=${getPath(body, 'error')}`)
      return
    }
    ok('analyze HTTP 200')
  } catch (err) {
    fail('analyze HTTP 200', err instanceof Error ? err.message : String(err))
    return
  }

  const analysis = getPath(analyzeBody, 'analysis')
  if (analysis && typeof analysis === 'object') {
    ok('analysis object returned')
  } else {
    fail('analysis object returned', JSON.stringify(analyzeBody).slice(0, 200))
    return
  }

  const gcsUri = getPath(analyzeBody, 'upload', 'gcsUri')
  if (typeof gcsUri === 'string' && gcsUri.length > 0) {
    ok('upload.gcsUri present', gcsUri.slice(0, 60))
  } else {
    fail('upload.gcsUri present', `got ${JSON.stringify(gcsUri)}`)
  }

  const analysisModel = getPath(analyzeBody, 'analysis', 'analysisModel')
  if (typeof analysisModel === 'string') {
    ok('analysis.analysisModel present', analysisModel)
  } else {
    fail('analysis.analysisModel present', `got ${JSON.stringify(analysisModel)}`)
  }

  // ── enrich ───────────────────────────────────────────────────────────────
  const backendData = { ...(analysis as Record<string, unknown>) }
  let enrichBody: unknown = null
  try {
    const { status, body } = await httpPost(
      '/api/studio/concepts/enrich',
      { backend_data: backendData },
      35_000,
    )
    enrichBody = body
    if (status !== 200) {
      fail('enrich HTTP 200', `got ${status}, error=${getPath(body, 'error')}`)
      return
    }
    ok('enrich HTTP 200')
  } catch (err) {
    fail('enrich HTTP 200', err instanceof Error ? err.message : String(err))
    return
  }

  const overrides = getPath(enrichBody, 'overrides')
  if (overrides && typeof overrides === 'object') {
    ok('overrides object returned')
  } else {
    fail('overrides object returned', JSON.stringify(enrichBody).slice(0, 200))
    return
  }

  const headlineSv = getPath(enrichBody, 'overrides', 'headline_sv')
  if (typeof headlineSv === 'string' && headlineSv.length > 0) {
    ok('overrides.headline_sv non-empty', `"${String(headlineSv).slice(0, 50)}"`)
  } else {
    fail('overrides.headline_sv non-empty', `got ${JSON.stringify(headlineSv)}`)
  }

  const scriptSv = getPath(enrichBody, 'overrides', 'script_sv')
  if (typeof scriptSv === 'string') {
    ok('overrides.script_sv present')
  } else {
    fail('overrides.script_sv present', `got ${JSON.stringify(scriptSv)}`)
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`Hagen Studio Ingest Smoke Test`)
  console.log(`Target: ${HAGEN_URL}`)
  console.log(`${'═'.repeat(60)}`)

  await testVersion()
  await testAnalyzeValidation()
  await testEnrichValidation()
  await testEnrichMinimalPayload()
  await testFullPipeline()

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)
  console.log(`${'═'.repeat(60)}\n`)

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
