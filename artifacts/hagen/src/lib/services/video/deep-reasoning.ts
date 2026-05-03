/**
 * Deep Humor Reasoning Module
 * 
 * Enhances Gemini's analysis by forcing generative reasoning before taxonomic labeling.
 * This module adds a "reasoning chain" section to prompts that requires the model to
 * answer "why" questions before outputting humor types.
 * 
 * KEY INSIGHT: The difference between shallow and deep analysis is asking
 * "what explains this pattern?" rather than "what label fits this?"
 */

// =============================================================================
// REASONING CHAIN PROMPT SECTION
// =============================================================================

/**
 * The Deep Reasoning Chain - injected into prompts before humor analysis.
 * Forces the model to reason through dynamics before labeling.
 */
export const DEEP_REASONING_CHAIN = `
═══════════════════════════════════════════════════════════════════════════════
YOUR PERSPECTIVE
═══════════════════════════════════════════════════════════════════════════════

Imagine you're a 23-year-old college student scrolling through TikTok. You have a 
genuine appreciation for comedy and find yourself drawn to marketing clips, trying 
to figure out how different businesses create visual content that is both humorous 
and somehow creates an engaging piece of content representing a brand.

You notice when something is actually funny vs. when it's trying too hard. You can 
tell when a joke lands because you've seen thousands of videos. You understand the 
references, the trends, the formats. When a hospitality worker makes dark humor 
about their job, you get it - you've worked service jobs, you know the exhaustion 
behind the smile.

Analyze this video from that perspective. What would make you stop scrolling? What 
would make you share this with friends? What's the actual joke here?

═══════════════════════════════════════════════════════════════════════════════
DEEP HUMOR REASONING CHAIN (Complete BEFORE labeling humor type)
═══════════════════════════════════════════════════════════════════════════════

For EVERY video with humor, answer these questions IN ORDER before assigning labels:

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 1: CHARACTER DYNAMICS
├─────────────────────────────────────────────────────────────────────────────
│ Don't describe what characters DO. Describe their RELATIONSHIP and MOTIVATIONS.
│
│ Ask: "What dynamic exists between these characters?"
│ 
│ Common dynamics in service industry content:
│ • Worker who must maintain professionalism vs. customer who doesn't deserve it
│ • Workers who want less work vs. managers who want more output
│ • Someone who thinks they're clever vs. someone who sees through it
│ • Public performance of service vs. private reality (dead inside)
│ • The person doing the work vs. the person benefiting from it
│
│ OUTPUT: character_dynamic field
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 2: UNDERLYING TENSION
├─────────────────────────────────────────────────────────────────────────────
│ Every joke has tension. Find it. The humor lives in the GAP between opposites.
│
│ Ask: "What tension does this create?"
│
│ Common tensions:
│ • Professionalism vs. genuine emotion
│ • What you say vs. what you mean
│ • Customer expectations vs. reality
│ • Performance (fake smile) vs. authenticity (frustration)
│ • What SHOULD happen vs. what DOES happen
│
│ OUTPUT: underlying_tension field
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 3: FORMAT PARTICIPATION
├─────────────────────────────────────────────────────────────────────────────
│ The STRUCTURE of the video can be part of the joke.
│
│ Ask: "Does the format/structure participate in the humor?"
│
│ Format elements that become jokes:
│ • Pattern established → then broken (person refuses to play the game)
│ • POV misdirection (you think you know whose perspective, then discover otherwise)
│ • Escalation structure (each beat raises stakes until break)
│ • Mid-word/mid-action cut (implies without stating)
│ • Interview format subverted (interviewee or interviewer breaks role)
│
│ POV MISDIRECTION (common and important):
│ • Voice assumed to be POV character's internal monologue → reveal it's someone else
│ • Camera angle suggests we're seeing one person's view → reveal different context
│ • Example: "Internal tipping debate" sounds like customer → reveal it's cashier speaking out loud
│ • The reveal REFRAMES everything we just experienced
│
│ OUTPUT: format_participation field
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 4: EDITING AS COMEDY
├─────────────────────────────────────────────────────────────────────────────
│ Editing choices are often part of the joke. Analyze them.
│
│ Ask: "Did an editing choice add to the humor?"
│
│ Editing techniques:
│ • Mid-word cut: Implies profanity/action without showing it (feels authentic)
│ • Hard cut to black: Maximum impact ending, no resolution
│ • Held beat: Forces viewer to sit in awkwardness
│ • Pattern-pattern-break: Same rhythm then different on the break
│ • Reveal cut: Cut shows something that recontextualizes previous content
│
│ OUTPUT: editing_contribution field
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 4.5: VISUAL PUNCHLINE DETECTION
├─────────────────────────────────────────────────────────────────────────────
│ Many video jokes have punchlines that are VISUAL, not spoken.
│
│ Ask: "Is the punchline shown rather than said?"
│
│ Visual punchline types:
│ • Reveal: Camera shows something unexpected (text on screen, object, person)
│ • Expression: Someone's face is the joke (disgust, dead inside, cringe)
│ • Action without words: Someone walks away, hangs up, or does something
│ • Text on screen: The words ARE the joke (no dialogue needed)
│ • Absence of people: Video is just images/text (no performance, just concept)
│ • Physical comedy: Something happens visually that words can't capture
│
│ CRITICAL: If the video works WITHOUT dialogue, the punchline is visual.
│ If you remove the images and just read the script, would it still be funny?
│ If NO - the visual IS the humor. Document what you SEE, not what is said.
│
│ Common visual-only formats:
│ • Questions posed to camera with no answer (engagement bait)
│ • Reaction faces that carry the whole joke
│ • Text overlays that are funnier than the audio
│ • Before/after reveals
│ • Object reveals (uniform, price tag, empty plate)
│
│ OUTPUT: visual_punchline field (describe what visual element delivers the joke, or 'none')
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 4.6: TONE & DELIVERY
├─────────────────────────────────────────────────────────────────────────────
│ HOW something is said can be funnier than WHAT is said.
│
│ Ask: "Is the humor in the delivery, tone, or attitude?"
│
│ Delivery styles that ARE the joke:
│ • Deadpan: Flat affect while saying absurd things (makes it funnier)
│ • Fed up but professional: Worker barely holding it together
│ • Caustic but restrained: Says something cutting while keeping composure  
│ • Overly polite hostility: Sweetly passive-aggressive
│ • Innocent delivery of brutal content: Child or naive person, unaware of impact
│ • Enthusiastic incompetence: Trying really hard but failing
│
│ Small injected jokes through delivery:
│ • Brief reactions that show frustration
│ • Micro-expressions that undercut what's being said
│ • Tone shifts that reveal true feelings
│ • "Look at camera" moments that break the fourth wall
│
│ CRITICAL: If the script reads flat but the performance is funny,
│ the delivery IS the joke. Note what makes the performance land.
│
│ OUTPUT: tone_delivery field (describe what makes the delivery funny, or 'none')
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 5: AUDIENCE SURROGATE
├─────────────────────────────────────────────────────────────────────────────
│ Often one character represents what the audience feels.
│
│ Ask: "Is there a character the audience identifies with?"
│
│ The Rebel Worker Archetype:
│ • A worker who breaks professional composure
│ • Often the one "actually doing the work" (chef, server, kitchen staff)
│ • Expresses what viewers wish they could say
│ • Breaking from expected behavior is cathartic
│
│ OUTPUT: audience_surrogate field
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 5.5: WORDPLAY & MISUNDERSTANDING
├─────────────────────────────────────────────────────────────────────────────
│ Many jokes rely on deliberate or accidental miscommunication.
│
│ Ask: "Is there a word or phrase being interpreted two different ways?"
│
│ Types of linguistic humor:
│ • Literal vs intended: "Shake it" → shakes body instead of drink
│ • Finish this: "Finish this" → drinks the drink instead of completing task
│ • Ambiguous pronouns: "Made by a 4-year-old" → turns out literally true
│ • Sarcasm misread: "Do you work here?" + obvious uniform = sarcastic "no"
│ • Instruction misread: What seems obvious has another interpretation
│
│ THE REVEAL MOMENT:
│ • When does the audience realize the misinterpretation?
│ • Is there a visual reveal that confirms the wrong reading?
│ • Who is "in" on the joke vs. oblivious?
│
│ CRITICAL: If a phrase has two meanings, and the joke is someone taking 
│ the wrong one, you MUST articulate BOTH meanings explicitly.
│
│ Example analysis format:
│ ❌ "The humor comes from misunderstanding"
│ ✅ "The worker says 'finish this' meaning 'complete the task', but the 
│    colleague interprets it as 'finish drinking this' and chugs it"
│
│ OUTPUT: wordplay_misunderstanding field (describe both interpretations, or 'none')
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 6: SOCIAL DYNAMICS & CRUELTY
├─────────────────────────────────────────────────────────────────────────────
│ Many jokes involve social power, embarrassment, or casual cruelty.
│
│ Ask: "Is someone being embarrassed, rejected, or put down? Is that the joke?"
│
│ Types of social dynamics in humor:
│ • Mean humor: Casual cruelty delivered deadpan (beauty discount = rejection)
│ • Embarrassment comedy: Someone misunderstands and looks foolish
│ • Status reversal: Low-status person gains power, high-status person humbled
│ • Escalation: Small disagreement builds to absurd proportions
│ • Misunderstanding comedy: Literal vs intended interpretation (shake = dance)
│ • Sarcasm as annoyance: "Of course I work here" (obvious visual cues + sarcastic denial)
│ • Bill-paying dance: Social ritual where both parties know the "right" answer but play games
│ • The "fold": Someone gives in when social rules say they shouldn't (he let her pay)
│
│ SARCASM AS RESPONSE TO OBVIOUS QUESTIONS:
│ • Someone asks an obviously dumb question ("Do you work here?" to uniformed employee)
│ • The response is exaggerated sarcasm (removes uniform, says "No")
│ • The subtext is "isn't it obvious?" expressed through action not words
│ • This is SOCIAL CORRECTION humor - making the asker feel foolish for asking
│
│ Key insight: If someone is embarrassed or rejected, NAME IT. 
│ "The joke is that she's told she's not attractive" is clearer than "subversion."
│
│ WHO LOOKS FOOLISH? This is critical for misunderstanding comedy:
│ • Does the character who misunderstands REALIZE they look foolish?
│ • Is their facial expression confident while we know they're wrong?
│ • The gap between self-perception and reality IS the joke.
│
│ OUTPUT: social_dynamic field
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 6.3: DARK HUMOR & HIDDEN DISTRESS
├─────────────────────────────────────────────────────────────────────────────
│ Dark humor often hides in plain sight. The surface looks normal, but something
│ deeply uncomfortable is being communicated through contrast.
│
│ Ask: "Is there darkness hiding behind a cheerful surface?"
│
│ DARK HUMOR PATTERNS:
│ • Smiling through pain: Character performs happiness while implying suffering
│ • Casual mention of disturbing things: Said in upbeat tone or matter-of-factly
│ • Service worker "dead inside": Maintains customer service face while dying
│ • Implied self-harm/violence: Gestures, glances, or actions that suggest harm
│ • "This is fine" energy: Chaos happening while someone acts like it's normal
│ • Cheerful nihilism: Upbeat delivery of bleak content
│ • Facade vs reality: Extreme gap between presented emotion and implied emotion
│
│ CRITICAL DETECTION SIGNALS:
│ • Inappropriate affect: Happy face + negative context = RED FLAG
│ • Dramatic contrast: Upbeat music + depressing situation
│ • Gestures that suggest: Looking at knives, ovens, rope, exits while smiling
│ • "Jokes" about quitting, dying, escaping, giving up
│ • Eye contact that communicates suffering while maintaining smile
│
│ HOSPITALITY-SPECIFIC DARK HUMOR:
│ • Server smiling at camera while making self-harm gestures
│ • Kitchen worker maintaining composure while eyes suggest murder
│ • Holiday season content where "festive" masks desperation
│ • "Day in my life" that implies this life is unbearable
│
│ THE JUXTAPOSITION IS THE JOKE:
│ • If the audio says "I love my job" but the visual says "kill me"
│ • If the face is smiling but the context is horrifying
│ • If the energy is upbeat but the message is bleak
│ • THAT GAP between surface and truth IS the humor
│
│ NEVER describe these as "observational" or "relatable" - they are DARK.
│ The humor comes from the horror of recognition, not just recognition.
│
│ OUTPUT: dark_humor_signals field (describe the darkness hiding under the surface, or 'none')
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 6.5: CULTURAL CONTEXT & TROPES
├─────────────────────────────────────────────────────────────────────────────
│ Humor often relies on shared cultural knowledge that may not be stated.
│
│ Ask: "What cultural context, tropes, or shared experiences does this require?"
│
│ Common service industry tropes:
│ • The "clueless young worker" - forgetful, unfocused, but endearing
│ • The "demanding kitchen staff" - everyone jumps when the chef speaks
│ • The "generosity game" - social ritual of insisting to pay the bill
│ • The "dead inside" service worker - professional smile hiding exhaustion
│ • The "entitled customer" - unreasonable demands treated as normal
│
│ Generational humor codes:
│ • Gen Z irony: Deadpan, understated, nihilistic undertones
│ • Millennial relatability: "Adulting is hard" shared exhaustion
│ • Parent/child dynamics: Authority vs. naive worldview
│
│ Social rituals that drive humor:
│ • Tipping anxiety (US-specific cultural tension)
│ • Bill-paying dance (who offers, who insists, who caves)
│ • Interview politeness (masks vs. true feelings)
│ • Customer-is-always-right (vs. worker revenge fantasies)
│
│ Ask yourself: "What does the audience need to ALREADY KNOW to find this funny?"
│ If you can't articulate the shared context, you may be missing the joke.
│
│ OUTPUT: cultural_context field (or 'none' if culturally neutral)
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 7: CONTENT TYPE & INTENT (BEFORE quality rating)
├─────────────────────────────────────────────────────────────────────────────
│ Not all engaging content is trying to be funny. Identify what this IS.
│
│ Ask: "What is this content trying to BE? What response does it want?"
│
│ CONTENT TYPES:
│ • Comedy: Goal is laughs. Punchline, surprise, absurdity, wit.
│ • Wholesome/Cute: Goal is warmth. Child, pet, touching moment. "Aww" not "haha"
│ • Relatable: Goal is recognition. "So true!" but not necessarily funny.
│ • Charming/Endearing: Goal is to like the person/brand. Personality-driven.
│ • Clever/Smart: Goal is appreciation. "That's clever" not laughs.
│ • Chaotic/Unhinged: Goal is "what did I just watch?" energy.
│ • Engagement Bait: Goal is comments/shares. Question, debate, reaction.
│
│ IMPORTANT: A video featuring a child TRYING to negotiate like an adult
│ is WHOLESOME, not comedy. The cuteness IS the point.
│ 
│ A video where someone looks foolish is COMEDY.
│ A video where a child looks innocent is WHOLESOME.
│ Know the difference. Label accordingly.
│
│ OUTPUT: content_type field (Comedy / Wholesome / Relatable / Charming / Clever / Chaotic / Bait)
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 8: CONTENT QUALITY ASSESSMENT (BE BRUTALLY HONEST)
├─────────────────────────────────────────────────────────────────────────────
│ Now rate quality - but relative to CONTENT TYPE identified above.
│
│ Ask: "Does this succeed at what it's trying to be?"
│
│ FOR COMEDY - Does it make you laugh?
│ FOR WHOLESOME - Does it create warmth/charm?
│ FOR RELATABLE - Is the observation sharp or obvious?
│ FOR CLEVER - Is the concept genuinely smart?
│
│ DISTINGUISH BETWEEN:
│ • Humor: Makes you laugh or smile
│ • Relatability: You recognize the situation (but it's not funny)
│ • Engagement bait: Designed to get comments, not laughs
│ • Clever: Smart concept but not actually funny
│ • Cute/Charming: Pleasant but not comedic (this is FINE if that's the goal)
│
│ BE CRITICAL - Don't inflate quality. Many videos are:
│ • "Premise is obvious, execution is average"
│ • "Relatable but not actually funny"
│ • "Trying too hard / overexplained"
│ • "Format is tired / seen this 100 times"
│ • "The idea is better than the execution"
│
│ QUALITY TIERS:
│ • Exceptional: Genuinely clever, surprising, well-executed. Would share.
│ • Good: Solid execution with clear appeal. Worth watching.
│ • Average: Does what it sets out to do, nothing special. Forgettable.
│ • Weak: Misses the mark, or poorly executed good idea.
│ • Poor: Doesn't work. Concept is broken or execution fails.
│
│ Common mistakes:
│ ❌ Calling something "funny" because you understand what they're going for
│ ❌ Rating based on effort rather than outcome
│ ❌ Assuming observational = funny (observing something isn't inherently humor)
│ 
│ OUTPUT: quality_assessment field (tier + honest 1-sentence assessment)
└─────────────────────────────────────────────────────────────────────────────

┌─────────────────────────────────────────────────────────────────────────────
│ STEP 9: THE EXPLANATION TEST
├─────────────────────────────────────────────────────────────────────────────
│ Before finalizing your humor analysis, check your explanation.
│
│ ❌ WRONG: "The humor comes from the contrast between the characters"
│    (This labels but doesn't explain)
│
│ ✅ RIGHT: "The humor comes from each answer revealing self-interest based on 
│    job role - those who profit want more, those who labor want less. The chef 
│    breaks the format entirely by refusing to give a number, expressing the 
│    frustration of being the one 'actually doing the work'."
│    (This explains the MECHANISM)
│
│ For misunderstanding jokes specifically:
│ ❌ WRONG: "The humor comes from misunderstanding"
│ ✅ RIGHT: "The customer reads 'shake it' as 'shake your body' (dance) rather
│    than 'shake the drink'. Her confused expression shows she thinks the worker
│    is strange - but WE know she's the one who misread, making her look foolish."
│
│ Rule: If your explanation could apply to multiple videos, it's too shallow.
└─────────────────────────────────────────────────────────────────────────────

NOW output your deep reasoning analysis in this format:

"deep_reasoning": {
  "character_dynamic": "<one sentence describing the relationship/tension between characters>",
  "underlying_tension": "<what gap or conflict creates the humor>",
  "format_participation": "<how does structure/format participate in the joke, or 'none'>",
  "editing_contribution": "<what editing choices add to humor, or 'none'>",
  "visual_punchline": "<if punchline is visual: describe what visual element delivers the joke, or 'none'>",
  "tone_delivery": "<if relevant: what makes the delivery/performance funny beyond the words, or 'none'>",
  "audience_surrogate": "<which character represents viewer feelings, and what experience this taps into, or 'none'>",
  "wordplay_misunderstanding": "<if relevant: word/phrase with two meanings - state BOTH interpretations explicitly, or 'none'>",
  "social_dynamic": "<if relevant: who is embarrassed/rejected/put down and how, or 'none'>",
  "dark_humor_signals": "<CRITICAL: if cheerful surface hides disturbing subtext, describe the darkness. Smiling + self-harm gestures, fake happiness + despair, upbeat + bleak. Or 'none'>",
  "cultural_context": "<what cultural knowledge, tropes, or shared experiences does this joke require, or 'none'>",
  "content_type": "<Comedy/Wholesome/Relatable/Charming/Clever/Chaotic/Bait - what is this TRYING to be?>",
  "quality_assessment": "<tier (Exceptional/Good/Average/Weak/Poor) + honest 1-sentence assessment>",
  "why_this_is_funny": "<2-3 sentences explaining the MECHANISM, not just describing what happens>",
  "what_makes_it_work": "<the core insight that makes this joke land>"
}
`

// =============================================================================
// ENHANCED HUMOR OUTPUT SCHEMA
// =============================================================================

/**
 * Enhanced humor analysis schema that requires deep reasoning
 */
export interface DeepHumorAnalysis {
  // Required deep reasoning (must be completed BEFORE labeling)
  deep_reasoning: {
    character_dynamic: string
    underlying_tension: string
    format_participation: string
    editing_contribution: string
    visual_punchline: string  // What visual element delivers the punchline?
    tone_delivery: string  // NEW: What makes the delivery/performance funny?
    audience_surrogate: string
    wordplay_misunderstanding: string  // Word/phrase with two meanings
    social_dynamic: string
    cultural_context: string  // What shared knowledge does this joke require?
    content_type: string  // Comedy/Wholesome/Relatable/etc.
    quality_assessment: string
    why_this_is_funny: string
    what_makes_it_work: string
  }
  
  // Traditional humor fields (now DERIVED from reasoning)
  humor_type_primary: string
  humor_type_secondary?: string
  humor_mechanism: string
  
  // Replicability insight (derived from understanding)
  replicability_insight: {
    core_template: string  // The abstract pattern that could be adapted
    what_would_change: string[]  // Elements that vary in adaptation
    what_must_stay: string[]  // Elements essential to the joke
  }
}

// =============================================================================
// LEARNING EXAMPLE ENHANCEMENT
// =============================================================================

/**
 * When saving learning examples, structure them to model deep reasoning.
 * This teaches the model HOW to think, not just WHAT to output.
 */
export interface DeepReasoningExample {
  // The video context
  video_summary: string
  
  // What the model originally said (shallow analysis)
  original_analysis: string
  
  // The deep reasoning chain (models the thinking process)
  deep_reasoning: {
    character_dynamic: string
    underlying_tension: string
    format_participation: string
    editing_contribution: string
    visual_punchline?: string
    tone_delivery?: string
    audience_surrogate: string
    wordplay_misunderstanding?: string
    social_dynamic?: string
    dark_humor_signals?: string
    cultural_context?: string
  }
  
  // The complete interpretation (result of deep reasoning)
  correct_interpretation: string
  
  // What the model should learn from this
  key_teaching: string
  
  // Tags for retrieval
  tags: string[]
  humor_types: string[]
}

// =============================================================================
// PROMPT BUILDER
// =============================================================================

/**
 * Build enhanced humor prompt section with deep reasoning chain
 */
export function buildDeepHumorPromptSection(): string {
  return `
${DEEP_REASONING_CHAIN}

Then complete the standard humor analysis, but ensure your "humorMechanism" 
reflects the deep reasoning above, not just a surface label.
`
}

/**
 * Build few-shot examples that MODEL the deep reasoning process
 */
export function buildDeepReasoningExamples(examples: DeepReasoningExample[]): string {
  if (examples.length === 0) return ''
  
  let prompt = `
═══════════════════════════════════════════════════════════════════════════════
DEEP REASONING EXAMPLES: Study HOW to think about humor
═══════════════════════════════════════════════════════════════════════════════

These examples show the REASONING PROCESS, not just correct answers.
Follow the same thinking pattern for new videos.

`
  
  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i]
    
    prompt += `┌─────────────────────────────────────────────────────────────────────────────
│ EXAMPLE ${i + 1}: ${ex.video_summary.slice(0, 60)}...
├─────────────────────────────────────────────────────────────────────────────
│ ❌ SHALLOW ANALYSIS (what you might say):
│    ${ex.original_analysis}
│
│ ✅ DEEP REASONING CHAIN:
│    Character Dynamic: ${ex.deep_reasoning.character_dynamic}
│    Underlying Tension: ${ex.deep_reasoning.underlying_tension}
│    Format Participation: ${ex.deep_reasoning.format_participation}
│    Editing Contribution: ${ex.deep_reasoning.editing_contribution}
│    Audience Surrogate: ${ex.deep_reasoning.audience_surrogate}
│
│ ✅ RESULTING INTERPRETATION:
│    ${ex.correct_interpretation.split('\n').slice(0, 3).join('\n│    ')}
│
│ 🎓 KEY TEACHING:
│    ${ex.key_teaching}
└─────────────────────────────────────────────────────────────────────────────

`
  }
  
  return prompt
}

// =============================================================================
// EXAMPLE DEEP REASONING ENTRIES (seed data)
// =============================================================================

export const SEED_DEEP_REASONING_EXAMPLES: DeepReasoningExample[] = [
  {
    video_summary: "Restaurant skit where different staff members estimate how many lamb chops they'll make. Floor manager (600), waitress (100), owner (1000), chef refuses and says 'I think you should all stfu' (cut mid-word).",
    original_analysis: "Script Humor: contrast - Different people give different estimates showing different perspectives.",
    deep_reasoning: {
      character_dynamic: "Workers who labor (waitress, chef) vs. those who profit (owner, manager) - each person's answer reveals their incentive structure",
      underlying_tension: "Self-interest based on job role: profit-motivated want high numbers, labor-motivated want low numbers",
      format_participation: "The chef BREAKS the established format (role + estimate) by refusing to give a number and opting out entirely",
      editing_contribution: "Mid-word cut on profanity ('stfu') implies without stating, feels authentic and abrupt, matches chef's frustration",
      audience_surrogate: "The chef is the audience surrogate - anyone who's worked service knows the frustration of being the one 'actually doing the work' while others make demands"
    },
    correct_interpretation: "Format subversion + incentive revelation. Each answer exposes self-interest based on job role (profit vs. labor). The chef refuses to participate, breaking the format entirely. The mid-word cut on profanity adds authenticity and creates an abrupt, satisfying ending that matches the character's frustration.",
    key_teaching: "When analyzing humor, don't stop at 'what type' (contrast). Ask: 'What dynamic between characters creates the tension?' and 'Does the format itself become part of the joke?'",
    tags: ['incentive-conflict', 'format-subversion', 'workplace-dynamic', 'rebel-worker', 'mid-word-cut'],
    humor_types: ['format-subversion', 'character-reveal', 'editing-as-punchline']
  },
  {
    video_summary: "POV customer at register, internal voice debates tip amount ('5%... no 10%... maybe 30%'). Reveal: it was the CASHIER speaking out loud. Customer: 'Can you shut up?'",
    original_analysis: "Subversion humor - The voice wasn't the customer's internal monologue.",
    deep_reasoning: {
      character_dynamic: "Power inversion - customer's private decision (tipping) is being influenced by the person who would benefit",
      underlying_tension: "The gap between internal thought (private) and spoken manipulation (public intrusion)",
      format_participation: "POV misdirection - we assume first-person voice = POV character, reveal breaks this assumption and reframes everything",
      editing_contribution: "The held POV shot maintains the illusion until the reveal",
      audience_surrogate: "The customer - everyone has felt the awkwardness of tipping decisions"
    },
    correct_interpretation: "POV misdirection revealing a power dynamic. We think we're in the customer's head (relatable tipping anxiety), but discover the cashier has been speaking out loud, trying to influence the tip. The payoff ('Can you shut up?') is casual boundary-setting that resolves the tension.",
    key_teaching: "Don't just identify 'subversion' - explain WHAT was subverted. Here it's the assumption that POV = whose thoughts we hear.",
    tags: ['pov-misdirection', 'power-dynamic', 'tipping-anxiety', 'boundary-setting'],
    humor_types: ['subversion', 'reveal', 'relatable']
  },
  {
    video_summary: "Manager says 'use your heads' to staff. Cut to workers literally using their physical heads to clean windows, sweep floors, etc.",
    original_analysis: "Wordplay humor - Literal interpretation of the phrase 'use your head'.",
    deep_reasoning: {
      character_dynamic: "Authority (manager using clichés) vs. Malicious compliance (workers deliberately misunderstanding)",
      underlying_tension: "Empty management-speak vs. workers treating meaningless phrases as meaningless",
      format_participation: "Each scene escalates the absurdity of literal interpretation",
      editing_contribution: "Quick cuts between different absurd applications build the joke through repetition with variation",
      audience_surrogate: "The workers - anyone who's been told platitudes by management understands the impulse to mock them"
    },
    correct_interpretation: "Malicious compliance comedy. Workers deliberately misinterpret a management cliché as literal instruction. Each scene escalates the absurdity. The subtext is workplace resistance - reflecting back the meaninglessness of empty management-speak.",
    key_teaching: "Look for subtext. This isn't just wordplay - it's worker solidarity disguised as compliance.",
    tags: ['malicious-compliance', 'workplace-resistance', 'escalation', 'management-cliches'],
    humor_types: ['wordplay', 'absurdist', 'escalation', 'subversive']
  },
  {
    video_summary: "Bubble tea shop. Sign says 'shake it'. Customer reads sign, then starts shaking her body (dancing) with a confused face, looking at the worker like THEY'RE the weird one.",
    original_analysis: "Script Humor: observational",
    deep_reasoning: {
      character_dynamic: "Customer who misreads vs. worker who watches in disbelief. The customer's confidence makes it funnier.",
      underlying_tension: "'Shake it' means shake the DRINK (obvious to us) vs. shake your BODY (what she thinks it means). Gap between intended and literal interpretation.",
      format_participation: "The sign sets up the misreading. The humor requires us to SEE the sign to understand what went wrong.",
      editing_contribution: "Holding on her confused face while she dances - we see she genuinely thinks the worker is strange.",
      audience_surrogate: "The worker (and viewer) - we see the obvious meaning she's missed."
    },
    correct_interpretation: "Misunderstanding comedy where the customer reads 'shake it' as an instruction to dance rather than shake the drink. The absurdity is heightened because her facial expression implies SHE thinks the worker is strange - but WE know she's the one who misread. The gap between her self-perception (rightfully confused) and reality (she's the foolish one) IS the joke.",
    key_teaching: "When someone misunderstands something, ask: Who looks foolish? Do THEY know they look foolish? The gap between self-perception and audience knowledge is often where the humor lives.",
    tags: ['misunderstanding', 'literal-vs-intended', 'self-perception-gap', 'visual-instruction'],
    humor_types: ['wordplay', 'misunderstanding', 'absurdist']
  },
  {
    video_summary: "Date at restaurant. Man and woman do the 'generosity dance' - she offers to pay, he says no. Back and forth. Then he FOLDS - 'ok, you can pay'. Her face drops.",
    original_analysis: "Script Humor: subversion",
    deep_reasoning: {
      character_dynamic: "Dating ritual where both know the 'rules' - man is supposed to insist on paying. The woman offers as politeness, not genuine offer.",
      underlying_tension: "Social ritual (offers/refuses/insists/accepts) vs. breaking the ritual (actually accepting her 'offer'). He 'folds' when he shouldn't.",
      format_participation: "Back-and-forth builds expectation that he'll 'win' the ritual. His fold breaks the expected pattern.",
      editing_contribution: "Hold on her face after he folds - her expression IS the punchline.",
      audience_surrogate: "Anyone who's played the generosity game and knows the unwritten rules."
    },
    correct_interpretation: "The 'generosity game' is a social ritual where offering to pay is performative - you're SUPPOSED to be refused. The joke is that he 'folds' (accepts her offer when he should refuse), breaking the ritual. Her facial expression - shock, disappointment, realization - shows she didn't ACTUALLY want to pay; it was just the dance. The subversion is that he took her performative offer literally.",
    key_teaching: "Identify SOCIAL RITUALS. The 'generosity dance' is a specific cultural pattern where both parties know the expected outcome. Breaking it reveals the gap between performance and reality.",
    tags: ['generosity-game', 'social-ritual', 'facial-expression-punchline', 'dating-dynamics'],
    humor_types: ['subversion', 'social-dynamics', 'relatable']
  },
  {
    video_summary: "Worker says 'can you finish this for me?' while holding drink. Coworker takes drink and chugs it. Worker's face: shock/annoyance.",
    original_analysis: "subversion",
    deep_reasoning: {
      character_dynamic: "One worker asking for help with a task, another who (deliberately?) misunderstands.",
      underlying_tension: "'Finish this' = complete the task vs. 'finish this' = drink this beverage. Two valid interpretations, wrong one chosen.",
      format_participation: "Simple setup-payoff. The misinterpretation is the whole joke.",
      editing_contribution: "Hold on reaction face after the drink is finished - worker's annoyance sells it.",
      audience_surrogate: "The worker who asked - we've all had someone take us too literally."
    },
    correct_interpretation: "Classic 'finish this' ambiguity. The worker means 'complete this task' but the coworker interprets it as 'finish drinking this'. The humor is in the coworker choosing the lazier/more convenient interpretation - whether deliberately obtuse or genuinely confused. The reaction shot confirms the miscommunication and pays off the joke.",
    key_teaching: "When a phrase has two meanings, STATE BOTH EXPLICITLY. Don't just say 'misunderstanding' - say 'finish this (task) vs. finish this (drink)'.",
    tags: ['ambiguous-phrasing', 'convenient-misreading', 'reaction-punchline'],
    humor_types: ['wordplay', 'misunderstanding', 'workplace']
  },
  {
    video_summary: "Customer complains pizza 'tastes like a 4-year-old made it'. Cut to reveal: an actual 4-year-old in chef hat, looking proud.",
    original_analysis: "Script Humor: subversion",
    deep_reasoning: {
      character_dynamic: "Complaining customer vs. the reveal that undermines the complaint. The child is innocent/oblivious.",
      underlying_tension: "'Made by a 4-year-old' as insult vs. literal truth. Expression becomes accidentally accurate.",
      format_participation: "Setup (complaint) → Reveal (literal truth). Classic misdirect structure.",
      editing_contribution: "Cut to reveal is the punchline. The child's proud face adds wholesome layer.",
      audience_surrogate: "None - we're observers. The child adds cuteness factor."
    },
    correct_interpretation: "The customer uses 'made by a 4-year-old' as an INSULT (meaning amateur, low quality), but the reveal shows it's LITERALLY TRUE. The phrase shifts from metaphorical criticism to accurate description. The child's proud, innocent face adds a wholesome dimension - this is more CUTE than purely funny. Content type is Wholesome-Comedy hybrid.",
    key_teaching: "Identify when metaphorical expressions become literally true. The 'insult-becomes-fact' reveal is a common structure. Also: recognize when content is WHOLESOME (cute child) vs. purely comedic.",
    tags: ['literal-truth-reveal', 'child-humor', 'wholesome-comedy', 'expression-reversal'],
    humor_types: ['reveal', 'wordplay', 'wholesome']
  },
  {
    video_summary: "Customer asks 'Do you work here?' to person wearing full uniform with company logo on apron, holding branded box. Person looks at uniform, looks at customer, removes apron, says 'No.'",
    original_analysis: "Subversion humor",
    deep_reasoning: {
      character_dynamic: "Customer asking obvious question vs. worker's exasperated sarcasm. The question is so obviously dumb it deserves a sarcastic response.",
      underlying_tension: "Social expectation (politely answer 'yes') vs. worker's rebellion (sarcastically deny the obvious). The visual cues make the question absurd.",
      format_participation: "The visual setup (uniform, branded items) is essential - it makes the question obviously stupid, which justifies the sarcastic response.",
      editing_contribution: "Mid-action cut as uniform comes off emphasizes commitment to the bit.",
      audience_surrogate: "The worker - anyone who's been asked an obvious question understands the impulse to respond sarcastically."
    },
    correct_interpretation: "Sarcasm as social correction. The customer asks a question so obviously answered by visual cues (uniform, apron, branded box) that it deserves mockery. The worker's response ('No' while removing uniform) isn't literal - it's exasperated sarcasm meaning 'isn't it obvious?' The humor is in the commitment to the bit and the worker expressing what we all wish we could say.",
    key_teaching: "When someone sarcastically denies an obvious truth, they're not lying - they're expressing 'your question was stupid'. The subtext is more important than the literal words.",
    tags: ['sarcasm-as-correction', 'obvious-question', 'uniform-visual', 'worker-frustration'],
    humor_types: ['sarcasm', 'workplace', 'relatable']
  },
  {
    video_summary: "Waitress says 'Beautiful people get a discount'. Customer looks hopeful. Waitress: 'That'll be $15.' (Same price, no discount given.)",
    original_analysis: "Subversion humor",
    deep_reasoning: {
      character_dynamic: "Waitress with power (determines discount eligibility) vs. customer hoping to be validated as 'beautiful'. Classic setup for rejection.",
      underlying_tension: "Expectation of compliment/discount vs. implied rejection (you're not beautiful enough).",
      format_participation: "Setup (discount mentioned) → No discount given. The omission IS the punchline.",
      editing_contribution: "Deadpan delivery without reaction - the waitress doesn't acknowledge what she just implied.",
      audience_surrogate: "The customer - we've all hoped for validation and been subtly denied."
    },
    correct_interpretation: "Mean humor disguised as neutral transaction. By mentioning a 'beautiful people discount' and then NOT applying it, the waitress implies the customer doesn't qualify. The cruelty is in what's NOT said - she doesn't insult directly, she just doesn't give the discount. The customer's face shows the realization. This is casual rejection comedy.",
    key_teaching: "Absence of action can be a punchline. Not getting the discount implies rejection. The humor is in the GAP between expectation (I might be beautiful!) and reality (I'm not).",
    tags: ['implied-rejection', 'beauty-standards', 'casual-cruelty', 'deadpan'],
    humor_types: ['mean-humor', 'subversion', 'social-dynamics']
  },
  // ============================================================================
  // CULTURAL CONTEXT EXAMPLES (Gap: 57 instances)
  // ============================================================================
  {
    video_summary: "Kitchen bell rings. Cut to: server throws drink mid-conversation, waitress slides across table, busboy vaults counter. All staff drop everything instantly to respond to kitchen bell.",
    original_analysis: "Script Humor: absurdist",
    deep_reasoning: {
      character_dynamic: "Kitchen staff (demanding, expects immediate obedience) vs. Front-of-house staff (absurdly compliant)",
      underlying_tension: "CULTURAL TRUTH: Kitchen staff in restaurants DO have unrealistic expectations that food should be picked up immediately. This shared cultural knowledge makes the absurdist response feel like exaggerated truth.",
      format_participation: "Visual gag format - escalating absurdity with each scene builds comedic momentum",
      editing_contribution: "Quick cuts between different staff members amplify the 'everyone drops everything' effect",
      audience_surrogate: "Anyone who's worked in restaurants recognizes this power dynamic - the kitchen bell commands everyone"
    },
    correct_interpretation: "Absurdist commentary on restaurant culture. The joke works because restaurant workers ACTUALLY experience this pressure from kitchen staff. By showing extreme compliance (throwing drinks, sliding across tables), it exaggerates a shared cultural experience to absurd proportions. The humor requires knowing that 'kitchen runs the show' is a real industry trope.",
    key_teaching: "When a joke exaggerates a workplace dynamic, identify the CULTURAL TRUTH underneath. Ask: 'What shared experience makes this recognizable?' The absurdity is funny BECAUSE the underlying dynamic is real.",
    tags: ['workplace-culture', 'restaurant-industry', 'absurdist-exaggeration', 'shared-experience'],
    humor_types: ['absurdist', 'cultural-commentary', 'workplace']
  },
  {
    video_summary: "Customer asks for pizza with vanilla ice cream and six pickles. Worker refuses. Customer reveals it's for his pregnant wife. Worker's demeanor changes instantly, now accommodating.",
    original_analysis: "Script Humor: subversion",
    deep_reasoning: {
      character_dynamic: "Worker (gatekeeping food culture) vs. Customer (advocating for pregnant wife)",
      underlying_tension: "CULTURAL RULE: Pregnancy cravings override normal food rules. This is a widely understood social exception.",
      format_participation: "Setup (absurd request + refusal) → Reveal (pregnancy) → Resolution (accommodation). The pregnancy reveal is the pivot.",
      editing_contribution: "Worker's face shift from dismissive to understanding IS the payoff",
      audience_surrogate: "Anyone familiar with pregnancy craving culture understands why the dynamic shifts"
    },
    correct_interpretation: "Cultural exception humor. The worker's initial refusal is about respecting 'pizza culture' (you don't do that to pizza). But 'pregnancy cravings' is a culturally recognized exception - we're supposed to accommodate weird requests because 'she's pregnant'. The worker's instant demeanor change shows this cultural rule overriding his personal standards. The humor requires knowing this unwritten social rule.",
    key_teaching: "Identify CULTURAL EXCEPTIONS - unwritten rules that override normal behavior. 'Pregnancy cravings' is one such rule. Ask: 'What cultural knowledge does the audience need to understand why this is funny?'",
    tags: ['pregnancy-cravings', 'cultural-exception', 'social-rules', 'demeanor-shift'],
    humor_types: ['cultural-reference', 'subversion', 'relatable']
  },
  {
    video_summary: "Child pretends to work at restaurant, negotiates 'pay' with adult. Child understands some real-world concepts but misses others, creating charming confusion.",
    original_analysis: "Script Humor: contrast",
    deep_reasoning: {
      character_dynamic: "Child (playing adult roles) vs. Adult (playing along with make-believe)",
      underlying_tension: "GENERATIONAL GAP: The humor comes from a child approximating adult concepts imperfectly. They grasp SOME rules (negotiation, payment) but miss others entirely.",
      format_participation: "Meta-perspective: We're watching through an 'adult lens' as a child navigates grown-up concepts",
      editing_contribution: "Holding on the child's earnest attempts emphasizes their innocence",
      audience_surrogate: "The adult - we've all seen children try to mimic adult behaviors"
    },
    correct_interpretation: "Generational humor + make-believe. The child understands fragments of adult world (jobs = pay, negotiation exists) but their incomplete understanding creates charm. It's wholesome because we're seeing innocent attempts to join the adult world. This is CUTE content with humor elements, not pure comedy. The cultural knowledge required: children often engage in 'playing house/work' and their misunderstandings are endearing.",
    key_teaching: "Distinguish between COMEDY and CUTE/WHOLESOME content. When a child's misunderstanding of adult concepts is the core appeal, the emotional register is warmth, not laughter. Label content type accurately.",
    tags: ['child-humor', 'make-believe', 'generational-gap', 'wholesome'],
    humor_types: ['wholesome', 'generational', 'relatable']
  },
  // ============================================================================
  // QUALITY MISJUDGED EXAMPLES (Gap: 31 instances)
  // ============================================================================
  {
    video_summary: "Text overlay: 'waiting for my coworker to finish serving so I can finish my story'. Worker stands idle with impatient expression.",
    original_analysis: "Script Humor: relatable",
    deep_reasoning: {
      character_dynamic: "Worker waiting vs. Worker serving (implied off-screen)",
      underlying_tension: "Very low - the premise is thin and doesn't develop",
      format_participation: "Single static shot with text overlay. No escalation, no payoff.",
      editing_contribution: "Minimal - just a reaction shot",
      audience_surrogate: "Workers who gossip, but the connection is weak"
    },
    correct_interpretation: "MEDIOCRE content. While the scenario is relatable (we've all paused a story for interruptions), the execution lacks depth. There's no twist, no escalation, no clever observation. Relatability alone doesn't equal quality. This is a one-note observation without comedic development. Rate accordingly: [MEDIOCRE]",
    key_teaching: "Relatability is not enough for GOOD comedy. Ask: 'Does this go anywhere beyond the initial observation?' If it's just 'here's a thing that happens' without development, it's MEDIOCRE at best.",
    tags: ['thin-premise', 'no-escalation', 'mediocre', 'underdeveloped'],
    humor_types: ['relatable', 'observational']
  },
  {
    video_summary: "Customer asks which coffee is iced. Barista: 'The cold one.' Customer asks which is oat. Barista: 'The one that says oat.' Customer asks which is large. Barista: 'The one that isn't small.'",
    original_analysis: "Script Humor: sarcasm",
    deep_reasoning: {
      character_dynamic: "Obtuse customer vs. sarcastic barista",
      underlying_tension: "Customer asks obvious questions, worker responds with obvious answers",
      format_participation: "Repetition format - same setup/payoff pattern three times",
      editing_contribution: "Minimal - relies on dialogue",
      audience_surrogate: "Service workers who deal with obvious questions"
    },
    correct_interpretation: "MEDIOCRE content. The script has a clear structure but lacks cleverness. Each exchange follows the same pattern (obvious question → obvious answer) without escalation or surprise. The third response isn't funnier than the first - it's just more of the same. Compare to great comedy where each beat raises the stakes. This is functional but not clever. Rate: [MEDIOCRE]",
    key_teaching: "Evaluate COMEDIC CRAFT, not just concept. Ask: 'Does each beat escalate or just repeat?' 'Is there surprise or just pattern?' A good concept with flat execution is still MEDIOCRE.",
    tags: ['flat-execution', 'no-escalation', 'repetitive', 'mediocre'],
    humor_types: ['sarcasm', 'workplace']
  },
  {
    video_summary: "Bartender looks confused at the term 'dry wine' because 'they're all wet'. Makes a confused face.",
    original_analysis: "Script Humor: wordplay",
    deep_reasoning: {
      character_dynamic: "Confused bartender who takes 'dry' literally",
      underlying_tension: "Wordplay (dry wine = taste profile vs. dry = not wet)",
      format_participation: "Single joke, single shot. Very brief.",
      editing_contribution: "Reaction shot of confusion",
      audience_surrogate: "None - we're observing an obtuse character"
    },
    correct_interpretation: "MEDIOCRE content. The wordplay is surface-level (dry wine = literally wet) without any additional layer. The bartender's confusion implies incompetence, which is mildly amusing but not clever. Very short with no development. The joke would be better if it escalated or had a second twist. As-is, it's a single obvious pun with a reaction shot. Rate: [MEDIOCRE]",
    key_teaching: "Rate EXECUTION, not just category. Wordplay CAN be excellent, but obvious puns without layers are MEDIOCRE. Ask: 'How clever is this actually?' not just 'What type of humor is this?'",
    tags: ['surface-level', 'single-pun', 'no-depth', 'mediocre'],
    humor_types: ['wordplay', 'character-stupidity']
  },
  // ============================================================================
  // VISUAL REVEAL EXAMPLES (Gap: 21 instances)
  // ============================================================================
  {
    video_summary: "Man's girlfriend offers him her leftover food. He smiles eagerly. CUT TO: Stock footage of a satisfied pig with same expression/angle.",
    original_analysis: "Script Humor: relatable",
    deep_reasoning: {
      character_dynamic: "Boyfriend (eager for food) with pig comparison",
      underlying_tension: "The 'men are pigs about food' trope",
      format_participation: "The VISUAL EDIT is the punchline - position matching between human and pig face",
      editing_contribution: "THE ENTIRE JOKE IS EDITING. The cut to matching pig footage at the exact angle/expression IS the humor.",
      audience_surrogate: "Women who've seen partners' excitement about leftover food"
    },
    correct_interpretation: "VISUAL-DEPENDENT humor. The joke cannot exist without the edit. The comedy is: 1) matching facial angle between human and pig, 2) the implication that the man is 'piggish' about food, 3) the editing technique showing the transition. If you only read the transcript, you miss 100% of the joke. The punchline is VISUAL, not verbal.",
    key_teaching: "When the punchline is a CUT or VISUAL EDIT, state explicitly that this is visual-dependent humor. Ask: 'Would this joke work in audio-only format?' If no, the editing IS the comedy.",
    tags: ['visual-punchline', 'editing-dependent', 'stock-footage-insert', 'position-matching'],
    humor_types: ['visual', 'editing-comedy', 'relatable']
  },
  {
    video_summary: "Employee sets up camera gear, takes task seriously to photograph food. Text says 'Results:' followed by countdown clip. Reveal: It's all selfies of the employee, no food photos.",
    original_analysis: "Key Message: Capable of handling social media",
    deep_reasoning: {
      character_dynamic: "Employee who misunderstands the assignment",
      underlying_tension: "Expectation (professional food content) vs. Reality (vanity selfies)",
      format_participation: "Setup → Movie countdown (builds anticipation) → Visual reveal (subverted expectation)",
      editing_contribution: "The REVEAL (selfies instead of food) is a VISUAL payoff. The countdown builds anticipation for this visual reveal.",
      audience_surrogate: "Anyone who's seen someone misunderstand an assignment"
    },
    correct_interpretation: "Visual reveal comedy. The setup establishes competence (proper equipment, serious demeanor). The 'Results:' text with countdown creates anticipation. The REVEAL (selfies instead of food photos) is entirely VISUAL - you must SEE the selfies to get the joke. The incompetence is shown, not told. This is [GOOD] content because the structure is well-executed and the payoff is earned.",
    key_teaching: "When a punchline is a VISUAL REVEAL (something you must see to understand), describe what changes visually between setup and payoff. Don't just say 'reveal' - say what is revealed and why it subverts the visual expectation.",
    tags: ['visual-reveal', 'incompetence-comedy', 'setup-payoff', 'expectation-subversion'],
    humor_types: ['reveal', 'visual', 'workplace']
  }
]
