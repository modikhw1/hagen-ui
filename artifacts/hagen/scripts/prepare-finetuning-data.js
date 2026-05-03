const fs = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, '../datasets/replicability_dataset_2025-12-23.json');
const OUTPUT_PATH = path.join(__dirname, '../datasets/fine-tuning/training_data.jsonl');

function main() {
  console.log('🚀 Preparing Fine-Tuning Data...');

  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`❌ Input dataset not found at ${INPUT_PATH}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
  const stream = fs.createWriteStream(OUTPUT_PATH);

  let count = 0;
  data.forEach(entry => {
    // Construct the input prompt (what the model sees)
    // We want the model to learn to map Signals + Notes -> Replicability Analysis
    
    const signals = JSON.stringify(entry.signals, null, 2);
    const notes = entry.original_data.notes;
    
    const userPrompt = `Analyze the replicability of this video based on the following signals and general notes.
    
SIGNALS:
${signals}

GENERAL NOTES:
${notes}

Provide a neutral, structured analysis of the replicability factors.`;

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
  console.log(`💾 Saved to ${OUTPUT_PATH}`);
}

main();