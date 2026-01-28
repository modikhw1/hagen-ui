/**
 * TikTok Followers Scraper - RapidAPI Version
 *
 * Uses ScrapTik API on RapidAPI to scrape followers of seed profiles.
 * Free tier: 50 requests/month
 *
 * Setup:
 *   1. Create account on rapidapi.com
 *   2. Subscribe to ScrapTik API (free tier): https://rapidapi.com/scraptik-api-scraptik-api-default/api/scraptik
 *   3. Copy your API key from RapidAPI dashboard
 *   4. Set environment variable: RAPIDAPI_KEY=your_key_here
 *
 * Usage:
 *   npx ts-node scripts/tiktok-leads/scrape-followers-rapidapi.ts
 *   npx ts-node scripts/tiktok-leads/scrape-followers-rapidapi.ts --test  (only 2 seeds)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =============================================================================
// CONFIGURATION
// =============================================================================

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'scraptik.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}`;

// Scraping limits
const MAX_FOLLOWERS_PER_SEED = 100;  // Max followers to fetch per seed profile
const FOLLOWERS_PER_REQUEST = 20;    // ScrapTik returns ~20-30 per request
const REQUEST_DELAY_MS = 1500;       // Delay between requests to avoid rate limiting

// =============================================================================
// TYPES
// =============================================================================

interface Seed {
  username: string;
  notes?: string;
}

interface SeedsFile {
  seeds: Seed[];
}

interface TikTokUser {
  user_id: string;
  sec_user_id: string;
  unique_id: string;        // username
  nickname: string;
  signature?: string;       // bio
  follower_count?: number;
  following_count?: number;
  avatar?: string;
  verified?: boolean;
}

interface FollowerProfile {
  username: string;
  nickname: string;
  bio: string;
  followerCount: number;
  followingCount: number;
  verified: boolean;
  profileUrl: string;
  foundVia: string;
}

interface ApiResponse<T> {
  code: number;
  msg: string;
  data?: T;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function makeRequest<T>(endpoint: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY!,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  API Error ${response.status}: ${errorText.substring(0, 200)}`);
      return null;
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    console.error(`  Request failed:`, error);
    return null;
  }
}

/**
 * Convert TikTok username to user_id and sec_user_id
 */
async function getUserIdFromUsername(username: string): Promise<{ user_id: string; sec_user_id: string } | null> {
  console.log(`  Converting @${username} to user_id...`);

  const response = await makeRequest<ApiResponse<{ user_id: string; sec_user_id: string }>>(
    '/username-to-id',
    { username }
  );

  if (!response || response.code !== 0 || !response.data) {
    console.error(`  Failed to get user_id for @${username}: ${response?.msg || 'Unknown error'}`);
    return null;
  }

  console.log(`  Got user_id: ${response.data.user_id}`);
  return response.data;
}

/**
 * Get detailed user info
 */
async function getUserInfo(userId: string): Promise<TikTokUser | null> {
  const response = await makeRequest<ApiResponse<{ user: TikTokUser }>>(
    '/get-user',
    { user_id: userId }
  );

  if (!response || response.code !== 0 || !response.data?.user) {
    return null;
  }

  return response.data.user;
}

/**
 * Get followers of a user with pagination
 */
async function getFollowers(
  userId: string,
  secUserId: string,
  maxFollowers: number,
  seedUsername: string
): Promise<FollowerProfile[]> {
  const followers: FollowerProfile[] = [];
  let cursor = '0';
  let hasMore = true;
  let requestCount = 0;

  while (hasMore && followers.length < maxFollowers) {
    requestCount++;
    console.log(`    Request ${requestCount}: cursor=${cursor}, collected=${followers.length}/${maxFollowers}`);

    const response = await makeRequest<ApiResponse<{
      followers: Array<{
        user_id: string;
        unique_id: string;
        nickname: string;
        signature?: string;
        follower_count?: number;
        following_count?: number;
        avatar_larger?: string;
        verified?: boolean;
      }>;
      cursor: string;
      has_more: boolean;
    }>>(
      '/list-followers',
      {
        user_id: userId,
        sec_user_id: secUserId,
        count: String(FOLLOWERS_PER_REQUEST),
        cursor: cursor,
      }
    );

    if (!response || response.code !== 0 || !response.data) {
      console.error(`    Failed to fetch followers: ${response?.msg || 'Unknown error'}`);
      break;
    }

    const batch = response.data.followers || [];

    for (const f of batch) {
      if (followers.length >= maxFollowers) break;

      followers.push({
        username: f.unique_id || '',
        nickname: f.nickname || '',
        bio: f.signature || '',
        followerCount: f.follower_count || 0,
        followingCount: f.following_count || 0,
        verified: f.verified || false,
        profileUrl: `https://tiktok.com/@${f.unique_id}`,
        foundVia: `follower:${seedUsername}`,
      });
    }

    cursor = response.data.cursor || '0';
    hasMore = response.data.has_more && batch.length > 0;

    // Rate limiting
    if (hasMore && followers.length < maxFollowers) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  return followers;
}

// =============================================================================
// HELPERS
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadSeeds(): Seed[] {
  const seedsPath = path.join(__dirname, 'seeds.json');
  const data = JSON.parse(fs.readFileSync(seedsPath, 'utf-8')) as SeedsFile;
  return data.seeds;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('=== TikTok Followers Scraper (RapidAPI) ===\n');

  // Check API key
  if (!RAPIDAPI_KEY) {
    console.error('ERROR: RAPIDAPI_KEY environment variable not set');
    console.log('\nSetup instructions:');
    console.log('1. Go to https://rapidapi.com/scraptik-api-scraptik-api-default/api/scraptik');
    console.log('2. Subscribe to the free tier');
    console.log('3. Copy your API key from the dashboard');
    console.log('4. Run: set RAPIDAPI_KEY=your_key_here (Windows)');
    console.log('   Or:  export RAPIDAPI_KEY=your_key_here (Mac/Linux)');
    process.exit(1);
  }

  // Load seeds
  const seeds = loadSeeds();
  console.log(`Loaded ${seeds.length} seed profiles\n`);

  // Test mode
  const testMode = process.argv.includes('--test');
  const seedsToProcess = testMode ? seeds.slice(0, 2) : seeds;

  if (testMode) {
    console.log('TEST MODE: Processing only first 2 seeds\n');
  }

  // Track all followers
  const allFollowers: FollowerProfile[] = [];
  const failedSeeds: string[] = [];
  let totalRequests = 0;

  // Process each seed
  for (let i = 0; i < seedsToProcess.length; i++) {
    const seed = seedsToProcess[i];
    console.log(`\n[${i + 1}/${seedsToProcess.length}] Processing seed: @${seed.username}`);

    // Step 1: Get user_id from username
    const userIds = await getUserIdFromUsername(seed.username);
    if (!userIds) {
      console.log(`  Skipping @${seed.username} (could not get user_id)`);
      failedSeeds.push(seed.username);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }
    totalRequests++;

    // Step 2: Get followers
    console.log(`  Fetching up to ${MAX_FOLLOWERS_PER_SEED} followers...`);
    const followers = await getFollowers(
      userIds.user_id,
      userIds.sec_user_id,
      MAX_FOLLOWERS_PER_SEED,
      seed.username
    );

    // Estimate requests made (1 per ~20 followers + 1 for user_id)
    const followerRequests = Math.ceil(followers.length / FOLLOWERS_PER_REQUEST);
    totalRequests += followerRequests;

    console.log(`  Found ${followers.length} followers`);
    allFollowers.push(...followers);

    // Delay between seeds
    if (i < seedsToProcess.length - 1) {
      await sleep(REQUEST_DELAY_MS * 2);
    }
  }

  // =============================================================================
  // RESULTS
  // =============================================================================

  console.log('\n' + '='.repeat(50));
  console.log('RESULTS');
  console.log('='.repeat(50));

  // Deduplicate by username
  const uniqueFollowers = new Map<string, FollowerProfile>();
  for (const f of allFollowers) {
    if (f.username && !uniqueFollowers.has(f.username)) {
      uniqueFollowers.set(f.username, f);
    }
  }

  const results = Array.from(uniqueFollowers.values());

  console.log(`\nTotal followers collected: ${allFollowers.length}`);
  console.log(`Unique followers: ${results.length}`);
  console.log(`Total API requests: ~${totalRequests}`);
  console.log(`Failed seeds: ${failedSeeds.length > 0 ? failedSeeds.join(', ') : 'none'}`);

  // Save results
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save JSON
  const jsonPath = path.join(outputDir, 'followers-rapidapi.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved: ${jsonPath}`);

  // Save CSV
  const csvHeader = 'username,nickname,followers,following,verified,bio,source,profile_url\n';
  const csvRows = results.map(f => [
    f.username,
    `"${(f.nickname || '').replace(/"/g, '""')}"`,
    f.followerCount,
    f.followingCount,
    f.verified,
    `"${(f.bio || '').replace(/"/g, '""').substring(0, 100)}"`,
    f.foundVia,
    f.profileUrl,
  ].join(',')).join('\n');

  const csvPath = path.join(outputDir, 'followers-rapidapi.csv');
  fs.writeFileSync(csvPath, csvHeader + csvRows);
  console.log(`Saved: ${csvPath}`);

  // Stats by follower count
  const inRange = results.filter(f => f.followerCount >= 50 && f.followerCount <= 4000);
  console.log(`\nFollowers in target range (50-4000): ${inRange.length}`);

  // Top 10 preview
  console.log('\n=== Preview: First 10 followers ===\n');
  results.slice(0, 10).forEach((f, i) => {
    console.log(`${i + 1}. @${f.username} (${f.followerCount} followers) - ${f.foundVia}`);
  });

  // Reminder about free tier
  console.log('\n' + '='.repeat(50));
  console.log('NOTE: ScrapTik free tier = 50 requests/month');
  console.log(`You used ~${totalRequests} requests in this run.`);
  console.log('='.repeat(50));
}

main().catch(console.error);
