/**
 * Check V7.X training status and update model_versions.json when complete
 */

const { GoogleAuth } = require('google-auth-library');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const JOB_NAME = 'projects/1061681256498/locations/us-central1/tuningJobs/883912567393615872';
const VERSIONS_PATH = path.join(__dirname, '../datasets/fine-tuning/model_versions.json');

async function main() {
  const auth = new GoogleAuth({
    keyFile: './credentials/gen-lang-client-0853618366-8c06f8b7a2d1.json',
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/${JOB_NAME}`;

  const response = await fetch(endpoint, {
    headers: { 'Authorization': `Bearer ${token.token}` }
  });

  const job = await response.json();

  console.log('='.repeat(50));
  console.log('V7.X VIDEO-ONLY STATUS');
  console.log('='.repeat(50));
  console.log(`State: ${job.state}`);
  console.log(`Created: ${job.createTime}`);
  console.log(`Updated: ${job.updateTime}`);

  if (job.tunedModel?.model) {
    console.log(`Model: ${job.tunedModel.model}`);
  }
  if (job.tunedModel?.endpoint) {
    console.log(`Endpoint: ${job.tunedModel.endpoint}`);
  }

  if (job.state === 'JOB_STATE_SUCCEEDED') {
    console.log('\n✅ Training complete!');

    // Update model_versions.json
    const versions = JSON.parse(fs.readFileSync(VERSIONS_PATH, 'utf-8'));

    versions.versions['v7.X'] = {
      model: job.tunedModel.model,
      endpoint: job.tunedModel.endpoint,
      description: '266 VIDEO-ONLY examples (zero Simpsons text)',
      trainedAt: new Date().toISOString(),
      examples: 266,
      method: 'video_only_hypothesis_test',
      hypothesis: 'Testing if text data dilutes video analysis'
    };

    fs.writeFileSync(VERSIONS_PATH, JSON.stringify(versions, null, 2));
    console.log('\n📝 Updated model_versions.json');
    console.log('\n🔬 Ready to compare! Run:');
    console.log('   npm run dev  (in another terminal)');
    console.log('   node scripts/compare-v7b-v7x.js');

  } else if (job.state === 'JOB_STATE_FAILED') {
    console.log('\n❌ Training failed!');
    console.log('Error:', job.error);

  } else {
    console.log('\n⏳ Still training...');
    console.log('Run this script again in a few minutes.');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
