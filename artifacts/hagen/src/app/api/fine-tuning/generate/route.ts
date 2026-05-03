import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';
import { createVideoDownloader } from '@/lib/services/video/downloader';
import { createVideoStorageService } from '@/lib/services/video/storage';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configuration
const DATASET_DIR = path.join(process.cwd(), 'datasets/fine-tuning');
const TUNED_MODEL_FILE = path.join(DATASET_DIR, 'tuned_model.json');
const MODEL_VERSIONS_FILE = path.join(DATASET_DIR, 'model_versions.json');

// Load model version config
function getModelResource(version?: string): { resourceName: string; versionUsed: string } {
  // Try new versioned config first
  if (fs.existsSync(MODEL_VERSIONS_FILE)) {
    const versions = JSON.parse(fs.readFileSync(MODEL_VERSIONS_FILE, 'utf-8'));
    const targetVersion = version || versions.default || versions.latest;
    const modelInfo = versions.versions?.[targetVersion];

    if (modelInfo?.endpoint || modelInfo?.model) {
      return {
        resourceName: modelInfo.endpoint || modelInfo.model,
        versionUsed: targetVersion
      };
    }
  }

  // Fallback to legacy single model file
  if (fs.existsSync(TUNED_MODEL_FILE)) {
    const modelInfo = JSON.parse(fs.readFileSync(TUNED_MODEL_FILE, 'utf-8'));
    return {
      resourceName: modelInfo.endpoint || modelInfo.model,
      versionUsed: 'legacy'
    };
  }

  throw new Error('No tuned model found. Please wait for training to complete.');
}

export async function POST(req: NextRequest) {
  let tempFilePath: string | null = null;
  let gcsUri: string | null = null;

  try {
    const { url, mode = 'concise', version, temperature = 0.7, maxTokens = 8192, customPrompt, textOnly } = await req.json();

    // Text-only mode: use base Gemini for text completion (no video)
    if (textOnly && customPrompt) {
      console.log('📝 Text-only mode: using base Gemini...');

      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
      const client = await auth.getClient();
      const token = await client.getAccessToken();

      // Use base Gemini model for text-only tasks
      const endpoint = 'https://us-central1-aiplatform.googleapis.com/v1/projects/gen-lang-client-0853618366/locations/us-central1/publishers/google/models/gemini-2.0-flash-001:generateContent';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: customPrompt }]
          }],
          generationConfig: {
            temperature: temperature,
            maxOutputTokens: maxTokens
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini Error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const analysis = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis generated';

      return NextResponse.json({
        analysis,
        model: 'gemini-2.0-flash-001',
        version: 'base-text-only'
      });
    }

    if (!url) return NextResponse.json({ error: 'Missing URL' }, { status: 400 });

    // 1. Get Tuned Model ID
    const { resourceName, versionUsed } = getModelResource(version); 

    console.log(`🧪 Using model version: ${versionUsed}`);
    console.log(`🧪 Using Vertex AI resource: ${resourceName}`);

    // 2. Download Video
    const downloader = createVideoDownloader();
    const tempDir = os.tmpdir();
    console.log(`⬇️ Downloading video from ${url}...`);
    
    const downloadResult = await downloader.download(url, { outputDir: tempDir });
    
    if (!downloadResult.success) {
      console.error('Download failed details:', downloadResult.error);
      // Clean up error message for UI
      const errorMessage = downloadResult.error?.includes('100004') 
        ? 'TikTok blocked the download (Region/Bot protection). Try another video.' 
        : downloadResult.error || 'Failed to download video';
      throw new Error(errorMessage);
    }

    tempFilePath = downloadResult.filePath ?? null;
    
    if (!tempFilePath || !fs.existsSync(tempFilePath)) {
      throw new Error('Download appeared successful but file is missing');
    }

    // 3. Upload to GCS
    const storage = createVideoStorageService();
    const filename = `fine-tuning/lab/lab_${Date.now()}_${path.basename(tempFilePath)}`;
    console.log(`☁️ Uploading to GCS: ${filename}...`);
    
    gcsUri = await storage.upload(tempFilePath, filename);
    console.log(`✅ Uploaded to: ${gcsUri}`);

    // 4. Call Tuned Model (via Vertex AI REST API)
    console.log('🤖 Generating analysis via Vertex AI...');
    
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/${resourceName}:generateContent`;
    
    const PROMPT_DETAILED = `Analysera denna video. Förklara vad som händer och varför det är roligt eller effektivt.

Fokusera på:
1. Vad händer i videon? (Konkret beskrivning)
2. Vad är humormekanismen? (Subversion, timing, kontrast, etc.)
3. Varför fungerar det? (Psykologisk/social förklaring)
4. Vem uppskattar detta? (Målgrupp)`;

    const PROMPT_CONCISE = `Analysera videon kort och koncist.

Format:
**Handling:** [En mening om vad som sker]
**Mekanism:** [Nyckelord: t.ex. Subversion, Igenkänning]
**Varför:** [En mening om poängen]
**Målgrupp:** [Specifik demografi/intresse]

Håll det extremt kort. Inget fluff.`;

    const PROMPT_BALANCED = `Analysera videon. Hitta den faktiska poängen - inte bara beskriv scenen.

Format:
**Observation:** [Vad i videon stödjer din tolkning? Specifika visuella/auditiva detaljer.]
**Handling:** [Vad händer och varför det är poängen. Längden ska matcha innehållet - kort om det är enkelt, längre om detaljer är relevanta för förståelsen.]
**Mekanism:** [Vilken humormekanism används]
**Varför:** [Varför det fungerar. Om det finns nyanser värda att förklara, ta med dem.]
**Målgrupp:** [Vem uppskattar detta]

Fokusera på att fånga rätt tolkning. Om ordlek eller flertydighet finns, kontrollera visuella ledtrådar för att avgöra vilken tolkning som gäller.`;

    const prompt = customPrompt || (mode === 'detailed' ? PROMPT_DETAILED : mode === 'balanced' ? PROMPT_BALANCED : PROMPT_CONCISE);

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
      throw new Error(`Vertex AI Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log('🏁 Finish Reason:', result.candidates?.[0]?.finishReason);
    
    // Extract text from Vertex AI response structure
    // Usually: candidates[0].content.parts[0].text
    const analysis = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis generated';

    // 5. Cleanup
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return NextResponse.json({
      analysis,
      gcsUri,
      model: resourceName.split('/').pop()?.split('@')[0] || 'unknown',
      version: versionUsed
    });

  } catch (error: any) {
    console.error('Generation error:', error);
    
    // Cleanup on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (e) {}
    }

    return NextResponse.json({ 
      error: error.message || 'Internal Server Error',
      details: error.toString()
    }, { status: 500 });
  }
}
