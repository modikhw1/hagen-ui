/**
 * Check what data we have for building a likeness comparison system
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('=== DATA INVENTORY FOR LIKENESS SCORING ===\n');

  // 1. Check video_analysis_examples (learning examples with corrections)
  const { data: examples, count: examplesCount } = await supabase
    .from('video_analysis_examples')
    .select('*', { count: 'exact' })
    .limit(3);

  console.log('📚 video_analysis_examples (learning data):');
  console.log('   Total entries:', examplesCount);
  if (examples?.[0]) {
    console.log('   Fields:', Object.keys(examples[0]).join(', '));
    console.log('\n   Sample entry:');
    console.log('   - context:', examples[0].context?.substring(0, 100) + '...');
    console.log('   - correction:', examples[0].correction?.substring(0, 150) + '...');
    console.log('   - example_type:', examples[0].example_type);
  }

  // 2. Check analyzed_videos
  const { count: totalVideos } = await supabase
    .from('analyzed_videos')
    .select('id', { count: 'exact', head: true });

  const { count: withNotes } = await supabase
    .from('analyzed_videos')
    .select('id', { count: 'exact', head: true })
    .not('signal_notes', 'is', null);

  const { data: sampleVideo } = await supabase
    .from('analyzed_videos')
    .select('id, tiktok_id, signal_notes, gemini_analysis')
    .not('signal_notes', 'is', null)
    .limit(1)
    .single();

  console.log('\n📹 analyzed_videos:');
  console.log('   Total videos:', totalVideos);
  console.log('   With signal_notes:', withNotes);
  
  if (sampleVideo) {
    console.log('\n   Sample video with notes:');
    console.log('   - signal_notes:', sampleVideo.signal_notes?.substring(0, 200) + '...');
    const analysis = sampleVideo.gemini_analysis;
    if (analysis) {
      console.log('   - gemini humorType:', analysis.humorType);
      console.log('   - gemini humorMechanism:', analysis.humorMechanism?.substring(0, 100) + '...');
    }
  }

  // 3. Check what fields we can compare
  const { data: recentVideos } = await supabase
    .from('analyzed_videos')
    .select('gemini_analysis')
    .not('gemini_analysis', 'is', null)
    .limit(5);

  console.log('\n📊 Fields available for comparison:');
  if (recentVideos?.[0]?.gemini_analysis) {
    const keys = Object.keys(recentVideos[0].gemini_analysis);
    console.log('   gemini_analysis keys:', keys.join(', '));
  }

  // 4. Show potential comparison plan
  console.log('\n\n=== LIKENESS SCORING STRATEGY ===');
  console.log(`
The goal is to measure how well Gemini's analysis matches human understanding.

Option 1: Semantic Similarity (Embeddings)
- Embed signal_notes (human notes) 
- Embed relevant gemini_analysis fields (humorMechanism, transcript, etc.)
- Cosine similarity = likeness score

Option 2: LLM Evaluation  
- Send both human notes and Gemini analysis to an LLM
- Ask it to rate similarity on a 0-100 scale
- More nuanced but slower/costlier

Recommended: Option 1 for batch processing, store as 'understanding_score'

Data available:
- ${totalVideos} total videos
- ${withNotes} videos with human signal_notes
- ${examplesCount} learning examples with corrections

We can:
1. Compute likeness scores for videos WITH human notes (${withNotes} videos)
2. Store these scores
3. Re-analyze with deep reasoning
4. Compare before/after scores
  `);
}

main().catch(console.error);
