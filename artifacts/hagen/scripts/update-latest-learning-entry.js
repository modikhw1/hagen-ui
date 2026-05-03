require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function main() {
  const entryId = 'c43d3e95-b01a-4e29-af3f-dc542be870a4';
  
  // Richer, multi-layered explanation
  const newVideoSummary = `Restaurant skit where different staff members estimate how many lamb chops they'll make. Floor manager (600), waitress (100), customer (250), owner (1000), chef ("I'm the one making them... I think you should all stfu"). The pattern reveals incentive conflict: managers/owners want high volume (profit), workers want low (less labor). Chef breaks format entirely with frustrated punchline, cut mid-word on profanity.`;

  const newCorrectInterpretation = `HUMOR STRUCTURE: Format Subversion + Incentive Conflict

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
   - Escalating absurdity in the numbers (100 → 250 → 600 → 1000) makes chef's opt-out funnier
   - Editing choice (mid-word cut) feels like capturing a genuine moment

REPLICABILITY NOTES: The template is "ask different stakeholders the same question, reveal their self-interest through answers, have one person refuse to play." Works for any business where workers vs management have different incentives.`;

  const newExplanation = `Gemini identified "contrast" humor but missed the deeper structure. The humor isn't from different numbers (that's just the vehicle). The humor comes from:

1. INCENTIVE REVELATION - Each answer exposes self-interest. This is comedy as social commentary.

2. FORMAT SUBVERSION - The chef refusing to give a number at all breaks the established pattern. Pattern-break is a fundamental comedy mechanism.

3. THE PROFANITY CUT - Ending mid-word on "stfu" is a deliberate editing choice. It implies the profanity (more impactful than saying it), feels spontaneous/real, and creates an abrupt ending that matches the chef's frustration.

4. RELATABLE FRUSTRATION - Anyone who's worked in service understands being the one "actually doing the work" while others make demands. The chef is the audience surrogate.

KEY TEACHING: When analyzing humor, don't stop at "what type" (contrast, absurdism, etc.). Ask: "What dynamic between the characters creates the tension?" and "Does the format/structure itself become part of the joke?"`;

  // Generate new embedding from the richer content
  const embeddingText = `${newVideoSummary}\n\n${newCorrectInterpretation}\n\n${newExplanation}`;
  
  console.log('Generating embedding for richer content...');
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: embeddingText,
    dimensions: 1536,
  });
  
  const newEmbedding = embeddingResponse.data[0].embedding;
  console.log('Embedding generated, updating entry...');
  
  // Update the entry
  const { error } = await supabase
    .from('video_analysis_examples')
    .update({
      video_summary: newVideoSummary,
      correct_interpretation: newCorrectInterpretation,
      explanation: newExplanation,
      embedding: newEmbedding,
      tags: ['incentive-conflict', 'format-subversion', 'workplace-dynamic', 'profanity-implication', 'rebel-worker', 'mid-word-cut'],
      humor_types: ['format-subversion', 'situational-irony', 'character-reveal', 'editing-as-punchline'],
      humor_type_correction: {
        original: 'contrast',
        correct: 'format-subversion + incentive-reveal',
        why: 'The humor is not from the contrast of numbers, but from (1) each answer revealing self-interest, and (2) the chef breaking the format entirely. The mid-word profanity cut is an editing technique that amplifies the punchline.'
      }
    })
    .eq('id', entryId);
    
  if (error) {
    console.error('Error updating:', error.message);
  } else {
    console.log('✅ Updated learning entry with richer analysis');
    console.log('\nNew tags:', ['incentive-conflict', 'format-subversion', 'workplace-dynamic', 'profanity-implication', 'rebel-worker', 'mid-word-cut']);
    console.log('New humor types:', ['format-subversion', 'situational-irony', 'character-reveal', 'editing-as-punchline']);
  }
}

main();
