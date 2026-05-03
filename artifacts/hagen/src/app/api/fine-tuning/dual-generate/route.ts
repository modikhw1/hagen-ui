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
const STAGING_FILE = path.join(DATASET_DIR, 'staging.jsonl');

// Gemini base model endpoint
const BASE_MODEL = 'gemini-2.0-flash-001';
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || '1061681256498';
const LOCATION = 'us-central1';

const ANALYSIS_PROMPT = `Analysera videon kort och koncist.

Format:
**Handling:** [En mening om vad som sker]
**Mekanism:** [Nyckelord: t.ex. Subversion, Igenkänning]
**Varför:** [En mening om poängen]
**Målgrupp:** [Specifik demografi/intresse]

Håll det extremt kort. Inget fluff.`;

interface DualAnalysisResult {
  tunedOutput: string;
  baseOutput: string;
  agreement: number;
  recommendAutoApprove: boolean;
  discrepancyFields: string[];
  gcsUri: string;
  url: string;
}

/**
 * Calculate agreement score between two analyses
 * Returns 0-100 based on structural and semantic similarity
 */
function calculateAgreement(tuned: string, base: string): { score: number; discrepancies: string[] } {
  const discrepancies: string[] = [];

  // Extract fields from both outputs
  const tunedFields = extractFields(tuned);
  const baseFields = extractFields(base);

  let matchScore = 0;
  let totalFields = 0;

  // Compare each field
  for (const field of ['handling', 'mekanism', 'varfor', 'malgrupp']) {
    totalFields++;
    const tunedValue = tunedFields[field] || '';
    const baseValue = baseFields[field] || '';

    if (!tunedValue && !baseValue) {
      matchScore += 0.5; // Both empty
    } else if (!tunedValue || !baseValue) {
      discrepancies.push(`${field}: One model didn't provide this field`);
    } else {
      // Calculate word overlap
      const overlap = calculateWordOverlap(tunedValue, baseValue);
      matchScore += overlap;

      if (overlap < 0.5) {
        discrepancies.push(`${field}: Low agreement (${Math.round(overlap * 100)}%)`);
      }
    }
  }

  // Check if mechanism keywords match
  const tunedMechanism = tunedFields.mekanism?.toLowerCase() || '';
  const baseMechanism = baseFields.mekanism?.toLowerCase() || '';
  const mechanismKeywords = ['subversion', 'igenkänning', 'överdrift', 'kontrast', 'ironi', 'absurd', 'timing'];

  const tunedKeywords = mechanismKeywords.filter(k => tunedMechanism.includes(k));
  const baseKeywords = mechanismKeywords.filter(k => baseMechanism.includes(k));

  if (tunedKeywords.length > 0 && baseKeywords.length > 0) {
    const keywordOverlap = tunedKeywords.filter(k => baseKeywords.includes(k)).length;
    if (keywordOverlap === 0) {
      discrepancies.push('mekanism: Different humor mechanisms identified');
    }
  }

  const score = Math.round((matchScore / totalFields) * 100);
  return { score, discrepancies };
}

/**
 * Extract structured fields from analysis text
 */
function extractFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {};

  const patterns = [
    { key: 'handling', pattern: /\*\*Handling:\*\*\s*(.+?)(?=\*\*|$)/is },
    { key: 'mekanism', pattern: /\*\*Mekanism:\*\*\s*(.+?)(?=\*\*|$)/is },
    { key: 'varfor', pattern: /\*\*Varför:\*\*\s*(.+?)(?=\*\*|$)/is },
    { key: 'malgrupp', pattern: /\*\*Målgrupp:\*\*\s*(.+?)(?=\*\*|$)/is },
  ];

  for (const { key, pattern } of patterns) {
    const match = text.match(pattern);
    if (match) {
      fields[key] = match[1].trim();
    }
  }

  return fields;
}

/**
 * Calculate word overlap between two strings (Jaccard similarity)
 */
function calculateWordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

/**
 * Call a Vertex AI model with video
 */
async function callModel(
  gcsUri: string,
  endpoint: string,
  token: string,
  prompt: string
): Promise<string> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
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
    throw new Error(`Model error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return result.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function POST(req: NextRequest) {
  let tempFilePath: string | null = null;
  let gcsUri: string | null = null;

  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'Missing URL' }, { status: 400 });

    // 1. Get Tuned Model endpoint
    if (!fs.existsSync(TUNED_MODEL_FILE)) {
      return NextResponse.json({
        error: 'Tuned model not found. Please wait for training to complete.'
      }, { status: 503 });
    }
    const modelInfo = JSON.parse(fs.readFileSync(TUNED_MODEL_FILE, 'utf-8'));
    const tunedEndpoint = modelInfo.endpoint || modelInfo.model;

    console.log(`🧪 Dual-generate: Comparing tuned vs base model`);

    // 2. Download Video
    const downloader = createVideoDownloader();
    const tempDir = os.tmpdir();
    console.log(`⬇️ Downloading video from ${url}...`);

    const downloadResult = await downloader.download(url, { outputDir: tempDir });

    if (!downloadResult.success) {
      throw new Error(downloadResult.error || 'Failed to download video');
    }

    tempFilePath = downloadResult.filePath ?? null;

    if (!tempFilePath || !fs.existsSync(tempFilePath)) {
      throw new Error('Download successful but file is missing');
    }

    // 3. Upload to GCS
    const storage = createVideoStorageService();
    const filename = `fine-tuning/dual/dual_${Date.now()}_${path.basename(tempFilePath)}`;
    console.log(`☁️ Uploading to GCS: ${filename}...`);

    gcsUri = await storage.upload(tempFilePath, filename);
    console.log(`✅ Uploaded to: ${gcsUri}`);

    // 4. Get auth token
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    // 5. Call BOTH models in parallel
    console.log('🤖 Calling both tuned and base models...');

    const tunedEndpointUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/${tunedEndpoint}:generateContent`;
    const baseEndpointUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${BASE_MODEL}:generateContent`;

    const [tunedOutput, baseOutput] = await Promise.all([
      callModel(gcsUri, tunedEndpointUrl, token.token!, ANALYSIS_PROMPT),
      callModel(gcsUri, baseEndpointUrl, token.token!, ANALYSIS_PROMPT)
    ]);

    console.log('✅ Both models responded');

    // 6. Calculate agreement
    const { score: agreement, discrepancies } = calculateAgreement(tunedOutput, baseOutput);
    const recommendAutoApprove = agreement >= 85 && discrepancies.length === 0;

    console.log(`📊 Agreement: ${agreement}%, Auto-approve: ${recommendAutoApprove}`);

    // 7. Cleanup temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    const result: DualAnalysisResult = {
      tunedOutput,
      baseOutput,
      agreement,
      recommendAutoApprove,
      discrepancyFields: discrepancies,
      gcsUri,
      url
    };

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Dual-generate error:', error);

    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (e) {}
    }

    return NextResponse.json({
      error: error.message || 'Internal Server Error'
    }, { status: 500 });
  }
}

/**
 * Save to staging dataset (for batch auto-approval)
 */
export async function PUT(req: NextRequest) {
  try {
    const { url, analysis, agreement, source = 'dual-auto' } = await req.json();

    if (!url || !analysis) {
      return NextResponse.json({ error: 'Missing url or analysis' }, { status: 400 });
    }

    const entry = {
      url,
      analysis,
      timestamp: new Date().toISOString(),
      source,
      agreement_score: agreement
    };

    // Append to staging file
    fs.appendFileSync(STAGING_FILE, JSON.stringify(entry) + '\n');

    return NextResponse.json({ success: true, saved: entry });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
