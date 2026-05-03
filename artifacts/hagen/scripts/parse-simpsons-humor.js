/**
 * Parse Simpsons Scripts for Humor Mechanisms
 *
 * Extracts action lines, dialogue, and categorizes humor mechanisms
 * to bridge gaps in TikTok training data.
 *
 * Usage: node scripts/parse-simpsons-humor.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SCRIPTS_DIR = path.join(__dirname, '../datasets/simpsons-scripts');
const OUTPUT_FILE = path.join(__dirname, '../datasets/simpsons-humor-extracted.json');

// Humor mechanism patterns to detect
const MECHANISM_PATTERNS = {
  sarcasm: [
    /sarcast/i, /ironi/i, /deadpan/i, /dry/i, /yeah[,.]* right/i,
    /oh[,.]* really/i, /sure[,.]* /i, /whatever/i
  ],
  physical_comedy: [
    /falls/i, /trips/i, /crashes/i, /slips/i, /tumbles/i, /stumbles/i,
    /hits/i, /smacks/i, /bonks/i, /lands on/i, /face.?first/i,
    /pratfall/i, /slapstick/i
  ],
  reaction_shot: [
    /eyes widen/i, /jaw drops/i, /freezes/i, /stunned/i, /shocked/i,
    /stares/i, /glares/i, /blinks/i, /double.?take/i, /reacts/i,
    /expression/i, /look of/i, /face falls/i
  ],
  contrast: [
    /meanwhile/i, /contrast/i, /opposite/i, /but /i, /however/i,
    /on the other hand/i, /while /i, /versus/i
  ],
  subversion: [
    /unexpected/i, /suddenly/i, /twist/i, /turns out/i, /reveal/i,
    /surprise/i, /actually/i, /instead/i
  ],
  timing: [
    /beat/i, /pause/i, /moment/i, /silence/i, /wait/i,
    /then/i, /finally/i, /after a/i, /\(beat\)/i, /\(pause\)/i
  ],
  wordplay: [
    /pun/i, /play on/i, /double meaning/i, /literally/i,
    /misunderstand/i, /mishear/i, /malaprop/i
  ],
  callback: [
    /callback/i, /earlier/i, /remember/i, /again/i, /running gag/i,
    /same/i, /like before/i
  ],
  absurdism: [
    /absurd/i, /nonsense/i, /random/i, /bizarre/i, /surreal/i,
    /impossible/i, /ridiculous/i, /crazy/i, /insane/i
  ],
  escalation: [
    /escalat/i, /worse/i, /more and more/i, /keeps/i, /continues/i,
    /snowball/i, /spiral/i, /out of control/i
  ]
};

// Patterns to identify action lines vs dialogue
const ACTION_LINE_PATTERNS = [
  /^[A-Z][A-Z\s]+\./,           // ALL CAPS sentence
  /^\([^)]+\)$/,                 // Parenthetical direction
  /^(INT\.|EXT\.)/i,            // Scene headers
  /^(CUT TO|FADE|DISSOLVE)/i,   // Transitions
  /^\s*[A-Z][a-z]+\s+(walks|runs|enters|exits|looks|turns|picks|puts|grabs|throws|sits|stands|moves|goes|comes|takes|gives|opens|closes|pulls|pushes|holds|drops|falls|jumps|dives|crawls|climbs|reaches|points|waves|nods|shakes|smiles|frowns|laughs|cries|screams|whispers|shouts|yells|sighs|groans|gasps|stares|glares|blinks|winks|rolls)/i
];

// Character name pattern (dialogue attribution)
const CHARACTER_PATTERN = /^([A-Z][A-Z\s]+)(\s*\([^)]+\))?$/;

/**
 * Parse HTML content from scripts
 * Handles both regular HTML and CHOCR (OCR output) format
 */
function parseHtmlContent(html) {
  // Check if this is CHOCR format (OCR output)
  if (html.includes('ocrx_word') || html.includes('ocr_line')) {
    return parseChocrHtml(html);
  }

  // Regular HTML parsing
  let text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return text;
}

/**
 * Parse HOCR (OCR output) HTML format
 * Extracts text from word spans and preserves line structure
 */
function parseChocrHtml(html) {
  const lines = [];

  // For HOCR format, words are directly in ocrx_word spans
  // Extract each ocr_line and get the words from it
  const lineRegex = /<span class="ocr_line"[^>]*>([\s\S]*?)(?=<\/span>\s*<\/p>|<span class="ocr_line")/gi;

  let lineMatch;
  while ((lineMatch = lineRegex.exec(html)) !== null) {
    const lineContent = lineMatch[1];

    // Extract words - in HOCR they're directly in the span
    const wordRegex = /<span class="ocrx_word"[^>]*>([^<]+)<\/span>/gi;
    const words = [];
    let wordMatch;

    while ((wordMatch = wordRegex.exec(lineContent)) !== null) {
      const word = wordMatch[1].trim();
      if (word) {
        words.push(word);
      }
    }

    if (words.length > 0) {
      lines.push(words.join(' '));
    }
  }

  // If that didn't work, try paragraph-based extraction
  if (lines.length < 20) {
    const altLines = [];
    const paraRegex = /<p class="ocr_par"[^>]*>([\s\S]*?)<\/p>/gi;
    let paraMatch;

    while ((paraMatch = paraRegex.exec(html)) !== null) {
      const paraContent = paraMatch[1];

      // Get all words in this paragraph
      const wordRegex = /<span class="ocrx_word"[^>]*>([^<]+)<\/span>/gi;
      const words = [];
      let wordMatch;

      while ((wordMatch = wordRegex.exec(paraContent)) !== null) {
        const word = wordMatch[1].trim();
        if (word) {
          words.push(word);
        }
      }

      if (words.length > 0) {
        altLines.push(words.join(' '));
      }
    }

    if (altLines.length > lines.length) {
      return altLines.join('\n');
    }
  }

  return lines.join('\n');
}

/**
 * Extract scenes from script text
 */
function extractScenes(text) {
  const scenes = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  let currentScene = null;
  let currentContent = [];

  for (const line of lines) {
    // Detect scene header
    if (/^(INT\.|EXT\.)/i.test(line)) {
      if (currentScene && currentContent.length > 0) {
        scenes.push({
          header: currentScene,
          content: currentContent.join('\n'),
          lines: currentContent
        });
      }
      currentScene = line;
      currentContent = [];
    } else if (currentScene) {
      currentContent.push(line);
    }
  }

  // Push last scene
  if (currentScene && currentContent.length > 0) {
    scenes.push({
      header: currentScene,
      content: currentContent.join('\n'),
      lines: currentContent
    });
  }

  return scenes;
}

/**
 * Identify if a line is an action line (visual description)
 */
function isActionLine(line) {
  // Skip if it's a character name (dialogue attribution)
  if (CHARACTER_PATTERN.test(line) && line.length < 30) {
    return false;
  }

  // Check for action patterns
  for (const pattern of ACTION_LINE_PATTERNS) {
    if (pattern.test(line)) {
      return true;
    }
  }

  // Heuristic: If it describes actions with present tense verbs
  const actionVerbs = /\b(walks|runs|looks|turns|grabs|throws|falls|jumps|stares|freezes|reacts|enters|exits|picks up|puts down|opens|closes|smiles|frowns|laughs|sighs|screams|whispers)\b/i;
  if (actionVerbs.test(line) && !line.includes('"') && !/^[A-Z]+$/.test(line.split(' ')[0])) {
    return true;
  }

  return false;
}

/**
 * Detect humor mechanisms in a scene
 */
function detectMechanisms(sceneContent) {
  const detected = [];

  for (const [mechanism, patterns] of Object.entries(MECHANISM_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(sceneContent)) {
        detected.push(mechanism);
        break;
      }
    }
  }

  return [...new Set(detected)];
}

/**
 * Extract comedy beats from a scene
 */
function extractComedyBeats(scene) {
  const beats = [];
  const lines = scene.lines;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : '';
    const nextLine = i < lines.length - 1 ? lines[i + 1] : '';

    // Look for reaction shots (action after dialogue)
    if (isActionLine(line)) {
      const mechanisms = detectMechanisms(line);

      // Check if this is a reaction to previous dialogue
      const isReaction = CHARACTER_PATTERN.test(prevLine) ||
                        /reacts|looks|stares|freezes|eyes|expression/i.test(line);

      if (mechanisms.length > 0 || isReaction) {
        beats.push({
          type: isReaction ? 'reaction' : 'action',
          line: line,
          context: {
            before: prevLine,
            after: nextLine
          },
          mechanisms
        });
      }
    }

    // Look for timing beats
    if (/\(beat\)|\(pause\)|\(silence\)/i.test(line)) {
      beats.push({
        type: 'timing',
        line: line,
        context: {
          before: prevLine,
          after: nextLine
        },
        mechanisms: ['timing']
      });
    }
  }

  return beats;
}

/**
 * Score a scene for humor training potential
 */
function scoreScene(scene, beats) {
  let score = 0;

  // More beats = more interesting
  score += beats.length * 2;

  // Variety of mechanisms
  const allMechanisms = beats.flatMap(b => b.mechanisms);
  const uniqueMechanisms = [...new Set(allMechanisms)];
  score += uniqueMechanisms.length * 3;

  // Bonus for reaction shots
  const reactions = beats.filter(b => b.type === 'reaction');
  score += reactions.length * 2;

  // Bonus for physical comedy
  if (allMechanisms.includes('physical_comedy')) score += 5;

  // Bonus for timing beats
  if (allMechanisms.includes('timing')) score += 3;

  return score;
}

/**
 * Process a single script file
 */
function processScript(filePath) {
  const filename = path.basename(filePath);

  // Read file content
  let content;
  if (filePath.endsWith('.gz')) {
    const buffer = fs.readFileSync(filePath);
    content = zlib.gunzipSync(buffer).toString('utf-8');
  } else {
    content = fs.readFileSync(filePath, 'utf-8');
  }

  // Parse HTML if needed
  if (filePath.endsWith('.html') || filePath.endsWith('.html.gz')) {
    content = parseHtmlContent(content);
  }

  // Extract scenes
  const scenes = extractScenes(content);

  // Process each scene
  const processedScenes = scenes.map(scene => {
    const beats = extractComedyBeats(scene);
    const score = scoreScene(scene, beats);
    const mechanisms = detectMechanisms(scene.content);

    return {
      header: scene.header,
      content: scene.content.slice(0, 1000), // Truncate for readability
      mechanisms,
      beats,
      score,
      actionLines: scene.lines.filter(isActionLine)
    };
  });

  // Sort by score and take top scenes
  processedScenes.sort((a, b) => b.score - a.score);

  return {
    filename,
    episodeCode: filename.match(/S\d+_([^_]+)/)?.[1] || 'unknown',
    title: filename.replace(/^S\d+_[^_]+_/, '').replace(/\.(txt|html|html\.gz)$/, '').replace(/_/g, ' '),
    totalScenes: scenes.length,
    topScenes: processedScenes.slice(0, 10), // Top 10 scenes by humor score
    mechanismCounts: countMechanisms(processedScenes)
  };
}

/**
 * Count mechanism occurrences across scenes
 */
function countMechanisms(scenes) {
  const counts = {};
  for (const scene of scenes) {
    for (const mech of scene.mechanisms) {
      counts[mech] = (counts[mech] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Main function
 */
async function main() {
  console.log('Simpsons Humor Parser');
  console.log('=====================\n');

  // Get all script files
  const files = fs.readdirSync(SCRIPTS_DIR)
    .filter(f => f.endsWith('.txt') || f.endsWith('.html') || f.endsWith('.html.gz'))
    .map(f => path.join(SCRIPTS_DIR, f));

  console.log(`Found ${files.length} scripts to process\n`);

  const results = {
    scripts: [],
    globalMechanismCounts: {},
    topBeatsForTraining: []
  };

  for (const file of files) {
    process.stdout.write(`Processing ${path.basename(file)}... `);
    try {
      const scriptData = processScript(file);
      results.scripts.push(scriptData);

      // Aggregate mechanism counts
      for (const [mech, count] of Object.entries(scriptData.mechanismCounts)) {
        results.globalMechanismCounts[mech] = (results.globalMechanismCounts[mech] || 0) + count;
      }

      console.log(`OK (${scriptData.topScenes.length} scenes)`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }

  // Extract best beats across all scripts for training
  for (const script of results.scripts) {
    for (const scene of script.topScenes) {
      for (const beat of scene.beats) {
        if (beat.mechanisms.length > 0) {
          results.topBeatsForTraining.push({
            episode: script.episodeCode,
            title: script.title,
            sceneHeader: scene.header,
            beat: beat,
            score: scene.score
          });
        }
      }
    }
  }

  // Sort and take top 500 beats
  results.topBeatsForTraining.sort((a, b) => b.score - a.score);
  results.topBeatsForTraining = results.topBeatsForTraining.slice(0, 500);

  // Save results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`\nScripts processed: ${results.scripts.length}`);
  console.log(`Top beats extracted: ${results.topBeatsForTraining.length}`);
  console.log('\nMechanism Distribution:');

  const sorted = Object.entries(results.globalMechanismCounts)
    .sort((a, b) => b[1] - a[1]);

  for (const [mech, count] of sorted) {
    const bar = '█'.repeat(Math.min(30, Math.round(count / 10)));
    console.log(`  ${mech.padEnd(18)} ${String(count).padStart(4)} ${bar}`);
  }

  console.log(`\nOutput saved to: ${OUTPUT_FILE}`);

  // Generate training-ready format
  const trainingFile = OUTPUT_FILE.replace('.json', '-training.jsonl');
  const trainingLines = results.topBeatsForTraining.map(item => ({
    source: 'simpsons',
    episode: item.episode,
    title: item.title,
    scene: item.sceneHeader,
    action_line: item.beat.line,
    context_before: item.beat.context.before,
    context_after: item.beat.context.after,
    mechanisms: item.beat.mechanisms,
    type: item.beat.type,
    // Placeholder for human annotation
    humor_explanation: '',
    focus_element: ''
  }));

  fs.writeFileSync(trainingFile,
    trainingLines.map(l => JSON.stringify(l)).join('\n')
  );

  console.log(`Training template saved to: ${trainingFile}`);
  console.log(`\n→ Review and annotate the training file to add humor explanations`);
}

main().catch(console.error);
