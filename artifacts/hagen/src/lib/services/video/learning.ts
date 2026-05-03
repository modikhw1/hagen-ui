/**
 * Video Analysis Learning Service
 * 
 * RAG-based learning system that retrieves relevant annotated examples
 * to inject into Gemini prompts for improved video analysis.
 * 
 * ARCHITECTURE:
 * 1. When a new video is analyzed, we generate an embedding from its metadata/transcript
 * 2. We retrieve similar annotated videos with human corrections
 * 3. We inject these as few-shot examples into the Gemini prompt
 * 4. Gemini learns from YOUR interpretations of similar content
 */

import { createClient } from '@supabase/supabase-js'
import { generateEmbedding } from '@/lib/openai/client'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// =============================================================================
// TYPES
// =============================================================================

export interface VideoAnalysisExample {
  id: string
  exampleType: 'humor_interpretation' | 'cultural_context' | 'visual_punchline' | 'misdirection' | 'replicability' | 'bad_interpretation' | 'good_interpretation'
  videoSummary: string
  geminiInterpretation: string | null
  correctInterpretation: string
  explanation: string
  humorTypeCorrection: {
    original?: string
    correct?: string
    why?: string
    pattern?: string
    geminiMissed?: string[]
    humanInsight?: string
    scenes?: string
    transcript?: string
  } | null
  culturalContext: string | null
  visualElements: string[]
  tags: string[]
  humorTypes: string[]
  qualityScore: number
  similarity: number
  // New fields for better matching
  transcript?: string
  sceneBreakdown?: string
  effectiveness?: number
}

export interface SaveExampleInput {
  videoId?: string
  videoUrl?: string
  exampleType: VideoAnalysisExample['exampleType']
  videoSummary: string
  geminiInterpretation?: string
  correctInterpretation: string  // For good_interpretation, this is same as geminiInterpretation
  explanation: string            // For good_interpretation, this explains why Gemini got it right
  humorTypeCorrection?: VideoAnalysisExample['humorTypeCorrection']
  culturalContext?: string
  visualElements?: string[]
  tags?: string[]
  humorTypes?: string[]
  industry?: string
  contentFormat?: string
  qualityScore?: number
}

export interface RetrievalOptions {
  exampleTypes?: string[]
  humorTypes?: string[]
  industry?: string
  contentFormat?: string
  limit?: number
  threshold?: number
}

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Find relevant video analysis examples for RAG injection
 * 
 * @param context - Text describing the video (transcript, summary, metadata)
 * @param options - Filtering options for more targeted retrieval
 * @returns Array of relevant examples ordered by relevance
 */
export async function findRelevantVideoExamples(
  context: string,
  options: RetrievalOptions = {}
): Promise<VideoAnalysisExample[]> {
  const {
    exampleTypes,
    humorTypes,
    industry,
    contentFormat,
    limit = 5,
    threshold = 0.5
  } = options

  try {
    // Generate embedding for the context
    const embedding = await generateEmbedding(context)

    // Call the database function for RAG retrieval
    const { data, error } = await supabase.rpc('find_video_analysis_examples', {
      query_embedding: embedding,
      target_example_types: exampleTypes || null,
      target_humor_types: humorTypes || null,
      target_industry: industry || null,
      target_format: contentFormat || null,
      match_threshold: threshold,
      match_count: limit
    })

    if (error) {
      console.error('Failed to find video analysis examples:', error)
      return []
    }

    // Record usage for retrieved examples (async, don't wait)
    for (const example of data || []) {
      Promise.resolve(supabase.rpc('record_video_example_usage', { example_uuid: example.id }))
        .catch(() => {})
    }

    return (data || []).map((e: any) => ({
      id: e.id,
      exampleType: e.example_type,
      videoSummary: e.video_summary,
      geminiInterpretation: e.gemini_interpretation,
      correctInterpretation: e.correct_interpretation,
      explanation: e.explanation,
      humorTypeCorrection: e.humor_type_correction,
      culturalContext: e.cultural_context,
      visualElements: e.visual_elements || [],
      tags: e.tags || [],
      humorTypes: e.humor_types || [],
      qualityScore: e.quality_score,
      similarity: e.similarity
    }))

  } catch (error) {
    console.error('Error in findRelevantVideoExamples:', error)
    return []
  }
}

import { DEEP_REASONING_CHAIN } from './deep-reasoning'

/**
 * Build the few-shot learning prompt section from retrieved examples
 * This gets injected into the Gemini prompt to provide context
 * 
 * ENHANCED: Now includes Deep Reasoning Chain to force generative analysis
 * Structure: Deep Reasoning Chain → Video Examples → Human Corrections → Requirements
 */
export function buildFewShotPrompt(examples: VideoAnalysisExample[]): string {
  if (examples.length === 0) {
    // Even without examples, inject the reasoning chain
    return DEEP_REASONING_CHAIN
  }

  // Start with the Deep Reasoning Chain
  let prompt = DEEP_REASONING_CHAIN

  // Separate positive and negative examples
  const corrections = examples.filter(e => e.exampleType !== 'good_interpretation')
  const confirmations = examples.filter(e => e.exampleType === 'good_interpretation')

  // Show corrections first (what you got wrong)
  if (corrections.length > 0) {
    prompt += `
═══════════════════════════════════════════════════════════════════════════════
LEARNING FROM HUMAN-VERIFIED CORRECTIONS
═══════════════════════════════════════════════════════════════════════════════

You have made interpretation errors on similar videos before. Study these corrections 
and notice HOW the human reasoning differs from surface-level labeling:

`

    for (let i = 0; i < corrections.length; i++) {
      const ex = corrections[i]
      const patternType = ex.exampleType.replace(/_/g, ' ').toUpperCase()
      
      prompt += `┌─────────────────────────────────────────────────────────────────────────────
│ CORRECTION #${i + 1}: ${patternType}
├─────────────────────────────────────────────────────────────────────────────
│ VIDEO CONTEXT: ${ex.videoSummary}
│
`

      if (ex.geminiInterpretation && ex.geminiInterpretation !== 'Original Gemini analysis') {
        prompt += `│ ❌ YOUR ORIGINAL ANALYSIS:
│    ${ex.geminiInterpretation.split('\n').join('\n│    ')}
│
│ ✅ CORRECT INTERPRETATION:
│    ${ex.correctInterpretation.split('\n').join('\n│    ')}
│
│ 📚 WHAT YOU MISSED:
│    ${ex.explanation.split('\n').join('\n│    ')}
`
      } else {
        prompt += `│ ✅ CORRECT INTERPRETATION:
│    ${ex.correctInterpretation.split('\n').join('\n│    ')}
│
│ 📚 KEY INSIGHT:
│    ${ex.explanation.split('\n').join('\n│    ')}
`
      }

      // Add scene/transcript context
      const scenes = ex.humorTypeCorrection?.scenes || ex.sceneBreakdown
      if (scenes) {
        prompt += `│
│ 🎬 SCENE BREAKDOWN:
│    ${scenes.split('\n').slice(0, 4).join('\n│    ')}
`
      }

      const transcript = ex.humorTypeCorrection?.transcript || ex.transcript
      if (transcript && transcript.length > 50) {
        prompt += `│
│ 📜 TRANSCRIPT EXCERPT:
│    "${transcript.slice(0, 200)}${transcript.length > 200 ? '...' : ''}"
`
      }

      prompt += `└─────────────────────────────────────────────────────────────────────────────

`
    }
  }

  // Show confirmations (what you got right - positive reinforcement)
  if (confirmations.length > 0) {
    prompt += `
═══════════════════════════════════════════════════════════════════════════════
VERIFIED CORRECT: These interpretations were confirmed accurate by humans
═══════════════════════════════════════════════════════════════════════════════

For similar videos, replicate this analysis approach:

`

    for (let i = 0; i < confirmations.length; i++) {
      const ex = confirmations[i]
      
      prompt += `┌─────────────────────────────────────────────────────────────────────────────
│ ✅ VERIFIED CORRECT #${i + 1}
├─────────────────────────────────────────────────────────────────────────────
│ VIDEO CONTEXT: ${ex.videoSummary}
│
│ YOUR ANALYSIS (CONFIRMED CORRECT):
│    ${ex.correctInterpretation.split('\n').join('\n│    ')}
│
│ WHY THIS IS RIGHT:
│    ${ex.explanation.split('\n').join('\n│    ')}
└─────────────────────────────────────────────────────────────────────────────

`
    }
  }

  // Only add requirements if we have corrections
  if (corrections.length > 0) {
    prompt += `═══════════════════════════════════════════════════════════════════════════════
MANDATORY REQUIREMENTS FOR THIS ANALYSIS (Enforcing Deep Reasoning)
═══════════════════════════════════════════════════════════════════════════════

1. COMPLETE THE DEEP REASONING CHAIN FIRST:
   Before assigning any humor labels, fill out the deep_reasoning object:
   - character_dynamic: What relationship/tension exists between characters?
   - underlying_tension: What gap or conflict creates the humor?
   - format_participation: Does the structure/format participate in the joke?
   - editing_contribution: What editing choices add to humor?
   - audience_surrogate: Which character represents viewer feelings?

2. YOUR HUMOR MECHANISM MUST REFLECT THE REASONING:
   ❌ WRONG: "The humor is contrast between the characters"
   ✅ RIGHT: "The humor comes from each answer revealing self-interest based on
              job role - those who profit want more, those who labor want less"

3. CHECK YOUR EXPLANATION:
   - If your explanation could apply to multiple videos, it's too shallow
   - Ask: Am I explaining WHAT HAPPENS or WHY IT'S FUNNY?
   - Ask: What would a 25-year-old service worker find relatable here?

4. LOOK FOR PATTERNS FROM CORRECTIONS ABOVE:
   - Same humor mechanism (format subversion, incentive reveal, rebel worker)?
   - Similar character dynamics (worker vs management, performance vs reality)?
   - Visual/editing punchlines rather than dialogue?

5. COMMON MISTAKES TO AVOID:
   - Calling something "subversion of expectations" without explaining WHAT expectation
   - Missing visual comedy (facial expressions, physical gags)
   - Over-intellectualizing simple relatable humor
`
  }

  return prompt
}

/**
 * Save a new video analysis example for future learning
 * Automatically generates embedding for RAG retrieval
 */
export async function saveVideoAnalysisExample(
  input: SaveExampleInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    // Build embedding focused on JOKE CONCEPT/MECHANISM for better similarity matching
    // Priority: concept > mechanism > interpretation > transcript
    // This captures "what makes it funny" not just "what was said"
    const embeddingParts: string[] = []
    
    // 1. Video summary - THE CONCEPT (most important for matching similar jokes)
    if (input.videoSummary) {
      embeddingParts.push(`JOKE_CONCEPT: ${input.videoSummary}`)
    }
    
    // 2. Humor mechanism - HOW THE JOKE WORKS (critical for format matching)
    if (input.geminiInterpretation) {
      // Extract mechanism from Gemini's interpretation
      embeddingParts.push(`HUMOR_MECHANISM: ${input.geminiInterpretation}`)
    }
    
    // 3. Human correction - THE INSIGHT (what makes this specific pattern)
    if (input.correctInterpretation) {
      embeddingParts.push(`CORRECT_INTERPRETATION: ${input.correctInterpretation}`)
    }
    
    // 4. Humor pattern/type - CATEGORICAL (helps cluster similar formats)
    if (input.humorTypeCorrection?.pattern) {
      embeddingParts.push(`HUMOR_PATTERN: ${input.humorTypeCorrection.pattern}`)
    }
    if (input.humorTypes?.length) {
      embeddingParts.push(`HUMOR_TYPES: ${input.humorTypes.join(', ')}`)
    }
    
    // 5. Explanation - WHY IT'S FUNNY (teaching content)
    if (input.explanation && input.explanation !== input.correctInterpretation) {
      embeddingParts.push(`EXPLANATION: ${input.explanation}`)
    }
    
    // 6. Human insight - WHAT AI MISSED
    if (input.humorTypeCorrection?.humanInsight) {
      embeddingParts.push(`INSIGHT: ${input.humorTypeCorrection.humanInsight}`)
    }
    if (input.humorTypeCorrection?.geminiMissed?.length) {
      embeddingParts.push(`MISSED_ELEMENTS: ${input.humorTypeCorrection.geminiMissed.join(', ')}`)
    }
    
    // 7. Visual elements - VISUAL PUNCHLINES
    if (input.visualElements?.length) {
      embeddingParts.push(`VISUAL_ELEMENTS: ${input.visualElements.join(', ')}`)
    }
    
    // 8. Cultural context
    if (input.culturalContext) {
      embeddingParts.push(`CULTURAL_CONTEXT: ${input.culturalContext}`)
    }
    
    // 9. Scene breakdown - NARRATIVE STRUCTURE (secondary)
    if (input.humorTypeCorrection?.scenes) {
      embeddingParts.push(`SCENES: ${input.humorTypeCorrection.scenes}`)
    }
    
    // 10. Transcript - LAST (exact words matter less than concept)
    // Include only a summary portion for context
    if (input.humorTypeCorrection?.transcript) {
      const shortTranscript = input.humorTypeCorrection.transcript.slice(0, 300)
      embeddingParts.push(`TRANSCRIPT_EXCERPT: ${shortTranscript}`)
    }
    
    // 11. Tags
    if (input.tags?.length) {
      embeddingParts.push(`TAGS: ${input.tags.join(', ')}`)
    }
    
    const embeddingText = embeddingParts.join('\n')
    console.log(`📝 Building embedding from ${embeddingParts.length} parts (${embeddingText.length} chars)`)

    // Generate embedding
    const embedding = await generateEmbedding(embeddingText)

    // Insert into database
    const { data, error } = await supabase
      .from('video_analysis_examples')
      .insert({
        video_id: input.videoId || null,
        video_url: input.videoUrl || null,
        example_type: input.exampleType,
        video_summary: input.videoSummary,
        gemini_interpretation: input.geminiInterpretation || null,
        correct_interpretation: input.correctInterpretation,
        explanation: input.explanation,
        humor_type_correction: input.humorTypeCorrection || null,
        cultural_context: input.culturalContext || null,
        visual_elements: input.visualElements || [],
        tags: input.tags || [],
        humor_types: input.humorTypes || [],
        industry: input.industry || null,
        content_format: input.contentFormat || null,
        quality_score: input.qualityScore || 0.8,
        embedding
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to save video analysis example:', error)
      return { success: false, error: error.message }
    }

    console.log(`✅ Saved video analysis example: ${data.id}`)
    return { success: true, id: data.id }

  } catch (error) {
    console.error('Error saving video analysis example:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

/**
 * Save a correction note for a video and automatically create a learning example
 * This is the main entry point for adding feedback that improves the model
 */
export async function saveVideoCorrection(
  videoId: string,
  correction: {
    field: string           // e.g., 'humorType', 'humorMechanism', 'conceptCore'
    originalValue: string   // What Gemini said
    correctedValue: string  // What it should be
    explanation: string     // Why this is wrong/right
    culturalContext?: string
    visualElements?: string[]
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // First, get the video details
    const { data: video, error: videoError } = await supabase
      .from('analyzed_videos')
      .select('video_url, visual_analysis')
      .eq('id', videoId)
      .single()

    if (videoError || !video) {
      return { success: false, error: 'Video not found' }
    }

    // Determine example type based on field
    let exampleType: SaveExampleInput['exampleType'] = 'humor_interpretation'
    if (correction.field.includes('cultural') || correction.culturalContext) {
      exampleType = 'cultural_context'
    } else if (correction.field.includes('visual') || correction.visualElements?.length) {
      exampleType = 'visual_punchline'
    } else if (correction.field.includes('replicab')) {
      exampleType = 'replicability'
    }

    // Extract video summary from analysis
    const analysis = video.visual_analysis as any
    const videoSummary = analysis?.content?.keyMessage || 
                         analysis?.visual?.summary ||
                         analysis?.script?.conceptCore ||
                         'Video content'

    // Determine humor types from the correction or existing analysis
    const humorTypes: string[] = []
    if (correction.field === 'humorType') {
      humorTypes.push(correction.correctedValue)
    } else if (analysis?.script?.humor?.humorType) {
      humorTypes.push(analysis.script.humor.humorType)
    }

    // Save the learning example
    const result = await saveVideoAnalysisExample({
      videoId,
      videoUrl: video.video_url,
      exampleType,
      videoSummary,
      geminiInterpretation: correction.originalValue,
      correctInterpretation: correction.correctedValue,
      explanation: correction.explanation,
      humorTypeCorrection: correction.field === 'humorType' ? {
        original: correction.originalValue,
        correct: correction.correctedValue,
        why: correction.explanation
      } : undefined,
      culturalContext: correction.culturalContext,
      visualElements: correction.visualElements,
      humorTypes,
      qualityScore: 0.9  // Human corrections are high quality
    })

    if (!result.success) {
      return { success: false, error: result.error }
    }

    // Also append to the video's gemini_corrections for reference
    const existingCorrections = (video.visual_analysis as any)?.gemini_corrections || []
    await supabase
      .from('analyzed_videos')
      .update({
        gemini_corrections: [
          ...existingCorrections,
          {
            timestamp: new Date().toISOString(),
            field: correction.field,
            originalValue: correction.originalValue,
            correctedValue: correction.correctedValue,
            note: correction.explanation,
            learningExampleId: result.id
          }
        ]
      })
      .eq('id', videoId)

    console.log(`✅ Saved correction for video ${videoId}, created learning example ${result.id}`)
    return { success: true }

  } catch (error) {
    console.error('Error saving video correction:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

/**
 * Get learning context for a video before analysis
 * Call this before Gemini analysis to get relevant examples
 * 
 * Priority for matching:
 * 1. Transcript (most semantic match)
 * 2. Title + Description
 * 3. Industry/Format filters
 */
export async function getLearningContext(
  videoMetadata: {
    transcript?: string
    title?: string
    description?: string
    hashtags?: string[]
    industry?: string
    contentFormat?: string
    existingAnalysis?: any  // Previous analysis if re-analyzing
  },
  videoId?: string  // For tracking which examples were used
): Promise<string> {
  // Build context string from metadata - prioritize transcript
  const contextParts: string[] = []
  
  // Transcript is most valuable for semantic matching
  if (videoMetadata.transcript) {
    contextParts.push(videoMetadata.transcript.slice(0, 2000))
  }
  
  // Existing analysis can provide context
  if (videoMetadata.existingAnalysis) {
    const ea = videoMetadata.existingAnalysis
    if (ea.content?.conceptCore) contextParts.push(ea.content.conceptCore)
    if (ea.content?.keyMessage) contextParts.push(ea.content.keyMessage)
    if (ea.script?.transcript) contextParts.push(ea.script.transcript.slice(0, 1000))
    if (ea.summary) contextParts.push(ea.summary)
  }
  
  // Title and description
  if (videoMetadata.title) contextParts.push(videoMetadata.title)
  if (videoMetadata.description) contextParts.push(videoMetadata.description)
  
  // Hashtags can indicate topic
  if (videoMetadata.hashtags?.length) {
    contextParts.push(videoMetadata.hashtags.join(' '))
  }

  if (contextParts.length === 0) {
    console.log('📚 No context available for learning retrieval')
    return ''
  }

  const context = contextParts.join('\n\n')
  console.log(`📚 Building learning context from: ${contextParts.length} sources (${context.length} chars)`)

  // Find relevant examples with lower threshold for more matches
  const examples = await findRelevantVideoExamples(context, {
    industry: videoMetadata.industry,
    contentFormat: videoMetadata.contentFormat,
    limit: 4,  // Get 4 examples for better coverage
    threshold: 0.35  // Lower threshold to find more matches
  })

  if (examples.length === 0) {
    console.log('📚 No matching learning examples found')
    return ''
  }

  console.log(`📚 Found ${examples.length} relevant examples (similarities: ${examples.map(e => e.similarity?.toFixed(2)).join(', ')})`)

  // Track which examples were used (if videoId provided)
  if (videoId) {
    for (const ex of examples) {
      // Async tracking, don't wait - wrap in IIFE to handle promise
      (async () => {
        try {
          await supabase.rpc('record_example_usage_with_tracking', {
            p_example_id: ex.id,
            p_video_id: videoId,
            p_similarity: ex.similarity
          })
        } catch {
          // Ignore tracking errors
        }
      })()
    }
  }

  // Build few-shot prompt
  return buildFewShotPrompt(examples)
}

/**
 * Get statistics on learning examples
 */
export async function getLearningStats(): Promise<{
  totalExamples: number
  byType: Record<string, number>
  mostUsed: Array<{ id: string; videoSummary: string; timesUsed: number }>
}> {
  const { data: examples, error } = await supabase
    .from('video_analysis_examples')
    .select('id, example_type, video_summary, times_used')
    .order('times_used', { ascending: false })

  if (error || !examples) {
    return { totalExamples: 0, byType: {}, mostUsed: [] }
  }

  const byType: Record<string, number> = {}
  for (const ex of examples) {
    byType[ex.example_type] = (byType[ex.example_type] || 0) + 1
  }

  return {
    totalExamples: examples.length,
    byType,
    mostUsed: examples.slice(0, 5).map(ex => ({
      id: ex.id,
      videoSummary: ex.video_summary,
      timesUsed: ex.times_used
    }))
  }
}
