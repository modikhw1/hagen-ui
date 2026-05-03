const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuration
const DATASET_PATH = path.join(__dirname, '../datasets/dataset_2025-12-18.json');
const OUTPUT_PATH = path.join(__dirname, '../datasets/replicability_dataset_2025-12-23.json');
const MODEL_NAME = 'gemini-2.0-flash';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('🚀 Starting Replicability Dataset Preparation...');

  if (!fs.existsSync(DATASET_PATH)) {
    console.error(`❌ Dataset not found at ${DATASET_PATH}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(DATASET_PATH, 'utf8');
  const dataset = JSON.parse(rawData);
  const videos = dataset.videos || [];

  console.log(`📦 Loaded ${videos.length} videos from dataset.`);

  const processedVideos = [];
  let processedCount = 0;

  for (const video of videos) {
    processedCount++;
    if (processedCount % 10 === 0) {
      console.log(`⏳ Processing video ${processedCount}/${videos.length}...`);
    }

    // 1. Gather Context
    const context = {
      id: video.id,
      url: video.video_url,
      general_notes: video.rating?.notes || '',
      replicability_structured: video.deep_analysis?.replicability || null,
      signals: {
        quality: video.deep_analysis?.quality_signals || {},
        execution: video.deep_analysis?.execution_signals || {},
        schema: video.deep_analysis?.schema_version || 'unknown'
      },
      metadata: {
        description: video.metadata?.description || '',
        transcript: video.deep_analysis?.transcript || ''
      }
    };

    // Skip if absolutely no data to work with
    if (!context.general_notes && !context.replicability_structured && !context.metadata.description) {
      console.log(`⚠️ Skipping video ${video.id} - No data available.`);
      continue;
    }

    // 2. Construct Prompt
    const prompt = `
You are an expert social media consultant analyzing a video for a business owner.
Your task is to extract and synthesize a "Replicability Analysis" based on the provided notes and metadata.

CONTEXT:
The user has a database of analyzed videos. 
- Historically, "General Notes" contained a mix of quality opinions AND replicability advice.
- Recently, a dedicated "Replicability" field was added.
- "Technical Signals" are automated metrics about the video.

YOUR GOAL:
Create a single, clean, neutral, professional paragraph describing the **replicability** of this video concept.

INPUT DATA:
---
General Notes (Mixed Bag):
"${context.general_notes}"

Structured Replicability Data (Newer):
${JSON.stringify(context.replicability_structured, null, 2)}

Technical Signals (Schema v1.1):
${JSON.stringify(context.signals, null, 2)}

Video Metadata:
Description: "${context.metadata.description}"
Transcript: "${context.metadata.transcript}"
---

INSTRUCTIONS:
1. **Synthesize**: Combine insights from the "General Notes" and "Structured Replicability Data".
2. **Filter**: Extract ONLY the advice related to *replicability* (difficulty, resources, acting skills, editing needs, cultural barriers).
3. **Neutralize**: Remove subjective quality judgments (e.g., "I think this is funny") unless they explain a replicability challenge (e.g., "The humor relies on perfect timing, which is hard to replicate").
4. **Enrich**: Use the "Technical Signals" to ground your analysis (e.g., if signals say "high production value", mention that it requires good equipment).
5. **Persona**: Write as a neutral advisor to a business owner.
6. **Output**: Return ONLY the analysis paragraph. If there is absolutely no information to form an opinion, return "N/A".
`;

    try {
      // 3. Call LLM
      const result = await model.generateContent(prompt);
      const response = result.response;
      const analysis = response.text().trim();

      if (analysis !== 'N/A') {
        processedVideos.push({
          video_id: video.id,
          original_data: {
            notes: context.general_notes,
            replicability: context.replicability_structured
          },
          signals: context.signals,
          replicability_analysis: analysis
        });
      }

    } catch (error) {
      console.error(`❌ Error processing video ${video.id}:`, error.message);
      // Continue to next video
    }
    
    // Rate limiting / Pause slightly to be nice to the API
    await sleep(10000); 
  }

  // 4. Save Result
  console.log(`✅ Finished processing. Saving ${processedVideos.length} entries...`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(processedVideos, null, 2));
  console.log(`💾 Saved to ${OUTPUT_PATH}`);
}

main().catch(console.error);
