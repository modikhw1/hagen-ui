const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: '.env.local' });

const DATASET_PATH = path.join(__dirname, '../datasets/replicability_dataset_2025-12-23.json');
const MODEL_NAME = 'gemini-2.0-flash';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Heuristic to detect if text is Swedish
const isSwedish = (text) => {
  if (!text) return false;
  const swedishWords = [' och ', ' är ', ' en ', ' ett ', ' att ', ' det ', ' i ', ' på ', ' med ', ' som '];
  const englishWords = [' and ', ' is ', ' a ', ' an ', ' that ', ' it ', ' in ', ' on ', ' with ', ' as '];
  
  const swedishScore = swedishWords.filter(w => text.toLowerCase().includes(w)).length;
  const englishScore = englishWords.filter(w => text.toLowerCase().includes(w)).length;
  
  return swedishScore > englishScore;
};

async function main() {
  console.log('🚀 Starting Batch Translation with Style Transfer...');

  if (!fs.existsSync(DATASET_PATH)) {
    console.error(`❌ Dataset not found at ${DATASET_PATH}`);
    process.exit(1);
  }

  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
  
  // 1. Identify existing Swedish entries (The "Gold Standard")
  const goldStandard = [];
  const toProcess = [];

  dataset.forEach(entry => {
    // Check if already marked or detect language
    const isVerified = entry.translation_status === 'verified' || entry.translation_status === 'manual-lab';
    
    if (isVerified || isSwedish(entry.replicability_analysis)) {
      // Mark as verified if not already
      if (!entry.translation_status) {
        entry.translation_status = 'verified'; // Assuming existing Swedish ones are from the lab
      }
      goldStandard.push(entry);
    } else {
      toProcess.push(entry);
    }
  });

  console.log(`📊 Found ${goldStandard.length} existing Swedish analyses (Gold Standard).`);
  console.log(`📊 Found ${toProcess.length} entries to translate.`);

  if (goldStandard.length === 0) {
    console.error("❌ No Swedish examples found to use as style guide. Aborting.");
    process.exit(1);
  }

  // 2. Prepare Style Guide (Pick 3 random good examples)
  const examples = goldStandard
    .sort(() => 0.5 - Math.random())
    .slice(0, 3)
    .map(e => e.replicability_analysis)
    .join('\n\n---\n\n');

  console.log('🎨 Using the following style examples:\n', examples.substring(0, 200) + '...');

  // 3. Process the rest
  let processedCount = 0;

  for (const entry of toProcess) {
    processedCount++;
    console.log(`⏳ Processing ${processedCount}/${toProcess.length}: ${entry.video_id}`);

    const prompt = `
You are an expert translator and data analyst. 
Your task is to translate a video replicability analysis from English to Swedish.

CRITICAL INSTRUCTION:
You must mimic the style, tone, and structure of the provided SWEDISH EXAMPLES.
The tone should be neutral, objective, and professional.

SWEDISH STYLE EXAMPLES (Do not translate these, just copy their style):
---
${examples}
---

INPUT TEXT (English):
${entry.replicability_analysis}

ORIGINAL NOTES (Context only, do not translate):
${entry.original_data.notes}

OUTPUT (Swedish translation in the requested style):
`;

    try {
      const result = await model.generateContent(prompt);
      const translatedText = result.response.text().trim();

      // Update entry
      entry.replicability_analysis = translatedText;
      entry.translation_status = 'auto-generated'; // Mark as auto-generated
      entry.translation_source_model = MODEL_NAME;

    } catch (error) {
      console.error(`❌ Error processing ${entry.video_id}:`, error.message);
      // Wait a bit longer on error
      await sleep(2000);
    }

    // Rate limiting
    await sleep(1000);

    // Save periodically (every 10 items)
    if (processedCount % 10 === 0) {
      fs.writeFileSync(DATASET_PATH, JSON.stringify(dataset, null, 2));
      console.log('💾 Intermediate save.');
    }
  }

  // Final Save
  fs.writeFileSync(DATASET_PATH, JSON.stringify(dataset, null, 2));
  console.log(`✅ Finished! Processed ${processedCount} videos.`);
  console.log(`💾 Saved to ${DATASET_PATH}`);
}

main();