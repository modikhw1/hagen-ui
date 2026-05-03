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
    console.log('\n=== Checking which tables exist ===\n');
    
    // Check video_ratings
    const { data: vr, error: vrError } = await supabase
      .from('video_ratings')
      .select('*')
      .limit(0);
    
    if (vrError) {
      console.log('❌ video_ratings:', vrError.message);
    } else {
      console.log('✅ video_ratings exists');
    }
    
    // Check video_brand_ratings
    const { data: vbr, error: vbrError } = await supabase
      .from('video_brand_ratings')
      .select('*')
      .limit(0);
    
    if (vbrError) {
      console.log('❌ video_brand_ratings:', vbrError.message);
    } else {
      console.log('✅ video_brand_ratings exists');
    }
    
    // Check video_signals (NEW architecture)
    const { data: vs, error: vsError } = await supabase
      .from('video_signals')
      .select('*')
      .limit(0);
    
    if (vsError) {
      console.log('❌ video_signals:', vsError.message);
    } else {
      console.log('✅ video_signals exists (NEW ARCHITECTURE)');
    }
    
    console.log('\n=== Checking what /analyze-rate currently saves to ===\n');
    
    // Get most recent video_ratings entry
    const { data: recentRating } = await supabase
      .from('video_ratings')
      .select('id, video_id, rated_at')
      .order('rated_at', { ascending: false })
      .limit(1);
    
    if (recentRating && recentRating[0]) {
      console.log('Most recent video_ratings entry:');
      console.log('  - Rated at:', recentRating[0].rated_at);
      console.log('  - Video ID:', recentRating[0].video_id);
    } else {
      console.log('No entries in video_ratings yet');
    }
    
    // Get most recent video_brand_ratings entry
    const { data: recentBrand } = await supabase
      .from('video_brand_ratings')
      .select('video_id, created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (recentBrand && recentBrand[0]) {
      console.log('\nMost recent video_brand_ratings entry:');
      console.log('  - Created at:', recentBrand[0].created_at);
      console.log('  - Video ID:', recentBrand[0].video_id);
    } else {
      console.log('\nNo entries in video_brand_ratings yet');
    }
    
    // Get most recent video_signals entry
    const { data: recentSignal } = await supabase
      .from('video_signals')
      .select('video_id, created_at, schema_version')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (recentSignal && recentSignal[0]) {
      console.log('\nMost recent video_signals entry:');
      console.log('  - Created at:', recentSignal[0].created_at);
      console.log('  - Video ID:', recentSignal[0].video_id);
      console.log('  - Schema version:', recentSignal[0].schema_version);
    } else {
      console.log('\nNo entries in video_signals yet');
    }
    
    console.log('\n=== Conclusion ===\n');
    if (vsError && !vrError) {
      console.log('You are using the LEGACY schema (video_ratings, video_brand_ratings)');
      console.log('The NEW schema (video_signals) has not been migrated yet.');
      console.log('\nTo migrate, run: supabase/migrations/016_video_signals_table.sql');
    } else if (!vsError) {
      console.log('You have the NEW schema (video_signals) available!');
      console.log('But /analyze-rate may still be writing to the old tables.');
      console.log('Check src/app/api/analyze-rate/route.ts to see which tables it writes to.');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
