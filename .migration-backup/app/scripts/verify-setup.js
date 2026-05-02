#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(__dirname, '..', '..');

require('dotenv').config({ path: path.join(appRoot, '.env.local') });

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  log(title, 'bright');
  console.log('='.repeat(60));
}

function ok(message) {
  log(`[OK] ${message}`, 'green');
}

function warn(message) {
  log(`[WARN] ${message}`, 'yellow');
}

function fail(message) {
  log(`[ERR] ${message}`, 'red');
}

function info(message) {
  log(`[INFO] ${message}`, 'blue');
}

function resolvePath(base, relativePath) {
  return path.join(base === 'repo' ? repoRoot : appRoot, relativePath);
}

function fileExists(base, relativePath) {
  return fs.existsSync(resolvePath(base, relativePath));
}

function buildSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in app/.env.local');
    process.exit(1);
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function checkEnvironment() {
  section('1. Environment');

  let passed = true;

  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const optional = [
    'STRIPE_ENV',
    'STRIPE_TEST_SECRET_KEY',
    'STRIPE_TEST_PUBLISHABLE_KEY',
    'STRIPE_TEST_WEBHOOK_SECRET',
    'STRIPE_LIVE_SECRET_KEY',
    'STRIPE_LIVE_PUBLISHABLE_KEY',
    'STRIPE_LIVE_WEBHOOK_SECRET',
    'NEXT_PUBLIC_APP_URL',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
    'MIGRATION_SECRET',
  ];

  for (const name of required) {
    if (process.env[name]) {
      ok(`${name} is set`);
    } else {
      fail(`${name} is missing`);
      passed = false;
    }
  }

  info('Optional/currently environment-specific variables');
  for (const name of optional) {
    if (process.env[name]) {
      ok(`${name} is set`);
    } else {
      warn(`${name} is not set`);
    }
  }

  return passed;
}

function checkFiles() {
  section('2. Repo Files');

  let passed = true;

  const requiredFiles = [
    { base: 'app', path: 'src/lib/auth/api-auth.ts', desc: 'API auth helper' },
    { base: 'app', path: 'src/lib/server/supabase-admin.ts', desc: 'Service-role helper' },
    { base: 'app', path: 'src/lib/admin/overview-derive.ts', desc: 'Overview derive logic' },
    { base: 'app', path: 'src/lib/stripe/environment.ts', desc: 'Stripe environment model' },
    { base: 'app', path: 'src/components/admin/AttentionList.tsx', desc: 'Attention overview actions' },
    { base: 'app', path: 'src/app/api/stripe/webhook/route.ts', desc: 'Stripe webhook route' },
    { base: 'repo', path: 'supabase/migrations/20260420123000_repo_truth_cleanup.sql', desc: 'Repo truth cleanup migration' },
    { base: 'repo', path: 'supabase/functions/attention-maintenance/index.ts', desc: 'Attention maintenance function' },
    { base: 'repo', path: 'supabase/functions/onboarding-tick/index.ts', desc: 'Onboarding tick function' },
    { base: 'repo', path: 'adminv3/AGENT-PROMPT.md', desc: 'Implementation prompt' },
  ];

  for (const file of requiredFiles) {
    if (fileExists(file.base, file.path)) {
      ok(`${file.path} - ${file.desc}`);
    } else {
      fail(`${file.path} missing - ${file.desc}`);
      passed = false;
    }
  }

  if (fileExists('repo', 'app/supabase/migrations/README.md')) {
    ok('Legacy migrations are still present as reference only');
  }

  return passed;
}

async function checkTables(supabase) {
  section('3. Tables');

  let passed = true;

  const requiredTables = [
    ['profiles', 'Profile records'],
    ['user_roles', 'Canonical RBAC roles'],
    ['customer_profiles', 'Customer profiles'],
    ['concepts', 'Concept library'],
    ['customer_concepts', 'Customer concept assignments'],
    ['cm_activities', 'CM activity feed'],
    ['invoices', 'Invoice mirror'],
    ['stripe_sync_log', 'Stripe sync log'],
    ['attention_snoozes', 'Overview snoozes'],
    ['demos', 'Demo pipeline'],
    ['tiktok_publications', 'TikTok publication history'],
    ['tiktok_videos', 'TikTok video mirror'],
  ];

  for (const [name, desc] of requiredTables) {
    const { count, error } = await supabase
      .from(name)
      .select('*', { count: 'exact', head: true });

    if (error) {
      fail(`${name} - ${error.message}`);
      passed = false;
      continue;
    }

    ok(`${name} (${count ?? 0} rows) - ${desc}`);
  }

  return passed;
}

async function checkColumns(supabase) {
  section('4. Critical Columns');

  let passed = true;

  const checks = [
    ['customer_profiles', 'account_manager_profile_id', 'Assigned CM by profile id'],
    ['customer_profiles', 'discount_type', 'Canonical discount type'],
    ['customer_profiles', 'tiktok_profile_url', 'Canonical TikTok identity'],
    ['invoices', 'environment', 'Stripe environment separation'],
    ['stripe_sync_log', 'environment', 'Stripe sync environment separation'],
    ['team_members', 'profile_id', 'Team member to profile link'],
    ['tiktok_videos', 'customer_profile_id', 'TikTok video ownership'],
  ];

  for (const [table, column, desc] of checks) {
    const { error } = await supabase
      .from(table)
      .select(column)
      .limit(1);

    if (error) {
      fail(`${table}.${column} - ${error.message}`);
      passed = false;
      continue;
    }

    ok(`${table}.${column} - ${desc}`);
  }

  return passed;
}

async function checkRbac(supabase) {
  section('5. RBAC and Data Sanity');

  let passed = true;

  const [{ count: roleCount, error: roleError }, { count: adminCount, error: adminError }] =
    await Promise.all([
      supabase.from('user_roles').select('*', { count: 'exact', head: true }),
      supabase.from('user_roles').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
    ]);

  if (roleError) {
    fail(`user_roles count failed - ${roleError.message}`);
    passed = false;
  } else {
    ok(`user_roles contains ${roleCount ?? 0} rows`);
  }

  if (adminError) {
    fail(`admin role count failed - ${adminError.message}`);
    passed = false;
  } else if (!adminCount) {
    warn('No admin roles found in user_roles');
    passed = false;
  } else {
    ok(`user_roles contains ${adminCount} admin assignments`);
  }

  const { data: legacyTables, error: legacyTableError } = await supabase
    .schema('information_schema')
    .from('tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'tiktok_oauth_tokens');

  if (legacyTableError) {
    if (legacyTableError.message.includes('Invalid schema: information_schema')) {
      info('Skipping information_schema check in Supabase REST client; use SQL/MCP for legacy-table verification');
    } else {
      warn(`Could not verify legacy table cleanup via information_schema: ${legacyTableError.message}`);
    }
  } else if ((legacyTables ?? []).length > 0) {
    warn('tiktok_oauth_tokens still exists in information_schema');
    passed = false;
  } else {
    ok('tiktok_oauth_tokens is absent, which matches the canonical schema');
  }

  return passed;
}

async function checkStripe() {
  section('6. Stripe Config');

  const stripeEnv = process.env.STRIPE_ENV || 'test';
  const envPrefix = stripeEnv === 'live' ? 'STRIPE_LIVE' : 'STRIPE_TEST';
  const secretKeyName = `${envPrefix}_SECRET_KEY`;
  const publishableKeyName = `${envPrefix}_PUBLISHABLE_KEY`;
  const webhookSecretName = `${envPrefix}_WEBHOOK_SECRET`;

  ok(`STRIPE_ENV=${stripeEnv}`);

  let passed = true;

  for (const name of [secretKeyName, publishableKeyName, webhookSecretName]) {
    if (process.env[name]) {
      ok(`${name} is set`);
    } else {
      warn(`${name} is not set for current Stripe environment`);
      passed = false;
    }
  }

  return passed;
}

async function main() {
  log('\nRepo setup verification\n', 'bright');

  let passed = true;

  passed = checkEnvironment() && passed;
  passed = checkFiles() && passed;

  const supabase = buildSupabaseClient();

  passed = (await checkTables(supabase)) && passed;
  passed = (await checkColumns(supabase)) && passed;
  passed = (await checkRbac(supabase)) && passed;
  passed = (await checkStripe()) && passed;

  section('Summary');

  if (passed) {
    ok('All verified checks passed');
    info('Next step: run the app with `npm run dev` from app/');
    process.exit(0);
  }

  fail('One or more checks failed');
  info('Apply canonical migrations from repo root with `npx supabase db push`');
  info('Grant admin roles via public.user_roles, not via legacy profiles.role writes');
  process.exit(1);
}

main().catch((error) => {
  fail(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
