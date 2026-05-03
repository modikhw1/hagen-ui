/**
 * Check what context is available for a specific video
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const videoId = process.argv[2] || 'c5413895-df8c-456c-9c50-6389c6ad2603';
  
  console.log('Checking video:', videoId);
  
  const { data: analysis, error } = await supabase
    .from('analyzed_videos')
    .select('id, deep_analysis')
    .eq('id', videoId)
    .single();
  
  if (error) {
    console.log('Error:', error.message);
    return;
  }
  
  if (!analysis) {
    console.log('No analysis found');
    return;
  }
  
  console.log('\n=== ORIGINAL ANALYSIS STRUCTURE ===');
  const da = analysis.deep_analysis;
  if (!da) {
    console.log('No deep_analysis field');
    return;
  }
  
  console.log('Top-level keys:', Object.keys(da));
  
  if (da.scenes && da.scenes.sceneBreakdown) {
    console.log('\n=== SCENE BREAKDOWN ===');
    console.log('Scene count:', da.scenes.sceneBreakdown.length);
    da.scenes.sceneBreakdown.forEach((s, i) => {
      console.log(`\nScene ${i + 1} (${s.timestamp}):`);
      console.log('  Visual:', s.visualContent?.substring(0, 100));
      console.log('  Audio:', s.audioContent?.substring(0, 100));
      if (s.impliedMeaning) console.log('  Meaning:', s.impliedMeaning.substring(0, 100));
    });
  }
  
  if (da.script) {
    console.log('\n=== SCRIPT DATA ===');
    if (da.script.transcript) console.log('Transcript:', da.script.transcript.substring(0, 200));
    if (da.script.visualTranscript) console.log('Visual:', da.script.visualTranscript.substring(0, 200));
    if (da.script.humor) {
      console.log('Humor type:', da.script.humor.humorType);
      console.log('Mechanism:', da.script.humor.humorMechanism?.substring(0, 200));
    }
  }
}

check().catch(console.error);
