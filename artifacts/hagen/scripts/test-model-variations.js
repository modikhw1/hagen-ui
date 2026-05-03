/**
 * Test Model Variations
 *
 * Tests the fine-tuned model with different configurations to see
 * which combinations catch the intended humor vs miss the point.
 *
 * Variations tested:
 * 1. Video compression (original, medium, low quality)
 * 2. Prompt mode (concise, balanced, detailed)
 * 3. Temperature (0.3, 0.7, 1.0)
 * 4. Max output tokens (512, 2048, 8192)
 *
 * Usage: node scripts/test-model-variations.js <tiktok-url>
 */

const { GoogleAuth } = require('google-auth-library');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Config
const MODEL_VERSIONS_FILE = path.join(process.cwd(), 'datasets/fine-tuning/model_versions.json');
const RESULTS_FILE = path.join(process.cwd(), 'datasets/fine-tuning/variation-test-results.json');

// GCS bucket
const GCS_BUCKET = 'hagen-video-analysis';

// Prompts
const PROMPTS = {
  concise: `Analysera videon kort och koncist.

Format:
**Handling:** [En mening om vad som sker]
**Mekanism:** [Nyckelord: t.ex. Subversion, Igenkänning]
**Varför:** [En mening om poängen]
**Målgrupp:** [Specifik demografi/intresse]

Håll det extremt kort. Inget fluff.`,

  balanced: `Analysera videon. Hitta den faktiska poängen - inte bara beskriv scenen.

Format:
**Observation:** [Vad i videon stödjer din tolkning? Specifika visuella/auditiva detaljer.]
**Handling:** [Vad händer och varför det är poängen. Längden ska matcha innehållet - kort om det är enkelt, längre om detaljer är relevanta för förståelsen.]
**Mekanism:** [Vilken humormekanism används]
**Varför:** [Varför det fungerar. Om det finns nyanser värda att förklara, ta med dem.]
**Målgrupp:** [Vem uppskattar detta]

Fokusera på att fånga rätt tolkning. Om ordlek eller flertydighet finns, kontrollera visuella ledtrådar för att avgöra vilken tolkning som gäller.`,

  detailed: `Analysera denna video. Förklara vad som händer och varför det är roligt eller effektivt.

Fokusera på:
1. Vad händer i videon? (Konkret beskrivning)
2. Vad är humormekanismen? (Subversion, timing, kontrast, etc.)
3. Varför fungerar det? (Psykologisk/social förklaring)
4. Vem uppskattar detta? (Målgrupp)`,

  reasoning: `Analysera videon steg för steg.

**Steg 1 - Vad ser/hör jag:**
Lista alla visuella och auditiva element. Var specifik om ljud - är samma ljud upprepat? Olika ljud?

**Steg 2 - Möjliga tolkningar:**
Lista 2-3 möjliga förklaringar till vad humorn kan vara.

**Steg 3 - Evidenskoll:**
Vilken tolkning har mest stöd i vad du faktiskt ser/hör?

**Steg 4 - Slutsats:**
**Handling:** [Vad händer]
**Mekanism:** [Vilken teknik]
**Varför:** [Varför det fungerar]
**Målgrupp:** [Vem uppskattar det]`
};

// Helper: spawn async
function spawnAsync(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { shell: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Exit code ${code}: ${stderr || stdout}`));
    });
    proc.on('error', reject);
  });
}

// Download video
async function downloadVideo(url, outputPath) {
  const pythonPath = process.platform === 'win32'
    ? `${process.env.LOCALAPPDATA}\\Programs\\Python\\Python314\\python.exe`
    : 'python3';

  const args = [
    '-m', 'yt_dlp',
    '--no-cache-dir',
    '--no-playlist',
    '--format', 'best[ext=mp4]/best',
    '--output', outputPath,
    '--no-warnings',
    url
  ];

  console.log(`📥 Downloading video...`);
  await spawnAsync(pythonPath, args);
  return outputPath;
}

// Compress video with ffmpeg
async function compressVideo(inputPath, outputPath, quality) {
  const ffmpegPath = 'ffmpeg';

  let args;
  switch (quality) {
    case 'low':
      // 360p, low bitrate
      args = ['-i', inputPath, '-vf', 'scale=640:-2', '-b:v', '500k', '-b:a', '64k', '-y', outputPath];
      break;
    case 'medium':
      // 480p, medium bitrate
      args = ['-i', inputPath, '-vf', 'scale=854:-2', '-b:v', '1000k', '-b:a', '128k', '-y', outputPath];
      break;
    case 'high':
    default:
      // Keep original, just re-encode for consistency
      args = ['-i', inputPath, '-c:v', 'copy', '-c:a', 'copy', '-y', outputPath];
      break;
  }

  console.log(`🎬 Compressing to ${quality} quality...`);
  await spawnAsync(ffmpegPath, args);
  return outputPath;
}

// Upload to GCS
async function uploadToGCS(filePath, gcsPath) {
  const { Storage } = require('@google-cloud/storage');
  const storage = new Storage();

  console.log(`☁️ Uploading to GCS: ${gcsPath}...`);
  await storage.bucket(GCS_BUCKET).upload(filePath, {
    destination: gcsPath,
    metadata: { contentType: 'video/mp4' }
  });

  return `gs://${GCS_BUCKET}/${gcsPath}`;
}

// Get model resource
function getModelResource(version) {
  const versions = JSON.parse(fs.readFileSync(MODEL_VERSIONS_FILE, 'utf-8'));
  const targetVersion = version || versions.default || 'v6';
  const modelInfo = versions.versions?.[targetVersion];
  return modelInfo?.endpoint || modelInfo?.model;
}

// Call Vertex AI
async function analyzeVideo(gcsUri, prompt, temperature, maxTokens) {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const resourceName = getModelResource('v6');
  const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/${resourceName}:generateContent`;

  const response = await fetch(endpoint, {
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
        temperature: temperature,
        maxOutputTokens: maxTokens
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vertex AI Error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return {
    text: result.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis',
    finishReason: result.candidates?.[0]?.finishReason,
    tokenCount: result.usageMetadata?.candidatesTokenCount || 0
  };
}

// Main test runner
async function runTests(url) {
  const tempDir = os.tmpdir();
  const timestamp = Date.now();
  const results = {
    url,
    timestamp: new Date().toISOString(),
    variations: []
  };

  try {
    // 1. Download original video
    const originalPath = path.join(tempDir, `test_original_${timestamp}.mp4`);
    await downloadVideo(url, originalPath);

    // 2. Create compressed versions
    const videoVersions = {
      high: originalPath,
      medium: path.join(tempDir, `test_medium_${timestamp}.mp4`),
      low: path.join(tempDir, `test_low_${timestamp}.mp4`)
    };

    // Check if ffmpeg is available
    let hasFFmpeg = true;
    try {
      await spawnAsync('ffmpeg', ['-version']);
    } catch {
      console.log('⚠️ FFmpeg not found, skipping compression tests');
      hasFFmpeg = false;
    }

    if (hasFFmpeg) {
      await compressVideo(originalPath, videoVersions.medium, 'medium');
      await compressVideo(originalPath, videoVersions.low, 'low');
    }

    // 3. Upload videos to GCS
    const gcsUris = {};
    for (const [quality, filePath] of Object.entries(videoVersions)) {
      if (fs.existsSync(filePath)) {
        const gcsPath = `variation-tests/${timestamp}_${quality}.mp4`;
        gcsUris[quality] = await uploadToGCS(filePath, gcsPath);
      }
    }

    // 4. Define test variations
    const variations = [
      // Test prompt modes with default settings
      { name: 'concise-default', gcsUri: gcsUris.high, prompt: 'concise', temp: 0.7, tokens: 8192 },
      { name: 'balanced-default', gcsUri: gcsUris.high, prompt: 'balanced', temp: 0.7, tokens: 8192 },
      { name: 'detailed-default', gcsUri: gcsUris.high, prompt: 'detailed', temp: 0.7, tokens: 8192 },
      { name: 'reasoning-chain', gcsUri: gcsUris.high, prompt: 'reasoning', temp: 0.7, tokens: 8192 },

      // Test temperature variations
      { name: 'balanced-temp-low', gcsUri: gcsUris.high, prompt: 'balanced', temp: 0.3, tokens: 8192 },
      { name: 'balanced-temp-high', gcsUri: gcsUris.high, prompt: 'balanced', temp: 1.0, tokens: 8192 },

      // Test token limits (does limiting tokens hurt quality?)
      { name: 'balanced-tokens-512', gcsUri: gcsUris.high, prompt: 'balanced', temp: 0.7, tokens: 512 },
      { name: 'balanced-tokens-2048', gcsUri: gcsUris.high, prompt: 'balanced', temp: 0.7, tokens: 2048 },

      // Test compression (if available)
      ...(gcsUris.medium ? [{ name: 'balanced-medium-quality', gcsUri: gcsUris.medium, prompt: 'balanced', temp: 0.7, tokens: 8192 }] : []),
      ...(gcsUris.low ? [{ name: 'balanced-low-quality', gcsUri: gcsUris.low, prompt: 'balanced', temp: 0.7, tokens: 8192 }] : [])
    ];

    // 5. Run each variation
    console.log(`\n🧪 Running ${variations.length} test variations...\n`);

    for (let i = 0; i < variations.length; i++) {
      const v = variations[i];
      console.log(`\n[${ i + 1}/${variations.length}] Testing: ${v.name}`);
      console.log(`   Prompt: ${v.prompt}, Temp: ${v.temp}, MaxTokens: ${v.tokens}`);

      try {
        const startTime = Date.now();
        const result = await analyzeVideo(v.gcsUri, PROMPTS[v.prompt], v.temp, v.tokens);
        const duration = Date.now() - startTime;

        results.variations.push({
          name: v.name,
          config: { prompt: v.prompt, temperature: v.temp, maxTokens: v.tokens, quality: v.gcsUri.includes('medium') ? 'medium' : v.gcsUri.includes('low') ? 'low' : 'high' },
          output: result.text,
          tokenCount: result.tokenCount,
          finishReason: result.finishReason,
          durationMs: duration
        });

        console.log(`   ✅ Done (${result.tokenCount} tokens, ${duration}ms)`);
        console.log(`   Preview: ${result.text.substring(0, 100)}...`);

        // Small delay between requests
        await new Promise(r => setTimeout(r, 1000));

      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        results.variations.push({
          name: v.name,
          config: { prompt: v.prompt, temperature: v.temp, maxTokens: v.tokens },
          error: error.message
        });
      }
    }

    // 6. Save results
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    console.log(`\n📊 Results saved to: ${RESULTS_FILE}`);

    // 7. Print summary
    console.log('\n' + '='.repeat(80));
    console.log('RESULTS SUMMARY');
    console.log('='.repeat(80));

    for (const r of results.variations) {
      if (r.error) {
        console.log(`\n❌ ${r.name}: ERROR - ${r.error}`);
        continue;
      }

      console.log(`\n📋 ${r.name}`);
      console.log(`   Config: temp=${r.config.temperature}, tokens=${r.config.maxTokens}, quality=${r.config.quality || 'high'}`);
      console.log(`   Output tokens: ${r.tokenCount}, Time: ${r.durationMs}ms`);
      console.log('-'.repeat(60));
      console.log(r.output);
      console.log('-'.repeat(60));
    }

    // 8. Cleanup temp files
    for (const filePath of Object.values(videoVersions)) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Entry point
const url = process.argv[2];
if (!url) {
  console.log('Usage: node scripts/test-model-variations.js <tiktok-url>');
  console.log('Example: node scripts/test-model-variations.js https://www.tiktok.com/@user/video/123');
  process.exit(1);
}

runTests(url);
