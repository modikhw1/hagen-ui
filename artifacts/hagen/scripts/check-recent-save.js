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
    // Check most recent video_ratings entry
    const { data: ratings, error: rError } = await supabase
      .from('video_ratings')
      .select('id, video_id, overall_score, rated_at, notes')
      .order('rated_at', { ascending: false })
      .limit(1);
    
    if (rError) {
      console.log('Error fetching video_ratings:', rError);
    } else if (ratings && ratings[0]) {
      console.log('\n=== Most Recent video_ratings Entry ===');
      console.log('Rated at:', ratings[0].rated_at);
      console.log('Score:', ratings[0].overall_score);
      console.log('Notes:', ratings[0].notes?.substring(0, 100) + '...');
    } else {
      console.log('\nNo video_ratings found');
    }
    
    // Check most recent video_brand_ratings entry
    const { data: brandRatings, error: bError } = await supabase
      .from('video_brand_ratings')
      .select('video_id, rater_id, replicability_signals, risk_level_signals, environment_signals, audience_signals, created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (bError) {
      console.log('\nError fetching video_brand_ratings:', bError.message);
    } else if (brandRatings && brandRatings[0]) {
      console.log('\n=== Most Recent video_brand_ratings Entry ===');
      console.log('Created:', brandRatings[0].created_at);
      console.log('Rater:', brandRatings[0].rater_id);
      console.log('Has v1.1 signals:');
      console.log('  - replicability:', !!brandRatings[0].replicability_signals);
      console.log('  - risk_level:', !!brandRatings[0].risk_level_signals);
      console.log('  - environment:', !!brandRatings[0].environment_signals);
      console.log('  - audience:', !!brandRatings[0].audience_signals);
      
      if (brandRatings[0].replicability_signals) {
        console.log('\nReplicability Signals:');
        console.log(JSON.stringify(brandRatings[0].replicability_signals, null, 2));
      }
    } else {
      console.log('\nNo video_brand_ratings found');
    }
    
    // Check if both entries match
    if (ratings && ratings[0] && brandRatings && brandRatings[0]) {
      if (ratings[0].video_id === brandRatings[0].video_id) {
        console.log('\n✅ Both tables have matching video_id - save was successful!');
      } else {
        console.log('\n⚠️  WARNING: video_ids do not match between tables');
        console.log('video_ratings video_id:', ratings[0].video_id);
        console.log('video_brand_ratings video_id:', brandRatings[0].video_id);
      }
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
