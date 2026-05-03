const { GoogleAuth } = require('google-auth-library');
require('dotenv').config({ path: '.env.local' });

const CONFIG = {
  projectId: '1061681256498',
  location: 'us-central1',
  endpointId: '4053959844749639680' // Checkpoint 4 Endpoint
};

async function main() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  const endpoint = `https://${CONFIG.location}-aiplatform.googleapis.com/v1/projects/${CONFIG.projectId}/locations/${CONFIG.location}/endpoints/${CONFIG.endpointId}:generateContent`;

  console.log(`Testing endpoint access: ${endpoint}`);

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: "Analysera denna video: (Test)" }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 100
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    console.error(`❌ Failed: ${response.status} ${response.statusText}`);
    console.error(await response.text());
  } else {
    const json = await response.json();
    console.log('✅ Success!');
    console.log(JSON.stringify(json, null, 2));
  }
}

main();
