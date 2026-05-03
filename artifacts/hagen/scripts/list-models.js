const { GoogleAuth } = require('google-auth-library');
require('dotenv').config({ path: '.env.local' });

const CONFIG = {
  projectId: '1061681256498',
  location: 'us-central1'
};

async function main() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  const endpoint = `https://${CONFIG.location}-aiplatform.googleapis.com/v1/projects/${CONFIG.projectId}/locations/${CONFIG.location}/models`;

  const response = await fetch(endpoint, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const json = await response.json();
  console.log(JSON.stringify(json, null, 2));
}

main();
