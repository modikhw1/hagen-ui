#!/usr/bin/env npx ts-node
/**
 * Migration Script: Migrate existing data to video_signals table
 * 
 * This script migrates data from legacy tables to the new unified video_signals table.
 * 
 * Usage:
 *   npx tsx scripts/migrate-to-video-signals.ts --dry-run    # Preview changes
 *   npx tsx scripts/migrate-to-video-signals.ts              # Execute migration
 *   npx tsx scripts/migrate-to-video-signals.ts --force      # Skip confirmations
 * 
 * Sources:
 *   1. analyzed_videos.visual_analysis → extract signals → video_signals.extracted
 *   2. video_brand_ratings → video_signals (rating, notes, rater as brand_id)
 *   3. video_ratings → video_signals (legacy user ratings)
 */

import { createClient } from '@supabase/supabase-js';
import { SignalExtractor } from '../src/lib/services/signals/extractor';
import { VideoSignals, CURRENT_SCHEMA_VERSION } from '../src/lib/services/signals/types';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

// Load environment variables
dotenv.config({ path: '.env.local' });

// =============================================================================
// CONFIGURATION
// =============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Try service role key first, fall back to anon key
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE key (service role or anon)');
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log('⚠️  Using anon key - writes may fail if RLS policies don\'t allow it');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const extractor = new SignalExtractor(CURRENT_SCHEMA_VERSION);

// =============================================================================
// TYPES
// =============================================================================

interface MigrationStats {
  analyzed_videos_processed: number;
  video_brand_ratings_processed: number;
  video_ratings_processed: number;
  signals_created: number;
  signals_updated: number;
  errors: number;
  skipped: number;
}

interface AnalyzedVideo {
  id: string;
  video_url: string;
  title: string;
  visual_analysis: Record<string, unknown>;
}

interface VideoBrandRating {
  id: string;
  video_id: string;
  rater_id: string;
  rating: number;
  rating_confidence: string;
  notes: string;
  audience_signals: Record<string, unknown>;
  replicability_signals: Record<string, unknown>;
  content_density_signals: Record<string, unknown>;
  production_quality_signals: Record<string, unknown>;
}

// =============================================================================
// MAIN MIGRATION FUNCTION
// =============================================================================

async function migrateToVideoSignals(dryRun: boolean = true): Promise<MigrationStats> {
  const stats: MigrationStats = {
    analyzed_videos_processed: 0,
    video_brand_ratings_processed: 0,
    video_ratings_processed: 0,
    signals_created: 0,
    signals_updated: 0,
    errors: 0,
    skipped: 0,
  };

  console.log(`\n🚀 Starting migration (${dryRun ? 'DRY RUN' : 'LIVE'})...\n`);

  // Step 1: Migrate from analyzed_videos.visual_analysis
  console.log('📊 Step 1: Processing analyzed_videos...');
  await migrateAnalyzedVideos(stats, dryRun);

  // Step 2: Migrate from video_brand_ratings (if table exists)
  console.log('\n📊 Step 2: Processing video_brand_ratings...');
  await migrateVideoBrandRatings(stats, dryRun);

  // Step 3: Migrate from video_ratings (if table exists)
  console.log('\n📊 Step 3: Processing video_ratings...');
  await migrateVideoRatings(stats, dryRun);

  return stats;
}

// =============================================================================
// STEP 1: MIGRATE ANALYZED VIDEOS
// =============================================================================

async function migrateAnalyzedVideos(stats: MigrationStats, dryRun: boolean) {
  const { data: videos, error } = await supabase
    .from('analyzed_videos')
    .select('id, video_url, title, visual_analysis')
    .not('visual_analysis', 'is', null);

  if (error) {
    console.error('❌ Error fetching analyzed_videos:', error.message);
    stats.errors++;
    return;
  }

  if (!videos || videos.length === 0) {
    console.log('   No analyzed_videos with visual_analysis found');
    return;
  }

  console.log(`   Found ${videos.length} videos with visual_analysis`);

  for (const video of videos as AnalyzedVideo[]) {
    try {
      // Extract signals from visual_analysis
      const result = extractor.extract({ visual_analysis: video.visual_analysis });
      
      if (!result.success || !result.signals) {
        console.log(`   ⚠️  Skipping ${video.id}: extraction failed`);
        stats.skipped++;
        continue;
      }

      // Check if signal row already exists
      const { data: existing } = await supabase
        .from('video_signals')
        .select('id')
        .eq('video_id', video.id)
        .is('brand_id', null)
        .single();

      if (existing) {
        // Update existing
        if (!dryRun) {
          await supabase
            .from('video_signals')
            .update({
              extracted: result.signals,
              schema_version: CURRENT_SCHEMA_VERSION,
              source: 'migration',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        }
        console.log(`   ✓ Updated signals for ${video.title?.substring(0, 40) || video.id}`);
        stats.signals_updated++;
      } else {
        // Insert new
        if (!dryRun) {
          await supabase
            .from('video_signals')
            .insert({
              video_id: video.id,
              brand_id: null,
              schema_version: CURRENT_SCHEMA_VERSION,
              extracted: result.signals,
              source: 'migration',
            });
        }
        console.log(`   + Created signals for ${video.title?.substring(0, 40) || video.id}`);
        stats.signals_created++;
      }

      stats.analyzed_videos_processed++;
    } catch (err) {
      console.error(`   ❌ Error processing ${video.id}:`, err);
      stats.errors++;
    }
  }
}

// =============================================================================
// STEP 2: MIGRATE VIDEO BRAND RATINGS
// =============================================================================

async function migrateVideoBrandRatings(stats: MigrationStats, dryRun: boolean) {
  // Check if table exists by trying to query it
  const { data: ratings, error } = await supabase
    .from('video_brand_ratings')
    .select('*')
    .limit(1000);

  if (error) {
    if (error.message.includes('does not exist')) {
      console.log('   Table video_brand_ratings does not exist, skipping');
      return;
    }
    console.error('❌ Error fetching video_brand_ratings:', error.message);
    stats.errors++;
    return;
  }

  if (!ratings || ratings.length === 0) {
    console.log('   No video_brand_ratings found');
    return;
  }

  console.log(`   Found ${ratings.length} brand ratings`);

  for (const rating of ratings as VideoBrandRating[]) {
    try {
      // Construct signals from the JSONB columns
      const signals: VideoSignals = {
        schema_version: CURRENT_SCHEMA_VERSION,
        extracted_at: new Date().toISOString(),
        extraction_source: 'migration',
      };

      // Merge in existing signal data from columns
      if (rating.audience_signals) {
        signals.audience_signals = rating.audience_signals as VideoSignals['audience_signals'];
      }
      if (rating.replicability_signals) {
        signals.replicability_signals = rating.replicability_signals as VideoSignals['replicability_signals'];
      }
      if (rating.content_density_signals) {
        signals.content_density_signals = rating.content_density_signals as VideoSignals['content_density_signals'];
      }
      if (rating.production_quality_signals) {
        signals.production_quality_signals = rating.production_quality_signals as VideoSignals['production_quality_signals'];
      }

      // Check if signal row already exists for this video+brand combo
      const { data: existing } = await supabase
        .from('video_signals')
        .select('id')
        .eq('video_id', rating.video_id)
        .eq('brand_id', rating.rater_id)
        .single();

      if (existing) {
        // Update existing
        if (!dryRun) {
          await supabase
            .from('video_signals')
            .update({
              extracted: signals,
              human_overrides: signals, // Brand ratings are human input
              rating: rating.rating,
              rating_confidence: rating.rating_confidence,
              notes: rating.notes,
              source: 'migration',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        }
        console.log(`   ✓ Updated brand rating for video ${rating.video_id}`);
        stats.signals_updated++;
      } else {
        // Insert new
        if (!dryRun) {
          await supabase
            .from('video_signals')
            .insert({
              video_id: rating.video_id,
              brand_id: rating.rater_id,
              schema_version: CURRENT_SCHEMA_VERSION,
              extracted: signals,
              human_overrides: signals,
              rating: rating.rating,
              rating_confidence: rating.rating_confidence,
              notes: rating.notes,
              source: 'migration',
            });
        }
        console.log(`   + Created brand rating for video ${rating.video_id}`);
        stats.signals_created++;
      }

      stats.video_brand_ratings_processed++;
    } catch (err) {
      console.error(`   ❌ Error processing brand rating ${rating.id}:`, err);
      stats.errors++;
    }
  }
}

// =============================================================================
// STEP 3: MIGRATE VIDEO RATINGS (LEGACY)
// =============================================================================

async function migrateVideoRatings(stats: MigrationStats, dryRun: boolean) {
  // Check if table exists
  const { data: ratings, error } = await supabase
    .from('video_ratings')
    .select('*')
    .limit(1000);

  if (error) {
    if (error.message.includes('does not exist')) {
      console.log('   Table video_ratings does not exist, skipping');
      return;
    }
    console.error('❌ Error fetching video_ratings:', error.message);
    stats.errors++;
    return;
  }

  if (!ratings || ratings.length === 0) {
    console.log('   No video_ratings found');
    return;
  }

  console.log(`   Found ${ratings.length} legacy ratings`);

  for (const rating of ratings) {
    try {
      // Legacy ratings have less structured data
      const signals: VideoSignals = {
        schema_version: 'v1.0', // Legacy ratings are v1.0
        extracted_at: new Date().toISOString(),
        extraction_source: 'migration',
        pacing: rating.pacing,
        humor: rating.humor,
        teaching_style: rating.teaching_style,
        content_type: rating.content_type,
      };

      // Check if already exists
      const { data: existing } = await supabase
        .from('video_signals')
        .select('id')
        .eq('video_id', rating.video_id)
        .is('brand_id', null)
        .single();

      if (existing) {
        // Merge with existing (don't overwrite with legacy data if newer exists)
        console.log(`   ~ Skipping legacy rating (newer signal exists) for ${rating.video_id}`);
        stats.skipped++;
      } else {
        // Insert new
        if (!dryRun) {
          await supabase
            .from('video_signals')
            .insert({
              video_id: rating.video_id,
              brand_id: null,
              schema_version: 'v1.0',
              extracted: signals,
              human_overrides: signals,
              rating: rating.rating,
              notes: rating.notes,
              source: 'migration',
            });
        }
        console.log(`   + Created legacy rating for ${rating.video_id}`);
        stats.signals_created++;
      }

      stats.video_ratings_processed++;
    } catch (err) {
      console.error(`   ❌ Error processing legacy rating:`, err);
      stats.errors++;
    }
  }
}

// =============================================================================
// CLI INTERFACE
// =============================================================================

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--force') && (args.includes('--dry-run') || !args.includes('--execute'));
  const skipConfirm = args.includes('--force');

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║          VIDEO SIGNALS MIGRATION SCRIPT                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\nMode: ${dryRun ? '🔍 DRY RUN (no changes will be made)' : '⚡ LIVE EXECUTION'}`);

  if (!dryRun && !skipConfirm) {
    const answer = await prompt('\n⚠️  This will modify your database. Continue? (y/N): ');
    if (answer.toLowerCase() !== 'y') {
      console.log('Migration cancelled.');
      process.exit(0);
    }
  }

  const stats = await migrateToVideoSignals(dryRun);

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    MIGRATION SUMMARY                            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\n📊 Processed:`);
  console.log(`   - analyzed_videos: ${stats.analyzed_videos_processed}`);
  console.log(`   - video_brand_ratings: ${stats.video_brand_ratings_processed}`);
  console.log(`   - video_ratings: ${stats.video_ratings_processed}`);
  console.log(`\n📝 Results:`);
  console.log(`   - Signals created: ${stats.signals_created}`);
  console.log(`   - Signals updated: ${stats.signals_updated}`);
  console.log(`   - Skipped: ${stats.skipped}`);
  console.log(`   - Errors: ${stats.errors}`);

  if (dryRun) {
    console.log('\n💡 This was a dry run. To execute, run:');
    console.log('   npx ts-node scripts/migrate-to-video-signals.ts --execute');
  }

  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch(console.error);
