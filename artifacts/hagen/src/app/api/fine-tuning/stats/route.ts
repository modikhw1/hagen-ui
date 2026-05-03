import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATASET_DIR = path.join(process.cwd(), 'datasets/fine-tuning');
const GOLD_STANDARD_PATH = path.join(DATASET_DIR, 'gold_standard.jsonl');
const TEST_SET_PATH = path.join(DATASET_DIR, 'test_set.jsonl');
const STAGING_PATH = path.join(DATASET_DIR, 'staging.jsonl');

// Mechanism keywords to count
const MECHANISM_KEYWORDS = [
  'subversion', 'igenkänning', 'överdrift', 'kontrast', 'ironi',
  'absurd', 'timing', 'mörk humor', 'ordvits', 'humor'
];

interface DatasetStats {
  total: number;
  bySource: Record<string, number>;
  byMechanism: Record<string, number>;
  testSetSize: number;
  stagingSize: number;
  recentAdditions: number;
  lastUpdated: string | null;
}

function countLines(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  return fs.readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim()).length;
}

function parseEntries(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim());
  return lines.map(l => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

export async function GET() {
  try {
    const entries = parseEntries(GOLD_STANDARD_PATH);

    // Count by source
    const bySource: Record<string, number> = {};
    for (const entry of entries) {
      const source = entry.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    }

    // Count by mechanism (extract from analysis text)
    const byMechanism: Record<string, number> = {};
    for (const entry of entries) {
      const analysis = (entry.analysis || '').toLowerCase();

      // Extract mechanism field
      const mechMatch = analysis.match(/\*\*mekanism:\*\*\s*([^*\n]+)/i);
      if (mechMatch) {
        const mechText = mechMatch[1].toLowerCase();

        // Count each keyword found
        for (const keyword of MECHANISM_KEYWORDS) {
          if (mechText.includes(keyword)) {
            byMechanism[keyword] = (byMechanism[keyword] || 0) + 1;
          }
        }
      }
    }

    // Sort mechanisms by count
    const sortedMechanisms: Record<string, number> = {};
    Object.entries(byMechanism)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => { sortedMechanisms[k] = v; });

    // Count recent additions (last 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const recentAdditions = entries.filter(e => {
      if (!e.timestamp) return false;
      return new Date(e.timestamp) > oneWeekAgo;
    }).length;

    // Get last update time
    const timestamps = entries
      .filter(e => e.timestamp)
      .map(e => new Date(e.timestamp).getTime());
    const lastUpdated = timestamps.length > 0
      ? new Date(Math.max(...timestamps)).toISOString()
      : null;

    const stats: DatasetStats = {
      total: entries.length,
      bySource,
      byMechanism: sortedMechanisms,
      testSetSize: countLines(TEST_SET_PATH),
      stagingSize: countLines(STAGING_PATH),
      recentAdditions,
      lastUpdated
    };

    return NextResponse.json(stats);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
