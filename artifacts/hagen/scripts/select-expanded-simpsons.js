/**
 * Select Expanded Simpsons Training Data
 *
 * Targets gaps identified in human TikTok annotations:
 * - physical_commitment (116 mentions in human notes)
 * - direct_address/looks (67 mentions)
 * - escalation (8 mentions but undertrained)
 * - contrast (structural)
 * - absurd_visual (75 mentions)
 * - deadpan_context (5 mentions but important)
 * - vocal_commitment (performance)
 * - timing (already partial)
 * - reaction_shot (already partial)
 *
 * Usage: node scripts/select-expanded-simpsons.js
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../datasets/simpsons-humor-extracted.json');
const OUTPUT_FILE = path.join(__dirname, '../datasets/fine-tuning/simpsons-expanded-selection.jsonl');

// Target counts per category (total ~315)
const CATEGORIES = {
  physical_commitment: {
    target: 50,
    pattern: /throws|hurls|slams|crashes|dives|leaps|jumps|runs|charges|storms|bursts|collapses|falls|flails|waves|gestures|pounds|bangs|tackles|grabs|yanks|shoves|kicks|punches|wrestles|struggles/i,
    description: 'Physical commitment to the bit - body language that SELLS the joke'
  },
  vocal_commitment: {
    target: 30,
    pattern: /screams|yells|shouts|bellows|roars|whispers|mutters|stammers|stutters|cries|sobs|laughs|howls|wails|gasps|sighs|groans|moans|chokes|coughs/i,
    description: 'Vocal performance - sound that carries emotion'
  },
  direct_address: {
    target: 50,
    pattern: /camera|audience|viewer|us|directly|turns to|looks at.*directly|stares at|into the|breaks the fourth|addresses/i,
    description: 'Breaking fourth wall, meaningful looks AT camera/audience'
  },
  deadpan_context: {
    target: 25,
    pattern: /calmly|casually|matter.?of.?fact|simply|just|flatly|without emotion|emotionless|unfazed|unbothered|nonchalant|dry|blank|neutral|stoic/i,
    description: 'Deadpan delivery - contrast between calm demeanor and absurd situation'
  },
  escalation: {
    target: 30,
    pattern: /again|another|yet another|more|keeps|continues|still|worse|bigger|louder|faster|increasingly|even more|now|then|finally/i,
    description: 'Building tension - things getting progressively worse/bigger/more absurd'
  },
  contrast: {
    target: 30,
    pattern: /meanwhile|but|however|while|despite|although|instead|opposite|contrast|versus|compared|unlike|on the other hand/i,
    description: 'Juxtaposition - two things shown together for comedic contrast'
  },
  absurd_visual: {
    target: 30,
    pattern: /suddenly|inexplicably|magically|transforms|appears|disappears|floats|flies|explodes|multiplies|impossible|ridiculous|bizarre|surreal|nonsense|out of nowhere/i,
    description: 'Absurdist visuals - things that make no logical sense'
  },
  reaction_shot: {
    target: 40,
    pattern: /eyes widen|jaw drops|freezes|stunned|shocked|stares|glares|blinks|double.?take|reacts|expression|look of|face falls|horrified|surprised|confused|bewildered/i,
    description: 'Facial reactions that land the joke - the LOOK'
  },
  timing_beat: {
    target: 30,
    pattern: /beat|pause|moment|silence|wait|then|finally|after a|long|awkward|uncomfortable|\(beat\)|\(pause\)|before|hesitates/i,
    description: 'Comedic timing - pauses and beats that create tension'
  }
};

function main() {
  console.log('Expanded Simpsons Selection');
  console.log('===========================\n');

  // Load full extraction
  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));

  // Collect all beats with context
  let allBeats = [];
  data.scripts.forEach(script => {
    script.topScenes.forEach(scene => {
      scene.beats.forEach(beat => {
        allBeats.push({
          episode: script.episodeCode,
          title: script.title,
          scene: scene.header,
          action_line: beat.line,
          context_before: beat.context?.before || '',
          context_after: beat.context?.after || '',
          type: beat.type,
          mechanisms: beat.mechanisms || [],
          score: scene.score
        });
      });
    });
  });

  console.log(`Total beats available: ${allBeats.length}\n`);

  const selected = [];
  const usedLines = new Set();

  // Select beats for each category
  for (const [category, config] of Object.entries(CATEGORIES)) {
    const { target, pattern, description } = config;

    // Find matching beats
    const matches = allBeats.filter(b => {
      const fullText = `${b.action_line} ${b.context_before} ${b.context_after}`;
      return pattern.test(fullText) && !usedLines.has(b.action_line);
    });

    // Sort by score (higher = better) and line length (medium is best)
    matches.sort((a, b) => {
      const aLen = a.action_line.length;
      const bLen = b.action_line.length;
      // Prefer lines between 30-150 chars
      const aLenScore = (aLen > 30 && aLen < 150) ? 10 : 0;
      const bLenScore = (bLen > 30 && bLen < 150) ? 10 : 0;
      return (b.score + bLenScore) - (a.score + aLenScore);
    });

    // Select top N
    let count = 0;
    for (const beat of matches) {
      if (count >= target) break;

      // Quality filters
      if (beat.action_line.length < 15) continue; // Too short
      if (beat.action_line.length > 250) continue; // Too long
      if (/^\d+$/.test(beat.action_line)) continue; // Just numbers
      if (beat.action_line.split(' ').length < 3) continue; // Too few words

      usedLines.add(beat.action_line);
      selected.push({
        ...beat,
        category,
        category_description: description,
        annotation_prompt: getAnnotationPrompt(category)
      });
      count++;
    }

    console.log(`${category.padEnd(22)} ${count}/${target} selected (${matches.length} available)`);
  }

  console.log(`\nTotal selected: ${selected.length}`);

  // Shuffle to mix categories
  shuffleArray(selected);

  // Save
  fs.writeFileSync(
    OUTPUT_FILE,
    selected.map(s => JSON.stringify(s)).join('\n')
  );

  console.log(`\nSaved to: ${OUTPUT_FILE}`);

  // Summary by category
  console.log('\n' + '='.repeat(50));
  console.log('CATEGORY DISTRIBUTION');
  console.log('='.repeat(50));

  const byCat = {};
  selected.forEach(s => {
    byCat[s.category] = (byCat[s.category] || 0) + 1;
  });

  Object.entries(byCat).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    console.log(`${cat.padEnd(22)} ${count}`);
  });

  // Show samples
  console.log('\n' + '='.repeat(50));
  console.log('SAMPLES (one per category)');
  console.log('='.repeat(50));

  const shown = new Set();
  for (const beat of selected) {
    if (!shown.has(beat.category)) {
      shown.add(beat.category);
      console.log(`\n[${beat.category.toUpperCase()}]`);
      console.log(`Episode: ${beat.episode} - ${beat.title}`);
      console.log(`Action: "${beat.action_line}"`);
      console.log(`Why: ${beat.category_description}`);
    }
  }
}

function getAnnotationPrompt(category) {
  const prompts = {
    physical_commitment: 'COMMITMENT: How does the physical action SELL the joke? What makes the movement funny? (e.g., "the full-body commitment to the fall makes it absurd")',

    vocal_commitment: 'VOCAL: How does the sound/voice carry the humor? What emotion does it express? (e.g., "the scream is disproportionate to the situation")',

    direct_address: 'DIRECT ADDRESS: What does this look/address communicate? Why does breaking the fourth wall work here? (e.g., "the look says: can you believe this?")',

    deadpan_context: 'DEADPAN: What makes the calm delivery funny? What contrast exists? (e.g., "saying something absurd completely straight-faced")',

    escalation: 'ESCALATION: How does repetition/building create humor? What pattern emerges? (e.g., "each time gets worse, creating anticipation")',

    contrast: 'CONTRAST: What two things are juxtaposed? Why is the contrast funny? (e.g., "the mismatch between expectation and reality")',

    absurd_visual: 'ABSURD: What makes this visually impossible/ridiculous? Why does logic-breaking work? (e.g., "defies physics in a way that highlights the situation")',

    reaction_shot: 'REACTION: What does this expression communicate? How does it land the joke? (e.g., "the frozen stare lets the absurdity sink in")',

    timing_beat: 'TIMING: What does the pause accomplish? How does waiting create humor? (e.g., "the beat lets us anticipate what comes next")'
  };

  return prompts[category] || 'Describe what makes this moment funny.';
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

main();
