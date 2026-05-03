/**
 * Select Simpsons Beats to Fill TikTok Training Gaps
 *
 * Focuses on mechanisms underrepresented in TikTok data:
 * - timing (beats, pauses)
 * - physical_comedy
 * - reaction_shot
 * - callback
 *
 * Usage: node scripts/select-simpsons-gap-fills.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../datasets/simpsons-humor-extracted-training.jsonl');
const OUTPUT_FILE = path.join(__dirname, '../datasets/fine-tuning/simpsons-gap-fills.jsonl');

// Mechanisms we need more of (based on TikTok gap analysis)
const GAP_MECHANISMS = ['timing', 'physical_comedy', 'reaction_shot', 'callback'];

// Target count per mechanism
const TARGET_PER_MECHANISM = 25;

function main() {
  console.log('Simpsons Gap Fill Selector');
  console.log('==========================\n');

  // Read all beats
  const lines = fs.readFileSync(INPUT_FILE, 'utf-8').trim().split('\n');
  const beats = lines.map(l => JSON.parse(l));

  console.log(`Total beats available: ${beats.length}\n`);

  // Group by mechanism
  const byMechanism = {};
  for (const mech of GAP_MECHANISMS) {
    byMechanism[mech] = beats.filter(b => b.mechanisms.includes(mech));
    console.log(`${mech}: ${byMechanism[mech].length} candidates`);
  }

  // Select best examples for each gap mechanism
  const selected = [];
  const seenLines = new Set();

  for (const mech of GAP_MECHANISMS) {
    const candidates = byMechanism[mech]
      // Prefer beats with rich action lines (longer = more description)
      .sort((a, b) => b.action_line.length - a.action_line.length)
      // Avoid duplicates
      .filter(b => !seenLines.has(b.action_line));

    let count = 0;
    for (const beat of candidates) {
      if (count >= TARGET_PER_MECHANISM) break;

      // Quality filters
      if (beat.action_line.length < 20) continue; // Too short
      if (beat.action_line.length > 300) continue; // Too long (probably parsing error)
      if (/^\d+$/.test(beat.action_line)) continue; // Just a number
      if (beat.action_line.split(' ').length < 4) continue; // Too few words

      seenLines.add(beat.action_line);
      selected.push({
        ...beat,
        gap_mechanism: mech,
        annotation_prompt: getAnnotationPrompt(mech, beat)
      });
      count++;
    }

    console.log(`  → Selected ${count} for ${mech}`);
  }

  console.log(`\nTotal selected: ${selected.length}`);

  // Write output
  fs.writeFileSync(
    OUTPUT_FILE,
    selected.map(s => JSON.stringify(s)).join('\n')
  );

  console.log(`\nSaved to: ${OUTPUT_FILE}`);

  // Print sample for each mechanism
  console.log('\n' + '='.repeat(60));
  console.log('SAMPLES (one per gap mechanism)');
  console.log('='.repeat(60));

  for (const mech of GAP_MECHANISMS) {
    const sample = selected.find(s => s.gap_mechanism === mech);
    if (sample) {
      console.log(`\n[${mech.toUpperCase()}]`);
      console.log(`Episode: ${sample.episode} - ${sample.title}`);
      console.log(`Scene: ${sample.scene}`);
      console.log(`Action: "${sample.action_line}"`);
      console.log(`Context before: "${sample.context_before}"`);
      console.log(`Context after: "${sample.context_after}"`);
      console.log(`\nAnnotation prompt: ${sample.annotation_prompt}`);
    }
  }
}

/**
 * Generate annotation prompt to guide human annotator
 */
function getAnnotationPrompt(mechanism, beat) {
  const prompts = {
    timing: `TIMING: What makes this pause/beat funny? How does the delay create comedic effect? (e.g., "The beat lets the absurdity sink in before...")`,

    physical_comedy: `PHYSICAL: What's the visual gag here? Describe the movement/action that gets the laugh. (e.g., "Homer's face-first landing contrasts with...")`,

    reaction_shot: `REACTION: What emotion/expression carries the joke? What's the character reacting to that makes it funny? (e.g., "Bart's wide-eyed freeze after...")`,

    callback: `CALLBACK: What earlier setup does this pay off? How does repetition/recognition create the humor? (e.g., "This is the third time we've seen...")`
  };

  return prompts[mechanism] || 'Describe what makes this moment funny in 2-3 sentences.';
}

main();
