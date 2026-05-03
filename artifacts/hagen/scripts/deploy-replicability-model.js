const { GoogleAuth } = require('google-auth-library');
require('dotenv').config({ path: '.env.local' });

const CONFIG = {
  projectId: '1061681256498', // Project Number
  location: 'us-central1',
  modelId: '7999825601860993024',
  displayName: 'replicability-v1-endpoint'
};

async function deploy() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  const apiEndpoint = `https://${CONFIG.location}-aiplatform.googleapis.com/v1`;
  const parent = `projects/${CONFIG.projectId}/locations/${CONFIG.location}`;

  // 1. Create Endpoint
  console.log('Creating Endpoint...');
  const createEndpointResp = await fetch(`${apiEndpoint}/${parent}/endpoints`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      displayName: CONFIG.displayName
    })
  });

  if (!createEndpointResp.ok) {
    throw new Error(`Create Endpoint Failed: ${await createEndpointResp.text()}`);
  }

  const endpointOp = await createEndpointResp.json();
  console.log('Endpoint creation operation:', endpointOp.name);
  
  // Wait for endpoint creation (it's usually fast, but returns an LRO)
  // For simplicity, we'll just wait a bit or check the operation.
  // Actually, we need the Endpoint ID. The operation name contains it? No.
  // We need to poll the operation.
  
  // Let's just list endpoints and find the one we just created or use the one from the operation response if possible.
  // The operation response `response` field will contain the endpoint when done.
  
  // Let's poll the operation
  let endpointId = null;
  let endpointName = null;
  
  while (!endpointId) {
    console.log('Polling operation...');
    const opResp = await fetch(`https://${CONFIG.location}-aiplatform.googleapis.com/v1/${endpointOp.name}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const op = await opResp.json();
    
    if (op.done) {
      if (op.error) throw new Error(op.error.message);
      endpointName = op.response.name; // projects/.../endpoints/12345
      endpointId = endpointName.split('/').pop();
      console.log('Endpoint Created:', endpointName);
    } else {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // 2. Deploy Model
  console.log(`Deploying Model ${CONFIG.modelId} to Endpoint ${endpointId}...`);
  const deployResp = await fetch(`https://${CONFIG.location}-aiplatform.googleapis.com/v1/${endpointName}:deployModel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      deployedModel: {
        model: `projects/${CONFIG.projectId}/locations/${CONFIG.location}/models/${CONFIG.modelId}`,
        displayName: 'replicability-v1-deployed',
        dedicatedResources: {
          machineSpec: {
            machineType: 'n1-standard-4' // Standard for Gemini? No, Gemini is managed.
            // For Gemini, we might not need machineSpec?
            // Actually, for Gemini Tuned models, we DO need to deploy, but the machine type might be specific.
            // Let's try without machineSpec first, or check docs.
            // Docs say: "You must deploy the model to an endpoint."
            // And "Select a machine type".
          },
          minReplicaCount: 1,
          maxReplicaCount: 1
        }
      },
      trafficSplit: {
        '0': 100
      }
    })
  });

  if (!deployResp.ok) {
    throw new Error(`Deploy Model Failed: ${await deployResp.text()}`);
  }

  const deployOp = await deployResp.json();
  console.log('Deployment started:', deployOp.name);
  console.log('This will take a while. You can check status in Google Cloud Console.');
  console.log(`ENDPOINT_ID=${endpointId}`);
}

deploy().catch(console.error);
