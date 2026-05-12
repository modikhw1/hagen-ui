#!/usr/bin/env node
/**
 * Smoke test harness for Hagen library sync (Phase 63)
 *
 * Safe by default: only calls preview endpoints, never imports.
 *
 * Usage:
 *   node scripts/smoke-hagen-sync.mjs
 *
 * Env vars:
 *   HAGEN_BASE_URL              - Required. Hagen service URL (e.g., http://localhost:3000)
 *   HAGEN_SYNC_SECRET           - Optional. Shared secret for auth. If set, tests auth.
 *   HAGEN_SYNC_TEST_CUSTOMER_ID - Optional. Customer ID for smoke test (default: 'smoke-test')
 *   HAGEN_SYNC_TEST_HANDLE      - Optional. TikTok handle for smoke test (default: 'nonexistent-smoke-handle')
 *   API_SERVER_BASE_URL         - Optional. hagen-ui API URL (e.g., http://localhost:4000)
 *   HAGEN_UI_AUTH_COOKIE        - Optional. Auth cookie for authenticated preview test
 */

import { exit } from 'process';

const HAGEN_BASE_URL = process.env.HAGEN_BASE_URL;
const HAGEN_SYNC_SECRET = process.env.HAGEN_SYNC_SECRET;
const CUSTOMER_ID = process.env.HAGEN_SYNC_TEST_CUSTOMER_ID || 'smoke-test';
const HANDLE = process.env.HAGEN_SYNC_TEST_HANDLE || 'nonexistent-smoke-handle';
const API_SERVER_BASE_URL = process.env.API_SERVER_BASE_URL;
const AUTH_COOKIE = process.env.HAGEN_UI_AUTH_COOKIE;

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

function pass(msg) {
  log(`[OK] ${msg}`, 'green');
}

function fail(msg) {
  log(`[ERR] ${msg}`, 'red');
}

function info(msg) {
  log(`[INFO] ${msg}`, 'cyan');
}

function warn(msg) {
  log(`[WARN] ${msg}`, 'yellow');
}

async function checkHagenEndpoint() {
  if (!HAGEN_BASE_URL) {
    fail('HAGEN_BASE_URL not set. Cannot test Hagen endpoint.');
    return false;
  }

  info(`Testing Hagen endpoint: ${HAGEN_BASE_URL}`);

  // Test 1: Hagen endpoint with correct secret (if secret is set)
  if (HAGEN_SYNC_SECRET) {
    info('  Test 1: GET with correct secret and ?handle=');
    const url = `${HAGEN_BASE_URL}/api/studio-v2/customers/${CUSTOMER_ID}/hagen-clips?handle=${HANDLE}`;
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'x-hagen-sync-secret': HAGEN_SYNC_SECRET,
        },
      });

      if (!res.ok) {
        fail(`  Response ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.log(`  Body: ${text.slice(0, 200)}`);
        return false;
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        fail(`  Response is not JSON: ${contentType}`);
        return false;
      }

      const data = await res.json();

      if (!Array.isArray(data.clips)) {
        fail('  Response missing clips array');
        return false;
      }

      if (!data.diagnostics || typeof data.diagnostics !== 'object') {
        fail('  Response missing diagnostics object');
        return false;
      }

      if (data.diagnostics.handleFilter !== HANDLE) {
        fail(`  diagnostics.handleFilter is ${data.diagnostics.handleFilter}, expected ${HANDLE}`);
        return false;
      }

      pass(`  JSON response with clips (${data.clips.length}) and diagnostics`);
      pass(`  diagnostics.handleFilter = "${data.diagnostics.handleFilter}"`);
      pass(`  diagnostics.totalTikTokClips = ${data.diagnostics.totalTikTokClips ?? 'null'}`);
      pass(`  diagnostics.availableUsernameCount = ${data.diagnostics.availableUsernameCount ?? 'null'}`);
    } catch (err) {
      fail(`  Network error: ${err.message}`);
      return false;
    }

    // Test 2: Hagen endpoint without secret (should fail if secret is set)
    info('  Test 2: GET without secret (expect 401)');
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (res.status !== 401) {
        fail(`  Expected 401, got ${res.status}`);
        return false;
      }

      const data = await res.json();
      if (data.error !== 'unauthorized') {
        fail(`  Expected error='unauthorized', got '${data.error}'`);
        return false;
      }

      pass(`  401 unauthorized when secret is missing`);
    } catch (err) {
      fail(`  Network error: ${err.message}`);
      return false;
    }
  } else {
    info('  HAGEN_SYNC_SECRET not set. Testing without auth.');
    const url = `${HAGEN_BASE_URL}/api/studio-v2/customers/${CUSTOMER_ID}/hagen-clips?handle=${HANDLE}`;
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        fail(`  Response ${res.status} ${res.statusText}`);
        return false;
      }

      const data = await res.json();

      if (!Array.isArray(data.clips) || !data.diagnostics) {
        fail('  Response missing clips or diagnostics');
        return false;
      }

      pass(`  JSON response with clips (${data.clips.length}) and diagnostics (no auth)`);
    } catch (err) {
      fail(`  Network error: ${err.message}`);
      return false;
    }
  }

  return true;
}

async function checkHagenUIPreview() {
  if (!API_SERVER_BASE_URL) {
    info('API_SERVER_BASE_URL not set. Skipping hagen-ui API tests.');
    return true;
  }

  info(`Testing hagen-ui API: ${API_SERVER_BASE_URL}`);

  // Test 3: hagen-ui preview without auth (should fail with 401)
  info('  Test 3: POST preview without auth (expect 401)');
  const previewUrl = `${API_SERVER_BASE_URL}/api/studio-v2/customers/${CUSTOMER_ID}/sync-history?preview=true`;
  try {
    const res = await fetch(previewUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status !== 401 && res.status !== 403) {
      fail(`  Expected 401/403, got ${res.status}`);
      return false;
    }

    pass(`  ${res.status} when no auth provided`);
  } catch (err) {
    fail(`  Network error: ${err.message}`);
    return false;
  }

  // Test 4: hagen-ui preview with auth (optional)
  if (AUTH_COOKIE) {
    info('  Test 4: POST preview with auth');
    try {
      const res = await fetch(previewUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: AUTH_COOKIE,
        },
      });

      if (!res.ok) {
        warn(`  Response ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.log(`  Body: ${text.slice(0, 300)}`);
        warn('  This may be expected if customer does not exist or has no handle.');
        return true; // Not a hard failure
      }

      const data = await res.json();

      if (
        typeof data.handle !== 'string' ||
        typeof data.totalMatched !== 'number' ||
        typeof data.wouldImport !== 'number' ||
        typeof data.wouldSkip !== 'number'
      ) {
        fail('  Preview response missing expected fields');
        return false;
      }

      if (!data.hagenDiagnostics) {
        warn('  Preview response missing hagenDiagnostics (may be from older api-server)');
      } else {
        pass(`  Preview response includes hagenDiagnostics`);
      }

      pass(`  Preview: handle="${data.handle}", totalMatched=${data.totalMatched}, wouldImport=${data.wouldImport}`);
      info('  Note: This was a PREVIEW only. No rows were imported.');
    } catch (err) {
      fail(`  Network error: ${err.message}`);
      return false;
    }
  } else {
    info('  HAGEN_UI_AUTH_COOKIE not set. Skipping authenticated preview test.');
  }

  return true;
}

async function main() {
  log('\n=== Hagen Library Sync Smoke Test ===\n', 'cyan');

  if (!HAGEN_BASE_URL) {
    fail('HAGEN_BASE_URL is required.');
    log('\nSet env vars and try again:\n', 'yellow');
    log('  export HAGEN_BASE_URL=http://localhost:3000');
    log('  export HAGEN_SYNC_SECRET=your-secret  # optional, tests auth');
    log('  export API_SERVER_BASE_URL=http://localhost:4000  # optional, tests hagen-ui API');
    log('  export HAGEN_UI_AUTH_COOKIE="sb-access-token=..."  # optional, tests authenticated preview');
    log('  node scripts/smoke-hagen-sync.mjs\n');
    exit(1);
  }

  log(`Config:`, 'cyan');
  log(`  HAGEN_BASE_URL: ${HAGEN_BASE_URL}`);
  log(`  HAGEN_SYNC_SECRET: ${HAGEN_SYNC_SECRET ? '***' : '(not set)'}`);
  log(`  CUSTOMER_ID: ${CUSTOMER_ID}`);
  log(`  HANDLE: ${HANDLE}`);
  log(`  API_SERVER_BASE_URL: ${API_SERVER_BASE_URL || '(not set)'}`);
  log(`  AUTH_COOKIE: ${AUTH_COOKIE ? '(set)' : '(not set)'}\n`);

  let allPassed = true;

  const hagenOk = await checkHagenEndpoint();
  allPassed = allPassed && hagenOk;

  const apiOk = await checkHagenUIPreview();
  allPassed = allPassed && apiOk;

  log('');
  if (allPassed) {
    pass('All smoke tests passed!');
    exit(0);
  } else {
    fail('Some smoke tests failed.');
    exit(1);
  }
}

main();
