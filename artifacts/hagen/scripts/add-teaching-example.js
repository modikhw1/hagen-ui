/**
 * Add Teaching Example Helper
 * 
 * Interactive script to add a new teaching example to the deep reasoning system.
 * This makes it easy to capture patterns you've identified during analysis.
 * 
 * Usage:
 *   node scripts/add-teaching-example.js              # Interactive mode
 *   node scripts/add-teaching-example.js --video-id=xxx # From specific video correction
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

/**
 * Fetch video correction
 */
async function fetchVideoCorrection(videoId) {
  const { data, error } = await supabase
    .from('video_analysis_examples')
    .select('*')
    .eq('id', videoId)
    .single();
  
  if (error || !data) {
    throw new Error('Video correction not found');
  }
  
  return data;
}

/**
 * Interactive example builder
 */
async function buildExampleInteractive() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║          ADD TEACHING EXAMPLE TO DEEP REASONING           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  console.log('This will help you add a new teaching example based on a correction you made.\n');
  
  const example = {};
  
  example.video_summary = await question('Video summary (what happens): ');
  example.original_analysis = await question('What did Gemini say (shallow): ');
  
  console.log('\nDeep reasoning (your understanding):');
  example.character_dynamic = await question('  Character dynamic: ');
  example.underlying_tension = await question('  Underlying tension: ');
  example.format_participation = await question('  Format participation: ');
  example.editing_contribution = await question('  Editing contribution (or "none"): ');
  example.audience_surrogate = await question('  Audience surrogate (or "none"): ');
  example.social_dynamic = await question('  Social dynamic (or "none"): ');
  example.quality_assessment = await question('  Quality assessment: ');
  
  example.correct_interpretation = await question('\nCorrect interpretation (full): ');
  example.key_teaching = await question('Key teaching (what to learn): ');
  
  example.tags = (await question('Tags (comma-separated): ')).split(',').map(t => t.trim());
  example.humor_types = (await question('Humor types (comma-separated): ')).split(',').map(t => t.trim());
  
  return example;
}

/**
 * Build example from existing correction
 */
async function buildExampleFromCorrection(correction) {
  console.log(`\nBuilding example from: ${correction.video_summary?.substring(0, 60)}...\n`);
  
  const example = {
    video_summary: correction.video_summary,
    original_analysis: correction.gemini_interpretation || 'Original Gemini analysis',
    correct_interpretation: correction.correct_interpretation,
    key_teaching: correction.explanation,
    tags: correction.tags || [],
    humor_types: correction.humor_types || []
  };
  
  // Extract deep reasoning if available
  const htc = correction.humor_type_correction;
  if (htc?.deep_reasoning) {
    example.character_dynamic = htc.deep_reasoning.character_dynamic;
    example.underlying_tension = htc.deep_reasoning.underlying_tension;
    example.format_participation = htc.deep_reasoning.format_participation || 'none';
    example.editing_contribution = htc.deep_reasoning.editing_contribution || 'none';
    example.audience_surrogate = htc.deep_reasoning.audience_surrogate || 'none';
    example.social_dynamic = htc.deep_reasoning.social_dynamic || 'none';
    example.quality_assessment = htc.deep_reasoning.quality_assessment || 'Good premise';
  }
  
  // Fill in missing fields interactively
  console.log('Some fields are missing. Please provide:\n');
  
  if (!example.character_dynamic) {
    example.character_dynamic = await question('Character dynamic: ');
  }
  if (!example.underlying_tension) {
    example.underlying_tension = await question('Underlying tension: ');
  }
  if (!example.format_participation) {
    example.format_participation = await question('Format participation (or "none"): ');
  }
  
  return example;
}

/**
 * Generate TypeScript code for the example
 */
function generateTypeScriptCode(example) {
  return `{
  video_summary: "${example.video_summary.replace(/"/g, '\\"')}",
  original_analysis: "${example.original_analysis.replace(/"/g, '\\"')}",
  deep_reasoning: {
    character_dynamic: "${example.character_dynamic.replace(/"/g, '\\"')}",
    underlying_tension: "${example.underlying_tension.replace(/"/g, '\\"')}",
    format_participation: "${example.format_participation.replace(/"/g, '\\"')}",
    editing_contribution: "${example.editing_contribution.replace(/"/g, '\\"')}",
    audience_surrogate: "${example.audience_surrogate.replace(/"/g, '\\"')}",
    social_dynamic: "${example.social_dynamic.replace(/"/g, '\\"')}",
    quality_assessment: "${example.quality_assessment.replace(/"/g, '\\"')}"
  },
  correct_interpretation: "${example.correct_interpretation.replace(/"/g, '\\"')}",
  key_teaching: "${example.key_teaching.replace(/"/g, '\\"')}",
  tags: [${example.tags.map(t => `'${t}'`).join(', ')}],
  humor_types: [${example.humor_types.map(t => `'${t}'`).join(', ')}]
}`;
}

/**
 * Main
 */
async function main() {
  const videoId = process.argv.find(a => a.startsWith('--video-id='))?.split('=')[1];
  
  let example;
  
  if (videoId) {
    const correction = await fetchVideoCorrection(videoId);
    example = await buildExampleFromCorrection(correction);
  } else {
    example = await buildExampleInteractive();
  }
  
  // Generate code
  const code = generateTypeScriptCode(example);
  
  console.log('\n' + '═'.repeat(60));
  console.log('GENERATED TEACHING EXAMPLE');
  console.log('═'.repeat(60) + '\n');
  console.log(code);
  console.log('\n' + '═'.repeat(60));
  
  console.log('\nTO ADD THIS EXAMPLE:');
  console.log('1. Open: src/lib/services/video/deep-reasoning.ts');
  console.log('2. Find: SEED_DEEP_REASONING_EXAMPLES');
  console.log('3. Add this example to the array');
  console.log('4. Test with: node scripts/quick-iterate.js');
  console.log('5. If improvement > +3%, commit the change\n');
  
  const saveToFile = await question('Save to file for easy copy-paste? (y/n): ');
  
  if (saveToFile.toLowerCase() === 'y') {
    const outputPath = path.join(__dirname, '..', 'datasets', 'new_teaching_example.txt');
    fs.writeFileSync(outputPath, code);
    console.log(`\n✓ Saved to ${outputPath}`);
  }
  
  rl.close();
}

main().catch((err) => {
  console.error('Error:', err.message);
  rl.close();
  process.exit(1);
});
