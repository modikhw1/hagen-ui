/**
 * Humor Analysis API
 * 
 * Modular API for saving and retrieving humor-specific video analysis.
 * Separate from the full analyze-rate flow to allow focused iteration
 * on humor understanding accuracy.
 * 
 * POST - Save/update humor analysis for a video
 * GET  - Retrieve humor analysis for a video
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { saveVideoAnalysisExample } from '@/lib/services/video/learning';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface HumorAnalysisInput {
  videoId: string;
  videoUrl: string;
  geminiAnalysis: {
    script?: {
      humor?: {
        humorType?: string;
        humorMechanism?: string;
        isHumorous?: boolean;
        comedyTiming?: number;
      };
      structure?: {
        hook?: string;
        setup?: string;
        payoff?: string;
        payoffType?: string;
      };
      replicability?: {
        score?: number;
        template?: string;
        requiredElements?: string[];
      };
    };
    visual?: {
      summary?: string;
    };
    [key: string]: unknown;
  };
  analysisModel?: string;
  analysisVersion?: string;
  ragExamplesCount?: number;
}

interface CorrectionInput {
  videoId: string;
  field: string;          // 'humor_type', 'humor_mechanism', 'comedy_timing', etc.
  originalValue: string;
  correctedValue: string;
  notes?: string;
}

/**
 * POST /api/humor-analysis
 * 
 * Save or update humor analysis for a video.
 * Creates learning example if analysis differs significantly from expected patterns.
 */
export async function POST(request: NextRequest) {
  try {
    const body: HumorAnalysisInput = await request.json();
    const { videoId, videoUrl, geminiAnalysis, analysisModel, analysisVersion, ragExamplesCount } = body;

    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    // Extract normalized fields from Gemini analysis
    const humor = geminiAnalysis?.script?.humor;
    const structure = geminiAnalysis?.script?.structure;
    const replicability = geminiAnalysis?.script?.replicability;
    const summary = geminiAnalysis?.visual?.summary;

    // Build joke structure JSONB
    const jokeStructure = structure ? {
      hook: structure.hook || null,
      setup: structure.setup || null,
      payoff: structure.payoff || null,
      payoffType: structure.payoffType || null
    } : null;

    // Upsert humor analysis
    const { data, error } = await supabase.rpc('upsert_humor_analysis', {
      p_video_id: videoId,
      p_gemini_analysis: geminiAnalysis,
      p_humor_type: humor?.humorType || null,
      p_humor_mechanism: humor?.humorMechanism || null,
      p_comedy_timing_score: humor?.comedyTiming || null,
      p_is_humorous: humor?.isHumorous ?? null,
      p_joke_structure: jokeStructure,
      p_summary: summary || null,
      p_replicability_template: replicability?.template || null,
      p_replicability_score: replicability?.score || null,
      p_required_elements: replicability?.requiredElements || null,
      p_analysis_model: analysisModel || 'gemini-2.0-flash',
      p_analysis_version: analysisVersion || 'v5.0',
      p_deep_reasoning_used: true,
      p_rag_examples_count: ragExamplesCount || 0
    });

    if (error) {
      console.error('Failed to save humor analysis:', error);
      return NextResponse.json(
        { error: 'Failed to save humor analysis', details: error.message },
        { status: 500 }
      );
    }

    console.log(`✅ Saved humor analysis for video ${videoId}: ${data}`);

    return NextResponse.json({
      success: true,
      id: data,
      videoId,
      humorType: humor?.humorType,
      humorMechanism: humor?.humorMechanism
    });

  } catch (err) {
    console.error('Humor analysis error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to save humor analysis'
    }, { status: 500 });
  }
}

/**
 * GET /api/humor-analysis?videoId=xxx
 * 
 * Retrieve humor analysis for a specific video.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('videoId');

    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('video_humor_analysis')
      .select(`
        *,
        analyzed_videos!inner (
          id,
          video_url,
          platform,
          metadata
        )
      `)
      .eq('video_id', videoId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return NextResponse.json({ error: 'Humor analysis not found' }, { status: 404 });
      }
      console.error('Failed to get humor analysis:', error);
      return NextResponse.json({ error: 'Failed to get humor analysis' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      analysis: data
    });

  } catch (err) {
    console.error('Get humor analysis error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to get humor analysis'
    }, { status: 500 });
  }
}

/**
 * PUT /api/humor-analysis
 * 
 * Submit a correction to humor analysis.
 * Automatically creates a learning example for RAG.
 */
export async function PUT(request: NextRequest) {
  try {
    const body: CorrectionInput = await request.json();
    const { videoId, field, originalValue, correctedValue, notes } = body;

    if (!videoId || !field || !correctedValue) {
      return NextResponse.json(
        { error: 'videoId, field, and correctedValue are required' },
        { status: 400 }
      );
    }

    // Add correction to the humor analysis record
    const { data: correctionResult, error: correctionError } = await supabase.rpc('add_humor_correction', {
      p_video_id: videoId,
      p_field: field,
      p_original_value: originalValue || '',
      p_corrected_value: correctedValue,
      p_notes: notes || null
    });

    if (correctionError) {
      console.error('Failed to add correction:', correctionError);
      return NextResponse.json(
        { error: 'Failed to add correction', details: correctionError.message },
        { status: 500 }
      );
    }

    // Get the full analysis to create a learning example
    const { data: humorAnalysis } = await supabase
      .from('video_humor_analysis')
      .select('*, analyzed_videos!inner(video_url, metadata)')
      .eq('video_id', videoId)
      .single();

    // Create a learning example for RAG
    let learningExampleId: string | undefined;
    
    if (humorAnalysis) {
      const video = humorAnalysis.analyzed_videos as any;
      
      // Determine example type based on correction field
      let exampleType: 'humor_interpretation' | 'cultural_context' | 'visual_punchline' | 'misdirection' = 'humor_interpretation';
      if (notes?.toLowerCase().includes('cultural') || notes?.toLowerCase().includes('generation')) {
        exampleType = 'cultural_context';
      } else if (notes?.toLowerCase().includes('visual') || field === 'joke_structure') {
        exampleType = 'visual_punchline';
      } else if (notes?.toLowerCase().includes('misdirect') || notes?.toLowerCase().includes('subvert')) {
        exampleType = 'misdirection';
      }

      const learningResult = await saveVideoAnalysisExample({
        videoId,
        videoUrl: video?.video_url,
        exampleType,
        videoSummary: humorAnalysis.summary || 'Video humor analysis',
        geminiInterpretation: `${field}: ${originalValue}`,
        correctInterpretation: correctedValue,
        explanation: notes || `Corrected ${field} from "${originalValue}" to "${correctedValue}"`,
        humorTypeCorrection: field === 'humor_type' ? {
          original: originalValue,
          correct: correctedValue,
          why: notes || 'Human correction'
        } : undefined,
        humorTypes: humorAnalysis.humor_type ? [humorAnalysis.humor_type] : [],
        qualityScore: 0.9 // Human corrections are high quality
      });

      if (learningResult.success) {
        learningExampleId = learningResult.id;
        console.log(`✅ Created learning example: ${learningExampleId}`);
      }
    }

    return NextResponse.json({
      success: true,
      correctionSaved: correctionResult,
      learningExampleCreated: !!learningExampleId,
      learningExampleId
    });

  } catch (err) {
    console.error('Correction error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to save correction'
    }, { status: 500 });
  }
}
