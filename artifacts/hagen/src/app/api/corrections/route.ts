/**
 * Analysis Corrections API
 * 
 * Stores corrections to Gemini's analysis for learning
 * Now wired to the RAG-based video analysis learning system
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { saveVideoAnalysisExample } from '@/lib/services/video/learning';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/corrections
 * 
 * Save a correction to Gemini's analysis AND create a learning example for RAG
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      videoUrl, 
      originalAnalysis, 
      correction, 
      correctionType,
      notes 
    } = body;

    if (!videoUrl || !originalAnalysis || !correction || !correctionType) {
      return NextResponse.json(
        { error: 'videoUrl, originalAnalysis, correction, and correctionType are required' },
        { status: 400 }
      );
    }

    // Save the correction to analysis_corrections table (legacy)
    const { data, error } = await supabase
      .from('analysis_corrections')
      .insert({
        video_url: videoUrl,
        original_analysis: originalAnalysis,
        correction: correction,
        correction_type: correctionType,
        notes: notes || null
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to save correction:', error);
      return NextResponse.json({ error: 'Failed to save correction' }, { status: 500 });
    }

    // Get the video ID if it exists
    const { data: existingVideo } = await supabase
      .from('analyzed_videos')
      .select('id, metadata, visual_analysis')
      .eq('video_url', videoUrl)
      .single();

    // === NEW: Save to video_analysis_examples for RAG learning ===
    const videoSummary = originalAnalysis?.content?.keyMessage ||
                         originalAnalysis?.content?.conceptCore ||
                         originalAnalysis?.visual?.summary ||
                         existingVideo?.visual_analysis?.content?.keyMessage ||
                         'Video analysis';
    
    // Build comprehensive Gemini interpretation from all fields
    const geminiParts: string[] = [];
    const analysis = originalAnalysis || existingVideo?.visual_analysis || {};
    
    if (analysis.content?.humorType) geminiParts.push(`Humor Type: ${analysis.content.humorType}`);
    if (analysis.content?.humorMechanism) geminiParts.push(`Humor Mechanism: ${analysis.content.humorMechanism}`);
    if (analysis.content?.comedyTiming) geminiParts.push(`Comedy Timing: ${analysis.content.comedyTiming}`);
    if (analysis.content?.whyFunny) geminiParts.push(`Why Funny: ${analysis.content.whyFunny}`);
    if (analysis.script?.humor?.humorType) geminiParts.push(`Script Humor: ${analysis.script.humor.humorType}`);
    if (analysis.visual?.punchlineDelivery) geminiParts.push(`Punchline: ${analysis.visual.punchlineDelivery}`);
    
    const geminiInterpretation = geminiParts.length > 0 
      ? geminiParts.join('\n')
      : 'Gemini interpretation not captured';

    // Determine example type based on correction
    let exampleType: 'humor_interpretation' | 'cultural_context' | 'visual_punchline' | 'misdirection' | 'replicability' = 'humor_interpretation';
    const notesLower = (notes || '').toLowerCase();
    if (notesLower.includes('cultural') || notesLower.includes('generation') || notesLower.includes('gen z') || notesLower.includes('millennial')) {
      exampleType = 'cultural_context';
    } else if (notesLower.includes('visual') || notesLower.includes('cut') || notesLower.includes('edit') || notesLower.includes('reveal')) {
      exampleType = 'visual_punchline';
    } else if (notesLower.includes('misdirect') || notesLower.includes('subvert') || notesLower.includes('expect')) {
      exampleType = 'misdirection';
    }

    // Extract humor types from the correction - expanded keyword list
    const humorTypes: string[] = [];
    const allText = `${correction.humor_type || ''} ${notes || ''}`.toLowerCase();
    
    // Comprehensive humor type keywords
    const humorKeywords = [
      // Classic types
      'wordplay', 'visual-reveal', 'subversion', 'absurdist', 'observational', 
      'physical', 'callback', 'contrast', 'deadpan', 'escalation', 'satire', 
      'parody', 'edit-punchline', 'exaggeration', 'self-deprecating',
      // Dark/edge humor
      'dark-humor', 'dark humor', 'morbid', 'gallows', 'self-harm', 'violent',
      'fake-happiness', 'facade', 'mask',
      // Structural types
      'misdirection', 'reveal', 'twist', 'anti-humor', 'meta',
      // Social dynamics
      'cringe', 'awkward', 'relatable', 'insider', 'industry-joke',
      // Visual types
      'juxtaposition', 'montage', 'expression', 'reaction', 'silent',
      // Format types
      'format-subversion', 'pov-misdirection', 'fourth-wall'
    ];
    
    for (const keyword of humorKeywords) {
      if (allText.includes(keyword.replace('-', ' ')) || allText.includes(keyword)) {
        humorTypes.push(keyword.replace(' ', '-'));
      }
    }

    // Also extract tags from the notes
    const tags: string[] = [];
    const tagKeywords = [
      'workplace', 'service', 'hospitality', 'restaurant', 'cafe', 'bar',
      'customer', 'manager', 'worker', 'staff', 'christmas', 'holiday',
      'implied', 'subtle', 'extreme', 'over-the-top'
    ];
    for (const keyword of tagKeywords) {
      if (allText.includes(keyword)) {
        tags.push(keyword);
      }
    }

    const learningResult = await saveVideoAnalysisExample({
      videoId: existingVideo?.id,
      videoUrl,
      exampleType,
      videoSummary,
      geminiInterpretation,
      correctInterpretation: notes || correction.humor_type || correction.joke_structure || 'Corrected',
      explanation: notes || 'Human correction of Gemini analysis',
      humorTypeCorrection: correction.humor_type ? {
        original: originalAnalysis?.script?.humor?.humorType || 'unknown',
        correct: correction.humor_type,
        why: notes || 'User correction'
      } : undefined,
      humorTypes,
      tags,
      industry: 'restaurant', // Default for hospitality focus
      qualityScore: 0.9  // Human corrections are high quality
    });

    if (learningResult.success) {
      console.log(`✅ Created learning example: ${learningResult.id}`);
    } else {
      console.warn('⚠️ Failed to create learning example:', learningResult.error);
    }

    // If this video exists, update its embedding with the correction
    if (existingVideo) {
      // Build new embedding text with correction context
      const embeddingText = buildCorrectionEmbeddingText(
        existingVideo.metadata,
        originalAnalysis,
        correction,
        notes
      );

      // Generate new embedding
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: embeddingText,
        encoding_format: 'float'
      });

      // Update the video's embedding
      await supabase
        .from('analyzed_videos')
        .update({ content_embedding: embeddingResponse.data[0].embedding })
        .eq('id', existingVideo.id);

      console.log(`✅ Updated embedding for corrected video: ${existingVideo.id}`);
    }

    return NextResponse.json({
      success: true,
      correction: data,
      embeddingUpdated: !!existingVideo,
      learningExampleCreated: learningResult.success,
      learningExampleId: learningResult.id
    });

  } catch (err) {
    console.error('Correction error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to save correction'
    }, { status: 500 });
  }
}

/**
 * GET /api/corrections
 * 
 * Get corrections for learning/review
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50');

    let query = supabase
      .from('analysis_corrections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq('correction_type', type);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch corrections' }, { status: 500 });
    }

    return NextResponse.json({ corrections: data });

  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to fetch corrections'
    }, { status: 500 });
  }
}

function buildCorrectionEmbeddingText(
  metadata: any,
  originalAnalysis: any,
  correction: any,
  notes?: string
): string {
  const parts: string[] = [];

  if (metadata?.title) {
    parts.push(`Title: ${metadata.title}`);
  }

  // Include the CORRECT interpretation (now free-text)
  if (correction.humor_type) {
    parts.push(`Correct Humor Interpretation: ${correction.humor_type}`);
  }
  if (correction.joke_structure) {
    parts.push(`Correct Joke Structure: ${correction.joke_structure}`);
  }

  // Include correction notes
  if (notes) {
    parts.push(`Expert Correction: ${notes}`);
  }

  // Include what was WRONG to help avoid similar mistakes
  if (correction.original_humor_type) {
    parts.push(`Gemini said: ${correction.original_humor_type} (incorrect)`);
  }
  if (correction.original_mechanism) {
    parts.push(`Gemini mechanism: ${correction.original_mechanism} (incorrect)`);
  }

  return parts.join('\n');
}

/**
 * PUT /api/corrections
 * 
 * Confirm that Gemini's analysis was CORRECT - positive reinforcement
 * Creates a 'good_interpretation' learning example
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoUrl, analysis, notes } = body;

    if (!videoUrl || !analysis) {
      return NextResponse.json(
        { error: 'videoUrl and analysis are required' },
        { status: 400 }
      );
    }

    // Get existing video record if any
    const { data: existingVideo } = await supabase
      .from('analyzed_videos')
      .select('id, metadata')
      .eq('video_url', videoUrl)
      .maybeSingle();

    // Build summary from analysis
    const videoSummary = analysis.content?.summary || 
                        analysis.summary || 
                        analysis.script?.conceptCore ||
                        'Video analysis confirmed as correct';

    // Build the Gemini interpretation text (what was correct)
    const geminiParts: string[] = [];
    if (analysis.script?.humor?.humorType) {
      geminiParts.push(`Humor Type: ${analysis.script.humor.humorType}`);
    }
    if (analysis.script?.humor?.humorMechanism) {
      geminiParts.push(`Mechanism: ${analysis.script.humor.humorMechanism}`);
    }
    if (analysis.content?.humorMechanism) {
      geminiParts.push(`Content Humor: ${analysis.content.humorMechanism}`);
    }
    if (analysis.script?.humor?.visualComedyElement) {
      geminiParts.push(`Visual Comedy: ${analysis.script.humor.visualComedyElement}`);
    }
    
    const geminiInterpretation = geminiParts.length > 0 
      ? geminiParts.join('\n')
      : 'Gemini analysis was correct';

    // Extract humor types
    const humorTypes: string[] = [];
    if (analysis.script?.humor?.humorType) {
      humorTypes.push(analysis.script.humor.humorType);
    }

    // Create positive learning example
    const learningResult = await saveVideoAnalysisExample({
      videoId: existingVideo?.id,
      videoUrl,
      exampleType: 'good_interpretation',
      videoSummary,
      geminiInterpretation,
      correctInterpretation: geminiInterpretation, // Same as Gemini - it was correct!
      explanation: notes || 'Human confirmed Gemini analysis is accurate',
      humorTypeCorrection: {
        original: analysis.script?.humor?.humorType || 'analyzed',
        correct: analysis.script?.humor?.humorType || 'confirmed',
        why: notes || 'User confirmed this interpretation is correct',
        transcript: analysis.script?.transcript?.slice(0, 500),
        scenes: analysis.scenes?.description?.slice(0, 500)
      },
      humorTypes,
      industry: 'restaurant',
      qualityScore: 1.0  // Perfect quality - human verified as correct
    });

    if (learningResult.success) {
      console.log(`✅ Created positive learning example: ${learningResult.id}`);
    } else {
      console.warn('⚠️ Failed to create positive learning example:', learningResult.error);
    }

    return NextResponse.json({
      success: true,
      message: 'Analysis confirmed as correct',
      learningExampleId: learningResult.id
    });

  } catch (err) {
    console.error('Failed to confirm analysis:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to confirm analysis'
    }, { status: 500 });
  }
}
