/**
 * Enhanced Gemini Analysis Prompts
 * 
 * Multi-pass analysis for deep video understanding
 * Each pass focuses on a different aspect of the content
 */

export interface AnalysisPass {
  name: string
  description: string
  prompt: string
}

/**
 * Core analysis passes - previously ran 5 secondary inference passes on every video.
 * Disabled: social_dynamics, tonal_journey, persuasion_mechanics, authenticity_detection,
 * production_craft were speculative, slow, and not consumed by hagen-ui.
 * Kept as empty array to preserve the interface contract with /api/discern.
 */
export const coreAnalysisPasses: AnalysisPass[] = []

const _disabledPasses: AnalysisPass[] = [
  {
    name: 'social_dynamics',
    description: 'Analyze power dynamics, authority signals, and audience relationship',
    prompt: `Analyze the SOCIAL DYNAMICS in this video with extreme precision:

1. AUTHORITY & CREDIBILITY
   - How does the creator establish credibility? (expertise, confidence, social proof)
   - Eye contact patterns: Direct (commanding) vs averted (relatable) vs shifting (uncertain)
   - Body positioning: Open/confident vs closed/defensive vs casual/approachable
   - Vocal authority markers: Pace, certainty, hedging language
   - Timestamp each authority-establishing moment

2. AUDIENCE RELATIONSHIP
   - Parasocial techniques: Direct address ("you"), inclusive language ("we"), personal disclosure
   - Power dynamic: Talking AT viewers (broadcasting) vs WITH them (conversing) vs TO them (teaching)
   - Implied audience: Who does the creator think is watching?
   - Distance: Professional/distant vs friendly/peer vs intimate/confessional

3. SOCIAL PROOF & STATUS
   - Explicit claims of authority or popularity
   - Implicit status signals (environment, possessions, associations, knowledge display)
   - In-group/out-group language ("people who get it", "unlike most...")
   - Borrowed credibility (references to authorities, research, consensus)

4. TRUST ARCHITECTURE
   - Vulnerability moments: Real vs performed
   - Consistency between verbal content and non-verbal signals
   - What are they NOT saying? (Strategic omissions)
   - Promise-to-delivery ratio in previous statements within the video

Return observations with SPECIFIC TIMESTAMPS and CONFIDENCE LEVELS (high/medium/low).
Format as structured JSON.`
  },

  {
    name: 'tonal_journey',
    description: 'Map emotional arc, energy shifts, and tonal consistency',
    prompt: `Map the EMOTIONAL & TONAL JOURNEY of this video:

SEGMENT-BY-SEGMENT ANALYSIS (every 5 seconds):
For each segment provide:
- Timestamp range
- Dominant emotion being projected (specific: not "happy" but "triumphant", "playfully mischievous", "earnestly curious")
- Energy level (1-10)
- Intimacy level: Broadcast (1) → Group chat (5) → Personal conversation (10)
- Tonal intent: Educate / Entertain / Persuade / Connect / Provoke / Comfort

TONAL SHIFTS (critical moments):
- Where does energy change dramatically? Why?
- Where does the creator's persona shift?
- "Mask slip" moments - where authenticity breaks through performance
- Strategic tonal changes (softening before an ask, intensifying for emphasis)

TONAL FORMULA:
- Hook tone → Body tone → CTA tone
- Is there consistency or strategic variation?
- What emotion does the viewer leave with?

EMOTIONAL MANIPULATION FLAGS:
- Manufactured urgency
- Guilt or shame triggers
- Fear appeals
- False scarcity
- Identity threats ("you're not X if you don't...")

Return as structured JSON with timestamps.`
  },

  {
    name: 'persuasion_mechanics',
    description: 'Deconstruct psychological triggers and influence techniques',
    prompt: `Deconstruct the PERSUASION ARCHITECTURE of this video:

1. HOOK PSYCHOLOGY (first 3 seconds)
   - Primary cognitive trigger: Curiosity gap / Fear / Desire / Identity / Pattern interrupt / Controversy
   - The implicit promise: What does the viewer expect to get?
   - Specific technique used (name it if recognizable)
   - Effectiveness prediction: Will this stop a scroll?

2. RETENTION MECHANICS
   - Open loops: Unresolved questions or tensions (with timestamps)
   - Payoff timing: When are loops closed?
   - Information architecture: Drip (builds anticipation) vs Dump (overwhelms)
   - Re-hooks: Secondary hooks throughout the video

3. CREDIBILITY CONSTRUCTION
   - Evidence presentation: Stories / Data / Demonstrations / Testimonials
   - Objection handling: Does the creator address doubts?
   - Certainty calibration: Appropriate confidence for claims?

4. CALL-TO-ACTION ARCHITECTURE
   - Is there an ask? (Explicit or implicit)
   - How is it framed? (Benefit to viewer vs benefit to creator)
   - Reciprocity: Has the creator given value first?
   - Friction: How easy is the ask to complete?

5. PSYCHOLOGICAL TECHNIQUES (flag if present)
   - Scarcity (real or manufactured)
   - Social proof (authentic or fabricated)
   - Authority appeal (earned or borrowed)
   - Commitment/consistency traps
   - Liking triggers (similarity, compliments, familiarity)

Rate overall persuasive effectiveness (1-10) and ethical score (1-10).
Return as structured JSON.`
  },

  {
    name: 'authenticity_detection',
    description: 'Assess genuine vs performed elements',
    prompt: `Analyze AUTHENTICITY vs PERFORMANCE in this video:

AUTHENTIC SIGNALS (look for):
- Micro-expressions that contradict or complicate the narrative
- Unscripted moments: stumbles, genuine surprise, real laughter
- Eye movement: Recall patterns (looking up-left for right-handed) vs constructed (up-right)
- Natural speech: Filler words, self-corrections, incomplete thoughts
- Breathing patterns: Relaxed vs controlled vs anxious
- Genuine emotion: Does it reach the eyes?

PERFORMANCE SIGNALS (look for):
- Over-rehearsed delivery: Too smooth, unnatural pausing
- "YouTuber voice": Exaggerated enthusiasm, pitch variation, cadence
- Fake reactions: Exaggerated surprise, manufactured excitement
- Strategic vulnerability: Planned "authentic" moments that feel calculated
- Scripted spontaneity: "Random" elements that are clearly planned

SEGMENT-BY-SEGMENT AUTHENTICITY SCORE:
For each major segment (hook, each main point, CTA):
- Authenticity score (1-10)
- Key signals that informed the score
- What specifically feels genuine?
- What specifically feels performed?

OVERALL ASSESSMENT:
- Where is the creator MOST genuine?
- Where is it MOST performed?
- Is the performance appropriate for the content type?
- Does inauthenticity serve or hurt the message?

Return as structured JSON with timestamps.`
  },

  {
    name: 'production_craft',
    description: 'Technical and creative execution analysis',
    prompt: `Analyze the PRODUCTION CRAFT of this video:

VISUAL EXECUTION:
- Camera work: Static / Handheld / Gimbal / Mixed (quality of each)
- Composition: Rule of thirds, leading lines, depth, framing choices
- Lighting: Natural / Artificial / Mixed (quality, intentionality)
- Color grading: Palette, mood, consistency, intentional choices
- Graphics/text: Style, timing, readability, brand consistency
- B-roll/cutaways: Quality, relevance, pacing

AUDIO EXECUTION:
- Voice quality: Clarity, room tone, processing
- Music: Selection, mixing level, emotional alignment
- Sound design: Effects, transitions, ambient sound
- Audio-visual sync: Cuts on beat, energy matching

EDITING CRAFT:
- Pacing: Cuts per minute, rhythm, variation
- Transitions: Types used, appropriateness, smoothness
- Scene length: Average, variation, attention to viewer fatigue
- Continuity: Errors or intentional breaks

CREATIVE CHOICES:
- Thumbnail (if visible): Effectiveness prediction
- Title/caption alignment: Does content match promise?
- Format choices: Why this format for this content?
- Unique elements: What sets this apart technically?

PRODUCTION VALUE SCORE: 1-10
- What's the weakest element?
- What's done best?
- What would a 10/10 version improve?

Return as structured JSON.`
  }
]

/**
 * Build a comprehensive analysis prompt that incorporates user's focus areas
 */
export function buildAdaptivePrompt(
  basePass: AnalysisPass,
  userFocusAreas: Array<{ area: string; description: string; weight: number }>,
  userVocabulary: Array<{ term: string; definition: string }>,
  userDirections: Array<{ statement: string; applies_to: string }>
): string {
  let prompt = basePass.prompt

  // Add user's focus areas
  if (userFocusAreas.length > 0) {
    const focusSection = `

ADDITIONAL FOCUS AREAS (user-specified, HIGH PRIORITY):
${userFocusAreas.map(f => `- ${f.area}: ${f.description}`).join('\n')}

Pay special attention to these elements as they are important to this user.`
    prompt += focusSection
  }

  // Add user's vocabulary
  if (userVocabulary.length > 0) {
    const vocabSection = `

USER-DEFINED TERMINOLOGY:
Use these terms in your analysis where applicable:
${userVocabulary.map(v => `- "${v.term}": ${v.definition}`).join('\n')}`
    prompt += vocabSection
  }

  // Add user's directions
  const relevantDirections = userDirections.filter(
    d => d.applies_to === 'all' || d.applies_to === basePass.name
  )
  if (relevantDirections.length > 0) {
    const directionSection = `

USER DIRECTIONS:
${relevantDirections.map(d => `- ${d.statement}`).join('\n')}`
    prompt += directionSection
  }

  return prompt
}

/**
 * Build a comparison prompt when user is comparing videos
 */
export function buildComparisonPrompt(
  videoADescription: string,
  videoBDescription: string,
  userQuestion?: string
): string {
  return `Compare these two videos:

VIDEO A: ${videoADescription}

VIDEO B: ${videoBDescription}

${userQuestion ? `User's specific question: ${userQuestion}` : ''}

Analyze:
1. What do they have in common?
2. What makes them different?
3. Which is more effective and why?
4. What could each learn from the other?

Be specific about techniques, moments, and execution differences.
Return as structured JSON.`
}

/**
 * Build a drill-down prompt for specific moments
 */
export function buildDrillDownPrompt(
  timestamp: string,
  userObservation: string,
  previousAnalysis?: string
): string {
  return `The user noticed something at timestamp ${timestamp}:

"${userObservation}"

${previousAnalysis ? `Previous analysis of this video:\n${previousAnalysis}\n` : ''}

Analyze this SPECIFIC MOMENT in extreme detail:
1. Frame-by-frame: What changes in the 2 seconds around this timestamp?
2. Audio: What's happening with sound at this exact moment?
3. Editing: What technique was used for this transition/cut/moment?
4. Emotional arc: What feeling does this create?
5. Why might this have caught the user's attention?
6. Compare to typical content: What makes this different or notable?

Be extremely specific and technical.
Return as structured JSON.`
}

/**
 * Aggregate multiple analysis passes into a unified assessment
 */
export function buildSynthesisPrompt(
  passResults: Record<string, any>,
  viralKnowledge: Array<{ principle: string; category: string }>,
  userDirections: Array<{ statement: string; direction_type: string }>
): string {
  return `Synthesize these analysis passes into a unified assessment:

ANALYSIS DATA:
${JSON.stringify(passResults, null, 2)}

VIRAL CONTENT PRINCIPLES (reference these):
${viralKnowledge.map(v => `- [${v.category}] ${v.principle}`).join('\n')}

USER'S PREFERENCES AND RULES:
${userDirections.map(d => `- [${d.direction_type}] ${d.statement}`).join('\n')}

Create a SYNTHESIS that:
1. Identifies the video's core strengths and weaknesses
2. Maps strengths/weaknesses to viral principles (what aligns, what violates)
3. Considers user's specific preferences
4. Generates questions to ask the user about elements that require their judgment
5. Proposes a preliminary virality assessment with confidence levels

Format:
{
  "summary": "One paragraph synthesis",
  "strengths": ["with principle references"],
  "weaknesses": ["with principle references"],
  "user_alignment": {
    "likely_positive": ["based on their stated preferences"],
    "likely_negative": ["based on their stated preferences"],
    "unclear_need_input": ["elements requiring user judgment"]
  },
  "questions_for_user": ["Specific questions based on what needs human judgment"],
  "preliminary_score": {
    "objective_quality": 1-10,
    "viral_potential": 1-10,
    "user_alignment_estimate": 1-10,
    "confidence": "low/medium/high"
  }
}
`
}
