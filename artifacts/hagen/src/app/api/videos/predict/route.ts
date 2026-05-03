/**
 * Video Prediction API
 * 
 * Analyze videos using base Gemini or fine-tuned model
 * Returns structured predictions for the rating UI
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createVertexTuningService } from '@/lib/services/vertex/training';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface PredictionResult {
  overall: number;
  dimensions: {
    hook: number;
    pacing: number;
    originality: number;
    payoff: number;
    rewatchable: number;
  };
  reasoning: string;
  modelUsed: 'base' | 'tuned';
  confidence?: number;
}

/**
 * POST /api/videos/predict
 * 
 * Get model prediction for a video
 * Body: { videoId: string } or { videoUrl: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId, videoUrl, useTunedModel = true } = body;

    if (!videoId && !videoUrl) {
      return NextResponse.json(
        { error: 'videoId or videoUrl is required' },
        { status: 400 }
      );
    }

    // Get video details if videoId provided
    let gcsUri = videoUrl;
    let videoData = null;

    if (videoId) {
      const { data, error } = await supabase
        .from('analyzed_videos')
        .select('id, video_url, gcs_uri, metadata')
        .eq('id', videoId)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Video not found' }, { status: 404 });
      }

      videoData = data;
      gcsUri = data.gcs_uri || data.video_url;
    }

    // Check for available fine-tuned model
    let tunedModelEndpoint: string | null = null;
    
    if (useTunedModel) {
      const { data: activeModel } = await supabase
        .from('tuning_jobs')
        .select('tuned_model_endpoint')
        .eq('state', 'JOB_STATE_SUCCEEDED')
        .eq('is_active', true)
        .single();

      tunedModelEndpoint = activeModel?.tuned_model_endpoint;
    }

    let prediction: PredictionResult;

    if (tunedModelEndpoint && gcsUri.startsWith('gs://')) {
      // Use fine-tuned model
      prediction = await predictWithTunedModel(tunedModelEndpoint, gcsUri);
      prediction.modelUsed = 'tuned';
    } else {
      // Use base Gemini model
      prediction = await predictWithBaseModel(gcsUri);
      prediction.modelUsed = 'base';
    }

    // Save the AI prediction to the database
    // IMPORTANT: Merge with existing visual_analysis, don't overwrite!
    if (videoId && prediction) {
      // First get existing visual_analysis to preserve it
      const { data: existingVideo } = await supabase
        .from('analyzed_videos')
        .select('visual_analysis')
        .eq('id', videoId)
        .single();

      const existingAnalysis = existingVideo?.visual_analysis || {};
      
      // Merge prediction into existing analysis
      const { error: updateError } = await supabase
        .from('analyzed_videos')
        .update({
          visual_analysis: {
            ...existingAnalysis,  // Preserve all Gemini analysis (visual, audio, content, etc.)
            ai_prediction: prediction,  // Add prediction as nested field
            prediction_at: new Date().toISOString(),
            prediction_model: prediction.modelUsed,
          },
        })
        .eq('id', videoId);

      if (updateError) {
        console.error('Failed to save AI prediction:', updateError);
      } else {
        console.log(`✅ AI prediction saved for video ${videoId} (analysis preserved)`);
      }
    }

    return NextResponse.json({
      success: true,
      prediction,
      video: videoData ? {
        id: videoData.id,
        url: videoData.video_url,
        title: videoData.metadata?.title
      } : null
    });

  } catch (err) {
    console.error('Prediction error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Prediction failed'
    }, { status: 500 });
  }
}

/**
 * Predict using fine-tuned Vertex AI model
 */
async function predictWithTunedModel(
  endpoint: string,
  videoGcsUri: string
): Promise<PredictionResult> {
  const vertexService = createVertexTuningService();
  
  const result = await vertexService.generateWithTunedModel(endpoint, videoGcsUri);

  return {
    overall: result.overall || 0.5,
    dimensions: {
      hook: result.dimensions?.hook || 0.5,
      pacing: result.dimensions?.pacing || 0.5,
      originality: result.dimensions?.originality || 0.5,
      payoff: result.dimensions?.payoff || 0.5,
      rewatchable: result.dimensions?.rewatchable || 0.5
    },
    reasoning: result.reasoning || '',
    modelUsed: 'tuned'
  };
}

/**
 * Predict using base Gemini model via Vertex AI (supports GCS URIs)
 */
async function predictWithBaseModel(videoUri: string): Promise<PredictionResult> {
  const vertexService = createVertexTuningService();
  
  const prompt = `You are an expert short-form video analyst. Watch and analyze THIS SPECIFIC VIDEO carefully.

IMPORTANT: Your analysis must be UNIQUE to this video. Do NOT use generic placeholder text.

Describe what you SEE and HEAR in this video, then rate each dimension from 0.0 to 1.0:

1. **Hook** (0-1): How compelling are the first 3 seconds? Does it stop the scroll? What happens in the opening?
2. **Pacing** (0-1): How well does the video maintain momentum? Are there slow parts or dead air?
3. **Originality** (0-1): How fresh/unique is the concept? Have you seen this exact format before?
4. **Payoff** (0-1): How satisfying is the conclusion? Does it deliver on the hook's promise?
5. **Rewatchable** (0-1): Would viewers want to watch this again or share it? Why?

Also provide:
- **Overall** (0-1): Overall content quality and engagement potential
- **Reasoning**: 2-3 sentences describing WHAT HAPPENS in this specific video and why you gave these scores. Be specific about visual elements, audio, text overlays, or actions you observe.

Respond with ONLY valid JSON (no markdown code blocks):
{"overall": <number>, "dimensions": {"hook": <number>, "pacing": <number>, "originality": <number>, "payoff": <number>, "rewatchable": <number>}, "reasoning": "<your specific analysis>"}`;

  try {
    const result = await vertexService.analyzeVideoWithGemini(videoUri, prompt);

    return {
      overall: Math.max(0, Math.min(1, result.overall || 0.5)),
      dimensions: {
        hook: Math.max(0, Math.min(1, result.dimensions?.hook || 0.5)),
        pacing: Math.max(0, Math.min(1, result.dimensions?.pacing || 0.5)),
        originality: Math.max(0, Math.min(1, result.dimensions?.originality || 0.5)),
        payoff: Math.max(0, Math.min(1, result.dimensions?.payoff || 0.5)),
        rewatchable: Math.max(0, Math.min(1, result.dimensions?.rewatchable || 0.5))
      },
      reasoning: result.reasoning || '',
      modelUsed: 'base'
    };

  } catch (error) {
    console.error('Base model prediction failed:', error);
    
    // Return neutral prediction on error
    return {
      overall: 0.5,
      dimensions: {
        hook: 0.5,
        pacing: 0.5,
        originality: 0.5,
        payoff: 0.5,
        rewatchable: 0.5
      },
      reasoning: `Unable to analyze video: ${error instanceof Error ? error.message : 'Unknown error'}. Please rate manually.`,
      modelUsed: 'base'
    };
  }
}

/**
 * GET /api/videos/predict
 * 
 * Get prediction for a video by ID (query param)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');

  if (!videoId) {
    return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
  }

  // Forward to POST handler
  const postRequest = new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ videoId }),
    headers: { 'Content-Type': 'application/json' }
  });

  return POST(postRequest);
}
