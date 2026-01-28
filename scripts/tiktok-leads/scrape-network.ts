/**
 * TikTok Lead Scraper - Network Expansion
 *
 * Uses Apify to scrape followers/following of seed profiles
 * to find similar Swedish businesses doing humor content.
 *
 * Usage:
 *   npx ts-node scripts/tiktok-leads/scrape-network.ts
 *
 * Required:
 *   - APIFY_TOKEN env variable
 *   - seeds.json with seed profiles
 */

import { ApifyClient } from 'apify-client';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const MAX_FOLLOWERS_PER_SEED = 100; // Limit to save costs
const MAX_FOLLOWING_PER_SEED = 50;

// Apify Actor IDs
const FOLLOWERS_ACTOR = 'clockworks/tiktok-followers-scraper';
const FOLLOWING_ACTOR = 'scrape-creators/best-tiktok-following-scraper';
const PROFILE_ACTOR = 'clockworks/tiktok-profile-scraper';

interface Seed {
  username: string;
  notes?: string;
}

interface SeedsFile {
  seeds: Seed[];
}

interface TikTokProfile {
  username: string;
  nickname?: string;
  bio?: string;
  followerCount?: number;
  followingCount?: number;
  videoCount?: number;
  verified?: boolean;
  profileUrl?: string;
  // Source tracking
  foundVia?: string;
  occurrences?: number;
}

async function loadSeeds(): Promise<Seed[]> {
  const seedsPath = path.join(__dirname, 'seeds.json');
  const data = JSON.parse(fs.readFileSync(seedsPath, 'utf-8')) as SeedsFile;
  return data.seeds;
}

async function scrapeFollowers(client: ApifyClient, username: string): Promise<TikTokProfile[]> {
  console.log(`  Scraping followers of @${username}...`);

  try {
    const run = await client.actor(FOLLOWERS_ACTOR).call({
      profiles: [username],
      maxFollowersPerProfile: MAX_FOLLOWERS_PER_SEED,
      maxFollowingPerProfile: 0,
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    // clockworks/tiktok-followers-scraper returns data in authorMeta structure:
    // { authorMeta: { name, nickName, fans, signature, verified }, connectionType: "follower" }
    return items.map((item: any) => ({
      username: item.authorMeta?.name || item.uniqueId || item.username,
      nickname: item.authorMeta?.nickName || item.nickname,
      bio: item.authorMeta?.signature || item.signature || item.bio,
      followerCount: item.authorMeta?.fans || item.followerCount || item.fans,
      verified: item.authorMeta?.verified || item.verified,
      foundVia: `follower:${username}`,
    })).filter((p: TikTokProfile) => p.username);
  } catch (error) {
    console.error(`  Error scraping followers of @${username}:`, error);
    return [];
  }
}

async function scrapeFollowing(client: ApifyClient, username: string): Promise<TikTokProfile[]> {
  console.log(`  Scraping following of @${username}...`);

  try {
    const run = await client.actor(FOLLOWING_ACTOR).call({
      usernames: [username],
      numberOfFollowing: MAX_FOLLOWING_PER_SEED,
    });

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    return items.map((item: any) => ({
      username: item.uniqueId || item.username || item.user?.uniqueId,
      nickname: item.nickname || item.user?.nickname,
      bio: item.signature || item.bio || item.user?.signature,
      followerCount: item.followerCount || item.fans || item.user?.followerCount,
      verified: item.verified || item.user?.verified,
      foundVia: `following:${username}`,
    })).filter((p: TikTokProfile) => p.username);
  } catch (error) {
    console.error(`  Error scraping following of @${username}:`, error);
    return [];
  }
}

async function enrichProfiles(client: ApifyClient, usernames: string[]): Promise<Map<string, TikTokProfile>> {
  console.log(`\nEnriching ${usernames.length} profiles with full data...`);

  const enriched = new Map<string, TikTokProfile>();

  // Batch in chunks of 20 to avoid rate limits
  const chunks = [];
  for (let i = 0; i < usernames.length; i += 20) {
    chunks.push(usernames.slice(i, i + 20));
  }

  for (const chunk of chunks) {
    try {
      const run = await client.actor(PROFILE_ACTOR).call({
        usernames: chunk,
      });

      const { items } = await client.dataset(run.defaultDatasetId).listItems();

      for (const item of items) {
        const profile: TikTokProfile = {
          username: (item.uniqueId || item.username) as string,
          nickname: item.nickname as string | undefined,
          bio: item.signature as string | undefined,
          followerCount: item.followerCount as number | undefined,
          followingCount: item.followingCount as number | undefined,
          videoCount: item.videoCount as number | undefined,
          verified: item.verified as boolean | undefined,
          profileUrl: `https://www.tiktok.com/@${item.uniqueId || item.username}`,
        };
        enriched.set(profile.username, profile);
      }
    } catch (error) {
      console.error(`  Error enriching batch:`, error);
    }
  }

  return enriched;
}

function findOverlap(allProfiles: TikTokProfile[]): Map<string, TikTokProfile & { occurrences: number; sources: string[] }> {
  const profileMap = new Map<string, TikTokProfile & { occurrences: number; sources: string[] }>();

  for (const profile of allProfiles) {
    const existing = profileMap.get(profile.username);
    if (existing) {
      existing.occurrences++;
      if (profile.foundVia && !existing.sources.includes(profile.foundVia)) {
        existing.sources.push(profile.foundVia);
      }
    } else {
      profileMap.set(profile.username, {
        ...profile,
        occurrences: 1,
        sources: profile.foundVia ? [profile.foundVia] : [],
      });
    }
  }

  return profileMap;
}

async function main() {
  console.log('=== TikTok Lead Scraper - Network Expansion ===\n');

  if (!APIFY_TOKEN) {
    console.error('ERROR: APIFY_TOKEN environment variable not set');
    console.log('Set it with: export APIFY_TOKEN=your_token_here');
    process.exit(1);
  }

  const client = new ApifyClient({ token: APIFY_TOKEN });

  // Load seeds
  const seeds = await loadSeeds();
  console.log(`Loaded ${seeds.length} seed profiles\n`);

  // Option to run on subset for testing
  const testMode = process.argv.includes('--test');
  const seedsToProcess = testMode ? seeds.slice(0, 3) : seeds;

  if (testMode) {
    console.log('TEST MODE: Processing only first 3 seeds\n');
  }

  const allProfiles: TikTokProfile[] = [];

  // Scrape network for each seed
  for (const seed of seedsToProcess) {
    console.log(`\nProcessing seed: @${seed.username}`);

    // Scrape followers (who follows this account)
    const followers = await scrapeFollowers(client, seed.username);
    console.log(`  Found ${followers.length} followers`);
    allProfiles.push(...followers);

    // Scrape following (who this account follows)
    const following = await scrapeFollowing(client, seed.username);
    console.log(`  Found ${following.length} following`);
    allProfiles.push(...following);

    // Small delay between seeds
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n=== Collected ${allProfiles.length} total profiles ===\n`);

  // Find overlap (profiles that appear multiple times)
  const overlapped = findOverlap(allProfiles);
  console.log(`Unique profiles: ${overlapped.size}`);

  // Sort by occurrences (profiles appearing in multiple networks = more relevant)
  const sorted = Array.from(overlapped.values())
    .sort((a, b) => b.occurrences - a.occurrences);

  // Filter to profiles with 2+ occurrences
  const candidates = sorted.filter(p => p.occurrences >= 2);
  console.log(`Profiles appearing 2+ times: ${candidates.length}`);

  // Save raw results
  const outputDir = path.join(__dirname, 'output');

  fs.writeFileSync(
    path.join(outputDir, 'raw-network.json'),
    JSON.stringify(sorted, null, 2)
  );
  console.log(`\nSaved raw results to output/raw-network.json`);

  // Save candidates (2+ occurrences)
  fs.writeFileSync(
    path.join(outputDir, 'candidates.json'),
    JSON.stringify(candidates, null, 2)
  );
  console.log(`Saved candidates to output/candidates.json`);

  // Next step: Run filter-candidates.ts to apply criteria
  console.log('\n=== Next step ===');
  console.log('Run: npx ts-node scripts/tiktok-leads/filter-candidates.ts');
}

main().catch(console.error);
