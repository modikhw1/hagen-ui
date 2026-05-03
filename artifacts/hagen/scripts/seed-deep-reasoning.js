/**
 * Seed Deep Reasoning Examples
 * 
 * Populates the video_analysis_examples table with examples that MODEL
 * the deep reasoning process, not just corrections.
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DEEP_REASONING_EXAMPLES = [
  {
    example_type: 'humor_interpretation',
    video_summary: `Restaurant skit where different staff members estimate how many lamb chops they'll make. Floor manager (600), waitress (100), customer (250), owner (1000), chef ("I'm the one making them... I think you should all stfu"). The pattern reveals incentive conflict: managers/owners want high volume (profit), workers want low (less labor). Chef breaks format entirely with frustrated punchline, cut mid-word on profanity.`,
    gemini_interpretation: 'Script Humor: contrast - Different people give different estimates showing different perspectives.',
    correct_interpretation: `HUMOR STRUCTURE: Format Subversion + Incentive Conflict

1. SETUP: Establishes a predictable pattern - each role gives their number estimate
   - This creates viewer expectation: "okay, everyone will guess a number"

2. THE REAL JOKE (missed by surface analysis):
   - Floor manager/owner want MORE items → they profit from volume
   - Waitress wants FEWER → she has to serve them all
   - Chef wants NONE → he's the one doing all the cooking
   - This isn't random "contrast" - it's a workplace dynamic everyone recognizes: the people doing the work vs. the people counting the money

3. PUNCHLINE - FORMAT SUBVERSION:
   - Chef doesn't play the game at all: "I'm the one making the lamb chops"
   - Then: "I think you should all stfu" - cut mid-word
   - Breaking the expected format IS the joke
   - The mid-word cut on profanity adds impact (implies without saying, feels more real/spontaneous)

4. WHY IT WORKS:
   - Relatable frustration (anyone who's worked service knows this feeling)
   - The "rebel worker" archetype breaking professional composure
   - Escalating absurdity in the numbers makes chef's opt-out funnier
   - Editing choice (mid-word cut) feels like capturing a genuine moment`,
    explanation: `DEEP REASONING CHAIN:

CHARACTER DYNAMIC: Workers who labor (waitress, chef) vs. those who profit (owner, manager) - each person's answer reveals their incentive structure

UNDERLYING TENSION: Self-interest based on job role: profit-motivated want high numbers, labor-motivated want low numbers

FORMAT PARTICIPATION: The chef BREAKS the established format (role + estimate) by refusing to give a number and opting out entirely

EDITING CONTRIBUTION: Mid-word cut on profanity ('stfu') implies without stating, feels authentic and abrupt, matches chef's frustration

AUDIENCE SURROGATE: The chef is the audience surrogate - anyone who's worked service knows the frustration of being the one 'actually doing the work' while others make demands

KEY TEACHING: When analyzing humor, don't stop at "what type" (contrast). Ask: "What dynamic between characters creates the tension?" and "Does the format itself become part of the joke?"`,
    humor_type_correction: {
      original: 'contrast',
      correct: 'format-subversion + incentive-reveal',
      why: 'The humor is not from the contrast of numbers, but from (1) each answer revealing self-interest, and (2) the chef breaking the format entirely. The mid-word profanity cut is an editing technique that amplifies the punchline.',
      deep_reasoning: {
        character_dynamic: 'Workers who labor vs. those who profit - each answer reveals incentive structure',
        underlying_tension: 'Self-interest based on job role: profit-motivated want high, labor-motivated want low',
        format_participation: 'Chef breaks the established format by refusing to give a number',
        editing_contribution: 'Mid-word cut on profanity implies without stating',
        audience_surrogate: 'The chef - frustration of being the one actually doing the work'
      }
    },
    tags: ['incentive-conflict', 'format-subversion', 'workplace-dynamic', 'profanity-implication', 'rebel-worker', 'mid-word-cut', 'deep-reasoning-example'],
    humor_types: ['format-subversion', 'situational-irony', 'character-reveal', 'editing-as-punchline'],
    quality_score: 0.95
  },
  {
    example_type: 'humor_interpretation',
    video_summary: `POV customer at register, internal voice debates tip amount ('5%... no 10%... maybe 30%'). Reveal: it was the CASHIER speaking out loud. Customer: 'Can you shut up?'`,
    gemini_interpretation: 'Subversion humor - The voice was not the customer internal monologue as expected.',
    correct_interpretation: `HUMOR STRUCTURE: POV Misdirection + Power Dynamic Reveal

1. SETUP: We hear deliberation about tipping ("5%... no 10%... maybe 30%")
   - We assume this is the customer's internal monologue (standard POV convention)
   - This creates RELATABLE tension (everyone has felt tipping anxiety)

2. THE REVEAL:
   - It was the CASHIER speaking out loud the whole time
   - This reframes EVERYTHING we just experienced
   - The power dynamic flips: someone trying to manipulate the private decision

3. PUNCHLINE:
   - "Can you shut up?" delivered with casual annoyance, not anger
   - It's boundary-setting that acknowledges the absurdity
   - The casualness makes it funnier than outrage would

4. WHY IT WORKS:
   - POV conventions are so ingrained that breaking them is surprising
   - Tipping anxiety is universally relatable
   - The power grab (trying to influence private decision) creates tension
   - The payoff resolves tension through casual assertiveness`,
    explanation: `DEEP REASONING CHAIN:

CHARACTER DYNAMIC: Power inversion - customer's private decision (tipping) is being influenced by the person who would benefit from higher tip

UNDERLYING TENSION: The gap between internal thought (private) and spoken manipulation (public intrusion)

FORMAT PARTICIPATION: POV misdirection - we assume first-person voice = POV character, reveal breaks this assumption and reframes everything

EDITING CONTRIBUTION: The held POV shot maintains the illusion until the reveal

AUDIENCE SURROGATE: The customer - everyone has felt the awkwardness of tipping decisions

KEY TEACHING: Don't just identify "subversion" - explain WHAT was subverted. Here it's the assumption that POV = whose thoughts we hear.`,
    humor_type_correction: {
      original: 'subversion',
      correct: 'pov-misdirection + power-dynamic-reveal',
      why: 'The specific subversion is of POV conventions (voice = POV character thoughts). The humor comes from realizing someone was trying to manipulate a private decision.',
      deep_reasoning: {
        character_dynamic: 'Power inversion - cashier trying to influence customer private decision',
        underlying_tension: 'Private thought vs. public manipulation intrusion',
        format_participation: 'POV misdirection - voice assumed to be POV character',
        editing_contribution: 'Held POV shot maintains illusion',
        audience_surrogate: 'Customer - tipping anxiety is universal'
      }
    },
    tags: ['pov-misdirection', 'power-dynamic', 'tipping-anxiety', 'boundary-setting', 'deep-reasoning-example'],
    humor_types: ['subversion', 'reveal', 'relatable', 'pov-misdirection'],
    quality_score: 0.92
  },
  {
    example_type: 'humor_interpretation',
    video_summary: `Manager says 'use your heads' to staff. Cut to workers literally using their physical heads to clean windows, sweep floors, etc.`,
    gemini_interpretation: 'Wordplay humor - Literal interpretation of the phrase "use your head".',
    correct_interpretation: `HUMOR STRUCTURE: Malicious Compliance + Escalation

1. SETUP: Manager tells staff "use your heads"
   - This is a common management cliché meaning "think smarter"
   - It's the kind of meaningless phrase workers hear constantly

2. THE JOKE:
   - Workers interpret the instruction LITERALLY
   - Each scene shows a different absurd application
   - Using actual heads to clean, sweep, organize, etc.

3. THE SUBTEXT (often missed):
   - This is DELIBERATE misunderstanding as workplace resistance
   - It's malicious compliance: following instructions in the most unhelpful way
   - It says: "If you speak to us in clichés, we'll treat your words as meaningless"
   - It's worker solidarity disguised as stupidity

4. WHY IT WORKS:
   - Anyone who's worked under management knows empty platitudes
   - The escalation (each scene more absurd) builds the joke
   - There's catharsis in seeing workers mock management-speak`,
    explanation: `DEEP REASONING CHAIN:

CHARACTER DYNAMIC: Authority (manager using clichés) vs. Malicious compliance (workers deliberately misunderstanding)

UNDERLYING TENSION: Empty management-speak vs. workers treating meaningless phrases as meaningless

FORMAT PARTICIPATION: Each scene escalates the absurdity of literal interpretation - escalation structure builds the joke

EDITING CONTRIBUTION: Quick cuts between different absurd applications build the joke through repetition with variation

AUDIENCE SURROGATE: The workers - anyone who's been told platitudes by management understands the impulse to mock them

KEY TEACHING: Look for subtext. This isn't just wordplay - it's worker solidarity disguised as compliance. The humor has a social commentary layer.`,
    humor_type_correction: {
      original: 'wordplay',
      correct: 'malicious-compliance + absurdist-escalation',
      why: 'The wordplay is just the vehicle. The real humor is workplace resistance through deliberate misunderstanding.',
      deep_reasoning: {
        character_dynamic: 'Authority vs. malicious compliance',
        underlying_tension: 'Empty management-speak vs. workers mocking it',
        format_participation: 'Escalation structure - each scene more absurd',
        editing_contribution: 'Quick cuts build repetition with variation',
        audience_surrogate: 'Workers - anyone who has been told platitudes by management'
      }
    },
    tags: ['malicious-compliance', 'workplace-resistance', 'escalation', 'management-cliches', 'deep-reasoning-example'],
    humor_types: ['wordplay', 'absurdist', 'escalation', 'subversive', 'malicious-compliance'],
    quality_score: 0.90
  },
  {
    example_type: 'humor_interpretation',
    video_summary: `Restaurant employees shown doing busywork because their boss wants them to be working even when there are no customers. Staff cuts imaginary pizza, opens door for no one, takes order from empty table, adds invisible food to plate.`,
    gemini_interpretation: 'Absurdist humor showing workers doing unnecessary tasks.',
    correct_interpretation: `HUMOR STRUCTURE: Silent Resistance + Absurdist Compliance

1. SETUP: Manager insists staff work even with no customers
   - This is a recognizable workplace dynamic (paid time = working time)
   - Staff are told to "look busy" even when there's nothing to do

2. THE JOKE:
   - Staff comply with the letter of the request, not the spirit
   - Each scene shows a different "task" performed with nothing:
   - Cutting air in an empty pizza box
   - Opening door for nobody
   - Taking orders from empty chairs
   - Serving invisible food

3. THE SUBTEXT:
   - It's PASSIVE resistance - technically following orders
   - The absurdity highlights the absurdity of the request itself
   - Each worker cooperates in the protest (it's collective)

4. WHY IT WORKS:
   - The pacing builds as each scene adds to the concept
   - No dialogue needed - the visual absurdity speaks
   - It's relatable for anyone who's been told to "find something to do"
   - The deadpan execution makes it funnier than exaggeration would`,
    explanation: `DEEP REASONING CHAIN:

CHARACTER DYNAMIC: Manager demands appearance of productivity vs. staff providing that appearance (but mockingly)

UNDERLYING TENSION: The gap between what "work" means (output) vs. what management sees (activity)

FORMAT PARTICIPATION: Sketch format with repeating structure - each scene is a variation on "doing job with nothing"

EDITING CONTRIBUTION: No dialogue, purely visual storytelling. Each cut introduces a new absurd "task"

AUDIENCE SURROGATE: All the workers collectively - the shared understanding between them is part of the joke

KEY TEACHING: Sometimes humor has no dialogue. The visual absurdity IS the commentary. Also: collective resistance (multiple workers participating) adds to the joke.`,
    humor_type_correction: {
      original: 'absurdist',
      correct: 'silent-resistance + visual-absurdity',
      why: 'The absurdity serves a purpose - highlighting the absurdity of the manager request. It is malicious compliance done visually.',
      deep_reasoning: {
        character_dynamic: 'Manager demands productivity theater vs. staff providing mockingly',
        underlying_tension: 'Real work (output) vs. appearance of work (activity)',
        format_participation: 'Repeating structure with variation builds the concept',
        editing_contribution: 'No dialogue, purely visual - each cut is a new absurd task',
        audience_surrogate: 'All workers collectively - shared understanding is part of the joke'
      }
    },
    tags: ['silent-resistance', 'visual-absurdity', 'malicious-compliance', 'collective-humor', 'deep-reasoning-example'],
    humor_types: ['absurdist', 'visual-comedy', 'malicious-compliance', 'deadpan'],
    quality_score: 0.88
  }
];

async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  });
  return response.data[0].embedding;
}

async function seedExample(example) {
  // Build comprehensive embedding from all reasoning components
  const embeddingText = [
    `CONCEPT: ${example.video_summary}`,
    `DEEP_REASONING: ${example.explanation}`,
    `CORRECT_INTERPRETATION: ${example.correct_interpretation}`,
    `HUMOR_TYPES: ${example.humor_types.join(', ')}`,
    `TAGS: ${example.tags.join(', ')}`
  ].join('\n\n');
  
  console.log(`\nGenerating embedding for: ${example.video_summary.slice(0, 50)}...`);
  const embedding = await generateEmbedding(embeddingText);
  
  // Check if similar example already exists
  const { data: existing } = await supabase
    .from('video_analysis_examples')
    .select('id, video_summary')
    .textSearch('video_summary', example.video_summary.split(' ').slice(0, 5).join(' | '))
    .limit(1);
  
  if (existing && existing.length > 0) {
    console.log(`  Updating existing example: ${existing[0].id}`);
    
    const { error } = await supabase
      .from('video_analysis_examples')
      .update({
        video_summary: example.video_summary,
        gemini_interpretation: example.gemini_interpretation,
        correct_interpretation: example.correct_interpretation,
        explanation: example.explanation,
        humor_type_correction: example.humor_type_correction,
        tags: example.tags,
        humor_types: example.humor_types,
        quality_score: example.quality_score,
        embedding
      })
      .eq('id', existing[0].id);
      
    if (error) {
      console.error(`  Error updating: ${error.message}`);
    } else {
      console.log(`  ✅ Updated successfully`);
    }
    return;
  }
  
  // Insert new example
  const { data, error } = await supabase
    .from('video_analysis_examples')
    .insert({
      example_type: example.example_type,
      video_summary: example.video_summary,
      gemini_interpretation: example.gemini_interpretation,
      correct_interpretation: example.correct_interpretation,
      explanation: example.explanation,
      humor_type_correction: example.humor_type_correction,
      tags: example.tags,
      humor_types: example.humor_types,
      quality_score: example.quality_score,
      embedding,
      created_by: 'deep-reasoning-seed'
    })
    .select('id')
    .single();
    
  if (error) {
    console.error(`  Error inserting: ${error.message}`);
  } else {
    console.log(`  ✅ Created new example: ${data.id}`);
  }
}

async function main() {
  console.log('🌱 Seeding deep reasoning examples...\n');
  console.log(`Found ${DEEP_REASONING_EXAMPLES.length} examples to seed\n`);
  
  for (const example of DEEP_REASONING_EXAMPLES) {
    await seedExample(example);
  }
  
  console.log('\n✅ Seeding complete!');
  
  // Show stats
  const { data: stats } = await supabase
    .from('video_analysis_examples')
    .select('example_type')
    .order('created_at', { ascending: false });
    
  if (stats) {
    const counts = {};
    for (const row of stats) {
      counts[row.example_type] = (counts[row.example_type] || 0) + 1;
    }
    console.log('\nExample counts by type:', counts);
    console.log(`Total examples: ${stats.length}`);
  }
}

main().catch(console.error);
