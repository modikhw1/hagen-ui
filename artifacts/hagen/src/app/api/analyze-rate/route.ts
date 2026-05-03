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

    // Add structured overrides if provided by user
    if (structured_replicability) {
      humanOverrides.replicability_signals = {
        equipment_requirements: structured_replicability.equipment_needed?.length > 0 ? 5 : 2,
        skill_requirements: structured_replicability.skill_required === 'anyone' ? 2 : 
                           structured_replicability.skill_required === 'comfortable_on_camera' ? 4 :
                           structured_replicability.skill_required === 'acting_required' ? 7 : 9,
        time_investment: structured_replicability.estimated_time === 'under_15min' ? 2 :
                        structured_replicability.estimated_time === 'under_1hr' ? 4 :
                        structured_replicability.estimated_time === 'half_day' ? 7 : 9,
        budget_requirements: 3, // Default moderate
      };
    }

    if (target_audience_signals) {
      humanOverrides.audience_signals = {
        primary_ages: target_audience_signals.age_range ? [target_audience_signals.age_range] : undefined,
        vibe_alignments: target_audience_signals.lifestyle_tags,
        engagement_style: 'passive',
        niche_specificity: 5,
      };
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
    try {
      embedding = await generateEmbedding(embeddingText);
    } catch (embeddingError) {
      console.error('Error generating embedding:', embeddingError);
      // Continue without embedding - can be generated later
      embedding = undefined;
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

    // Check if signal record exists for this video
    const { data: existingSignal } = await supabase
      .from('video_signals')
      .select('id')
      .eq('video_id', videoId)
      .is('brand_id', null)
      .single();

    let signalResult;
    if (existingSignal) {
      // Update existing
      signalResult = await supabase
        .from('video_signals')
        .update(videoSignalsData)
        .eq('id', existingSignal.id)
        .select('id')
        .single();
    } else {
      // Insert new
      signalResult = await supabase
        .from('video_signals')
        .insert(videoSignalsData)
        .select('id')
        .single();
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
      message: 'Rating saved to video_signals with v1.1 schema'
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
