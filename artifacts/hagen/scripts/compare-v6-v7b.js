const fs = require('fs');
const path = require('path');

// Test cases with user notes for ground truth
const TEST_CASES = [
  {
    url: "https://www.tiktok.com/@elbirria_stockholm/video/7577452267595386134",
    shortName: "take-your-time",
    pattern: "tone_dependent",
    groundTruth: "NOT malicious compliance - playful/absurdist with soft inviting tone"
  },
  {
    url: "https://www.tiktok.com/@gelaterrasi/video/7524422534284971319",
    shortName: "rigged-bottle-flip",
    pattern: "social_invitation_violation",
    groundTruth: "Fun game invitation violated with meanness by physically hitting bottle away"
  },
  {
    url: "https://www.tiktok.com/@mayankingdomcoffee/video/7565658185856552206",
    shortName: "colleague-gets-extra",
    pattern: "coherent_absurdist_world",
    groundTruth: "Frames business as nonchalant dream-like place where no rules apply"
  },
  {
    url: "https://www.tiktok.com/@afrikanakitchen/video/7577002671932984598",
    shortName: "tip-pov-flip",
    pattern: "cinematic_interiority",
    groundTruth: "POV + sound perspective implies internal thoughts - but revealed to be cashier's, not customer's"
  },
  {
    url: "https://www.tiktok.com/@restaurangsobi/video/7559591650998095126",
    shortName: "tack-detsamma",
    pattern: "social_script_absurdist",
    groundTruth: "NOT exploitation - absurdist playing along, like person who doesn't understand social boundaries"
  },
  {
    url: "https://www.tiktok.com/@haddonfieldbistro/video/7564452004408364301",
    shortName: "waitress-hammer",
    pattern: "absurdist_frustration",
    groundTruth: "NOT tool threat - absurdist reaction to frustration after service rejection then blamed"
  },
  {
    url: "https://www.tiktok.com/@libertineburger/video/7327696242266393888",
    shortName: "regular-walks-past",
    pattern: "empathetic_humor",
    groundTruth: "Viewer feels slightly bad for server - hopeful gesture falls flat"
  },
  {
    url: "https://www.tiktok.com/@sweethousehelsingborg/video/7557658112619007254",
    shortName: "pays-with-her-card",
    pattern: "character_framing",
    groundTruth: "Frames man as STUPID, not just inversion - he thinks he's being clever"
  },
  {
    url: "https://www.tiktok.com/@stevespokebar/video/7537899692592549126",
    shortName: "hurry-chant",
    pattern: "petty_theater",
    groundTruth: "Strange clapping, mean-spirited undertone - pettiness and ineffective action"
  },
  {
    url: "https://www.tiktok.com/@chefofthepartie/video/7560018996787957014",
    shortName: "creature-hunt-beer",
    pattern: "expectation_subversion",
    groundTruth: "NOT a hunt - responsible action toward 'found' animal, beer reveal adds silliness"
  },
  {
    url: "https://www.tiktok.com/@vi0la.pizza/video/7568503018015034642",
    shortName: "pizza-not-finished",
    pattern: "tone_reveals_world",
    groundTruth: "Chef's funny small scream like a bird (not aggressive) - shows cultural expectations clash"
  },
  {
    url: "https://www.tiktok.com/@staxburgerco/video/7586559354548079892",
    shortName: "elderly-makes-own",
    pattern: "performance_dependent",
    groundTruth: "Funny because of acting quality and escalating wildness - performance is key"
  }
];

async function analyzeWithVersion(url, version) {
  try {
    const response = await fetch('http://localhost:3000/api/fine-tuning/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, version, mode: 'balanced' })
    });

    if (!response.ok) {
      const error = await response.text();
      return { error: `HTTP ${response.status}: ${error}` };
    }

    const data = await response.json();
    return { analysis: data.analysis, model: data.model };
  } catch (e) {
    return { error: e.message };
  }
}

async function runComparison() {
  console.log('='.repeat(80));
  console.log('MODEL COMPARISON: v6 vs v7.B');
  console.log('='.repeat(80));
  console.log(`Testing ${TEST_CASES.length} videos with user-provided ground truth\n`);

  const results = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];
    console.log(`\n[${i + 1}/${TEST_CASES.length}] ${testCase.shortName}`);
    console.log(`Pattern: ${testCase.pattern}`);
    console.log(`Ground Truth: ${testCase.groundTruth}`);
    console.log('-'.repeat(60));

    // Get v6 analysis
    console.log('  Analyzing with v6...');
    const v6Result = await analyzeWithVersion(testCase.url, 'v6');

    // Wait a bit between requests
    await new Promise(r => setTimeout(r, 3000));

    // Get v7.B analysis
    console.log('  Analyzing with v7.B...');
    const v7Result = await analyzeWithVersion(testCase.url, 'v7.B');

    results.push({
      ...testCase,
      v6: v6Result.analysis || v6Result.error,
      v7B: v7Result.analysis || v7Result.error
    });

    // Print summaries
    if (v6Result.analysis) {
      const v6Lines = v6Result.analysis.split('\n').slice(0, 3).join('\n');
      console.log('\n  V6:', v6Lines.substring(0, 150) + '...');
    } else {
      console.log('\n  V6 Error:', v6Result.error);
    }

    if (v7Result.analysis) {
      const v7Lines = v7Result.analysis.split('\n').slice(0, 3).join('\n');
      console.log('  V7.B:', v7Lines.substring(0, 150) + '...');
    } else {
      console.log('  V7.B Error:', v7Result.error);
    }

    // Rate limit between videos
    if (i < TEST_CASES.length - 1) {
      console.log('\n  Waiting before next video...');
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Save full results
  const outputPath = path.join(process.cwd(), 'datasets/fine-tuning/model-comparison-v6-v7b.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Results saved to: ${outputPath}`);
  console.log('='.repeat(80));
}

runComparison().catch(console.error);
