/**
 * Migration Runner
 * Runs SQL migrations against Supabase database
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function runMigration() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Read migration file
  const migrationPath = path.join(__dirname, '../supabase/migrations/004_invoice_tracking.sql');

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📋 Running migration: 004_invoice_tracking.sql');
  console.log('🔗 Target:', supabaseUrl);
  console.log('');

  try {
    // Split SQL into statements (basic split on semicolons outside of function definitions)
    const statements = sql
      .split(/;\s*(?=(?:[^']*'[^']*')*[^']*$)/) // Split on ; but not inside strings
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    let executed = 0;
    let failed = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      // Skip comments
      if (stmt.startsWith('--') || stmt.startsWith('/*')) continue;

      // Extract first few words for logging
      const preview = stmt.split('\n')[0].substring(0, 60) + '...';

      try {
        console.log(`  [${i + 1}/${statements.length}] Executing: ${preview}`);

        const { error } = await supabase.rpc('exec_sql', { sql_query: stmt });

        if (error) {
          // If exec_sql RPC doesn't exist, try direct query
          if (error.code === '42883') {
            // Use raw query instead
            const { error: queryError } = await supabase.from('_').select('*').limit(0);

            // Since we can't execute arbitrary SQL via JS client easily,
            // we'll use a different approach
            throw new Error('Direct SQL execution not available via JS client. Use psql or Supabase CLI.');
          }
          throw error;
        }

        executed++;
      } catch (err) {
        console.error(`  ❌ Failed: ${err.message}`);
        failed++;

        // Continue with other statements
      }
    }

    console.log('');
    console.log(`✅ Migration completed: ${executed} statements executed, ${failed} failed`);

    if (failed === 0) {
      console.log('');
      console.log('✨ Database schema updated successfully!');
      console.log('');
      console.log('Next steps:');
      console.log('1. Restart your dev server: cd app && npm run dev');
      console.log('2. Test invoice creation and verify invoices table');
      console.log('3. Check stripe_sync_log for webhook events');
    } else {
      console.log('');
      console.log('⚠️  Some statements failed. Check errors above.');
      console.log('You may need to run the migration manually via psql.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('');
    console.log('Alternative method: Use psql or Supabase dashboard SQL editor');
    console.log('');
    console.log('Via psql:');
    console.log(`  psql "${supabaseUrl.replace('https://', 'postgresql://postgres:[password]@').replace('.supabase.co', '.supabase.co:5432/postgres')}" -f ${migrationPath}`);
    console.log('');
    console.log('Via Supabase Dashboard:');
    console.log('  1. Go to: ' + supabaseUrl.replace('/rest/v1', '') + '/project/default/sql');
    console.log('  2. Copy contents of 004_invoice_tracking.sql');
    console.log('  3. Paste and run in SQL editor');

    process.exit(1);
  }
}

runMigration();
