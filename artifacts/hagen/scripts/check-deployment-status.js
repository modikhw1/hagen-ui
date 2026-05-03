const { GoogleAuth } = require('google-auth-library');
require('dotenv').config({ path: '.env.local' });

const OPERATION_NAME = 'projects/1061681256498/locations/us-central1/endpoints/5258813482559602688/operations/8644331744373243904';

async function checkStatus() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/${OPERATION_NAME}`;
  
  console.log(`Checking operation: ${OPERATION_NAME}`);
  const response = await fetch(endpoint, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    console.error('Error:', await response.text());
    return;
  }

  const op = await response.json();
  console.log('Done:', op.done);
  if (op.error) console.error('Error:', op.error);
}

checkStatus().catch(console.error);
