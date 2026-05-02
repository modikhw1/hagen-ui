/**
 * Seed Script: Populate concepts table from JSON data files
 *
 * Reads clips-priority.json and clips.json, then inserts all clips
 * into the `concepts` table via the Supabase Admin client.
 * Idempotent: skips concepts that already exist (ON CONFLICT DO NOTHING).
 *
 * Usage (from app/ directory):
 *   npx ts-node scripts/seed-concepts.ts
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'OK' : 'MISSING');
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'OK' : 'MISSING');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ClipsFile {
  _meta?: { version: string; lastUpdated: string; description: string };
  clips: Array<Record<string, unknown>>;
  overrides?: Record<string, Record<string, unknown>>;
  defaults?: Record<string, unknown>;
}

function loadClipsFile(filePath: string): ClipsFile {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ClipsFile;
}

async function main() {
  console.log('Starting concepts seed...\n');

  // Load both JSON files
  const dataDir = path.join(process.cwd(), 'src', 'data');
  const priorityPath = path.join(dataDir, 'clips-priority.json');
  const basicPath = path.join(dataDir, 'clips.json');

  const priorityData = loadClipsFile(priorityPath);
  const basicData = loadClipsFile(basicPath);

  console.log(`Loaded clips-priority.json: ${priorityData.clips.length} clips`);
  console.log(`Loaded clips.json: ${basicData.clips.length} clips`);

  // Merge: priority first, add any from basic that aren't already in priority
  const allClips = [...priorityData.clips];
  const allOverrides: Record<string, Record<string, unknown>> = { ...(priorityData.overrides ?? {}) };
  const seenIds = new Set(priorityData.clips.map((c) => c.id as string));

  for (const clip of basicData.clips) {
    const clipId = clip.id as string;
    if (!seenIds.has(clipId)) {
      allClips.push(clip);
      if (basicData.overrides?.[clipId]) {
        allOverrides[clipId] = basicData.overrides[clipId];
      }
    }
  }

  console.log(`\nTotal concepts to seed: ${allClips.length}\n`);

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const clip of allClips) {
    const clipId = clip.id as string;

    // Remove internal comment fields before storing
    const { _comment, ...backendData } = clip as Record<string, unknown>;
    void _comment; // suppress unused variable warning

    const overrides = allOverrides[clipId] ?? basicData.defaults ?? {};

    const { error } = await supabase.from('concepts').insert({
      id: clipId,
      source: 'hagen',
      created_by: null,
      backend_data: backendData,
      overrides,
      is_active: true,
      version: 1,
    });

    if (error) {
      if (error.code === '23505') {
        // Unique violation = already exists
        console.log(`  SKIP ${clipId} (already exists)`);
        skipped++;
      } else {
        console.error(`  ERROR ${clipId}:`, error.message);
        errors++;
      }
    } else {
      console.log(`  INSERT ${clipId}`);
      inserted++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Errors:   ${errors}`);

  if (errors > 0) {
    console.error('\nSeed completed with errors.');
    process.exit(1);
  } else {
    console.log('\nSeed complete.');
  }
}

main().catch((err: Error) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
