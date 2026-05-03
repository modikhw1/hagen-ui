import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local') });

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_PLATFORM_GQL = 'https://platform-api.p.rapidapi.com/graphql';

async function testPlatformSimple() {
  if (!RAPIDAPI_KEY) return;
  console.log('--- Testing Platform API (Simple Query) ---');
  const query = '{ me { id username } }';
  try {
    const res = await fetch(RAPIDAPI_PLATFORM_GQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': 'platform-api.p.rapidapi.com',
      },
      body: JSON.stringify({ query }),
    });
    console.log('Platform API Status:', res.status);
    const json = await res.json();
    console.log('Platform API Response:', JSON.stringify(json, null, 2));
  } catch (e) {
    console.error('Platform API Error:', e.message);
  }
}

async function testTiktokScraperHeaders() {
  if (!RAPIDAPI_KEY) return;
  console.log('\n--- Testing TikTok Scraper Headers ---');
  const RAPIDAPI_HOST = 'tiktok-scraper7.p.rapidapi.com';
  try {
    const res = await fetch(`https://${RAPIDAPI_HOST}/user/info?unique_id=tiktok`, {
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    });
    console.log('TikTok API Status:', res.status);
    console.log('Headers:');
    for (const [key, value] of res.headers.entries()) {
      if (key.includes('ratelimit')) {
        console.log(`${key}: ${value}`);
      }
    }
  } catch (e) {
    console.error('TikTok API Error:', e.message);
  }
}

async function run() {
  await testPlatformSimple();
  await testTiktokScraperHeaders();
}

run();
