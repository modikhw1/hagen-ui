
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  console.log('Checking database schema...');

  const { data: tables, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');

  if (error) {
    // information_schema might not be accessible via API depending on permissions.
    // Let's try a different approach: listing known tables and seeing if they exist.
    console.log('Could not query information_schema directly via API (expected with RLS/permissions).');
    console.log('Checking for existence of known/suspected tables...');
    
    const suspects = [
      'ratings_v2', 
      'discovered_criteria', 
      'learned_patterns', 
      'active_criteria', 
      'ratings_with_videos',
      'video_ratings',
      'analyzed_videos',
      'video_signals',
      'profiles'
    ];

    for (const table of suspects) {
      const { error } = await supabase.from(table).select('count', { count: 'exact', head: true });
      if (error && error.code === '42P01') { // undefined_table
        console.log(`❌ ${table}: DOES NOT EXIST (Clean)`);
      } else if (error) {
        console.log(`❓ ${table}: Error ${error.message}`);
      } else {
        console.log(`✅ ${table}: EXISTS`);
      }
    }
    return;
  }

  // If we CAN query information_schema (unlikely with standard client but possible)
  console.log('Tables found:', tables.map((t: any) => t.table_name));
}

checkSchema();
