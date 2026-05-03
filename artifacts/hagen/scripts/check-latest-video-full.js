require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  // Get latest analyzed video
  const { data: videos, error } = await supabase
    .from('analyzed_videos')
    .select('id, video_url, created_at, visual_analysis')
    .order('created_at', { ascending: false })
    .limit(1);
    
  if (error) {
    console.error('Error:', error.message);
    return;
  }
  
  if (videos && videos.length > 0) {
    const v = videos[0];
    console.log('=== LATEST ANALYZED VIDEO ===');
    console.log('ID:', v.id);
    console.log('URL:', v.video_url);
    console.log('Created:', v.created_at);
    console.log('\n=== FULL VISUAL ANALYSIS ===');
    console.log(JSON.stringify(v.visual_analysis, null, 2));
  }
}

main();
