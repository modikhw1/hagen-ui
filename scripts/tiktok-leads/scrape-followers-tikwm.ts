/**
 * TikTok Followers Scraper - TIKWM Version
 *
 * Uses TIKWM's Tiktok Scraper API on RapidAPI.
 * Free tier: 300 requests/month (6x more than ScrapTik!)
 *
 * Setup:
 *   1. Create account on rapidapi.com
 *   2. Subscribe to TIKWM API (free tier): https://rapidapi.com/tikwm-tikwm-default/api/tiktok-scraper7
 *   3. Copy your API key from RapidAPI dashboard
 *   4. Set environment variable: RAPIDAPI_KEY=your_key_here
 *
 * Usage:
 *   npx ts-node scripts/tiktok-leads/scrape-followers-tikwm.ts
 *   npx ts-node scripts/tiktok-leads/scrape-followers-tikwm.ts --test  (only 2 seeds)
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
const RAPIDAPI_HOST = 'tiktok-scraper7.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}`;

// Scraping limits
const MAX_FOLLOWERS_PER_SEED = 100;  // Max followers to fetch per seed profile
const FOLLOWERS_PER_REQUEST = 30;    // TIKWM typically returns 30 per request
const REQUEST_DELAY_MS = 1200;       // Delay between requests

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

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function makeRequest<T>(endpoint: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  console.log(`    API: ${endpoint}?${url.searchParams.toString().substring(0, 50)}...`);

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
      console.error(`    API Error ${response.status}: ${errorText.substring(0, 200)}`);
      return null;
    }

    const data = await response.json();
    return data as T;
  } catch (error) {
    console.error(`    Request failed:`, error);
    return null;
  }
}

/**
 * Get user info by username (to get user_id and sec_uid)
 */
async function getUserInfo(username: string): Promise<{
  user_id: string;
  sec_uid: string;
  nickname: string;
  follower_count: number;
} | null> {
  console.log(`  Fetching user info for @${username}...`);

  // TIKWM uses /user/info endpoint with unique_id parameter
  const response = await makeRequest<{
    code: number;
    msg: string;
    data?: {
      user: {
        id: string;
        uniqueId: string;
        nickname: string;
        secUid: string;
      };
      stats: {
        followerCount: number;
        followingCount: number;
        videoCount: number;
      };
    };
  }>('/user/info', { unique_id: username });

  if (!response || response.code !== 0 || !response.data) {
    // Try alternative parameter name
    const altResponse = await makeRequest<any>('/user/info', { username: username });
    if (!altResponse || altResponse.code !== 0 || !altResponse.data) {
      console.error(`    Failed to get user info for @${username}`);
      return null;
    }

    const user = altResponse.data.user || altResponse.data;
    return {
      user_id: user.id || user.user_id || '',
      sec_uid: user.secUid || user.sec_uid || '',
      nickname: user.nickname || '',
      follower_count: altResponse.data.stats?.followerCount || user.follower_count || 0,
    };
  }

  return {
    user_id: response.data.user.id,
    sec_uid: response.data.user.secUid,
    nickname: response.data.user.nickname,
    follower_count: response.data.stats.followerCount,
  };
}

/**
 * Get followers of a user with pagination
 */
async function getFollowers(
  userId: string,
  secUid: string,
  maxFollowers: number,
  seedUsername: string
): Promise<FollowerProfile[]> {
  const followers: FollowerProfile[] = [];
  let time = 0;  // Pagination uses 'time' not 'cursor'
  let hasMore = true;
  let requestCount = 0;

  while (hasMore && followers.length < maxFollowers) {
    requestCount++;
    console.log(`    Request ${requestCount}: collected=${followers.length}/${maxFollowers}`);

    // Build params - only add time if we have one from previous request
    const params: Record<string, string> = {
      user_id: userId,
      sec_uid: secUid,
      count: String(FOLLOWERS_PER_REQUEST),
    };
    if (time > 0) {
      params.time = String(time);
    }

    const response = await makeRequest<{
      code: number;
      msg: string;
      data?: {
        followers?: Array<{
          id?: string;
          user_id?: string;
          uniqueId?: string;
          unique_id?: string;
          nickname?: string;
          signature?: string;
          followerCount?: number;
          follower_count?: number;
          followingCount?: number;
          following_count?: number;
          verified?: boolean;
        }>;
        time?: number;
        hasMore?: boolean;
        has_more?: boolean;
      };
    }>('/user/followers', params);

    if (!response) {
      console.error(`    No response from API`);
      break;
    }

    if (response.code !== 0) {
      console.error(`    API returned code ${response.code}: ${response.msg}`);
      break;
    }

    if (!response.data || !response.data.followers) {
      console.log(`    No followers data in response`);
      break;
    }

    const batch = response.data.followers;

    for (const f of batch) {
      if (followers.length >= maxFollowers) break;

      const username = f.uniqueId || f.unique_id || '';
      if (!username) continue;

      followers.push({
        username,
        nickname: f.nickname || '',
        bio: f.signature || '',
        followerCount: f.followerCount || f.follower_count || 0,
        followingCount: f.followingCount || f.following_count || 0,
        verified: f.verified || false,
        profileUrl: `https://tiktok.com/@${username}`,
        foundVia: `follower:${seedUsername}`,
      });
    }

    time = response.data.time || 0;
    hasMore = (response.data.hasMore || response.data.has_more) && batch.length > 0;

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
  console.log('=== TikTok Followers Scraper (TIKWM - 300 free/month) ===\n');

  // Check API key
  if (!RAPIDAPI_KEY) {
    console.error('ERROR: RAPIDAPI_KEY environment variable not set');
    console.log('\nSetup instructions:');
    console.log('1. Go to https://rapidapi.com/tikwm-tikwm-default/api/tiktok-scraper7');
    console.log('2. Subscribe to the free tier (300 requests/month)');
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
  const seedResults: { username: string; followers: number; totalFollowers: number }[] = [];
  const failedSeeds: string[] = [];
  let totalRequests = 0;

  // Process each seed
  for (let i = 0; i < seedsToProcess.length; i++) {
    const seed = seedsToProcess[i];
    console.log(`\n[${i + 1}/${seedsToProcess.length}] Processing seed: @${seed.username}`);

    // Step 1: Get user info
    const userInfo = await getUserInfo(seed.username);
    totalRequests++;

    if (!userInfo) {
      console.log(`  Skipping @${seed.username} (could not get user info)`);
      failedSeeds.push(seed.username);
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    console.log(`  User has ${userInfo.follower_count.toLocaleString()} total followers`);

    // Step 2: Get followers
    console.log(`  Fetching up to ${MAX_FOLLOWERS_PER_SEED} followers...`);
    const followers = await getFollowers(
      userInfo.user_id,
      userInfo.sec_uid,
      MAX_FOLLOWERS_PER_SEED,
      seed.username
    );

    // Track requests
    const followerRequests = Math.max(1, Math.ceil(followers.length / FOLLOWERS_PER_REQUEST));
    totalRequests += followerRequests;

    console.log(`  ✓ Found ${followers.length} followers`);
    allFollowers.push(...followers);

    seedResults.push({
      username: seed.username,
      followers: followers.length,
      totalFollowers: userInfo.follower_count,
    });

    // Delay between seeds
    if (i < seedsToProcess.length - 1) {
      await sleep(REQUEST_DELAY_MS * 2);
    }
  }

  // =============================================================================
  // RESULTS
  // =============================================================================

  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));

  // Show per-seed results
  console.log('\nPer-seed breakdown:');
  for (const r of seedResults) {
    const pct = r.totalFollowers > 0
      ? ((r.followers / r.totalFollowers) * 100).toFixed(1)
      : '0';
    console.log(`  @${r.username}: ${r.followers} scraped / ${r.totalFollowers.toLocaleString()} total (${pct}%)`);
  }

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
  const jsonPath = path.join(outputDir, 'followers-tikwm.json');
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

  const csvPath = path.join(outputDir, 'followers-tikwm.csv');
  fs.writeFileSync(csvPath, csvHeader + csvRows);
  console.log(`Saved: ${csvPath}`);

  // Stats by follower count
  const inRange = results.filter(f => f.followerCount >= 50 && f.followerCount <= 4000);
  console.log(`\nFollowers in target range (50-4000): ${inRange.length}`);

  // Save filtered list
  if (inRange.length > 0) {
    const filteredPath = path.join(outputDir, 'followers-tikwm-filtered.json');
    fs.writeFileSync(filteredPath, JSON.stringify(inRange, null, 2));
    console.log(`Saved filtered: ${filteredPath}`);
  }

  // Top 10 preview
  console.log('\n=== Preview: First 10 followers ===\n');
  results.slice(0, 10).forEach((f, i) => {
    console.log(`${i + 1}. @${f.username} (${f.followerCount.toLocaleString()} followers) - via ${f.foundVia.split(':')[1]}`);
  });

  // Usage reminder
  console.log('\n' + '='.repeat(60));
  console.log('TIKWM FREE TIER: 300 requests/month');
  console.log(`You used ~${totalRequests} requests in this run.`);
  console.log(`Remaining (estimate): ~${300 - totalRequests} requests`);
  console.log('='.repeat(60));
}

main().catch(console.error);
