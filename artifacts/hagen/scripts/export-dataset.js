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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function exportData() {
  console.log('Fetching data from Supabase...');
  
  // Get all ratings with video data
  const { data: ratings, error: ratingsErr } = await supabase
    .from('video_ratings')
    .select(`
      *,
      video:analyzed_videos(id, video_url, video_id, platform, metadata, visual_analysis, gcs_uri, created_at, analyzed_at)
    `)
    .order('rated_at', { ascending: false });

  if (ratingsErr) {
    console.error('Error fetching ratings:', ratingsErr);
    process.exit(1);
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    source: 'supabase',
    totalVideos: ratings.length,
    videos: ratings.map(r => ({
      id: r.video_id,
      video_url: r.video?.video_url,
      platform: r.video?.platform,
      metadata: r.video?.metadata,
      deep_analysis: r.video?.visual_analysis,
      gcs_uri: r.video?.gcs_uri,
      created_at: r.video?.created_at,
      analyzed_at: r.video?.analyzed_at,
      rating: {
        overall_score: r.overall_score,
        dimensions: r.dimensions,
        notes: r.notes,
        tags: r.tags,
        rated_at: r.rated_at,
        rater_id: r.rater_id
      },
      ai_prediction: r.ai_prediction
    }))
  };

  // Ensure exports directory exists
  if (!fs.existsSync('exports')) {
    fs.mkdirSync('exports');
  }

  const filename = `exports/dataset_${new Date().toISOString().split('T')[0]}.json`;
  fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
  console.log(`\nExported ${ratings.length} videos to ${filename}`);
  
  // Summary stats
  const withDeepAnalysis = ratings.filter(r => r.video?.visual_analysis?.visual?.hookStrength).length;
  const withNotes = ratings.filter(r => r.notes).length;
  const withAiPrediction = ratings.filter(r => r.ai_prediction).length;
  
  console.log('\nStats:');
  console.log('- With deep analysis:', withDeepAnalysis);
  console.log('- With human notes:', withNotes);
  console.log('- With AI prediction:', withAiPrediction);
}

exportData().catch(console.error);
