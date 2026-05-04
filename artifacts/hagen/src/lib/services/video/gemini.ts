import { GoogleGenerativeAI } from '@google/generative-ai'
import type { 
  VideoAnalysisProvider, 
  VideoAnalysisOptions, 
  VideoAnalysis 
} from '../types'
import { getLearningContext } from './learning'
import { evaluateAnalysisQuality, type QualityScore } from './quality-judge'
import { parseVideoBrandObservationV1, type VideoBrandObservationV1 } from '../brand/schema-v1'

// Sentinels for the merged "deep + σTaste" prompt. Gemini wraps each JSON
// block between these markers so we can split a single response cleanly
// instead of paying for two round-trips.
const DISPLAY_OPEN = '<<<DISPLAY_JSON>>>'
const DISPLAY_CLOSE = '<<<END_DISPLAY_JSON>>>'
const SCHEMA_V1_OPEN = '<<<SCHEMA_V1_JSON>>>'
const SCHEMA_V1_CLOSE = '<<<END_SCHEMA_V1_JSON>>>'

function extractBetween(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open)
  if (start === -1) return null
  const end = text.indexOf(close, start + open.length)
  if (end === -1) return null
  return text.slice(start + open.length, end).trim()
}

function stripCodeFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!

export class GeminiVideoAnalyzer implements VideoAnalysisProvider {
  name = 'gemini'
  private client: GoogleGenerativeAI
  private model: string

  constructor(apiKey: string = GEMINI_API_KEY, model: string = 'gemini-2.0-flash-001') {
    this.client = new GoogleGenerativeAI(apiKey)
    this.model = model
  }

  /**
   * Quick concept extraction for learning context matching
   * Gets joke structure/mechanism for better semantic matching with learning examples
   */
  private async extractQuickTranscript(videoUrl: string): Promise<string> {
    try {
      const model = this.client.getGenerativeModel({ model: this.model })
      
      const result = await model.generateContent([
        {
          fileData: {
            mimeType: 'video/mp4',
            fileUri: videoUrl
          }
        },
        { text: `Analyze this video and extract the humor concept. Format your response as:

JOKE_CONCEPT: [One sentence describing what the joke/concept is about - e.g., "Restaurant employee offers attractiveness discount but price stays the same"]
HUMOR_MECHANISM: [How the humor works - e.g., "Subverts expectation by offering discount that provides no benefit"]  
HUMOR_TYPE: [Category: observational, physical, deadpan, absurdist, sarcastic, subversion, wordplay, or none]
SETUP: [What expectation is created]
PUNCHLINE: [What happens that's unexpected]
TRANSCRIPT: [Key dialogue, abbreviated]` }
      ])
      
      return result.response.text()
    } catch (error) {
      console.error('⚠️ Quick concept extraction failed:', error)
      return ''
    }
  }

  async analyzeVideo(
    videoUrl: string,
    options: VideoAnalysisOptions = {}
  ): Promise<VideoAnalysis> {
    const detailLevel = options.detailLevel || 'comprehensive'
    const useLearning = options.useLearning !== false  // Default to true
    
    console.log(`🎬 Analyzing video with Gemini (${detailLevel} detail)`)
    
    try {
      const model = this.client.getGenerativeModel({ model: this.model })

      // Get learning context from RAG if enabled
      let learningContext = options.learningContext || ''
      if (useLearning && !learningContext) {
        // Check if we have enough metadata for learning context
        const existingAnalysis = options.videoMetadata?.existingAnalysis as { script?: { transcript?: string } } | undefined
        const hasContext = options.videoMetadata?.transcript || 
                          options.videoMetadata?.title || 
                          options.videoMetadata?.description ||
                          existingAnalysis?.script?.transcript
        
        if (!hasContext) {
          // No existing context - extract quick transcript first (two-pass approach)
          console.log('📚 No existing context - extracting quick transcript for learning...')
          const quickTranscript = await this.extractQuickTranscript(videoUrl)
          
          if (quickTranscript) {
            console.log('📚 Got quick transcript, fetching learning context...')
            learningContext = await getLearningContext({
              ...options.videoMetadata,
              transcript: quickTranscript
            })
          }
        } else if (options.videoMetadata) {
          console.log('📚 Fetching learning context from existing metadata...')
          learningContext = await getLearningContext(options.videoMetadata)
        }
        
        if (learningContext) {
          console.log('✅ Found relevant learning examples')
        }
      }

      // Generate detailed analysis prompt based on detail level
      const basePrompt = this.buildAnalysisPrompt(detailLevel)
      
      // Inject learning context if available
      const prompt = learningContext 
        ? `${learningContext}\n\n${basePrompt}`
        : basePrompt

      const result = await model.generateContent([
        {
          fileData: {
            mimeType: 'video/mp4',
            fileUri: videoUrl
          }
        },
        { text: prompt }
      ])

      const response = result.response
      const analysisText = response.text()

      // Parse structured analysis from response
      const analysis = this.parseAnalysisResponse(analysisText, detailLevel)

      console.log('✅ Gemini analysis complete')

      // Optionally evaluate quality against human baseline
      if (options.evaluateQuality && options.humanBaseline) {
        console.log('📊 Evaluating analysis quality...')
        try {
          const qualityScore = await evaluateAnalysisQuality(
            analysis,
            options.humanBaseline
          )
          analysis.qualityScore = {
            ...qualityScore,
            evaluated_at: new Date().toISOString()
          }
          console.log(`📊 Quality score: ${qualityScore.overall}% overall`)
        } catch (error) {
          console.error('⚠️ Quality evaluation failed:', error)
        }
      }

      return analysis

    } catch (error) {
      console.error('❌ Gemini analysis failed:', error)
      throw new Error(
        `Video analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  private buildAnalysisPrompt(detailLevel: string): string {
    const basePrompt = `Analyze this video comprehensively and provide a structured JSON response with the following sections:`

    if (detailLevel === 'basic') {
      return `${basePrompt}

{
  "visual": {
    "hookStrength": <1-10>,
    "overallQuality": <1-10>,
    "mainElements": ["element1", "element2"],
    "colorPalette": ["color1", "color2"],
    "summary": "brief visual description"
  },
  "audio": {
    "quality": <1-10>,
    "musicType": "type",
    "hasVoiceover": <boolean>,
    "energyLevel": "low/medium/high"
  },
  "content": {
    "topic": "main topic",
    "style": "content style",
    "duration": <seconds>,
    "keyMessage": "main message"
  }
}`
    }

    if (detailLevel === 'detailed') {
      return `${basePrompt}

{
  "visual": {
    "hookStrength": <1-10>,
    "hookDescription": "what makes the first 3 seconds compelling",
    "overallQuality": <1-10>,
    "mainElements": ["element1", "element2"],
    "colorPalette": ["color1", "color2"],
    "colorDiversity": <1-10>,
    "transitions": ["type1", "type2"],
    "textOverlays": ["text1", "text2"],
    "summary": "detailed visual description"
  },
  "audio": {
    "quality": <1-10>,
    "musicType": "type",
    "musicGenre": "genre",
    "hasVoiceover": <boolean>,
    "voiceoverQuality": <1-10 or null>,
    "energyLevel": "low/medium/high",
    "audioEnergy": <1-10>,
    "soundEffects": ["effect1", "effect2"]
  },
  "content": {
    "topic": "main topic",
    "style": "content style",
    "format": "video format",
    "duration": <seconds>,
    "keyMessage": "main message",
    "narrativeStructure": "how story unfolds",
    "callsToAction": ["cta1", "cta2"],
    "targetAudience": "who this appeals to"
  },
  "technical": {
    "pacing": <1-10>,
    "editingStyle": "style description",
    "cameraWork": "camera technique",
    "lighting": "lighting quality"
  }
}`
    }

    // Comprehensive analysis (default)
    return `${basePrompt}

{
  "visual": {
    "hookStrength": <1-10, rate how compelling the first 3 seconds are>,
    "hookDescription": "detailed explanation of what makes the opening work or not work",
    "overallQuality": <1-10, production value and visual polish>,
    "mainElements": ["list all key visual elements"],
    "transitions": ["types of transitions between shots"],
    "textOverlays": ["any text that appears on screen"],
    "brandingElements": ["logos, watermarks, etc"],
    "summary": "comprehensive visual analysis covering all aspects"
  },
  "audio": {
    "quality": <1-10, audio production quality>,
    "musicType": "background music category",
    "musicGenre": "specific genre",
    "hasVoiceover": <boolean>,
    "voiceoverQuality": <1-10 or null if no voiceover>,
    "voiceoverTone": "tone and delivery style",
    "energyLevel": "low/medium/high",
    "audioEnergy": <1-10, intensity and engagement>,
    "soundEffects": ["list all sound effects used"]
  },
  "content": {
    "topic": "precise topic/subject matter",
    "style": "content style (educational, entertaining, inspirational, etc)",
    "format": "video format (talking head, montage, tutorial, etc)",
    "duration": <exact duration in seconds>,
    "keyMessage": "core message or takeaway",
    "narrativeStructure": "how the story/content unfolds (hook, body, close)",
    "callsToAction": ["list all CTAs"],
    "targetAudience": "detailed audience profile",
    "emotionalTone": "dominant emotion conveyed"
  },
  "scenes": {
    "description": "Analyze the video scene-by-scene, mapping visual edits to narrative/comedic beats.",
    "sceneBreakdown": [
      {
        "sceneNumber": <1, 2, 3...>,
        "timestamp": "approximate start time",
        "duration": "approximate length",
        "visualContent": "what is shown visually in this scene",
        "audioContent": "what is said/heard in this scene (dialogue, sound, music)",
        "narrativeFunction": "hook|setup|development|misdirection|reveal|payoff|callback|tag"
      }
    ],
    "editAsPunchline": <boolean, does a cut/edit itself serve as a reveal or punchline?>,
    "editPunchlineExplanation": "if true, explain how the edit delivers the joke",
    "visualNarrativeSync": <1-10, how tightly are visuals and story/joke synchronized>
  },
  "script": {
    "conceptCore": "one-sentence description of the replicable concept/format that could be copied",
    "hasScript": <boolean, does this video follow a scripted narrative vs spontaneous content>,
    "scriptQuality": <1-10, how well-written/structured is the script (null if unscripted)>,
    "transcript": "approximate transcript or description of what is said/shown",
    "humor": {
      "isHumorous": <boolean>,
      "humorType": "subversion|absurdist|observational|physical|wordplay|callback|contrast|deadpan|escalation|satire|parody|visual-reveal|edit-punchline|format-subversion|none",
      "humorMechanism": "detailed explanation of HOW the humor works — specific to this video, not a generic label",
      "visualComedyElement": "describe any visual element essential to the joke (reveal shots, reaction cuts, visual contradictions)"
    },
    "structure": {
      "hookType": "question|statement|action|mystery|pattern-interrupt|relatable-situation|visual-shock",
      "hook": "what happens in first 1-3 seconds to grab attention",
      "setup": "what expectation, context, or premise is established",
      "development": "how does the middle section build on the setup",
      "payoff": "how is the expectation resolved, subverted, or paid off",
      "payoffType": "verbal|visual|visual-reveal|edit-cut|combination",
      "payoffStrength": <1-10, how satisfying is the conclusion>,
      "hasCallback": <boolean, does it reference earlier elements>,
      "hasTwist": <boolean, is there an unexpected turn>,
      "twistDelivery": "verbal|visual|edit - how is the twist delivered?"
    },
    "replicability": {
      "score": <1-10, how easy is this concept to recreate with different content>,
      "template": "describe the templatable format in one sentence that another business could follow",
      "requiredElements": ["list elements ESSENTIAL to make this concept work"],
      "variableElements": ["list elements that can be swapped for different contexts"],
      "resourceRequirements": "low|medium|high - what's needed to recreate this (actors, props, locations, skills)",
      "contextDependency": <1-10, how much does this rely on specific context/brand/person (1=universal, 10=only works for this creator)>
    }
  },
  "technical": {
    "pacing": <1-10, how well the video maintains momentum>,
    "pacingDescription": "specific pacing patterns and effectiveness",
    "editingStyle": "detailed editing approach",
    "cutsPerMinute": <approximate number>,
    "cameraWork": "camera techniques and movement",
    "lighting": "lighting setup and quality",
    "aspectRatio": "video dimensions",
    "resolution": "visual clarity",
    "specialEffects": ["any VFX or filters used"]
  }
}

IMPORTANT:
1. SCENE-BY-SCENE ANALYSIS IS CRITICAL: Break down the video into individual scenes/shots. For each scene, note what is SHOWN and what is SAID. Many jokes rely on VISUAL reveals, not just dialogue.

2. EDITS CAN BE PUNCHLINES: A cut or scene change can itself deliver the joke. Hard cuts create abruptness matching character emotion.

3. For humorMechanism, be specific about THIS video's mechanism — explain HOW the humor works, not just a label. If your explanation could apply to multiple videos, it's too shallow.

4. For the "script" section, focus on analyzing the CONCEPT and STRUCTURE as intellectual property that could be extracted and reused. Think about what makes this format work and how another creator could adapt it.

Provide detailed, actionable analysis. Rate everything on 1-10 scales. Be specific about what works and what doesn't.`
  }

  /**
   * Run the legacy display analysis AND the σTaste / Schema v1 brand
   * observation in a SINGLE Gemini call. Halves per-video Gemini cost
   * compared to calling analyzeVideo() and BrandAnalyzer separately on
   * the same File API URI by issuing one tagged-section prompt and
   * splitting the response on sentinels.
   */
  async analyzeVideoCombined(
    videoUrl: string,
    options: VideoAnalysisOptions = {}
  ): Promise<CombinedDeepResult> {
    const detailLevel = options.detailLevel || 'comprehensive'
    const useLearning = options.useLearning !== false

    console.log(`🎬 Merged deep+σTaste Gemini call (${detailLevel})`)

    let learningContext = options.learningContext || ''
    if (useLearning && !learningContext) {
      const existingAnalysis = options.videoMetadata?.existingAnalysis as
        | { script?: { transcript?: string } }
        | undefined
      const hasContext =
        options.videoMetadata?.transcript ||
        options.videoMetadata?.title ||
        options.videoMetadata?.description ||
        existingAnalysis?.script?.transcript

      if (!hasContext) {
        const quickTranscript = await this.extractQuickTranscript(videoUrl)
        if (quickTranscript) {
          learningContext = await getLearningContext({
            ...options.videoMetadata,
            transcript: quickTranscript,
          })
        }
      } else if (options.videoMetadata) {
        learningContext = await getLearningContext(options.videoMetadata)
      }
    }

    const displayPrompt = this.buildAnalysisPrompt(detailLevel)
    const schemaV1Prompt = buildSchemaV1Prompt()

    const combinedPrompt = [
      learningContext ? `${learningContext}\n` : '',
      'You will produce TWO JSON outputs in a single response.',
      'Wrap each output between the exact sentinels shown — no markdown, no commentary outside the sentinels.',
      '',
      DISPLAY_OPEN,
      '<the JSON for SECTION A goes here>',
      DISPLAY_CLOSE,
      '',
      SCHEMA_V1_OPEN,
      '<the JSON for SECTION B goes here>',
      SCHEMA_V1_CLOSE,
      '',
      '════════════════════════════════════════════════════════════',
      'SECTION A — Deep display analysis (legacy):',
      '════════════════════════════════════════════════════════════',
      displayPrompt,
      '',
      '════════════════════════════════════════════════════════════',
      'SECTION B — σTaste / Schema v1.1 brand observation:',
      '════════════════════════════════════════════════════════════',
      schemaV1Prompt,
      '',
      'REMEMBER: Two JSON blocks, each wrapped in its sentinel pair, nothing else.',
    ].join('\n')

    const model = this.client.getGenerativeModel({ model: this.model })

    // Hard 15-second timeout per Gemini call attempt. If Gemini hangs (Railway
    // networking or under high load) the outer try/catch in the caller falls
    // back to the sequential two-call path instead of blocking indefinitely.
    async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const id = setTimeout(
          () => reject(new Error(`SENTINEL_TIMEOUT: Gemini call exceeded ${ms}ms`)),
          ms,
        )
        p.then(
          (v) => { clearTimeout(id); resolve(v) },
          (e: unknown) => { clearTimeout(id); reject(e) },
        )
      })
    }

    // Simplified display-only prompt used on retry — strips the σTaste
    // section so Gemini has less work to do and is less likely to omit sentinels.
    const displayOnlyPrompt = [
      learningContext ? `${learningContext}\n` : '',
      'Wrap your JSON response between the exact sentinels below — no markdown, no commentary outside.',
      '',
      DISPLAY_OPEN,
      '<the JSON goes here>',
      DISPLAY_CLOSE,
      '',
      displayPrompt,
    ].join('\n')

    let text = ''
    let displayBlock: string | null = null
    let schemaBlock: string | null = null

    for (let attempt = 1; attempt <= 2; attempt++) {
      const promptForAttempt = attempt === 1 ? combinedPrompt : displayOnlyPrompt
      if (attempt > 1) {
        console.warn('⚠️ analyzeVideoCombined: DISPLAY block missing/timeout on attempt 1 — retrying with simplified prompt…')
        await new Promise(resolve => setTimeout(resolve, 1500))
      }

      try {
        const result = await withTimeout(
          model.generateContent([
            { fileData: { mimeType: 'video/mp4', fileUri: videoUrl } },
            { text: promptForAttempt },
          ]),
          15000,
        )
        text = result.response.text()
        displayBlock = extractBetween(text, DISPLAY_OPEN, DISPLAY_CLOSE)
        schemaBlock = extractBetween(text, SCHEMA_V1_OPEN, SCHEMA_V1_CLOSE)
        if (displayBlock) break
      } catch (attemptErr) {
        const msg = attemptErr instanceof Error ? attemptErr.message : String(attemptErr)
        console.warn(`⚠️ analyzeVideoCombined attempt ${attempt} failed: ${msg}`)
        if (attempt === 2) {
          // Both attempts failed — surface the error so the caller can fall
          // back to the sequential analyzeVideo() + BrandAnalyzer path.
          throw new Error(`SENTINEL_FAIL: ${msg}`)
        }
      }
    }

    if (!displayBlock) {
      console.error('❌ Merged response missing DISPLAY block after 2 attempts; preview:', text.slice(0, 500))
      throw new Error('SENTINEL_FAIL: Gemini response missing display section after 2 attempts')
    }

    const analysis = this.parseAnalysisResponse(displayBlock, detailLevel)

    let schemaV1: VideoBrandObservationV1 | null = null
    let schemaV1ParseError: string | undefined
    if (schemaBlock) {
      try {
        const cleaned = stripCodeFences(schemaBlock)
        const parsed = JSON.parse(cleaned)
        schemaV1 = parseVideoBrandObservationV1(parsed)
      } catch (err) {
        schemaV1ParseError = err instanceof Error ? err.message : String(err)
        console.warn('⚠️ Merged σTaste block failed to parse:', schemaV1ParseError)
      }
    } else {
      schemaV1ParseError = 'no SCHEMA_V1 sentinel block in response'
      console.warn('⚠️ Merged response missing SCHEMA_V1 block')
    }

    return { analysis, schemaV1, schemaV1ParseError }
  }

  private parseAnalysisResponse(text: string, detailLevel: string): VideoAnalysis {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text]
      let jsonText = jsonMatch[1].trim()
      
      // Sanitize common LLM JSON issues
      // 1. Extract just the JSON object
      const firstBrace = jsonText.indexOf('{')
      const lastBrace = jsonText.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.slice(firstBrace, lastBrace + 1)
      }
      // 2. Remove trailing commas before } or ]
      jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1')
      
      const parsed = JSON.parse(jsonText)

      // Normalize to comprehensive format
      return {
        provider: this.name,
        analyzedAt: new Date().toISOString(),
        visual: {
          hookStrength: parsed.visual?.hookStrength || 5,
          hookDescription: parsed.visual?.hookDescription || '',
          overallQuality: parsed.visual?.overallQuality || 5,
          mainElements: parsed.visual?.mainElements || [],
          colorPalette: parsed.visual?.colorPalette || [],
          colorDiversity: parsed.visual?.colorDiversity || 5,
          transitions: parsed.visual?.transitions || [],
          textOverlays: parsed.visual?.textOverlays || [],
          visualHierarchy: parsed.visual?.visualHierarchy || '',
          compositionQuality: parsed.visual?.compositionQuality || 5,
          brandingElements: parsed.visual?.brandingElements || [],
          summary: parsed.visual?.summary || ''
        },
        audio: {
          quality: parsed.audio?.quality || 5,
          musicType: parsed.audio?.musicType || 'unknown',
          musicGenre: parsed.audio?.musicGenre || 'unknown',
          hasVoiceover: parsed.audio?.hasVoiceover || false,
          voiceoverQuality: parsed.audio?.voiceoverQuality || null,
          voiceoverTone: parsed.audio?.voiceoverTone || '',
          energyLevel: parsed.audio?.energyLevel || 'medium',
          audioEnergy: parsed.audio?.audioEnergy || 5,
          soundEffects: parsed.audio?.soundEffects || [],
          audioVisualSync: parsed.audio?.audioVisualSync || 5,
          audioMix: parsed.audio?.audioMix || ''
        },
        content: {
          topic: parsed.content?.topic || 'unknown',
          style: parsed.content?.style || 'unknown',
          format: parsed.content?.format || 'unknown',
          duration: parsed.content?.duration || 0,
          keyMessage: parsed.content?.keyMessage || '',
          narrativeStructure: parsed.content?.narrativeStructure || '',
          callsToAction: parsed.content?.callsToAction || [],
          targetAudience: parsed.content?.targetAudience || '',
          emotionalTone: parsed.content?.emotionalTone || '',
          valueProposition: parsed.content?.valueProposition || '',
          uniquenessFactors: parsed.content?.uniquenessFactors || []
        },
        script: {
          conceptCore: parsed.script?.conceptCore || '',
          hasScript: parsed.script?.hasScript ?? true,
          scriptQuality: parsed.script?.scriptQuality || null,
          transcript: parsed.script?.transcript || '',
          visualTranscript: parsed.script?.visualTranscript || '',
          humor: {
            isHumorous: parsed.script?.humor?.isHumorous ?? false,
            humorType: parsed.script?.humor?.humorType || 'none',
            humorMechanism: parsed.script?.humor?.humorMechanism || '',
            visualComedyElement: parsed.script?.humor?.visualComedyElement || ''
          },
          structure: {
            hookType: parsed.script?.structure?.hookType || 'statement',
            hook: parsed.script?.structure?.hook || '',
            setup: parsed.script?.structure?.setup || '',
            development: parsed.script?.structure?.development || '',
            payoff: parsed.script?.structure?.payoff || '',
            payoffType: parsed.script?.structure?.payoffType || 'verbal',
            payoffStrength: parsed.script?.structure?.payoffStrength || 5,
            hasCallback: parsed.script?.structure?.hasCallback ?? false,
            hasTwist: parsed.script?.structure?.hasTwist ?? false,
            twistDelivery: parsed.script?.structure?.twistDelivery || ''
          },
          replicability: {
            score: parsed.script?.replicability?.score || 5,
            template: parsed.script?.replicability?.template || '',
            requiredElements: parsed.script?.replicability?.requiredElements || [],
            variableElements: parsed.script?.replicability?.variableElements || [],
            resourceRequirements: parsed.script?.replicability?.resourceRequirements || 'medium',
            contextDependency: parsed.script?.replicability?.contextDependency || 5
          },
        },
        technical: {
          pacing: parsed.technical?.pacing || 5,
          pacingDescription: parsed.technical?.pacingDescription || '',
          editingStyle: parsed.technical?.editingStyle || '',
          cutsPerMinute: parsed.technical?.cutsPerMinute || 0,
          cameraWork: parsed.technical?.cameraWork || '',
          lighting: parsed.technical?.lighting || '',
          aspectRatio: parsed.technical?.aspectRatio || '',
          resolution: parsed.technical?.resolution || '',
          specialEffects: parsed.technical?.specialEffects || []
        },
        engagement: parsed.engagement ? {
          attentionRetention: parsed.engagement.attentionRetention || 5,
          shareability: parsed.engagement.shareability || 5,
          replayValue: parsed.engagement.replayValue || 5,
          scrollStopPower: parsed.engagement.scrollStopPower || 5,
          engagementFactors: parsed.engagement.engagementFactors || []
        } : undefined,
        trends: parsed.trends ? {
          trendingElements: parsed.trends.trendingElements || [],
          trendAlignment: parsed.trends.trendAlignment || 5,
          timelessness: parsed.trends.timelessness || 5
        } : undefined,
        scenes: parsed.scenes ? {
          sceneBreakdown: parsed.scenes.sceneBreakdown || [],
          editAsPunchline: parsed.scenes.editAsPunchline ?? false,
          editPunchlineExplanation: parsed.scenes.editPunchlineExplanation || '',
          visualNarrativeSync: parsed.scenes.visualNarrativeSync || 5,
          misdirectionTechnique: parsed.scenes.misdirectionTechnique || ''
        } : undefined
      }

    } catch (error) {
      console.error('Failed to parse Gemini response:', error)
      console.error('Raw response (first 500 chars):', text.substring(0, 500))
      throw new Error('Failed to parse video analysis response')
    }
  }
}

// Factory function for service registry
export function createGeminiAnalyzer(): VideoAnalysisProvider {
  return new GeminiVideoAnalyzer()
}

/**
 * Result of GeminiVideoAnalyzer.analyzeVideoCombined() — the merged
 * single-call path that produces both the legacy display analysis AND
 * the σTaste / Schema v1 brand observation.
 */
export interface CombinedDeepResult {
  analysis: VideoAnalysis
  schemaV1: VideoBrandObservationV1 | null
  schemaV1ParseError?: string
}

function buildSchemaV1Prompt(): string {
  // Trimmed copy of BrandAnalyzer.buildPrompt() — schema text only, no
  // duplicate "JSON only" / "evidence required" framing because the outer
  // combined prompt already establishes the contract.
  return [
    'Produce a Schema v1.1 brand observation for the same video.',
    'Unknown keys forbidden. At least 2 evidence items with timestamps when possible.',
    'Use null when uncertain and add an entry to "uncertainties".',
    '',
    'SCHEMA v1.1 (return EXACTLY this structure):',
    '{',
    '  "schema_version": 1,',
    '  "video": { "video_id": "...", "platform": "tiktok", "video_url": "...", "gcs_uri": "...", "detected_language": "en" },',
    '  "signals": {',
    '    "personality": { "energy_1_10": 1-10|null, "formality_1_10": 1-10|null, "warmth_1_10": 1-10|null, "confidence_1_10": 1-10|null, "traits_observed": ["..."], "social_positioning": { "accessibility": "everyman|aspirational|exclusive|elite"|null, "authority_claims": true|false|null, "peer_relationship": true|false|null } },',
    '    "statement": { "primary_intent": "inspire|entertain|inform|challenge|comfort|provoke|connect|sell"|null, "subtext": ["..."], "apparent_audience": "..."|null, "self_seriousness_1_10": 1-10|null, "opinion_stance": { "makes_opinions": true|false|null, "edginess": "safe|mild|moderate|edgy|provocative"|null, "defended": true|false|null } },',
    '    "execution": { "intentionality_1_10": 1-10|null, "production_investment_1_10": 1-10|null, "effortlessness_1_10": 1-10|null, "social_permission_1_10": 1-10|null, "has_repeatable_format": true|false|null, "format_name_if_any": "..."|null },',
    '    "replicability": { "actor_count": "solo|duo|small_team|large_team"|null, "setup_complexity": "phone_only|basic_tripod|lighting_setup|full_studio"|null, "skill_required": "anyone|basic_editing|intermediate|professional"|null, "environment_dependency": "anywhere|specific_indoor|specific_outdoor|venue_required"|null, "equipment_needed": ["..."], "estimated_time": "under_1hr|1_4hrs|half_day|full_day"|null },',
    '    "risk_level": { "content_edge": "brand_safe|mildly_edgy|edgy|provocative"|null, "humor_risk": "safe_humor|playful|sarcastic|dark_humor"|null, "trend_reliance": "evergreen|light_trends|trend_dependent"|null, "controversy_potential": "none|low|moderate|high"|null },',
    '    "hospitality": { "business_type": "restaurant|cafe|bar|hotel|other"|null, "vibe": ["..."], "occasion": ["..."], "price_tier": "budget|mid|premium|luxury|unknown"|null, "service_ethos": ["..."], "signature_items_or_offers": ["..."], "locality_markers": ["..."], "tourist_orientation": "locals|tourists|mixed|unknown"|null },',
    '    "environment_requirements": { "setting_type": "indoor|outdoor|kitchen|bar|storefront|dining_room|mixed"|null, "space_requirements": "minimal|moderate|spacious"|null, "lighting_conditions": "natural|artificial|low_light|flexible"|null, "noise_tolerance": "quiet_needed|moderate_ok|noisy_ok"|null, "customer_visibility": "no_customers|background|featured"|null },',
    '    "target_audience": { "age_range": { "primary": "gen_z|millennial|gen_x|boomer|broad"|null, "secondary": "gen_z|millennial|gen_x|boomer|none"|null }, "income_level": "budget|mid_range|upscale|luxury|broad"|null, "lifestyle_tags": ["..."], "primary_occasion": "quick_meal|casual_dining|special_occasion|takeout|delivery|bar_drinks|coffee_cafe|brunch"|null, "vibe_alignment": "trendy|classic|family_friendly|upscale_casual|dive_authentic|instagram_worthy|neighborhood_gem|hidden_gem"|null },',
    '    "humor": { "present": true|false|null, "humor_types": ["..."], "target": "self|customer|employee|industry|competitor|situation|product|none"|null, "age_code": "younger|older|balanced|unknown"|null, "meanness_risk": "low|medium|high|unknown"|null },',
    '    "conversion": { "cta_types": ["..."], "visit_intent_strength_0_1": 0-1|null },',
    '    "coherence": { "personality_message_alignment_0_1": 0-1|null, "contradictions": ["..."] }',
    '  },',
    '  "scores": { "brand_intent_signal_0_1": 0-1|null, "execution_coherence_0_1": 0-1|null, "distinctiveness_0_1": 0-1|null, "trust_signals_0_1": 0-1|null },',
    '  "evidence": [ { "type": "quote|ocr|visual|audio|caption|thumbnail|bio|other", "start_s": 0, "end_s": 1, "text": "...", "supports": ["signals.humor.present"] } ],',
    '  "confidence": { "overall_0_1": 0-1|null, "notes": "..." },',
    '  "uncertainties": ["..."]',
    '}',
  ].join('\n')
}
