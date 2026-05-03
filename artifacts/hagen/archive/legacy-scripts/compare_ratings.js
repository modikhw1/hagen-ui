const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load env file manually
const envPath = '/workspaces/hagen/.env.local';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  console.error('URL:', supabaseUrl ? 'Found' : 'Missing');
  console.error('Key:', supabaseKey ? 'Found' : 'Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function compareRatings() {
  // Get 3 most recent ratings
  const { data: recentRatings, error: recentError } = await supabase
    .from('video_ratings')
    .select(`
      id,
      video_id,
      overall_score,
      dimensions,
      notes,
      tags,
      rated_at,
      video:analyzed_videos(
        metadata,
        visual_analysis
      )
    `)
    .order('rated_at', { ascending: false })
    .limit(3);

  if (recentError) {
    console.error('Error fetching recent ratings:', recentError);
    return;
  }

  // Get 10 older ratings (skip the 3 most recent)
  const { data: olderRatings, error: olderError } = await supabase
    .from('video_ratings')
    .select(`
      id,
      video_id,
      overall_score,
      dimensions,
      notes,
      tags,
      rated_at,
      video:analyzed_videos(
        metadata,
        visual_analysis
      )
    `)
    .order('rated_at', { ascending: false })
    .range(3, 12);

  if (olderError) {
    console.error('Error fetching older ratings:', olderError);
    return;
  }

  console.log('='.repeat(80));
  console.log('DATA RICHNESS COMPARISON');
  console.log('='.repeat(80));
  console.log();

  // Analyze recent ratings
  console.log('📊 RECENT RATINGS (Last 3)');
  console.log('='.repeat(80));
  recentRatings.forEach((rating, idx) => {
    console.log(`\nRating #${idx + 1} (ID: ${rating.id.substring(0, 8)}...)`);
    console.log(`Rated: ${rating.rated_at}`);
    console.log(`Overall Score: ${rating.overall_score}`);
    console.log(`Dimensions:`, rating.dimensions);
    console.log(`Notes Length: ${rating.notes?.length || 0} chars`);
    if (rating.notes) {
      console.log(`Notes Preview: ${rating.notes.substring(0, 100)}...`);
    }
    console.log(`Tags: ${rating.tags?.join(', ') || 'none'}`);
    
    const analysis = rating.video?.visual_analysis;
    if (analysis) {
      const featureCount = Object.keys(analysis).length;
      const deepAnalysis = analysis.deep_analysis || analysis.analysis;
      console.log(`Visual Analysis: ${featureCount} top-level keys`);
      if (deepAnalysis?.features) {
        console.log(`  - Features analyzed: ${Object.keys(deepAnalysis.features).length}`);
      }
      if (analysis.script) {
        console.log(`  - Script analysis: Available`);
      }
    } else {
      console.log('Visual Analysis: Not available');
    }
  });

  console.log();
  console.log('='.repeat(80));
  console.log('📊 OLDER RATINGS (10 samples)');
  console.log('='.repeat(80));
  olderRatings.forEach((rating, idx) => {
    console.log(`\nRating #${idx + 1} (ID: ${rating.id.substring(0, 8)}...)`);
    console.log(`Rated: ${rating.rated_at}`);
    console.log(`Overall Score: ${rating.overall_score}`);
    console.log(`Dimensions:`, rating.dimensions);
    console.log(`Notes Length: ${rating.notes?.length || 0} chars`);
    if (rating.notes) {
      console.log(`Notes Preview: ${rating.notes.substring(0, 100)}...`);
    }
    console.log(`Tags: ${rating.tags?.join(', ') || 'none'}`);
    
    const analysis = rating.video?.visual_analysis;
    if (analysis) {
      const featureCount = Object.keys(analysis).length;
      const deepAnalysis = analysis.deep_analysis || analysis.analysis;
      console.log(`Visual Analysis: ${featureCount} top-level keys`);
      if (deepAnalysis?.features) {
        console.log(`  - Features analyzed: ${Object.keys(deepAnalysis.features).length}`);
      }
      if (analysis.script) {
        console.log(`  - Script analysis: Available`);
      }
    } else {
      console.log('Visual Analysis: Not available');
    }
  });

  // Calculate statistics
  console.log();
  console.log('='.repeat(80));
  console.log('📈 COMPARISON STATISTICS');
  console.log('='.repeat(80));

  const recentStats = {
    avgNotesLength: recentRatings.reduce((sum, r) => sum + (r.notes?.length || 0), 0) / recentRatings.length,
    avgTagCount: recentRatings.reduce((sum, r) => sum + (r.tags?.length || 0), 0) / recentRatings.length,
    withAnalysis: recentRatings.filter(r => r.video?.visual_analysis).length,
    withDeepAnalysis: recentRatings.filter(r => {
      const analysis = r.video?.visual_analysis;
      return analysis?.deep_analysis || analysis?.analysis?.features;
    }).length,
    withScriptAnalysis: recentRatings.filter(r => r.video?.visual_analysis?.script).length
  };

  const olderStats = {
    avgNotesLength: olderRatings.reduce((sum, r) => sum + (r.notes?.length || 0), 0) / olderRatings.length,
    avgTagCount: olderRatings.reduce((sum, r) => sum + (r.tags?.length || 0), 0) / olderRatings.length,
    withAnalysis: olderRatings.filter(r => r.video?.visual_analysis).length,
    withDeepAnalysis: olderRatings.filter(r => {
      const analysis = r.video?.visual_analysis;
      return analysis?.deep_analysis || analysis?.analysis?.features;
    }).length,
    withScriptAnalysis: olderRatings.filter(r => r.video?.visual_analysis?.script).length
  };

  console.log(`\n✨ Recent (Last 3):`);
  console.log(`  Average notes length: ${recentStats.avgNotesLength.toFixed(1)} chars`);
  console.log(`  Average tags per rating: ${recentStats.avgTagCount.toFixed(1)}`);
  console.log(`  Videos with visual analysis: ${recentStats.withAnalysis}/${recentRatings.length}`);
  console.log(`  Videos with deep analysis: ${recentStats.withDeepAnalysis}/${recentRatings.length}`);
  console.log(`  Videos with script analysis: ${recentStats.withScriptAnalysis}/${recentRatings.length}`);

  console.log(`\n📚 Older (10 samples):`);
  console.log(`  Average notes length: ${olderStats.avgNotesLength.toFixed(1)} chars`);
  console.log(`  Average tags per rating: ${olderStats.avgTagCount.toFixed(1)}`);
  console.log(`  Videos with visual analysis: ${olderStats.withAnalysis}/${olderRatings.length}`);
  console.log(`  Videos with deep analysis: ${olderStats.withDeepAnalysis}/${olderRatings.length}`);
  console.log(`  Videos with script analysis: ${olderStats.withScriptAnalysis}/${olderRatings.length}`);

  const notesChange = recentStats.avgNotesLength - olderStats.avgNotesLength;
  const notesPercent = olderStats.avgNotesLength > 0 ? ((notesChange / olderStats.avgNotesLength) * 100) : 0;

  console.log(`\n📊 VERDICT:`);
  console.log(`  Notes length: ${notesChange > 0 ? '📈 RICHER' : '📉 LESS RICH'} by ${Math.abs(notesChange).toFixed(1)} chars (${notesPercent > 0 ? '+' : ''}${notesPercent.toFixed(1)}%)`);
  console.log(`  Tags per rating: ${recentStats.avgTagCount > olderStats.avgTagCount ? '📈 MORE' : '📉 FEWER'} by ${Math.abs(recentStats.avgTagCount - olderStats.avgTagCount).toFixed(1)}`);
  console.log(`  Deep analysis coverage: ${recentStats.withDeepAnalysis}/${recentRatings.length} vs ${olderStats.withDeepAnalysis}/${olderRatings.length}`);
  console.log(`  Script analysis: ${recentStats.withScriptAnalysis}/${recentRatings.length} vs ${olderStats.withScriptAnalysis}/${olderRatings.length}`);

  if (notesChange > 50) {
    console.log('\n✅ Recent ratings are SIGNIFICANTLY RICHER in qualitative notes');
  } else if (notesChange < -50) {
    console.log('\n⚠️ Recent ratings are LESS RICH in qualitative notes');
  } else {
    console.log('\n➡️ Data richness is SIMILAR between old and new systems');
  }
}

compareRatings().catch(console.error);
