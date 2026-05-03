/**
 * Auto-Annotate Simpsons Beats with Gemini
 *
 * Uses Gemini to draft humor explanations for gap-fill beats,
 * then outputs for human review before merging into training data.
 *
 * Usage: node scripts/annotate-simpsons-beats.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const INPUT_FILE = path.join(__dirname, '../datasets/fine-tuning/simpsons-gap-fills.jsonl');
const OUTPUT_FILE = path.join(__dirname, '../datasets/fine-tuning/simpsons-annotated.jsonl');
const REVIEW_FILE = path.join(__dirname, '../datasets/fine-tuning/simpsons-for-review.json');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `Du är en expert på komedi och humoranalys. Din uppgift är att förklara VAD som gör ett specifikt ögonblick i en Simpsons-scen roligt.

Skriv som en manusförfattare som förklarar skämtet för en kollega - kort, insiktsfullt, fokuserat på HUR humorn fungerar.

Format:
- humor_explanation: 2-3 meningar som förklarar varför detta ögonblick är roligt (mekanismen, timingen, kontrasten)
- focus_element: Den specifika visuella/dialog-detaljen som "landar" skämtet

Skriv på svenska. Var specifik - nämn karaktärers reaktioner, timing, kontraster.`;

async function annotateBeats() {
  console.log('Simpsons Beat Annotator');
  console.log('=======================\n');

  // Read beats
  const lines = fs.readFileSync(INPUT_FILE, 'utf-8').trim().split('\n');
  const beats = lines.map(l => JSON.parse(l));

  console.log(`Beats to annotate: ${beats.length}\n`);

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const annotated = [];
  const forReview = [];

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    process.stdout.write(`[${i + 1}/${beats.length}] ${beat.episode} - ${beat.gap_mechanism}... `);

    try {
      const prompt = `${SYSTEM_PROMPT}

Scen: ${beat.scene}
Kontext innan: "${beat.context_before}"
Handling: "${beat.action_line}"
Kontext efter: "${beat.context_after}"
Humortyp: ${beat.gap_mechanism}

${beat.annotation_prompt}

Svara i JSON-format:
{
  "humor_explanation": "...",
  "focus_element": "..."
}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        const annotatedBeat = {
          ...beat,
          humor_explanation: parsed.humor_explanation,
          focus_element: parsed.focus_element,
          ai_generated: true
        };

        annotated.push(annotatedBeat);
        forReview.push({
          index: i,
          episode: beat.episode,
          title: beat.title,
          mechanism: beat.gap_mechanism,
          action_line: beat.action_line,
          context: `${beat.context_before} [ACTION] ${beat.context_after}`,
          humor_explanation: parsed.humor_explanation,
          focus_element: parsed.focus_element
        });

        console.log('OK');
      } else {
        console.log('PARSE_ERROR');
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
    }

    // Rate limiting
    if (i < beats.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Save annotated JSONL (for training)
  fs.writeFileSync(
    OUTPUT_FILE,
    annotated.map(a => JSON.stringify(a)).join('\n')
  );

  // Save review file (human-readable)
  fs.writeFileSync(
    REVIEW_FILE,
    JSON.stringify(forReview, null, 2)
  );

  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`\nAnnotated: ${annotated.length}/${beats.length}`);
  console.log(`\nOutput files:`);
  console.log(`  Training data: ${OUTPUT_FILE}`);
  console.log(`  Human review:  ${REVIEW_FILE}`);

  // Show mechanism distribution
  const byCat = {};
  for (const a of annotated) {
    byCat[a.gap_mechanism] = (byCat[a.gap_mechanism] || 0) + 1;
  }
  console.log('\nBy mechanism:');
  for (const [mech, count] of Object.entries(byCat)) {
    console.log(`  ${mech}: ${count}`);
  }

  console.log('\n→ Review simpsons-for-review.json');
  console.log('→ Edit any bad annotations in simpsons-annotated.jsonl');
  console.log('→ Then run: node scripts/merge-simpsons-to-training.js');
}

annotateBeats().catch(console.error);
