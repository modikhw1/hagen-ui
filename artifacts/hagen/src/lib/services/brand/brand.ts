/**
 * Brand
 * 
 * The fundamental brand object, composed of two equally weighted pillars:
 * 
 * 1. SELF-PERCEPTION (Person/Personality)
 *    - Who is the brand if summarized as a person?
 *    - An ever-evolving but somewhat stable personality
 *    - Can be focused (one-person show) or broad (corporate summary)
 * 
 * 2. STATEMENT (Message)
 *    - Everything being communicated through the channel
 *    - Not just content, but context and subtext
 *    - The furthest abstraction: feed mix, personality in subtext, voice
 */

// =============================================================================
// SELF-PERCEPTION: The Person/Personality Pillar
// =============================================================================

/**
 * If the brand was a person, who would they be?
 * This personification helps crystalize brand identity.
 */
export interface BrandPersona {
  /**
   * Gender presentation of the brand persona
   * Not about literal gender, but about the energy/vibe the brand projects
   */
  gender?: 'masculine' | 'feminine' | 'androgynous' | 'fluid'
  
  /**
   * Perceived age range of the brand persona
   * Affects language, references, and relatability
   */
  age_range?: 'youth' | 'young-adult' | 'adult' | 'mature' | 'ageless'
  
  /**
   * Life stage affects priorities and worldview
   */
  life_stage?: 
    | 'discovering' // Still figuring things out
    | 'building' // Actively constructing career/life
    | 'established' // Settled into identity
    | 'reflecting' // Looking back with wisdom
    | 'reinventing' // Pivoting or transforming
  
  /**
   * Key experiences that shaped this persona
   * What has the brand "been through"?
   */
  formative_experiences?: string[]
  
  /**
   * Social positioning and class markers
   * How does the brand present socially?
   */
  social_positioning?: {
    class_presentation?: 'working-class' | 'middle-class' | 'upper-class' | 'classless'
    accessibility?: 'everyman' | 'aspirational' | 'exclusive' | 'elite'
    cultural_capital?: 'mainstream' | 'niche' | 'subcultural' | 'high-culture'
  }
  
  /**
   * Core priorities that drive decisions
   * What does this person care about most?
   */
  priorities?: string[]
  
  /**
   * Core values this persona holds
   */
  values?: string[]
}

/**
 * How focused or diffuse is the brand identity?
 */
export interface BrandFocus {
  /**
   * Spectrum from laser-focused to broad
   */
  focus_type: 'singular' | 'focused' | 'balanced' | 'broad' | 'diffuse'
  
  /**
   * For singular/focused: The primary voice
   * For broad/diffuse: How is the corporate voice unified?
   */
  voice_unity?: {
    source?: 'founder' | 'character' | 'collective' | 'institutional'
    consistency?: 'rigid' | 'consistent' | 'flexible' | 'variable'
  }
  
  /**
   * If broad: Notes on how the personification was derived
   * Summarizing a corporation requires finding the focus within many minds
   */
  personification_notes?: string
}

/**
 * SELF-PERCEPTION
 * The internal identity of the brand - who it believes itself to be
 */
export interface SelfPerception {
  /**
   * The personified version of the brand
   */
  persona: BrandPersona
  
  /**
   * How focused or diffuse the identity is
   */
  focus: BrandFocus
  
  /**
   * The brand's relationship with itself
   */
  self_relationship?: {
    /**
     * Does the brand respect itself?
     * Affects confidence, pricing, boundaries
     */
    self_respect?: 'low' | 'moderate' | 'high' | 'excessive'
    
    /**
     * Is the brand aware of its own nature?
     * Meta-awareness of being a brand
     */
    self_awareness?: 'naive' | 'aware' | 'self-conscious' | 'meta'
    
    /**
     * How stable is the sense of self?
     */
    identity_stability?: 'volatile' | 'evolving' | 'stable' | 'rigid'
  }
  
  /**
   * Narrative summary of the persona in plain language
   * "If this brand was a person, they would be..."
   */
  persona_narrative?: string
}

// =============================================================================
// STATEMENT: The Message Pillar
// =============================================================================

/**
 * What is the brand saying between the lines?
 * The meta-message beyond the content itself
 */
export interface StatementContext {
  /**
   * What is being communicated in subtext?
   * The message beneath the message
   */
  subtext?: string[]
  
  /**
   * The overarching mission communicated
   * Is the brand trying to fill the world with love? Create enjoyment? Change something?
   */
  mission_communicated?: {
    type?: 'inspire' | 'entertain' | 'inform' | 'challenge' | 'comfort' | 'provoke' | 'connect'
    description?: string
  }
  
  /**
   * What change or impact is the brand advocating for?
   */
  advocacy?: {
    present: boolean
    cause?: string
    intensity?: 'subtle' | 'moderate' | 'strong' | 'militant'
  }
}

/**
 * To whom is the statement directed?
 */
export interface StatementAudience {
  /**
   * How targeted is the messaging?
   */
  targeting: 'universal' | 'broad' | 'focused' | 'niche' | 'exclusive'
  
  /**
   * Who is being spoken to?
   */
  addressed_to?: {
    description?: string
    relationship?: 'peer' | 'mentor' | 'friend' | 'authority' | 'servant' | 'ally'
  }
  
  /**
   * Who is explicitly not being spoken to?
   */
  exclusions?: string[]
}

/**
 * The personality transmitted through the statement
 * How the brand comes across in its communications
 */
export interface StatementPersonality {
  /**
   * Functional tone - helpful, informative, entertaining?
   */
  functional_mode?: 'informative' | 'helpful' | 'entertaining' | 'persuasive' | 'contemplative'
  
  /**
   * Does the brand take itself seriously?
   */
  self_seriousness?: 'self-deprecating' | 'casual' | 'balanced' | 'serious' | 'solemn'
  
  /**
   * Is the brand following its own lead?
   * Consistency with stated values and past behavior
   */
  consistency?: {
    follows_own_lead: boolean
    deviation_notes?: string
  }
  
  /**
   * Social hierarchy positioning
   * Where does the brand place itself relative to audience?
   */
  social_hierarchy?: {
    position?: 'below' | 'equal' | 'slightly-above' | 'above' | 'far-above'
    justification?: string // Does the brand "earn" this position?
  }
  
  /**
   * Opinion-making stance
   * Does the brand position itself as an opinion leader?
   */
  opinion_stance?: {
    makes_opinions: boolean
    edginess?: 'safe' | 'mild' | 'moderate' | 'edgy' | 'provocative'
    can_defend_position: boolean // Does the brand back up its opinions?
    authority_basis?: string // What gives it the right to opine?
  }
}

/**
 * The actual content being communicated
 * What is literally being said?
 */
export interface StatementContent {
  /**
   * Primary content themes/topics
   */
  themes?: string[]
  
  /**
   * Content character
   */
  character?: {
    informative?: boolean
    funny?: boolean
    clever?: boolean
    emotional?: boolean
    provocative?: boolean
    practical?: boolean
  }
  
  /**
   * If humor is present, what type?
   */
  humor_style?: {
    types?: ('observational' | 'absurdist' | 'self-deprecating' | 'satirical' | 'slapstick' | 'wordplay' | 'dark' | 'wholesome')[]
    targets?: string[] // What does the humor target?
    boundaries?: string[] // What won't be joked about?
  }
  
  /**
   * Content formats and mix
   */
  content_mix?: {
    formats?: string[]
    balance?: Record<string, number> // e.g., { educational: 30, entertainment: 50, promotional: 20 }
  }
}

/**
 * STATEMENT
 * Everything being communicated through the channel
 * The furthest abstraction of message: content, subtext, voice, personality
 */
export interface Statement {
  /**
   * The context and subtext of the message
   */
  context: StatementContext
  
  /**
   * Who the statement is directed toward
   */
  audience: StatementAudience
  
  /**
   * The personality transmitted through statements
   */
  personality: StatementPersonality
  
  /**
   * The actual content being communicated
   */
  content: StatementContent
  
  /**
   * Narrative summary of the statement in plain language
   * "This brand communicates by..."
   */
  statement_narrative?: string
}

// =============================================================================
// BRAND: The Complete Object
// =============================================================================

/**
 * BRAND
 * 
 * The fundamental brand identity object, composed of two equally weighted pillars:
 * - Self-perception: Who the brand is (the person/personality)
 * - Statement: What the brand says (the message, in all its abstraction)
 * 
 * These two pillars are not hierarchical - they are equally important and
 * interdependent. A brand is both who it is AND what it says.
 */
export interface Brand {
  /**
   * Unique identifier
   */
  id: string
  
  /**
   * Brand name
   */
  name: string
  
  /**
   * PILLAR 1: Self-Perception
   * Who is the brand? The person/personality.
   */
  self_perception: SelfPerception
  
  /**
   * PILLAR 2: Statement
   * What is the brand saying? The message in all its forms.
   */
  statement: Statement
  
  /**
   * Coherence score: How aligned are self-perception and statement?
   * A brand with high coherence has statements that match its identity.
   * A brand with low coherence has a disconnect between who it is and what it says.
   */
  coherence?: {
    score?: number // 0-1
    alignment_notes?: string
    tensions?: string[] // Areas where self-perception and statement diverge
  }
  
  /**
   * Evolution tracking
   * Brands evolve but maintain some stability
   */
  evolution?: {
    stability: 'volatile' | 'evolving' | 'stable' | 'static'
    trajectory?: 'emerging' | 'crystallizing' | 'mature' | 'transforming'
    pivot_history?: string[]
  }
  
  /**
   * Synthesis narrative
   * A holistic description combining both pillars
   */
  synthesis?: string
  
  /**
   * Metadata
   */
  created_at: string
  updated_at: string
  version: number
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Partial brand for progressive construction
 */
export type PartialBrand = Partial<Omit<Brand, 'id' | 'created_at' | 'updated_at'>> & {
  id?: string
  name: string
}

/**
 * Brand snapshot for comparison over time
 */
export interface BrandSnapshot {
  brand_id: string
  snapshot_at: string
  self_perception: SelfPerception
  statement: Statement
  coherence_score?: number
  notes?: string
}

/**
 * Create an empty brand template
 */
export function createEmptyBrand(name: string): Brand {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    self_perception: {
      persona: {},
      focus: { focus_type: 'balanced' }
    },
    statement: {
      context: {},
      audience: { targeting: 'broad' },
      personality: {},
      content: {}
    },
    created_at: now,
    updated_at: now,
    version: 1
  }
}

/**
 * Generate a persona narrative from the structured data
 */
export function generatePersonaNarrative(persona: BrandPersona, focus: BrandFocus): string {
  const parts: string[] = []
  
  if (persona.gender || persona.age_range) {
    const gender = persona.gender === 'androgynous' ? 'a person' : 
                   persona.gender === 'masculine' ? 'a man' : 
                   persona.gender === 'feminine' ? 'a woman' : 'someone'
    const age = persona.age_range ? `in their ${persona.age_range} years` : ''
    parts.push(`If this brand was a person, they would be ${gender} ${age}`.trim())
  }
  
  if (persona.life_stage) {
    const stageMap: Record<string, string> = {
      'discovering': 'still figuring out who they are',
      'building': 'actively building their life and career',
      'established': 'settled into a clear identity',
      'reflecting': 'looking back with accumulated wisdom',
      'reinventing': 'in the process of transformation'
    }
    parts.push(stageMap[persona.life_stage] || '')
  }
  
  if (persona.priorities && persona.priorities.length > 0) {
    parts.push(`Their priorities are ${persona.priorities.slice(0, 3).join(', ')}`)
  }
  
  if (focus.focus_type === 'singular' || focus.focus_type === 'focused') {
    parts.push('They speak with a clear, unified voice.')
  } else if (focus.focus_type === 'broad' || focus.focus_type === 'diffuse') {
    parts.push('They represent a collective voice, synthesized from many perspectives.')
  }
  
  return parts.filter(Boolean).join('. ') + '.'
}

/**
 * Generate a statement narrative from the structured data
 */
export function generateStatementNarrative(statement: Statement): string {
  const parts: string[] = []
  
  if (statement.context.mission_communicated) {
    const missionMap: Record<string, string> = {
      'inspire': 'to inspire and uplift',
      'entertain': 'to entertain and bring joy',
      'inform': 'to educate and inform',
      'challenge': 'to challenge and provoke thought',
      'comfort': 'to comfort and provide solace',
      'provoke': 'to provoke and disrupt',
      'connect': 'to connect and build community'
    }
    parts.push(`This brand communicates ${missionMap[statement.context.mission_communicated.type || 'connect'] || 'with purpose'}`)
  }
  
  if (statement.audience.targeting) {
    const audienceMap: Record<string, string> = {
      'universal': 'speaking to everyone',
      'broad': 'speaking to a wide audience',
      'focused': 'speaking to a specific audience',
      'niche': 'speaking to a niche community',
      'exclusive': 'speaking to a select few'
    }
    parts.push(audienceMap[statement.audience.targeting])
  }
  
  if (statement.personality.self_seriousness) {
    if (statement.personality.self_seriousness === 'self-deprecating') {
      parts.push("They don't take themselves too seriously")
    } else if (statement.personality.self_seriousness === 'serious' || statement.personality.self_seriousness === 'solemn') {
      parts.push('They carry themselves with gravity')
    }
  }
  
  if (statement.personality.opinion_stance?.makes_opinions) {
    if (statement.personality.opinion_stance.can_defend_position) {
      parts.push('They share opinions and can back them up')
    } else {
      parts.push('They share opinions but may not always defend them')
    }
  }
  
  return parts.filter(Boolean).join(', ') + '.'
}
