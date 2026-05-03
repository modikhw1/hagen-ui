/**
 * Check latest video entry and compare to embedding similarities
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // 1. Get the latest entry from video_analysis_examples
  console.log('=== Checking video_analysis_examples table ===\n');
  
  const { data: examples, error: examplesError } = await supabase
    .from('video_analysis_examples')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (examplesError) {
    console.error('Error fetching video_analysis_examples:', examplesError.message);
  } else if (examples && examples.length > 0) {
    console.log(`Found ${examples.length} video_analysis_examples\n`);
    const latest = examples[0];
    console.log('=== LATEST LEARNING ENTRY ===');
    console.log('ID:', latest.id);
    console.log('Example Type:', latest.example_type);
    console.log('Created:', latest.created_at);
    console.log('\nVideo Summary:', latest.video_summary);
    console.log('\nGemini Interpretation:', latest.gemini_interpretation);
    console.log('\nCorrect Interpretation:', latest.correct_interpretation);
    console.log('\nExplanation:', latest.explanation);
    console.log('\nHumor Type Correction:', JSON.stringify(latest.humor_type_correction, null, 2));
    console.log('Tags:', latest.tags);
    console.log('Humor Types:', latest.humor_types);
    console.log('Has Embedding:', !!latest.embedding);
    
    // Find similar examples
    if (latest.embedding) {
      console.log('\n=== SIMILAR EXAMPLES (by embedding) ===\n');
      
      const { data: similar, error: simError } = await supabase.rpc('find_video_analysis_examples', {
        query_embedding: latest.embedding,
        match_threshold: 0.3,
        match_count: 10
      });
      
      if (simError) {
        console.error('Error finding similar:', simError.message);
      } else if (similar && similar.length > 0) {
        // Skip the first one if it's the same as latest
        const filtered = similar.filter(s => s.id !== latest.id);
        console.log(`Found ${filtered.length} similar examples:\n`);
        
        filtered.forEach((s, i) => {
          console.log(`--- Similar #${i + 1} (Similarity: ${(s.similarity * 100).toFixed(1)}%) ---`);
          console.log('Example Type:', s.example_type);
          console.log('Video Summary:', s.video_summary);
          console.log('Correct Interpretation:', s.correct_interpretation);
          console.log('Explanation:', s.explanation);
          console.log('');
        });
      } else {
        console.log('No similar examples found');
      }
    }
  } else {
    console.log('No video_analysis_examples found');
  }
  
  // 2. Also check analyzed_videos for latest entry
  console.log('\n\n=== Checking analyzed_videos table ===\n');
  
  const { data: videos, error: videosError } = await supabase
    .from('analyzed_videos')
    .select('id, video_url, created_at, visual_analysis, gemini_corrections, content_embedding')
    .order('created_at', { ascending: false })
    .limit(3);
    
  if (videosError) {
    console.error('Error fetching analyzed_videos:', videosError.message);
  } else if (videos && videos.length > 0) {
    console.log(`Found ${videos.length} latest analyzed videos\n`);
    const latestVideo = videos[0];
    
    console.log('=== LATEST ANALYZED VIDEO ===');
    console.log('ID:', latestVideo.id);
    console.log('URL:', latestVideo.video_url);
    console.log('Created:', latestVideo.created_at);
    console.log('Has Embedding:', !!latestVideo.content_embedding);
    console.log('Has Gemini Corrections:', latestVideo.gemini_corrections && latestVideo.gemini_corrections.length > 0);
    
    if (latestVideo.visual_analysis) {
      const va = latestVideo.visual_analysis;
      console.log('\n--- Visual Analysis Summary ---');
      console.log('Summary:', va.summary || va.content?.keyMessage);
      console.log('Humor Type:', va.humorType || va.humor?.type);
      console.log('Why Funny:', va.whyFunny || va.humor?.whyFunny);
      console.log('Content Format:', va.contentFormat || va.content?.format);
    }
    
    if (latestVideo.gemini_corrections && latestVideo.gemini_corrections.length > 0) {
      console.log('\n--- Gemini Corrections ---');
      latestVideo.gemini_corrections.forEach((c, i) => {
        console.log(`\nCorrection ${i + 1}:`, JSON.stringify(c, null, 2));
      });
    }
    
    // Find similar videos by embedding
    if (latestVideo.content_embedding) {
      console.log('\n=== SIMILAR VIDEOS (by content embedding) ===\n');
      
      const { data: similarVids, error: simVidError } = await supabase.rpc('find_similar_videos', {
        query_embedding: latestVideo.content_embedding,
        match_threshold: 0.5,
        match_count: 5
      });
      
      if (simVidError) {
        console.error('Error finding similar videos:', simVidError.message);
      } else if (similarVids && similarVids.length > 0) {
        const filtered = similarVids.filter(v => v.id !== latestVideo.id);
        console.log(`Found ${filtered.length} similar videos:\n`);
        
        filtered.forEach((v, i) => {
          console.log(`--- Similar Video #${i + 1} (Similarity: ${((1 - v.distance) * 100).toFixed(1)}%) ---`);
          console.log('URL:', v.video_url);
          console.log('Summary:', v.visual_analysis?.summary || v.visual_analysis?.content?.keyMessage);
          console.log('Humor:', v.visual_analysis?.humorType || v.visual_analysis?.humor?.type);
          console.log('');
        });
      } else {
        console.log('No similar videos found');
      }
    }
  }
}

main().catch(console.error);
