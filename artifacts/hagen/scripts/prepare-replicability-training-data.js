const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '../datasets/replicability_dataset_2025-12-23.json');
const OUTPUT_DIR = path.join(__dirname, '../datasets/fine-tuning');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'replicability_training_data_verified.jsonl');

function main() {
  console.log('🚀 Preparing Verified Fine-Tuning Data...');

  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`❌ Input dataset not found at ${INPUT_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const data = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  
  // Filter for VERIFIED entries only
  const verifiedEntries = data.filter(d => d.translation_status === 'verified');
  
  if (verifiedEntries.length === 0) {
    console.error('❌ No verified entries found! Go to the lab and approve some videos first.');
    process.exit(1);
  }

  console.log(`📊 Found ${verifiedEntries.length} verified entries.`);

  const stream = fs.createWriteStream(OUTPUT_FILE);
  let count = 0;

  verifiedEntries.forEach(entry => {
    // Construct the input prompt (what the model sees)
    const signals = JSON.stringify(entry.signals, null, 2);
    const notes = entry.original_data.notes;
    
    // This prompt must match EXACTLY what we will use in production
    const userPrompt = `Analysera replikerbarheten för denna video baserat på följande signaler och generella anteckningar.

SIGNALER:
${signals}

GENERELLA ANTECKNINGAR:
${notes}

Ge en neutral, strukturerad analys av replikerbarhetsfaktorerna på svenska.`;

    const modelResponse = entry.replicability_analysis;

    // Gemini Fine-Tuning Format
    const trainingExample = {
      messages: [
        { role: "user", content: userPrompt },
        { role: "model", content: modelResponse }
      ]
    };

    stream.write(JSON.stringify(trainingExample) + '\n');
    count++;
  });

  stream.end();
  console.log(`✅ Generated ${count} training examples.`);
  console.log(`💾 Saved to ${OUTPUT_FILE}`);
  console.log('\nNEXT STEPS:');
  console.log('1. Go to Google AI Studio (https://aistudio.google.com/)');
  console.log('2. Click "Create new" -> "Tuned model"');
  console.log('3. Upload this JSONL file.');
  console.log('4. Select "Gemini 1.5 Flash" as the base model.');
  console.log('5. Start tuning!');
}

main();