
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeTableUsage() {
  console.log('📊 Analyzing database table usage...\n');

  // 1. Get list of tables
  // Note: We can't always query information_schema directly with the JS client depending on permissions,
  // but we can try. If that fails, we'll use a hardcoded list of known tables from the codebase.
  
  let tables: string[] = [];
  
  // Try fetching from information_schema
  const { data: schemaTables, error: schemaError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');

  if (!schemaError && schemaTables) {
    tables = schemaTables.map((t: any) => t.table_name);
  } else {
    // Fallback list based on codebase analysis
    tables = [
      'video_ratings',
      'analyzed_videos',
      'video_signals',
      'profiles',
      'ratings_v2',
      'discovered_criteria',
      'learned_patterns',
      'active_criteria', // view
      'ratings_with_videos', // view
      'rating_schema_versions',
      'video_brand_ratings'
    ];
  }

  console.log(`${'Table Name'.padEnd(30)} | ${'Rows'.padEnd(10)} | ${'Last Activity'.padEnd(25)} | ${'Status'}`);
  console.log('-'.repeat(80));

  for (const table of tables) {
    // 2. Get row count
    const { count, error: countError } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (countError) {
      // If error is "relation does not exist", it's likely a view or deleted table
      if (countError.code === '42P01') {
         // Skip, it doesn't exist
         continue;
      }
      console.log(`${table.padEnd(30)} | ${'ERROR'.padEnd(10)} | ${countError.message}`);
      continue;
    }

    // 3. Check for latest activity
    // We'll try common timestamp columns
    let lastActivity = 'N/A';
    
    const timestampCols = ['updated_at', 'created_at', 'rated_at', 'analyzed_at', 'extracted_at'];
    
    for (const col of timestampCols) {
      const { data: latest } = await supabase
        .from(table)
        .select(col)
        .order(col, { ascending: false })
        .limit(1);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = latest?.[0] as any;
      if (row && row[col]) {
        const date = new Date(row[col]);
        lastActivity = date.toISOString().split('T')[0]; // YYYY-MM-DD
        break; // Found a valid timestamp
      }
    }

    // Determine status
    let status = '❓ Unknown';
    if (count === 0) {
      status = '⚪ Empty';
    } else {
      status = 'jq Active'; 
      // If last activity was > 30 days ago
      if (lastActivity !== 'N/A') {
        const lastDate = new Date(lastActivity);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays > 30) status = '🟡 Stale (>30d)';
      }
    }

    console.log(`${table.padEnd(30)} | ${String(count).padEnd(10)} | ${lastActivity.padEnd(25)} | ${status}`);
  }
}

analyzeTableUsage();
