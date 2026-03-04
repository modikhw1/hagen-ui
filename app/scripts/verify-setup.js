#!/usr/bin/env node

/**
 * Setup Verification Script
 *
 * Verifies that all required environment variables, database tables,
 * and configurations are in place for the LeTrend admin/studio system.
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Colors for terminal output
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

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// =============================================
// 1. Check Environment Variables
// =============================================
async function checkEnvironmentVariables() {
  logSection('1. Environment Variables');

  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'RESEND_API_KEY',
    'RESEND_FROM_EMAIL',
  ];

  const optionalEnvVars = [
    { name: 'STRIPE_SECRET_KEY_TEST', desc: 'For test mode Stripe operations' },
    { name: 'STRIPE_WEBHOOK_SECRET_TEST', desc: 'For test webhook validation' },
    { name: 'STRIPE_PUBLISHABLE_KEY_TEST', desc: 'For frontend test mode' },
    { name: 'STRIPE_SECRET_KEY_LIVE', desc: 'For live mode Stripe operations' },
    { name: 'STRIPE_WEBHOOK_SECRET_LIVE', desc: 'For live webhook validation' },
    { name: 'STRIPE_PUBLISHABLE_KEY_LIVE', desc: 'For frontend live mode' },
    { name: 'NEXT_PUBLIC_APP_URL', desc: 'Application URL' },
    { name: 'NEXT_PUBLIC_ENV', desc: 'Environment (test/production)' },
  ];

  let allRequired = true;

  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      logSuccess(`${envVar}`);
    } else {
      logError(`${envVar} - MISSING!`);
      allRequired = false;
    }
  }

  logInfo('\nOptional environment variables:');
  for (const { name, desc } of optionalEnvVars) {
    if (process.env[name]) {
      logSuccess(`${name} - ${desc}`);
    } else {
      logWarning(`${name} - Not set (${desc})`);
    }
  }

  // Check for hardcoded secrets
  logInfo('\nSecurity checks:');
  if (!process.env.MIGRATION_SECRET || process.env.MIGRATION_SECRET === 'letrend-admin-2026') {
    logWarning('MIGRATION_SECRET not set or using default - update for production');
  } else {
    logSuccess('MIGRATION_SECRET configured');
  }

  return allRequired;
}

// =============================================
// 2. Check Database Tables
// =============================================
async function checkDatabaseTables(supabase) {
  logSection('2. Database Tables');

  const requiredTables = [
    { name: 'profiles', desc: 'User profiles with roles' },
    { name: 'customer_profiles', desc: 'Customer data' },
    { name: 'concepts', desc: 'Concept library' },
    { name: 'customer_concepts', desc: 'Customer-specific concepts' },
    { name: 'concept_versions', desc: 'Concept version history' },
    { name: 'cm_activities', desc: 'CM activity tracking' },
    { name: 'invoices', desc: 'Invoice tracking' },
    { name: 'stripe_sync_log', desc: 'Stripe sync logs' },
  ];

  let allTablesExist = true;

  for (const { name, desc } of requiredTables) {
    try {
      const { data, error } = await supabase
        .from(name)
        .select('*')
        .limit(1);

      if (error) {
        logError(`${name} - ${error.message}`);
        allTablesExist = false;
      } else {
        const { count } = await supabase
          .from(name)
          .select('*', { count: 'exact', head: true });
        logSuccess(`${name} (${count || 0} rows) - ${desc}`);
      }
    } catch (err) {
      logError(`${name} - ${err.message}`);
      allTablesExist = false;
    }
  }

  return allTablesExist;
}

// =============================================
// 3. Check Database Functions
// =============================================
async function checkDatabaseFunctions(supabase) {
  logSection('3. Database Functions');

  const functions = [
    { name: 'update_concept_with_version', desc: 'Concept versioning' },
    { name: 'log_cm_activity', desc: 'Activity logging' },
  ];

  let allFunctionsExist = true;

  for (const { name, desc } of functions) {
    try {
      // Query pg_proc to check if function exists
      const { data, error } = await supabase.rpc(name);

      if (error && error.message.includes('not found')) {
        logError(`${name} - Function not found - ${desc}`);
        allFunctionsExist = false;
      } else if (error && error.message.includes('missing')) {
        // Function exists but needs parameters
        logSuccess(`${name} - ${desc}`);
      } else {
        logSuccess(`${name} - ${desc}`);
      }
    } catch (err) {
      logWarning(`${name} - Could not verify (${err.message})`);
    }
  }

  return allFunctionsExist;
}

// =============================================
// 4. Check Table Columns
// =============================================
async function checkTableColumns(supabase) {
  logSection('4. Critical Table Columns');

  const checks = [
    { table: 'profiles', column: 'role', desc: 'User role field (admin/content_manager)' },
    { table: 'profiles', column: 'is_admin', desc: 'Legacy admin flag' },
    { table: 'customer_profiles', column: 'logo_url', desc: 'Customer logo support' },
    { table: 'customer_profiles', column: 'stripe_customer_id', desc: 'Stripe integration' },
    { table: 'concepts', column: 'source', desc: 'Concept source tracking' },
    { table: 'concepts', column: 'backend_data', desc: 'Concept data (JSONB)' },
    { table: 'cm_activities', column: 'activity_type', desc: 'Activity type field' },
    { table: 'cm_activities', column: 'metadata', desc: 'Activity metadata (JSONB)' },
  ];

  let allColumnsExist = true;

  for (const { table, column, desc } of checks) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select(column)
        .limit(1);

      if (error) {
        logError(`${table}.${column} - ${error.message}`);
        allColumnsExist = false;
      } else {
        logSuccess(`${table}.${column} - ${desc}`);
      }
    } catch (err) {
      logError(`${table}.${column} - ${err.message}`);
      allColumnsExist = false;
    }
  }

  return allColumnsExist;
}

// =============================================
// 5. Check Data Integrity
// =============================================
async function checkDataIntegrity(supabase) {
  logSection('5. Data Integrity');

  // Check if concepts were migrated
  const { data: concepts, error: conceptsError } = await supabase
    .from('concepts')
    .select('id, source')
    .limit(5);

  if (conceptsError) {
    logError(`Could not query concepts: ${conceptsError.message}`);
    return false;
  }

  if (!concepts || concepts.length === 0) {
    logWarning('No concepts found - run: node scripts/migrate-concepts-to-supabase.js');
  } else {
    const { count } = await supabase
      .from('concepts')
      .select('*', { count: 'exact', head: true });

    const hagenConcepts = concepts.filter(c => c.source === 'hagen').length;
    logSuccess(`${count} concepts in database (${hagenConcepts} from hagen)`);
  }

  // Check if profiles have role field populated
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, role, is_admin')
    .limit(10);

  if (profiles && profiles.length > 0) {
    const admins = profiles.filter(p => p.is_admin || p.role === 'admin');
    const cms = profiles.filter(p => p.role === 'content_manager');

    if (admins.length === 0) {
      logWarning('No admin users found - run: node scripts/setup-admin.sql');
    } else {
      logSuccess(`${admins.length} admin user(s)`);
    }

    if (cms.length > 0) {
      logSuccess(`${cms.length} content manager(s)`);
    }
  }

  // Check customer_concepts exist if customers have concepts
  const { data: customerProfiles } = await supabase
    .from('customer_profiles')
    .select('id, concepts')
    .limit(5);

  if (customerProfiles && customerProfiles.some(cp => cp.concepts && cp.concepts.length > 0)) {
    const { count: customerConceptCount } = await supabase
      .from('customer_concepts')
      .select('*', { count: 'exact', head: true });

    if (!customerConceptCount || customerConceptCount === 0) {
      logWarning('Customer profiles have concepts but customer_concepts table is empty - data may not be migrated');
    } else {
      logSuccess(`${customerConceptCount} customer-specific concepts`);
    }
  }

  return true;
}

// =============================================
// 6. Check File Structure
// =============================================
function checkFileStructure() {
  logSection('6. File Structure');

  const fs = require('fs');

  const criticalFiles = [
    { path: 'src/lib/auth/api-auth.ts', desc: 'API authentication' },
    { path: 'src/lib/activity/logger.ts', desc: 'Activity logger' },
    { path: 'src/lib/conceptLoaderDB.ts', desc: 'Database concept loader' },
    { path: 'src/styles/letrend-design-system.ts', desc: 'LeTrend design system' },
    { path: 'src/components/admin/CMActivityFeed.tsx', desc: 'CM activity feed' },
    { path: 'src/components/admin/CustomerContentGrid.tsx', desc: 'Customer grid' },
    { path: 'src/app/admin/layout.tsx', desc: 'Admin layout' },
    { path: 'src/app/studio/layout.tsx', desc: 'Studio layout' },
    { path: 'supabase/migrations/007_concepts_architecture.sql', desc: 'Concepts migration' },
    { path: 'supabase/migrations/008_cm_activity_tracking.sql', desc: 'Activity tracking migration' },
  ];

  let allFilesExist = true;

  for (const { path: filePath, desc } of criticalFiles) {
    const fullPath = path.join(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      logSuccess(`${filePath} - ${desc}`);
    } else {
      logError(`${filePath} - MISSING! (${desc})`);
      allFilesExist = false;
    }
  }

  return allFilesExist;
}

// =============================================
// 7. Check Stripe Configuration
// =============================================
async function checkStripe() {
  logSection('7. Stripe Configuration');

  const mode = process.env.NEXT_PUBLIC_ENV || 'test';
  logInfo(`Environment mode: ${mode}`);

  if (mode === 'test') {
    const hasTestKey = !!process.env.STRIPE_SECRET_KEY_TEST;
    const hasTestWebhook = !!process.env.STRIPE_WEBHOOK_SECRET_TEST;

    if (hasTestKey) {
      logSuccess('Stripe test secret key configured');

      try {
        const Stripe = require('stripe');
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
        const customers = await stripe.customers.list({ limit: 1 });
        logSuccess(`Connected to Stripe test mode (${customers.data.length} test customers)`);
      } catch (err) {
        logError(`Stripe connection failed: ${err.message}`);
        return false;
      }
    } else {
      logWarning('STRIPE_SECRET_KEY_TEST not set');
    }

    if (hasTestWebhook) {
      logSuccess('Stripe test webhook secret configured');
    } else {
      logWarning('STRIPE_WEBHOOK_SECRET_TEST not set - webhooks will not work');
    }
  } else if (mode === 'production') {
    const hasLiveKey = !!process.env.STRIPE_SECRET_KEY_LIVE;
    const hasLiveWebhook = !!process.env.STRIPE_WEBHOOK_SECRET_LIVE;

    if (hasLiveKey) {
      logSuccess('Stripe live secret key configured');
    } else {
      logError('STRIPE_SECRET_KEY_LIVE not set for production');
      return false;
    }

    if (hasLiveWebhook) {
      logSuccess('Stripe live webhook secret configured');
    } else {
      logError('STRIPE_WEBHOOK_SECRET_LIVE not set for production');
      return false;
    }
  }

  return true;
}

// =============================================
// Main Verification Function
// =============================================
async function main() {
  log('\n🔍 LeTrend Setup Verification (Phase 1-5)\n', 'bright');

  let allChecksPassed = true;

  // 1. Environment Variables
  const envVarsOk = await checkEnvironmentVariables();
  if (!envVarsOk) allChecksPassed = false;

  // 6. File Structure (can run without DB connection)
  const filesOk = checkFileStructure();
  if (!filesOk) allChecksPassed = false;

  // Initialize Supabase client
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logError('\nCannot connect to Supabase - missing credentials');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 2. Database Tables
  const tablesOk = await checkDatabaseTables(supabase);
  if (!tablesOk) allChecksPassed = false;

  // 3. Database Functions
  const functionsOk = await checkDatabaseFunctions(supabase);
  if (!functionsOk) allChecksPassed = false;

  // 4. Table Columns
  const columnsOk = await checkTableColumns(supabase);
  if (!columnsOk) allChecksPassed = false;

  // 5. Data Integrity
  const dataOk = await checkDataIntegrity(supabase);
  if (!dataOk) allChecksPassed = false;

  // 7. Stripe Configuration
  const stripeOk = await checkStripe();
  if (!stripeOk) allChecksPassed = false;

  // Summary
  logSection('Summary');

  if (allChecksPassed) {
    logSuccess('All checks passed! ✨\n');
    log('Your LeTrend setup is ready to use.', 'green');
    log('\nNext steps:', 'blue');
    log('1. Start the dev server: npm run dev', 'reset');
    log('2. Login as admin at http://localhost:3000/login', 'reset');
    log('3. Test creating a customer and inviting them', 'reset');
    log('4. Check CM activity feed in /admin dashboard', 'reset');
    console.log();
    process.exit(0);
  } else {
    logError('Some checks failed!\n');
    log('Please fix the issues above before proceeding.', 'red');
    log('\nCommon fixes:', 'yellow');
    log('- Missing migrations: Run SQL migrations in Supabase Dashboard', 'reset');
    log('- No concepts: Run node scripts/migrate-concepts-to-supabase.js', 'reset');
    log('- No admin user: Update profiles table with is_admin=true', 'reset');
    console.log();
    process.exit(1);
  }
}

// Run verification
main().catch((err) => {
  logError(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
