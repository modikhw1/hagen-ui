/**
 * TikTok Lead Filter
 *
 * Filters scraped candidates by criteria:
 * - Swedish (Swedish text in bio, Swedish city names)
 * - 50-4000 followers
 * - Food/hospitality business indicators
 *
 * Usage:
 *   npx ts-node scripts/tiktok-leads/filter-candidates.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Filter criteria
const MIN_FOLLOWERS = 50;
const MAX_FOLLOWERS = 4000;

// Swedish indicators
const SWEDISH_CHARS = /[åäöÅÄÖ]/;
const SWEDISH_CITIES = [
  'stockholm', 'göteborg', 'malmö', 'uppsala', 'västerås', 'örebro',
  'linköping', 'helsingborg', 'jönköping', 'norrköping', 'lund',
  'umeå', 'gävle', 'borås', 'södertälje', 'eskilstuna', 'halmstad',
  'växjö', 'karlstad', 'sundsvall', 'östersund', 'trollhättan',
  'luleå', 'borlänge', 'falun', 'kalmar', 'skövde', 'kristianstad',
  'karlskrona', 'skellefteå', 'uddevalla', 'varberg', 'örnsköldsvik',
  'nyköping', 'karlskoga', 'motala', 'lidingö', 'trelleborg',
  'ängelholm', 'visby', 'kiruna', 'solna', 'nacka', 'huddinge',
  'täby', 'kista', 'hägersten', 'södermalm', 'östermalm', 'vasastan',
  'gamla stan', 'liljeholmen', 'bromma', 'sälen', 'åre'
];

// Food/hospitality indicators
const FOOD_KEYWORDS = [
  'restaurang', 'restaurant', 'café', 'cafe', 'kaffe', 'coffee',
  'bar', 'pub', 'bistro', 'pizzeria', 'pizza', 'kebab', 'döner',
  'burger', 'hamburgare', 'sushi', 'mat', 'food', 'kök', 'kitchen',
  'bageri', 'bakery', 'konditori', 'fika', 'brunch', 'lunch',
  'middag', 'frukost', 'meny', 'menu', 'take away', 'takeaway',
  'uteservering', 'terrass', 'delivery', 'leverans', 'foodtruck',
  'streetfood', 'halal', 'vegan', 'vegetarisk', 'eatery',
  'krog', 'matbar', 'vinbar', 'cocktail', 'drinks', 'öl', 'beer',
  'glass', 'gelato', 'ice cream', 'dessert', 'tårta', 'cake',
  'tacos', 'mexican', 'thai', 'indisk', 'kinesisk', 'japansk',
  'italiensk', 'turkisk', 'libanesisk', 'arabisk', 'asiatisk'
];

interface Candidate {
  username: string;
  nickname?: string;
  bio?: string;
  followerCount?: number;
  followingCount?: number;
  videoCount?: number;
  verified?: boolean;
  profileUrl?: string;
  occurrences: number;
  sources: string[];
}

interface FilteredLead extends Candidate {
  score: number;
  swedishIndicators: string[];
  foodIndicators: string[];
}

function isSwedish(profile: Candidate): { isSwedish: boolean; indicators: string[] } {
  const indicators: string[] = [];
  const textToCheck = `${profile.bio || ''} ${profile.nickname || ''} ${profile.username}`.toLowerCase();

  // Check for Swedish characters
  if (SWEDISH_CHARS.test(textToCheck)) {
    indicators.push('swedish_chars');
  }

  // Check for Swedish city names
  for (const city of SWEDISH_CITIES) {
    if (textToCheck.includes(city)) {
      indicators.push(`city:${city}`);
    }
  }

  // Check for Swedish words
  const swedishWords = ['och', 'för', 'med', 'på', 'av', 'välkommen', 'öppet', 'stängt', 'idag'];
  for (const word of swedishWords) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(textToCheck)) {
      indicators.push(`word:${word}`);
    }
  }

  return {
    isSwedish: indicators.length > 0,
    indicators
  };
}

function isFoodBusiness(profile: Candidate): { isFood: boolean; indicators: string[] } {
  const indicators: string[] = [];
  const textToCheck = `${profile.bio || ''} ${profile.nickname || ''} ${profile.username}`.toLowerCase();

  for (const keyword of FOOD_KEYWORDS) {
    if (textToCheck.includes(keyword)) {
      indicators.push(keyword);
    }
  }

  return {
    isFood: indicators.length > 0,
    indicators
  };
}

function calculateScore(profile: Candidate, swedish: string[], food: string[]): number {
  let score = 0;

  // Base score from network overlap
  score += profile.occurrences * 10;

  // Swedish indicators
  score += swedish.length * 5;

  // Food indicators
  score += food.length * 5;

  // Follower count sweet spot (prefer 200-2000)
  const followers = profile.followerCount || 0;
  if (followers >= 200 && followers <= 2000) {
    score += 10;
  } else if (followers >= 50 && followers <= 4000) {
    score += 5;
  }

  // Has bio (more info = better lead)
  if (profile.bio && profile.bio.length > 20) {
    score += 5;
  }

  // Not verified (we want small businesses)
  if (!profile.verified) {
    score += 3;
  }

  return score;
}

async function main() {
  console.log('=== TikTok Lead Filter ===\n');

  const outputDir = path.join(__dirname, 'output');

  // Try candidates.json first (profiles with 2+ occurrences), fallback to raw-network.json
  let candidatesPath = path.join(outputDir, 'candidates.json');
  if (!fs.existsSync(candidatesPath) || JSON.parse(fs.readFileSync(candidatesPath, 'utf-8')).length === 0) {
    candidatesPath = path.join(outputDir, 'raw-network.json');
  }

  if (!fs.existsSync(candidatesPath)) {
    console.error('ERROR: No data found');
    console.log('Run scrape-network.ts first');
    process.exit(1);
  }

  const candidates: Candidate[] = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'));
  console.log(`Loaded ${candidates.length} candidates\n`);

  const leads: FilteredLead[] = [];

  for (const candidate of candidates) {
    // Filter by follower count
    const followers = candidate.followerCount || 0;
    if (followers < MIN_FOLLOWERS || followers > MAX_FOLLOWERS) {
      continue;
    }

    // Check Swedish
    const swedish = isSwedish(candidate);

    // Check food business
    const food = isFoodBusiness(candidate);

    // Must have at least one indicator
    if (!swedish.isSwedish && !food.isFood) {
      continue;
    }

    const score = calculateScore(candidate, swedish.indicators, food.indicators);

    leads.push({
      ...candidate,
      score,
      swedishIndicators: swedish.indicators,
      foodIndicators: food.indicators,
    });
  }

  // Sort by score
  leads.sort((a, b) => b.score - a.score);

  console.log(`Filtered to ${leads.length} qualified leads\n`);

  // Save as JSON
  fs.writeFileSync(
    path.join(outputDir, 'leads.json'),
    JSON.stringify(leads, null, 2)
  );

  // Save as CSV
  const csvHeader = 'username,nickname,followers,score,occurrences,swedish_indicators,food_indicators,bio,profile_url\n';
  const csvRows = leads.map(lead =>
    [
      lead.username,
      `"${(lead.nickname || '').replace(/"/g, '""')}"`,
      lead.followerCount || 0,
      lead.score,
      lead.occurrences,
      `"${lead.swedishIndicators.join(', ')}"`,
      `"${lead.foodIndicators.join(', ')}"`,
      `"${(lead.bio || '').replace(/"/g, '""').substring(0, 100)}"`,
      lead.profileUrl || `https://tiktok.com/@${lead.username}`
    ].join(',')
  ).join('\n');

  fs.writeFileSync(
    path.join(outputDir, 'leads.csv'),
    csvHeader + csvRows
  );

  console.log('Saved results:');
  console.log('  - output/leads.json');
  console.log('  - output/leads.csv');

  // Print top 10
  console.log('\n=== Top 10 Leads ===\n');
  for (const lead of leads.slice(0, 10)) {
    console.log(`@${lead.username} (${lead.followerCount} followers, score: ${lead.score})`);
    console.log(`  Swedish: ${lead.swedishIndicators.join(', ') || 'none'}`);
    console.log(`  Food: ${lead.foodIndicators.join(', ') || 'none'}`);
    console.log(`  Found via: ${lead.sources.slice(0, 3).join(', ')}`);
    console.log();
  }
}

main().catch(console.error);
