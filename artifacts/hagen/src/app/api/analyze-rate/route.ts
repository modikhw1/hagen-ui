import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { SignalExtractor } from '@/lib/services/signals/extractor';
import { VideoSignals, CURRENT_SCHEMA_VERSION } from '@/lib/services/signals/types';

// Use service role key for server-side operations (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

// Initialize the signal extractor with current schema version
const extractor = new SignalExtractor(CURRENT_SCHEMA_VERSION);

export async function POST(request: NextRequest) {
  try {
    console.log('📝 /api/analyze-rate - Processing request...');
    
    const body = await request.json();
    const {
      video_url,
      quality_tier,
      notes,
      replicability_notes,
      brand_tone_notes,
      analysis_notes,
      gemini_analysis,
      similar_videos,
      // v1.1: Complete structured signals (human overrides)
      structured_replicability,
      risk_level_signals,
      environment_signals,
      target_audience_signals
    } = body;

    console.log('📹 Video URL:', video_url);
    console.log('⭐ Quality tier:', quality_tier);

    if (!video_url || !quality_tier) {
      return NextResponse.json(
        { error: 'video_url and quality_tier are required' },
        { status: 400 }
      );
    }

    // Step 1: Find or create the video in analyzed_videos
    let videoId: string;
    
    // Extract platform video ID from URL
    const extractPlatformVideoId = (url: string): string => {
      // TikTok: /video/1234567890
      const tiktokMatch = url.match(/video\/(\d+)/);
      if (tiktokMatch) return tiktokMatch[1];
      
      // YouTube: v=xxxxx or youtu.be/xxxxx
      const ytMatch = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
      if (ytMatch) return ytMatch[1];
      
      // Instagram: /reel/xxxxx or /p/xxxxx
      const igMatch = url.match(/(?:reel|p)\/([a-zA-Z0-9_-]+)/);
      if (igMatch) return igMatch[1];
      
      // Fallback: hash the URL
      return video_url.replace(/[^a-zA-Z0-9]/g, '').slice(-20);
    };
    
    const platformVideoId = extractPlatformVideoId(video_url);
    
    // Check if video already exists
    const { data: existingVideo } = await supabase
      .from('analyzed_videos')
      .select('id')
      .eq('video_url', video_url)
      .single();
    
    if (existingVideo) {
      videoId = existingVideo.id;
    } else {
      // Create new video entry
      const { data: newVideo, error: createError } = await supabase
        .from('analyzed_videos')
        .insert({
          video_url,
          video_id: platformVideoId,
          platform: video_url.includes('tiktok') ? 'tiktok' : 
                   video_url.includes('youtube') ? 'youtube' : 
                   video_url.includes('instagram') ? 'instagram' : 'unknown',
          visual_analysis: gemini_analysis
        })
        .select('id')
        .single();
      
      if (createError) {
        console.error('Error creating video:', createError);
        return NextResponse.json(
          { error: 'Failed to create video entry', details: createError.message },
          { status: 500 }
        );
      }
      videoId = newVideo.id;
    }

    // Step 2: Extract signals from Gemini analysis using SignalExtractor
    const extractionResult = extractor.extract({
      visual_analysis: gemini_analysis || {},
      schema_version: CURRENT_SCHEMA_VERSION,
    });

    if (!extractionResult.success || !extractionResult.signals) {
      console.warn('Signal extraction had issues:', extractionResult.errors);
      // Continue with empty signals - user overrides will still be saved
    }

    const extractedSignals: VideoSignals = extractionResult.signals || {
      schema_version: CURRENT_SCHEMA_VERSION,
      extracted_at: new Date().toISOString(),
      extraction_source: 'gemini',
    };

    // Step 3: Build human overrides from UI input
    const humanOverrides: Partial<VideoSignals> = {};

    // Build combined notes for the notes field
    const combinedNotes = [
      `[${quality_tier.toUpperCase()}]`,
      notes,
      replicability_notes ? `Replicability: ${replicability_notes}` : null,
      brand_tone_notes ? `Brand/Tone: ${brand_tone_notes}` : null,
      analysis_notes ? `Analysis Notes: ${analysis_notes}` : null
    ].filter(Boolean).join('\n\n');

    // Map UI replicability enums into the σTaste replicability_decomposed shape.
    // We only fill fields the user actually selected — no hardcoded defaults so
    // we never silently downgrade richer values the AI extracted.
    const actorCountMap: Record<string, 'solo' | 'duo' | 'small_group' | 'crowd'> = {
      solo: 'solo',
      duo: 'duo',
      small_team: 'small_group',
      large_team: 'crowd',
    };
    const skillMap: Record<string, 'anyone' | 'comfortable_on_camera' | 'acting_required' | 'professional'> = {
      anyone: 'anyone',
      basic_editing: 'comfortable_on_camera',
      intermediate: 'acting_required',
      professional: 'professional',
      // Pass-through for σTaste-native values
      comfortable_on_camera: 'comfortable_on_camera',
      acting_required: 'acting_required',
    };
    const setupMap: Record<string, 'point_and_shoot' | 'basic_tripod' | 'multi_location' | 'elaborate_staging'> = {
      phone_only: 'point_and_shoot',
      basic_tripod: 'basic_tripod',
      lighting_setup: 'multi_location',
      full_studio: 'elaborate_staging',
      // Pass-through
      point_and_shoot: 'point_and_shoot',
      multi_location: 'multi_location',
      elaborate_staging: 'elaborate_staging',
    };

    // Helper: deep-merge plain objects so we never erase sibling fields the AI
    // already extracted. Arrays/scalars are replaced wholesale (intended for
    // human edits like "the actual primary_ages list is X").
    const isPlainObject = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null && !Array.isArray(v);
    const deepMerge = (
      base: Record<string, unknown>,
      patch: Record<string, unknown>
    ): Record<string, unknown> => {
      const out: Record<string, unknown> = { ...base };
      for (const [k, v] of Object.entries(patch)) {
        if (isPlainObject(v) && isPlainObject(out[k])) {
          out[k] = deepMerge(out[k] as Record<string, unknown>, v);
        } else {
          out[k] = v;
        }
      }
      return out;
    };

    if (structured_replicability) {
      const rep = structured_replicability;
      const actorReq: Record<string, unknown> = {};
      if (rep.actor_count && actorCountMap[rep.actor_count]) {
        actorReq.count = actorCountMap[rep.actor_count];
      }
      if (rep.skill_required && skillMap[rep.skill_required]) {
        actorReq.skill_level = skillMap[rep.skill_required];
      }

      const envReq: Record<string, unknown> = {};
      if (rep.setup_complexity && setupMap[rep.setup_complexity]) {
        envReq.setup_complexity = setupMap[rep.setup_complexity];
      }
      if (Array.isArray(rep.equipment_needed) && rep.equipment_needed.length > 0) {
        envReq.prop_dependency = {
          level: 'specific_props',
          items: rep.equipment_needed,
        };
      }

      const prodReq: Record<string, unknown> = {};
      if (rep.estimated_time) {
        prodReq.estimated_time = rep.estimated_time;
      }

      const replicabilityPatch: Record<string, unknown> = {};
      if (Object.keys(actorReq).length) replicabilityPatch.actor_requirements = actorReq;
      if (Object.keys(envReq).length) replicabilityPatch.environment_requirements = envReq;
      if (Object.keys(prodReq).length) replicabilityPatch.production_requirements = prodReq;

      if (Object.keys(replicabilityPatch).length > 0) {
        // Deep-merge into the extracted sigma_taste so unspecified subfields
        // (skill_level, social_risk_required, etc.) the AI found are preserved.
        const baseSigma = (extractedSignals.sigma_taste || {}) as Record<string, unknown>;
        const mergedSigma = deepMerge(baseSigma, {
          replicability_decomposed: replicabilityPatch,
        });
        humanOverrides.sigma_taste = mergedSigma as unknown as VideoSignals['sigma_taste'];
      }
    }

    if (target_audience_signals) {
      const aud = target_audience_signals;
      // Accept both the new multi-range shape (primary_ages: string[]) and the
      // legacy single age_range object so older callers don't break.
      let primaryAges: string[] | undefined;
      if (Array.isArray(aud.primary_ages) && aud.primary_ages.length > 0) {
        primaryAges = aud.primary_ages.filter((a: unknown): a is string => typeof a === 'string');
      } else if (aud.age_range?.primary) {
        primaryAges = [aud.age_range.primary, aud.age_range.secondary]
          .filter((a: unknown): a is string => typeof a === 'string' && a !== 'none');
      }

      const audiencePatch: Record<string, unknown> = {};
      if (primaryAges && primaryAges.length > 0) audiencePatch.primary_ages = primaryAges;
      if (Array.isArray(aud.vibe_alignment) && aud.vibe_alignment.length > 0) {
        audiencePatch.vibe_alignments = aud.vibe_alignment;
      } else if (Array.isArray(aud.lifestyle_tags) && aud.lifestyle_tags.length > 0) {
        // Lifestyle tags are not vibes; only fall back if no vibes were selected.
        audiencePatch.vibe_alignments = aud.lifestyle_tags;
      }
      if (Object.keys(audiencePatch).length > 0) {
        // Deep-merge with extracted audience_signals so engagement_style /
        // niche_specificity / other AI-extracted fields aren't blown away by a
        // shallow JSONB merge in get_merged_signals.
        const baseAud = (extractedSignals.audience_signals || {}) as Record<string, unknown>;
        humanOverrides.audience_signals = deepMerge(baseAud, audiencePatch) as VideoSignals['audience_signals'];
      }
    }

    // Step 4: Convert quality tier to numeric rating (1-10)
    const tierToRating: Record<string, number> = {
      'excellent': 9,
      'good': 7,
      'mediocre': 5,
      'bad': 3
    };
    const rating = tierToRating[quality_tier] || 5;

    // Step 5: Build embedding text for similarity search
    const embeddingParts: string[] = [];
    embeddingParts.push(`Quality: ${quality_tier}`);
    if (notes) embeddingParts.push(`Notes: ${notes}`);
    if (replicability_notes) embeddingParts.push(`Replicability: ${replicability_notes}`);
    if (brand_tone_notes) embeddingParts.push(`Brand/Tone: ${brand_tone_notes}`);
    if (analysis_notes) embeddingParts.push(`Analysis corrections: ${analysis_notes}`);
    
    // Include Gemini's interpretation for context
    if (gemini_analysis?.script?.humor?.humorType) {
      embeddingParts.push(`Humor type: ${gemini_analysis.script.humor.humorType}`);
    }
    if (gemini_analysis?.visual?.summary) {
      embeddingParts.push(`Visual: ${gemini_analysis.visual.summary}`);
    }
    if (extractedSignals.sigma_taste?.content_classification?.content_type) {
      embeddingParts.push(`Content type: ${extractedSignals.sigma_taste.content_classification.content_type}`);
    }

    const embeddingText = embeddingParts.join('\n');
    
    // Generate embedding (with error handling)
    let embedding: number[] | undefined;
    let embeddingError: string | undefined;
    try {
      embedding = await generateEmbedding(embeddingText);
    } catch (err) {
      console.error('Error generating embedding:', err);
      embedding = undefined;
      embeddingError = err instanceof Error ? err.message : 'Unknown embedding error';
    }

    // Step 6: Upsert into video_signals (NEW unified table)
    const videoSignalsData = {
      video_id: videoId,
      brand_id: null, // No brand association for general ratings
      schema_version: CURRENT_SCHEMA_VERSION,
      extracted: extractedSignals,
      human_overrides: Object.keys(humanOverrides).length > 0 ? humanOverrides : null,
      rating,
      rating_confidence: 'high' as const, // Human ratings are high confidence
      notes: combinedNotes,
      embedding,
      source: 'manual' as const,
    };

    // Upsert against the (video_id, brand_id) unique constraint. Migration 026
    // makes that constraint NULLS NOT DISTINCT so brand_id IS NULL rows are
    // unique per video and concurrent confirms can't create duplicates.
    let signalResult = await supabase
      .from('video_signals')
      .upsert(videoSignalsData, { onConflict: 'video_id,brand_id' })
      .select('id')
      .single();

    if (signalResult.error) {
      // Fallback for environments where migration 026 hasn't been applied yet:
      // do an explicit select-then-update/insert. Still race-prone there, but
      // matches prior behavior so we don't regress.
      console.warn('Upsert failed, falling back to select+update/insert:', signalResult.error.message);
      const { data: existingSignal } = await supabase
        .from('video_signals')
        .select('id')
        .eq('video_id', videoId)
        .is('brand_id', null)
        .maybeSingle();

      if (existingSignal) {
        signalResult = await supabase
          .from('video_signals')
          .update(videoSignalsData)
          .eq('id', existingSignal.id)
          .select('id')
          .single();
      } else {
        signalResult = await supabase
          .from('video_signals')
          .insert(videoSignalsData)
          .select('id')
          .single();
      }
    }

    if (signalResult.error) {
      console.error('Error saving to video_signals:', signalResult.error);
      return NextResponse.json(
        { error: 'Failed to save rating', details: signalResult.error.message },
        { status: 500 }
      );
    }

    // Step 7: Update analyzed_videos with rated_at timestamp
    await supabase
      .from('analyzed_videos')
      .update({ 
        rated_at: new Date().toISOString()
      })
      .eq('id', videoId);

    console.log('✅ Successfully saved to video_signals');
    
    return NextResponse.json({
      success: true,
      id: signalResult.data.id,
      video_id: videoId,
      quality_tier,
      schema_version: CURRENT_SCHEMA_VERSION,
      extraction_coverage: extractionResult.coverage,
      embedding_saved: embedding !== undefined,
      embedding_error: embeddingError,
      message: embeddingError
        ? 'Rating saved, but embedding generation failed. Re-submit to retry.'
        : 'Rating saved to video_signals with v1.1 schema'
    });

  } catch (error) {
    console.error('❌ API error in /api/analyze-rate:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    });
    return response.data[0].embedding;
  } catch (error) {
    console.error('OpenAI embedding error:', error);
    throw error;
  }
}
