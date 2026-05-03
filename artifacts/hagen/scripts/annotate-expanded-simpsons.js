/**
 * Annotate Expanded Simpsons Beats (315 examples)
 *
 * Uses Gemini to generate humor explanations for each category.
 *
 * Usage: node scripts/annotate-expanded-simpsons.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const INPUT_FILE = path.join(__dirname, '../datasets/fine-tuning/simpsons-expanded-selection.jsonl');
const OUTPUT_FILE = path.join(__dirname, '../datasets/fine-tuning/simpsons-expanded-annotated.jsonl');
const PROGRESS_FILE = path.join(__dirname, '../datasets/fine-tuning/annotation-progress.json');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `Du är en expert på komedi och humoranalys. Din uppgift är att förklara VAD som gör ett specifikt ögonblick i en Simpsons-scen roligt.

Skriv som en manusförfattare som förklarar skämtet för en kollega - kort, insiktsfullt, fokuserat på HUR humorn fungerar.

VIKTIGT: Var specifik om den VISUELLA komiken. Nämn:
- Kroppsspråk och rörelser
- Ansiktsuttryck och reaktioner
- Timing och pauser
- Kontraster mellan vad som visas

Format (JSON):
{
  "humor_explanation": "2-3 meningar som förklarar varför detta ögonblick är roligt",
  "focus_element": "Den specifika visuella/verbala detaljen som landar skämtet"
}

Skriv på svenska. Var KONKRET - nämn specifika handlingar, uttryck, kontraster.`;

async function annotateBeats() {
  console.log('Expanded Simpsons Annotator (315 beats)');
  console.log('=======================================\n');

  // Read beats
  const lines = fs.readFileSync(INPUT_FILE, 'utf-8').trim().split('\n');
  const beats = lines.map(l => JSON.parse(l));

  console.log(`Beats to annotate: ${beats.length}\n`);

  // Check for existing progress
  let startIndex = 0;
  let annotated = [];

  if (fs.existsSync(PROGRESS_FILE)) {
    const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    startIndex = progress.lastIndex + 1;
    if (fs.existsSync(OUTPUT_FILE)) {
      annotated = fs.readFileSync(OUTPUT_FILE, 'utf-8').trim().split('\n')
        .filter(l => l.trim())
        .map(l => JSON.parse(l));
    }
    console.log(`Resuming from index ${startIndex} (${annotated.length} already done)\n`);
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  for (let i = startIndex; i < beats.length; i++) {
    const beat = beats[i];
    const catShort = beat.category.substring(0, 12).padEnd(12);
    process.stdout.write(`[${i + 1}/${beats.length}] ${catShort} ${beat.episode}... `);

    try {
      const prompt = `${SYSTEM_PROMPT}

Kategori: ${beat.category_description}
Scen: ${beat.scene}
Kontext innan: "${beat.context_before}"
Handling: "${beat.action_line}"
Kontext efter: "${beat.context_after}"

${beat.annotation_prompt}

Svara ENDAST med JSON:`;

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
        console.log('OK');

        // Save progress every 10 beats
        if (i % 10 === 0) {
          fs.writeFileSync(OUTPUT_FILE, annotated.map(a => JSON.stringify(a)).join('\n'));
          fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastIndex: i, total: beats.length }));
        }
      } else {
        console.log('PARSE_ERROR');
      }
    } catch (err) {
      console.log(`ERROR: ${err.message.substring(0, 50)}`);
    }

    // Rate limiting - be gentle
    await new Promise(r => setTimeout(r, 300));
  }

  // Final save
  fs.writeFileSync(OUTPUT_FILE, annotated.map(a => JSON.stringify(a)).join('\n'));

  // Clean up progress file
  if (fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`\nAnnotated: ${annotated.length}/${beats.length}`);

  // By category
  const byCat = {};
  annotated.forEach(a => {
    byCat[a.category] = (byCat[a.category] || 0) + 1;
  });

  console.log('\nBy category:');
  Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    console.log(`  ${cat.padEnd(22)} ${count}`);
  });

  console.log(`\nOutput: ${OUTPUT_FILE}`);
  console.log('\n→ Run: node scripts/merge-expanded-simpsons.js');
}

annotateBeats().catch(console.error);
