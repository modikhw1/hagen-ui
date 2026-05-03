const { createClient } = require('@supabase/supabase-js');
const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Configuration
const CONFIG = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  location: 'us-central1',
  endpointId: '5258813482559602688', // The deployed Endpoint ID
  datasetPath: path.join(__dirname, '../datasets/replicability_dataset_2025-12-23.json'),
  outputDocPath: path.join(__dirname, '../docs/REPLICABILITY_EVALUATION_v1.md'),
  sampleSize: 15
};

const ANALYSIS_PROMPT = `Analysera denna video ur ett replikerbarhetsperspektiv.
Bedöm hur enkelt eller svårt det är för ett företag att återskapa detta koncept.

Fokusera på:
1. Vad händer i videon? (Konkret beskrivning)
2. Vilka resurser krävs? (Plats, utrustning, personal)
3. Hur komplex är redigeringen?
4. Vad är svårighetsgraden för replikering?

Ge en neutral, strukturerad analys på svenska.`;

class ReplicabilityEvaluator {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
  }

  async getAccessToken() {
    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    return tokenResponse.token;
  }

  async predict(gcsUri) {
    const token = await this.getAccessToken();
    const endpoint = `https://${CONFIG.location}-aiplatform.googleapis.com/v1/projects/${CONFIG.projectId}/locations/${CONFIG.location}/endpoints/${CONFIG.endpointId}:predict`;

    const requestBody = {
      instances: [
        {
          content: ANALYSIS_PROMPT,
          mimeType: 'video/mp4',
          videoUri: gcsUri
        }
      ],
      // For Gemini models on Vertex AI, the format is slightly different than standard AutoML
      // We need to use the generateContent method for Gemini models, even tuned ones.
      // Let's try the generateContent endpoint for the tuned model.
    };

    // Correct endpoint for Gemini Tuned Models deployed to an Endpoint
    const projectNumber = '1061681256498';
    const geminiEndpoint = `https://${CONFIG.location}-aiplatform.googleapis.com/v1/projects/${projectNumber}/locations/${CONFIG.location}/endpoints/${CONFIG.endpointId}:generateContent`;

    const geminiBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: gcsUri,
                mimeType: "video/mp4"
              }
            },
            {
              text: ANALYSIS_PROMPT
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192,
      }
    };

    try {
      const response = await fetch(geminiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(geminiBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vertex AI Error (${response.status} ${response.statusText}): ${errorText}`);
      }

      const result = await response.json();
      
      if (result.candidates && result.candidates[0]) {
        const candidate = result.candidates[0];
        if (candidate.finishReason !== 'STOP') {
          console.warn(`Warning: Finish reason is ${candidate.finishReason}`);
        }
        if (candidate.content && candidate.content.parts && candidate.content.parts[0]) {
          return candidate.content.parts[0].text;
        }
      }
      return "Error: No content generated";
    } catch (error) {
      console.error("Prediction failed:", error);
      return `Error: ${error.message}`;
    }
  }

  async listModels() {
    const token = await this.getAccessToken();
    const projectNumber = '1061681256498';
    const endpoint = `https://${CONFIG.location}-aiplatform.googleapis.com/v1/projects/${projectNumber}/locations/${CONFIG.location}/models`;
    
    console.log(`Listing models from: ${endpoint}`);
    const response = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      console.error(`List Models Error: ${await response.text()}`);
      return;
    }
    
    const data = await response.json();
    console.log('Models found:', data.models ? data.models.map(m => m.name) : 'None');
    return data.models;
  }

  async runEvaluation() {
    await this.listModels(); // Debug step

    console.log('🚀 Starting Replicability Model Evaluation...');

    // 1. Load Dataset
    const rawData = JSON.parse(fs.readFileSync(CONFIG.datasetPath, 'utf8'));
    
    // 2. Filter for Verified (Testing on Gold Standard)
    const verified = rawData.filter(d => d.translation_status === 'verified');
    console.log(`Found ${verified.length} verified videos.`);

    // 3. Sample
    const sample = verified.slice(0, 8); // Take first 8 verified to ensure we get 4 valid ones
    console.log(`Selected ${sample.length} verified samples for evaluation.`);

    // 4. Get GCS URIs
    const videoIds = sample.map(s => s.video_id);
    const { data: videos, error } = await this.supabase
      .from('analyzed_videos')
      .select('id, video_url, gcs_uri')
      .in('id', videoIds);

    if (error) throw error;

    const videoMap = new Map(videos.map(v => [v.id, v]));

    // 5. Generate Report Content
    let reportContent = `# Replicability Model Evaluation (v1)
Date: ${new Date().toISOString().split('T')[0]}
Model: ${CONFIG.endpointId}
Sample Size: ${sample.length}

| Video ID | Status |
|----------|--------|
`;

    // 6. Process each sample
    for (const entry of sample) {
      const videoInfo = videoMap.get(entry.video_id);
      
      if (!videoInfo || !videoInfo.gcs_uri) {
        console.warn(`Skipping ${entry.video_id}: No GCS URI found.`);
        continue;
      }

      console.log(`\nAnalyzing ${entry.video_id}...`);
      
      const modelAnalysis = await this.predict(videoInfo.gcs_uri);
      const currentPlaceholder = entry.replicability_analysis || "(No analysis)";

      reportContent += `
## Video: ${entry.video_id}
**Link:** [TikTok/Video](${videoInfo.video_url})
**GCS:** \`${videoInfo.gcs_uri}\`

### � Gold Standard (Verified)
> ${currentPlaceholder.replace(/\n/g, '\n> ')}

### 🤖 Tuned Model Analysis
${modelAnalysis}

---
`;
    }

    // 7. Write Report
    fs.writeFileSync(CONFIG.outputDocPath, reportContent);
    console.log(`\n✅ Evaluation complete! Report saved to ${CONFIG.outputDocPath}`);
  }
}

// Run
const evaluator = new ReplicabilityEvaluator();
evaluator.runEvaluation().catch(console.error);
