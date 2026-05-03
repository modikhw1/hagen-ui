/**
 * Batch Re-analyze Videos API
 * 
 * POST /api/videos/reanalyze
 * Re-run Gemini analysis on existing videos to restore rich visual_analysis
 * Uses Vertex AI REST API which supports GCS URIs directly
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createVertexTuningService } from '@/lib/services/vertex/training';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Comprehensive analysis prompt for Gemini via Vertex AI
// Includes SCRIPT analysis for humor, meaning, and replicability
// V2: Added casting, production, flexibility, trends, brand, standalone, execution sections
// Based on user's rating notes and calibration feedback
const COMPREHENSIVE_ANALYSIS_PROMPT = `Analyze this video comprehensively and provide a structured JSON response with the following sections:

{
  "visual": {
    "hookStrength": <1-10, rate how compelling the first 3 seconds are>,
    "hookDescription": "detailed explanation of what makes the opening work or not work",
    "overallQuality": <1-10, production value and visual polish>,
    "mainElements": ["list all key visual elements"],
    "colorPalette": ["dominant colors used"],
    "colorDiversity": <1-10, variety and impact of colors>,
    "transitions": ["types of transitions between shots"],
    "textOverlays": ["any text that appears on screen"],
    "visualHierarchy": "what draws the eye and when",
    "compositionQuality": <1-10>,
    "peopleCount": <number of people visible, 0 if none>,
    "settingType": "indoor/outdoor/mixed/animated",
    "summary": "comprehensive visual analysis"
  },
  "audio": {
    "quality": <1-10, audio production quality>,
    "musicType": "background music category or none",
    "musicGenre": "specific genre if applicable",
    "hasVoiceover": <boolean>,
    "voiceoverQuality": <1-10 or null if no voiceover>,
    "voiceoverTone": "tone and delivery style",
    "energyLevel": "low/medium/high",
    "audioEnergy": <1-10, intensity and engagement>,
    "soundEffects": ["list all sound effects used"],
    "audioVisualSync": <1-10, how well audio matches visuals>
  },
  "content": {
    "topic": "precise topic/subject matter",
    "style": "content style (educational, entertaining, inspirational, etc)",
    "format": "video format (talking head, montage, tutorial, skit, etc)",
    "duration": <exact duration in seconds>,
    "keyMessage": "core message or takeaway",
    "narrativeStructure": "how the story/content unfolds",
    "targetAudience": "who this appeals to",
    "emotionalTone": "dominant emotion conveyed"
  },
  "scenes": {
    "description": "CRITICAL: Scene-by-scene breakdown mapping visual edits to narrative/comedic beats",
    "sceneBreakdown": [
      {
        "sceneNumber": <1, 2, 3... sequential number>,
        "timestamp": "approximate start time (e.g., '0:00', '0:05')",
        "visualContent": "what is SHOWN visually in this scene - describe the shot, framing, who/what is visible. INCLUDE SMALL DETAILS that might be funny (overfilling cups, frozen expressions, background chaos)",
        "audioContent": "what is SAID or HEARD in this scene - dialogue, sound effects, music",
        "visualComedyDetail": "if this scene contains a visual gag, describe it specifically (e.g., 'drink overflowing while she stares blankly', 'visible mess in background contradicting what was said'). null if no visual comedy in this scene",
        "narrativeFunction": "hook|setup|development|misdirection|reveal|payoff|callback|tag - what role does this scene play?",
        "editSignificance": "why does this cut/transition matter? Does the edit itself convey meaning or comedy?",
        "viewerAssumption": "what assumption does the viewer make during this scene that might be subverted later?"
      }
    ],
    "totalScenes": <number of distinct scenes/shots>,
    "editAsPunchline": <boolean - does a cut/edit itself serve as a reveal or punchline?>,
    "editPunchlineExplanation": "if editAsPunchline is true, explain how the edit delivers the joke (e.g., 'cut reveals person was talking to nobody', 'cut shows aftermath contradicting what was said')",
    "visualNarrativeSync": <1-10, how tightly are visuals and story/joke synchronized? 10 = edit timing IS the comedy>,
    "misdirectionTechnique": "how does the video set up false expectations visually before the reveal? What does framing/editing make you ASSUME?",
    "keyVisualComedyMoment": "THE most important visual element that makes this video funny - describe the specific image/action that IS the punchline. If the joke is verbal, write 'verbal-punchline'"
  },
  "script": {
    "conceptCore": "one-sentence description of the replicable concept/format that could be copied by another creator",
    "hasScript": <boolean, does this video follow a scripted narrative vs spontaneous content>,
    "scriptQuality": <1-10, how well-written/structured is the script (null if unscripted)>,
    "transcript": "approximate transcript or description of what is said/shown",
    "visualTranscript": "scene-by-scene description integrating BOTH what is SHOWN and what is SAID, in chronological order - this should read like a script with stage directions",
    "humor": {
      "isHumorous": <boolean>,
      "humorType": "subversion|absurdist|observational|physical|wordplay|callback|contrast|deadpan|escalation|satire|parody|visual-reveal|edit-punchline|none",
      "humorMechanism": "detailed explanation of HOW the humor works - include VISUAL elements if the joke relies on what is shown, not just said",
      "visualComedyElement": "describe any visual element essential to the joke (reveal shots, reaction cuts, visual contradictions, what a cut shows)",
      "comedyTiming": <1-10, effectiveness of timing and beats>,
      "absurdismLevel": <1-10, how much does this violate normal logic or expectations>,
      "surrealismLevel": <1-10, how much does this distort reality or use dream-like elements>
    },
    "structure": {
      "hookType": "question|statement|action|mystery|pattern-interrupt|relatable-situation|visual-shock",
      "hook": "what happens in first 1-3 seconds to grab attention",
      "setup": "what expectation, context, or premise is established - include VISUAL setup",
      "development": "how does the middle section build on the setup",
      "payoff": "how is the expectation resolved, subverted, or paid off - CRITICAL: note if payoff is VISUAL (a cut, reveal, or shown element) vs VERBAL",
      "payoffType": "verbal|visual|visual-reveal|edit-cut|combination - how is the payoff delivered?",
      "payoffStrength": <1-10, how satisfying is the conclusion>,
      "hasCallback": <boolean, does it reference earlier elements>,
      "hasTwist": <boolean, is there an unexpected turn>,
      "twistDelivery": "verbal|visual|edit - if hasTwist, how is it delivered?"
    },
    "emotional": {
      "primaryEmotion": "the main emotion being engineered (humor, awe, curiosity, FOMO, nostalgia, satisfaction, shock, warmth, etc)",
      "emotionalArc": "how emotion changes through the video",
      "emotionalIntensity": <1-10, strength of emotional impact>,
      "relatability": <1-10, how much can average viewer relate to this>
    },
    "replicability": {
      "score": <1-10, how easy is this concept to recreate with different content>,
      "template": "describe the templatable format in one sentence that another business could follow",
      "requiredElements": ["list elements ESSENTIAL to make this concept work"],
      "variableElements": ["list elements that can be swapped for different contexts"],
      "resourceRequirements": "low|medium|high - what's needed to recreate this",
      "contextDependency": <1-10, how much does this rely on specific context/brand/person (1=universal, 10=only works for this creator)>
    },
    "originality": {
      "score": <1-10, how fresh/novel is this concept>,
      "similarFormats": ["list any known formats this resembles"],
      "novelElements": ["what makes this different from similar content"]
    }
  },
  "casting": {
    "minimumPeople": <integer, minimum number of people required to execute this concept>,
    "requiresCustomer": <boolean, does this need a customer/stranger to participate?>,
    "attractivenessDependency": <1-10, how much does this video rely on physical attractiveness of the subject? 1=works with anyone, 10=only works because subject is attractive>,
    "personalityDependency": <1-10, does this require a specific 'larger than life' or charismatic personality? 1=neutral delivery works, 10=requires specific persona>,
    "actingSkillRequired": <1-10, level of acting/improv ability needed to pull this off. 1=just stand there, 10=method acting required>,
    "castingNotes": "explanation of who could realistically perform this"
  },
  "production": {
    "shotComplexity": <1-10, number of unique camera setups/angles required. 1=single static shot, 10=complex multi-camera>,
    "editingDependency": <1-10, how much does this concept rely on editing to work? 1=works in single take, 10=editing IS the joke>,
    "timeToRecreate": "15min|30min|1hr|2hr|half-day|full-day - estimated time to shoot and edit a replica",
    "equipmentNeeded": ["list equipment beyond a smartphone that would be needed"],
    "productionNotes": "explanation of production complexity"
  },
  "flexibility": {
    "industryLock": <1-10, is this concept locked to a specific industry/business type? 1=works anywhere, 10=only works for this exact business type>,
    "industryExamples": ["list 3-5 business types that could use this exact concept"],
    "propDependency": <1-10, does this require specific props that others won't have? 1=no props, 10=requires specific branded/custom items>,
    "swappableCore": <boolean, can the central object/topic be easily replaced?>,
    "swapExamples": "examples of what could be swapped (e.g., 'snus→any craving, taco→any food')",
    "flexibilityNotes": "explanation of how adaptable this concept is"
  },
  "comedyStyle": {
    "isHumorFocused": <boolean, is humor the PRIMARY purpose of this video, or is it secondary to other goals (informational, inspirational, promotional)?>,
    "primaryTechnique": "visual-metaphor|verbal-subversion|absurdist-contrast|reaction-comedy|physical-slapstick|deadpan-delivery|escalation|anti-humor|cringe|wholesome-twist|dramatic-irony|meta-commentary|power-dynamic-absurdism|genre-transplant|third-party-reaction|hidden-malice-reveal|none",
    "visualMetaphor": {
      "present": <boolean, does a visual element represent an internal state or abstract concept?>,
      "element": "describe the visual (e.g., 'overfilling drinks', 'slow-motion walk', 'thousand-yard stare', 'frozen expression')",
      "represents": "what it symbolizes (e.g., 'mental overwhelm', 'being checked out', 'trauma', 'dissociation')",
      "whyEffective": "explain why this visual metaphor works in context (for humor or emotional impact)"
    },
    "genreTransplant": {
      "present": <boolean, does this borrow conventions from a dramatic genre (war, horror, thriller, drama) and place them in a mundane setting?>,
      "sourceGenre": "the dramatic genre being referenced (e.g., 'war film', 'horror movie', 'thriller', 'soap opera', 'infomercial', 'documentary')",
      "mundaneSetting": "the everyday context it's transplanted into (e.g., 'restaurant kitchen', 'office', 'retail store')",
      "dramaticElement": "what specific dramatic convention is borrowed (e.g., 'PTSD response', 'thousand-yard stare', 'dramatic zoom', 'ominous music')",
      "whyEffective": "the effect comes from the CONTRAST between dramatic genre conventions and mundane reality"
    },
    "powerDynamicAbsurdism": {
      "present": <boolean, does humor come from one person treating another in a way that violates normal social contracts?>,
      "dynamicType": "pet-owner|parent-child|trainer-animal|authority-subordinate|abuser-victim|teacher-student|exploiter-exploited|other",
      "violatedNorm": "what social expectation is being violated (e.g., 'cashiers don't spray customers', 'service workers are agreeable', 'bosses shouldn't exploit language barriers')",
      "playedStraight": <boolean, is the absurd dynamic presented matter-of-factly without acknowledgment?>,
      "whyEffective": "humor comes from blatantly playing out an unhealthy/absurd dynamic as if it were normal"
    },
    "thirdPartyReaction": {
      "present": <boolean, is the punchline delivered through a THIRD PARTY's reaction to a situation between others?>,
      "primaryActors": "describe the main interaction (e.g., 'two customers fighting to pay')",
      "reactingParty": "who is the third party reacting (e.g., 'the cashier')",
      "reactionType": "frustration|confusion|exasperation|deadpan|shock|amusement|resignation",
      "whyEffective": "the comedy comes from the observer's reaction to a situation that is normally positive but becomes annoying/absurd in excess"
    },
    "hiddenMaliceReveal": {
      "present": <boolean, does a final line or moment reveal that a character had hidden ill intent or was scheming all along?>,
      "revealLine": "the specific line or moment that reveals the malice (e.g., 'Luckily he doesn't know English', 'It'll be the original price')",
      "characterAppearance": "how the character appeared before the reveal (e.g., 'friendly boss offering a choice', 'agreeable cashier')",
      "actualIntent": "what the reveal shows about their true intentions (e.g., 'intentionally exploiting language barrier', 'planned to deny the prize')",
      "whyEffective": "the shock of realizing a seemingly innocent interaction was actually manipulative"
    },
    "contrastMechanism": {
      "present": <boolean, does the video's effect come from contrast between two elements?>,
      "element1": "describe first element (e.g., 'traumatized response', 'dramatic genre convention', 'positive social norm')",
      "element2": "describe contrasting element (e.g., 'mundane restaurant job', 'everyday situation', 'frustrating outcome')",
      "contrastType": "tone-shift|scale-mismatch|expectation-reality|dramatic-mundane|sincere-absurd|genre-reality|positive-negative"
    },
    "physicalComedyDetails": {
      "present": <boolean, is physical action/visual gag central to the video's effect?>,
      "action": "describe the physical element (e.g., 'slaps the bottle', 'drinks overflow', 'blank stare', 'sprays customer', 'swagger walk')",
      "suddenness": <boolean, does the physical action happen suddenly/unexpectedly for shock value?>,
      "timing": "when in the video this occurs and why timing matters",
      "wouldWorkWithoutVisual": <boolean, would this concept work as audio-only?>
    },
    "punchlineStructure": {
      "layeredPunchline": <boolean, are there multiple punchlines that stack or compound?>,
      "punchlineCount": <integer, how many distinct payoff moments are there?>,
      "punchlines": [
        {
          "type": "physical-shock|verbal-reveal|visual-reveal|edit-cut|realization|callback|third-party-reaction|malice-reveal",
          "description": "what the punchline is",
          "whatItReveals": "what new information or subversion this punchline delivers"
        }
      ],
      "finalTwist": "if there's a final line/moment that recontextualizes everything, describe it (e.g., 'It'll be the original price' reveals the trick was premeditated, 'Luckily he doesn't know English' reveals exploitation)",
      "characterSubversion": "does the punchline reveal a character is not who they seemed? (e.g., 'agreeable cashier was actually scheming', 'friendly boss was exploiting')"
    },
    "musicMomentAmplifier": {
      "present": <boolean, does music or sound kick in to amplify a character moment or emotional beat?>,
      "momentType": "swagger|triumph|dramatic-reveal|tension|comedy-sting|main-character-energy|emotional-payoff",
      "musicStyle": "describe the music/sound (e.g., 'confident hip-hop beat', 'dramatic orchestral hit', 'comedic sound effect')",
      "characterEffect": "how the music elevates the character or moment (e.g., 'transforms barista into confident swagger moment', 'punctuates the awkwardness')",
      "essentialToEffect": <boolean, would the moment land without this music?>
    }
  },
  "trends": {
    "usesPremadeSound": <boolean, does this use a TikTok 'sound' or trending audio that viewers would recognize?>,
    "soundName": "name or description of the sound/audio trend if applicable",
    "soundEssential": <boolean, is the premade sound essential to the joke, or just background?>,
    "memeDependent": <boolean, does this rely on a current meme/trend to land?>,
    "trendName": "name of the meme/trend if applicable, or null",
    "trendLifespan": "dead-meme|dying|current|evergreen-trope|not-trend-dependent",
    "insideJokeDependency": <1-10, does this rely on creator's recurring jokes/persona? 1=standalone, 10=only makes sense to their audience>,
    "culturalSpecificity": <1-10, how culture/region-specific is this? 1=universal, 10=only works in specific culture>,
    "trendNotes": "explanation of trend/cultural dependencies"
  },
  "brand": {
    "riskLevel": <1-10, how risky is this for a conservative brand? 1=safe/corporate-friendly, 10=edgy/could backfire>,
    "toneMatch": ["corporate", "playful", "edgy", "youthful", "wholesome", "irreverent"] - select all that apply,
    "adultThemes": <boolean, contains adult/suggestive content?>,
    "brandExclusions": ["list brand types that should NOT use this concept"],
    "brandNotes": "explanation of brand fit considerations"
  },
  "standalone": {
    "worksWithoutContext": <1-10, does this work for someone who has never seen this creator? 1=needs backstory, 10=completely self-contained>,
    "worksWithoutProduct": <boolean, can this work without featuring a specific product?>,
    "requiresSetup": <boolean, does this need external context like a previous video or trend knowledge?>,
    "standaloneNotes": "explanation of how self-contained this concept is"
  },
  "execution": {
    "physicalComedyLevel": <1-10, how much does this rely on physical comedy/expressions? 1=dialogue-driven, 10=all physical/visual gags>,
    "timingCriticality": <1-10, how much does success depend on perfect timing in delivery? 1=forgiving, 10=one beat off and it fails>,
    "improvisationRoom": <1-10, how much can the performer improvise vs follow exact script? 1=must be exact, 10=lots of room to riff>,
    "executionNotes": "explanation of execution requirements"
  },
  "technical": {
    "pacing": <1-10, how well the video maintains momentum>,
    "editingStyle": "editing approach description",
    "cutsPerMinute": <approximate number>,
    "cameraWork": "camera techniques used",
    "lighting": "lighting quality description"
  },
  "engagement": {
    "attentionRetention": <1-10, predicted ability to hold attention>,
    "shareability": <1-10, likelihood of being shared>,
    "replayValue": <1-10, desire to watch multiple times>,
    "scrollStopPower": <1-10, ability to stop scrolling>
  }
}

CRITICAL INSTRUCTIONS:

1. SCENE-BY-SCENE ANALYSIS IS ESSENTIAL: You MUST break down the video into individual scenes/shots in the "scenes.sceneBreakdown" array. For EACH scene, describe:
   - What is SHOWN visually (who is on screen, what are they doing, camera angle)
   - What is SAID or HEARD (dialogue, sounds)
   - What narrative role this scene plays
   - What the EDIT/CUT to this scene communicates
   - Any VISUAL DETAIL in this specific scene (small visual gags, background details, physical actions, expressions)

2. EDITS CAN BE PUNCHLINES: A cut or scene change can itself deliver the joke. Example: if someone says "I'm fine" but then a cut reveals they're talking to nobody, the EDIT is the punchline. Look for reveal cuts, reaction shots, or scene changes that contradict or subvert what was just established.

3. VISUAL ELEMENTS: If the video's effect depends on what is SHOWN (not just said), you MUST capture this in "script.humor.visualComedyElement". The transcript alone may miss the point if the payoff is visual.

4. COMPLETE THE SCENE: If a scene is cut short or ends abruptly (e.g., "Serena? Serena?" with no response), what does NOT happen is often the point. Note what the viewer expects vs what they get.

5. MISDIRECTION: Note when the video deliberately misleads viewers visually before a reveal. What assumptions does the framing create that get subverted?

6. VISUAL METAPHORS FOR INTERNAL STATES: Look for visual elements that represent mental/emotional states through physical imagery:
   - Drinks overflowing = mental overflow/being "checked out"
   - Thousand-yard stare = trauma/disassociation
   - Slow motion = internal experience of time
   - Background chaos while person is calm = disconnect from reality
   Capture in "comedyStyle.visualMetaphor" - these can work for humor OR emotional impact.

7. GENRE TRANSPLANTATION (dramatic/mundane contrast): Look for DRAMATIC GENRE CONVENTIONS (war films, horror movies, thrillers, soap operas) placed in MUNDANE SETTINGS (restaurants, offices, retail). Examples:
   - PTSD/shell-shocked response after a busy restaurant shift
   - Horror movie tension in an office supply closet
   - War film thousand-yard stare at a cash register
   The effect comes from CONTRAST between dramatic genre weight and everyday triviality. Capture in "comedyStyle.genreTransplant".

8. POWER DYNAMIC ABSURDISM: Look for one person treating another in a way that VIOLATES NORMAL SOCIAL CONTRACTS:
   - Spraying a customer like training a pet
   - Treating a coworker like a child
   - Boss exploiting an employee's language barrier
   The effect is playing out an unhealthy/absurd power dynamic BLATANTLY, as if normal. Capture in "comedyStyle.powerDynamicAbsurdism".

9. THIRD-PARTY REACTION COMEDY: Sometimes the payoff is a THIRD PARTY's reaction to a situation between others:
   - Two customers fight over who pays → CASHIER's frustrated reaction is the punchline
   - Couple argues → Server's awkward expression is the comedy
   The primary actors create the situation, but the OBSERVER's reaction delivers the payoff. Capture in "comedyStyle.thirdPartyReaction".

10. HIDDEN MALICE REVEAL: Look for a final line or moment that reveals a character had HIDDEN ILL INTENT all along:
    - "Luckily he doesn't know English" → reveals boss was exploiting language barrier
    - "It'll be the original price" → reveals cashier planned to deny the prize
    - Taking her card to pay "for her" → reveals the "gentleman" used her money
    The shock comes from realizing a seemingly innocent interaction was actually manipulative. Capture in "comedyStyle.hiddenMaliceReveal".

11. LAYERED/COMPOUND PUNCHLINES: Many viral videos have MULTIPLE payoffs that stack:
    - First punchline: Physical shock (e.g., slapping a bottle)
    - Second punchline: Verbal reveal that recontextualizes everything
    The second often SUBVERTS CHARACTER ASSUMPTIONS (the agreeable person was scheming). Count ALL punchlines in "comedyStyle.punchlineStructure".

12. MUSIC AS MOMENT AMPLIFIER: Note when music/sound kicks in to elevate a character moment:
    - Confident beat when barista puts on sunglasses and struts
    - Dramatic sting for a reveal
    - "Main character energy" music for swagger moments
    Capture in "comedyStyle.musicMomentAmplifier" - note if the moment would land without the music.

13. SUDDEN PHYSICAL ACTIONS: Physical comedy often relies on SUDDENNESS for shock value. A slap, spray, or unexpected action that comes without warning creates visceral impact. Note the "suddenness" boolean in physicalComedyDetails.

14. PRE-MADE SOUNDS/TRENDS: Flag if the video uses a recognizable TikTok sound or trend format in "trends.usesPremadeSound". Note whether the sound is essential or just background.

15. NOT ALL VIDEOS ARE HUMOR-FOCUSED: Set "comedyStyle.isHumorFocused" to false if humor is secondary to other goals (informational, inspirational, promotional, creative/artistic). Still analyze any comedic elements present, but recognize the primary purpose.

BUSINESS CONTEXT: This analysis helps businesses replicate viral video concepts. Focus on:
- CASTING: Does success depend on specific person's looks, personality, or acting?
- PRODUCTION: How much equipment/editing/time is needed?
- FLEXIBILITY: Can this work for different business types?
- STANDALONE: Does this work without knowing the creator or trend context?

For "script" section, analyze CONCEPT and STRUCTURE as intellectual property. Be specific about mechanics - explain WHY and HOW elements work, including visual elements.

Be specific and detailed. Rate everything on 1-10 scales. Return valid JSON only.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { videoIds, limit = 3 } = body;

    // Get videos to re-analyze
    let query = supabase
      .from('analyzed_videos')
      .select('id, gcs_uri, video_url, visual_analysis')
      .not('gcs_uri', 'is', null);

    if (videoIds && videoIds.length > 0) {
      query = query.in('id', videoIds);
    }

    const { data: videos, error } = await query.limit(limit);

    if (error || !videos) {
      return NextResponse.json({ error: 'Failed to fetch videos' }, { status: 500 });
    }

    console.log(`🔄 Re-analyzing ${videos.length} videos with Vertex AI Gemini...`);

    const vertexService = createVertexTuningService();
    const results: Array<{ id: string; success: boolean; error?: string; features?: number }> = [];

    for (const video of videos) {
      try {
        console.log(`  📹 Analyzing ${video.id}...`);
        
        // Use Vertex AI REST API (supports GCS URIs)
        // analyzeVideoWithGemini returns parsed JSON directly from Gemini
        const analysis = await vertexService.analyzeVideoWithGemini(
          video.gcs_uri,
          COMPREHENSIVE_ANALYSIS_PROMPT
        );

        // The result is already parsed JSON with our structure
        // analyzeVideoWithGemini does: return JSON.parse(jsonMatch[0])
        // So 'analysis' already contains { visual, audio, content, ... }
        let parsedAnalysis: any = analysis;
        
        // If it has 'reasoning' but no 'visual', it failed to parse properly
        if ('reasoning' in analysis && !('visual' in analysis)) {
          console.log('  ⚠️ Got unstructured response, attempting to parse...');
          try {
            const text = analysis.reasoning as string;
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              parsedAnalysis = JSON.parse(jsonMatch[0]);
            } else {
              parsedAnalysis = { 
                visual: { summary: text },
                rawResponse: analysis 
              };
            }
          } catch {
            parsedAnalysis = { 
              visual: { summary: analysis.reasoning },
              rawResponse: analysis 
            };
          }
        }
        
        console.log('  📊 Analysis structure:', Object.keys(parsedAnalysis));

        // Preserve any existing ai_prediction
        const existingPrediction = video.visual_analysis?.ai_prediction;

        // Count features extracted
        const featureCount = countFeatures(parsedAnalysis);

        // Save the rich analysis
        const { error: updateError } = await supabase
          .from('analyzed_videos')
          .update({
            visual_analysis: {
              ...parsedAnalysis,
              ai_prediction: existingPrediction || null,
              analyzed_at: new Date().toISOString(),
              analysis_model: 'gemini-2.0-flash-vertex',
              feature_count: featureCount,
            },
            analyzed_at: new Date().toISOString(),
          })
          .eq('id', video.id);

        if (updateError) {
          results.push({ id: video.id, success: false, error: updateError.message });
        } else {
          results.push({ id: video.id, success: true, features: featureCount });
          console.log(`  ✅ ${video.id} - ${featureCount} features extracted`);
        }

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        results.push({ id: video.id, success: false, error: errorMsg });
        console.error(`  ❌ ${video.id} - ${errorMsg}`);
      }

      // Delay between videos to avoid rate limits
      await new Promise(r => setTimeout(r, 2000));
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalFeatures = results.reduce((sum, r) => sum + (r.features || 0), 0);

    console.log(`\n✅ Re-analysis complete: ${successful} succeeded, ${failed} failed, ${totalFeatures} total features`);

    return NextResponse.json({
      success: true,
      summary: {
        total: videos.length,
        successful,
        failed,
        totalFeatures,
      },
      results,
    });

  } catch (error) {
    console.error('Re-analysis failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Re-analysis failed',
    }, { status: 500 });
  }
}

/**
 * Count the number of features extracted from analysis
 */
function countFeatures(analysis: Record<string, unknown>): number {
  let count = 0;
  
  function countRecursive(obj: unknown): void {
    if (obj === null || obj === undefined) return;
    if (typeof obj !== 'object') {
      count++;
      return;
    }
    if (Array.isArray(obj)) {
      obj.forEach(item => countRecursive(item));
      return;
    }
    Object.values(obj as Record<string, unknown>).forEach(val => countRecursive(val));
  }
  
  countRecursive(analysis);
  return count;
}

/**
 * GET /api/videos/reanalyze
 * Check which videos need re-analysis (missing rich visual_analysis)
 */
export async function GET() {
  try {
    // Get videos with GCS URIs
    const { data: videos, error } = await supabase
      .from('analyzed_videos')
      .select('id, gcs_uri, visual_analysis')
      .not('gcs_uri', 'is', null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Check which have rich analysis vs just prediction
    const needsAnalysis = videos?.filter(v => {
      const analysis = v.visual_analysis;
      // If no analysis, or only has ai_prediction (no visual/audio/content sections)
      return !analysis || 
        (!analysis.visual && !analysis.audio && !analysis.content);
    }) || [];

    const hasRichAnalysis = videos?.filter(v => {
      const analysis = v.visual_analysis;
      return analysis?.visual && analysis?.audio && analysis?.content;
    }) || [];

    return NextResponse.json({
      total: videos?.length || 0,
      needsReanalysis: needsAnalysis.length,
      hasRichAnalysis: hasRichAnalysis.length,
      videoIds: needsAnalysis.map(v => v.id),
    });

  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to check videos',
    }, { status: 500 });
  }
}
