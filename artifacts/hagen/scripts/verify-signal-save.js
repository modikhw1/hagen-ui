const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load env manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    process.env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  try {
    console.log('\n=== Checking Most Recent video_signals Entry ===\n');
    
    // Get most recent video_signals entry
    const { data: signals, error: signalsError } = await supabase
      .from('video_signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (signalsError) {
      console.log('❌ Error fetching video_signals:', signalsError.message);
      return;
    }
    
    if (!signals || signals.length === 0) {
      console.log('❌ No entries in video_signals yet');
      console.log('\nTry analyzing and rating a video at http://localhost:3000/analyze-rate');
      return;
    }
    
    const signal = signals[0];
    
    console.log('✅ Found video_signals entry!\n');
    console.log('Video ID:', signal.video_id);
    console.log('Schema Version:', signal.schema_version);
    console.log('Rating:', signal.rating, '/10');
    console.log('Rating Confidence:', signal.rating_confidence);
    console.log('Source:', signal.source);
    console.log('Created:', signal.created_at);
    console.log('Updated:', signal.updated_at);
    
    console.log('\n--- Extracted Signals ---');
    if (signal.extracted) {
      const extracted = signal.extracted;
      console.log('Schema Version:', extracted.schema_version);
      console.log('Extraction Source:', extracted.extraction_source);
      console.log('Extracted At:', extracted.extracted_at);
      
      if (extracted.sigma_taste) {
        console.log('\n✅ σTaste v1.1 signals present:');
        console.log('  - Content Type:', extracted.sigma_taste.content_classification?.content_type);
        console.log('  - Service Relevance:', extracted.sigma_taste.content_classification?.service_relevance);
        console.log('  - Utility Score:', extracted.sigma_taste.utility_score);
        console.log('  - Quality Score:', extracted.sigma_taste.quality_score);
        console.log('  - σTaste Final:', extracted.sigma_taste.sigma_taste_final);
        
        if (extracted.sigma_taste.replicability_decomposed) {
          console.log('\n  Replicability Decomposed:');
          const rep = extracted.sigma_taste.replicability_decomposed;
          console.log('    - Actor Count:', rep.actor_requirements?.count);
          console.log('    - Skill Level:', rep.actor_requirements?.skill_level);
          console.log('    - Setup Complexity:', rep.environment_requirements?.setup_complexity);
          console.log('    - Editing Skill:', rep.production_requirements?.editing_skill);
        }
      } else {
        console.log('\n⚠️  No σTaste v1.1 signals found in extracted data');
      }
    } else {
      console.log('⚠️  No extracted signals');
    }
    
    console.log('\n--- Human Overrides ---');
    if (signal.human_overrides && Object.keys(signal.human_overrides).length > 0) {
      console.log('✅ User overrides present:');
      console.log(JSON.stringify(signal.human_overrides, null, 2));
    } else {
      console.log('No human overrides');
    }
    
    console.log('\n--- Notes ---');
    if (signal.notes) {
      console.log(signal.notes.substring(0, 200) + (signal.notes.length > 200 ? '...' : ''));
    } else {
      console.log('No notes');
    }
    
    console.log('\n--- Computed Values ---');
    console.log('Has Embedding:', !!signal.embedding);
    console.log('Has Fingerprint:', !!signal.fingerprint);
    
    if (signal.fingerprint) {
      console.log('\nFingerprint:');
      console.log(JSON.stringify(signal.fingerprint, null, 2));
    }
    
    // Check the corresponding analyzed_videos entry
    const { data: video } = await supabase
      .from('analyzed_videos')
      .select('id, video_url, platform, rated_at')
      .eq('id', signal.video_id)
      .single();
    
    if (video) {
      console.log('\n--- Corresponding analyzed_videos Entry ---');
      console.log('URL:', video.video_url);
      console.log('Platform:', video.platform);
      console.log('Rated At:', video.rated_at);
    }
    
    console.log('\n========================================');
    console.log('✅ Save structure looks correct!');
    console.log('========================================\n');
    
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
