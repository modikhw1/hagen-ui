const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Test URLs with user notes for ground truth
const TEST_CASES = [
  {
    url: "https://www.tiktok.com/@feildensarmsmellor/video/7556722838745435414",
    shortName: "3-year-old-coffee",
    pattern: "literal_hyperbole",
    groundTruth: "Hyperbole 'tastes like 3-year-old made it' is literally true - actual 3-year-old child made the coffee"
  },
  {
    url: "https://www.tiktok.com/@hilltop.creamery/video/7554453946949979405",
    shortName: "97-year-old-icecream",
    pattern: "literal_hyperbole",
    groundTruth: "Same pattern but with sympathy twist - 97-year-old responds 'I'm doing my best'"
  },
  {
    url: "https://www.tiktok.com/@chefofthepartie/video/7560018996787957014",
    shortName: "creature-hunt-beer",
    pattern: "expectation_subversion",
    groundTruth: "NOT a hunt - responsible action toward 'found' animal, beer reveal adds silliness"
  },
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
  }
];

const MODEL_VERSIONS = path.join(process.cwd(), 'datasets/fine-tuning/model_versions.json');

async function getModelEndpoint(version) {
  const versions = JSON.parse(fs.readFileSync(MODEL_VERSIONS, 'utf-8'));
  return versions.versions[version]?.endpoint;
}

async function analyzeVideo(url, version, auth) {
  const endpoint = await getModelEndpoint(version);
  if (!endpoint) throw new Error(`No endpoint for ${version}`);

  // For this test, we'll use the generate API directly
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  // Download video first
  const { createVideoDownloader } = require('../src/lib/services/video/downloader');
  const { createVideoStorageService } = require('../src/lib/services/video/storage');

  const downloader = createVideoDownloader();
  const tempDir = os.tmpdir();

  console.log(`  Downloading: ${url.substring(0, 50)}...`);
  const downloadResult = await downloader.download(url, { outputDir: tempDir });

  if (!downloadResult.success) {
    return { error: downloadResult.error };
  }

  const tempFilePath = downloadResult.filePath;

  // Upload to GCS
  const storage = createVideoStorageService();
  const filename = `fine-tuning/compare/compare_${Date.now()}_${path.basename(tempFilePath)}`;
  const gcsUri = await storage.upload(tempFilePath, filename);

  // Call model
  const apiEndpoint = `https://us-central1-aiplatform.googleapis.com/v1/${endpoint}:generateContent`;

  const prompt = `Analysera videon. Hitta den faktiska poängen - inte bara beskriv scenen.

Format:
**Observation:** [Vad i videon stödjer din tolkning? Specifika visuella/auditiva detaljer.]
**Handling:** [Vad händer och varför det är poängen.]
**Mekanism:** [Vilken humormekanism används]
**Varför:** [Varför det fungerar.]
**Målgrupp:** [Vem uppskattar detta]`;

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { fileData: { mimeType: 'video/mp4', fileUri: gcsUri } },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    })
  });

  // Cleanup
  if (fs.existsSync(tempFilePath)) {
    fs.unlinkSync(tempFilePath);
  }

  if (!response.ok) {
    const errorText = await response.text();
    return { error: `API Error: ${response.status} - ${errorText}` };
  }

  const result = await response.json();
  const analysis = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis';

  return { analysis };
}

async function runComparison() {
  console.log('='.repeat(80));
  console.log('MODEL COMPARISON: v6 vs v7.B');
  console.log('='.repeat(80));
  console.log(`Testing ${TEST_CASES.length} videos with user-provided ground truth\n`);

  const auth = new GoogleAuth({
    keyFile: './credentials/gen-lang-client-0853618366-8c06f8b7a2d1.json',
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });

  const results = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];
    console.log(`\n[${ i + 1}/${TEST_CASES.length}] ${testCase.shortName} (${testCase.pattern})`);
    console.log('-'.repeat(60));
    console.log(`Ground Truth: ${testCase.groundTruth}`);
    console.log('-'.repeat(60));

    try {
      // Get v6 analysis
      console.log('\n  Analyzing with v6...');
      const v6Result = await analyzeVideo(testCase.url, 'v6', auth);

      // Get v7.B analysis
      console.log('  Analyzing with v7.B...');
      const v7Result = await analyzeVideo(testCase.url, 'v7.B', auth);

      results.push({
        ...testCase,
        v6: v6Result.analysis || v6Result.error,
        v7B: v7Result.analysis || v7Result.error
      });

      console.log('\n  V6 Analysis:');
      console.log('  ' + (v6Result.analysis || v6Result.error).substring(0, 200) + '...');
      console.log('\n  V7.B Analysis:');
      console.log('  ' + (v7Result.analysis || v7Result.error).substring(0, 200) + '...');

    } catch (e) {
      console.error(`  Error: ${e.message}`);
      results.push({
        ...testCase,
        v6: 'ERROR',
        v7B: 'ERROR',
        error: e.message
      });
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 2000));
  }

  // Save results
  const outputPath = path.join(process.cwd(), 'datasets/fine-tuning/model-comparison-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n\nResults saved to: ${outputPath}`);
}

runComparison().catch(console.error);
