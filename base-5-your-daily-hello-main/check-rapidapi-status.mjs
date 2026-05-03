
import https from 'https';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env files exactly like the app does
dotenv.config({ path: path.join(__dirname, '.env.local') });
dotenv.config({ path: path.join(__dirname, '.env') });

const apiKey = process.env.RAPIDAPI_KEY;
const host = 'tiktok-scraper7.p.rapidapi.com';

async function checkStatus() {
  console.log('--- RAPIDAPI DIAGNOSTIC ---');
  console.log('Date:', new Date().toISOString());
  console.log('Target Host:', host);
  
  if (!apiKey) {
    console.error('ERROR: RAPIDAPI_KEY is missing from environment variables!');
    return;
  }
  
  console.log('API Key Found:', apiKey.slice(0, 5) + '...' + apiKey.slice(-5));

  const options = {
    hostname: host,
    path: '/user/info?unique_id=tiktok',
    method: 'GET',
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': host,
    }
  };

  console.log('Sending request to TikTok Scraper API...');

  const req = https.request(options, (res) => {
    console.log('HTTP Status:', res.statusCode);
    
    const limit = res.headers['x-ratelimit-requests-limit'] ?? res.headers['x-ratelimit-scraping-api-limit'];
    const remaining = res.headers['x-ratelimit-requests-remaining'] ?? res.headers['x-ratelimit-scraping-api-remaining'];
    const reset = res.headers['x-ratelimit-requests-reset'] ?? res.headers['x-ratelimit-scraping-api-reset'];

    console.log('\n--- QUOTA HEADERS ---');
    console.log('x-ratelimit-requests-limit:', res.headers['x-ratelimit-requests-limit']);
    console.log('x-ratelimit-requests-remaining:', res.headers['x-ratelimit-requests-remaining']);
    console.log('x-ratelimit-scraping-api-limit:', res.headers['x-ratelimit-scraping-api-limit']);
    console.log('x-ratelimit-scraping-api-remaining:', res.headers['x-ratelimit-scraping-api-remaining']);
    
    if (limit && remaining) {
      const used = Number(limit) - Number(remaining);
      const percentage = (used / Number(limit)) * 100;
      console.log('\n--- CALCULATED STATUS ---');
      console.log(`Usage: ${used} / ${limit}`);
      console.log(`Percentage: ${percentage.toFixed(2)}%`);
      console.log(`Quota resets in approx: ${Math.round(Number(reset) / 3600)} hours`);
    } else {
      console.log('\nERROR: Could not find any known quota headers in the response.');
      console.log('Full Headers:', JSON.stringify(res.headers, null, 2));
    }
  });

  req.on('error', (e) => {
    console.error('\nNETWORK ERROR:', e.message);
  });

  req.end();
}

checkStatus();
