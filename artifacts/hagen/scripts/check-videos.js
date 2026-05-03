const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  // Get one Schema v1 rating to examine its structure
  const { data, error } = await supabase
    .from('video_brand_ratings')
    .select('ai_analysis')
    .eq('rater_id', 'schema_v1')
    .limit(1)
    .single();
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Schema v1 ai_analysis structure:');
  console.log(JSON.stringify(data.ai_analysis, null, 2));
}

main().catch(console.error);
