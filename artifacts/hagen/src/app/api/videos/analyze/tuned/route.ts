/**
 * Tuned Model Analysis API
 *
 * Endpoint for analyzing videos using the fine-tuned Gemini model.
 * This is the simplified replacement for the 850-line prompt approach.
 *
 * Options:
 *   hybrid: true  - Run both tuned (humor) and base (technical) models in parallel
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TunedGeminiService } from '@/lib/services/gemini/tuned-service';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId, gcsUri, hybrid = false } = body;

    if (!videoId && !gcsUri) {
      return NextResponse.json(
        { error: 'Either videoId or gcsUri is required' },
        { status: 400 }
      );
    }

    let targetGcsUri = gcsUri;

    // If videoId provided, fetch gcsUri from database
    if (videoId && !gcsUri) {
      const { data: video, error } = await supabase
        .from('analyzed_videos')
        .select('id, video_url, gcs_uri')
        .eq('id', videoId)
        .single();

      if (error || !video) {
        return NextResponse.json(
          { error: 'Video not found' },
          { status: 404 }
        );
      }

      if (!video.gcs_uri) {
        return NextResponse.json(
          { error: 'Video does not have a GCS URI. Upload to GCS first.' },
          { status: 400 }
        );
      }

      targetGcsUri = video.gcs_uri;
    }

    // Analyze with tuned model
    const service = new TunedGeminiService();

    // Use hybrid analysis if requested (combines tuned humor + base technical)
    if (hybrid) {
      const hybridAnalysis = await service.analyzeHybrid(targetGcsUri);

      // Optionally save to database
      if (videoId && body.save !== false) {
        await saveAnalysis(videoId, hybridAnalysis);
      }

      return NextResponse.json({
        success: true,
        videoId,
        gcsUri: targetGcsUri,
        usedTunedModel: hybridAnalysis.usedTunedModel,
        hybrid: true,
        analysis: {
          // Humor analysis from tuned model
          summary: hybridAnalysis.summary,
          mechanism: hybridAnalysis.mechanism,
          why_it_works: hybridAnalysis.why_it_works,
          audience: hybridAnalysis.audience,
          category: hybridAnalysis.category,
          quality: hybridAnalysis.quality,
          replicable: hybridAnalysis.replicable,
          // Technical signals from base model
          technical: hybridAnalysis.technical
        },
        raw_response: hybridAnalysis.raw_response
      });
    }

    // Standard analysis (humor only)
    const analysis = await service.analyze(targetGcsUri);

    // Optionally save to database
    if (videoId && body.save !== false) {
      await saveAnalysis(videoId, analysis);
    }

    return NextResponse.json({
      success: true,
      videoId,
      gcsUri: targetGcsUri,
      usedTunedModel: analysis.usedTunedModel,
      hybrid: false,
      analysis: {
        summary: analysis.summary,
        mechanism: analysis.mechanism,
        why_it_works: analysis.why_it_works,
        audience: analysis.audience,
        category: analysis.category,
        quality: analysis.quality,
        replicable: analysis.replicable
      },
      raw_response: analysis.raw_response
    });

  } catch (error: any) {
    console.error('Tuned analysis error:', error);
    return NextResponse.json(
      { error: error.message || 'Analysis failed' },
      { status: 500 }
    );
  }
}

async function saveAnalysis(videoId: string, analysis: any) {
  try {
    // Upsert to video_humor_analysis table
    await supabase
      .from('video_humor_analysis')
      .upsert({
        video_id: videoId,
        gemini_analysis: {
          summary: analysis.summary,
          mechanism: analysis.mechanism,
          why_it_works: analysis.why_it_works,
          audience: analysis.audience,
          raw_response: analysis.raw_response
        },
        humor_type: analysis.mechanism,
        humor_mechanism: analysis.why_it_works,
        summary: analysis.summary,
        is_humorous: true,
        analysis_model: analysis.usedTunedModel ? 'gemini-tuned-v7b' : 'gemini-2.0-flash-001',
        analysis_version: 'v7.B-tuned',
        deep_reasoning_used: false,
        rag_examples_count: 0, // Tuned model doesn't need RAG
        confidence_score: 0.8,
        needs_review: false
      }, {
        onConflict: 'video_id'
      });
  } catch (err) {
    console.error('Failed to save analysis:', err);
    // Don't fail the request if save fails
  }
}

// GET for checking tuned model status
export async function GET() {
  const service = new TunedGeminiService();
  
  return NextResponse.json({
    tunedModelAvailable: service.hasTunedModel(),
    message: service.hasTunedModel() 
      ? 'Tuned model is ready for use'
      : 'No tuned model available. Run: npx ts-node scripts/fine-tune-gemini.ts run'
  });
}
