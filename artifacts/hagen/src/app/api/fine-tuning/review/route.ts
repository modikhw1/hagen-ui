import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const REVIEW_FILE = path.join(process.cwd(), 'datasets/fine-tuning/entries_for_review.json');
const GOLD_STANDARD_FILE = path.join(process.cwd(), 'datasets/fine-tuning/gold_standard.jsonl');

// GET - Load entries for review
export async function GET() {
  try {
    if (!fs.existsSync(REVIEW_FILE)) {
      return NextResponse.json({
        error: 'No review file found. Run: node scripts/export-weak-entries.js'
      }, { status: 404 });
    }

    const data = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf-8'));
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT - Save single entry edit
export async function PUT(req: NextRequest) {
  try {
    const { id, observation, handling, mekanism, varfor, malgrupp } = await req.json();

    if (!id) {
      return NextResponse.json({ error: 'Missing entry ID' }, { status: 400 });
    }

    // Load review file
    const data = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf-8'));

    // Find and update entry
    const entryIndex = data.entries.findIndex((e: any) => e.id === id);
    if (entryIndex === -1) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    data.entries[entryIndex] = {
      ...data.entries[entryIndex],
      observation: observation || data.entries[entryIndex].observation,
      handling: handling || data.entries[entryIndex].handling,
      mekanism: mekanism || data.entries[entryIndex].mekanism,
      varfor: varfor || data.entries[entryIndex].varfor,
      malgrupp: malgrupp || data.entries[entryIndex].malgrupp,
      reviewed: true,
      edited_at: new Date().toISOString()
    };

    // Save review file
    fs.writeFileSync(REVIEW_FILE, JSON.stringify(data, null, 2));

    return NextResponse.json({
      success: true,
      entry: data.entries[entryIndex]
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Apply reviewed entries to gold_standard
export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json();

    if (action !== 'apply') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Load review file
    const reviewData = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf-8'));
    const reviewedEntries = reviewData.entries.filter((e: any) => e.reviewed);

    if (reviewedEntries.length === 0) {
      return NextResponse.json({ error: 'No reviewed entries to apply' }, { status: 400 });
    }

    // Load gold_standard
    const goldLines = fs.readFileSync(GOLD_STANDARD_FILE, 'utf-8')
      .split('\n')
      .filter(l => l.trim());

    // Create map of reviewed entries by line number
    const reviewMap = new Map();
    reviewedEntries.forEach((e: any) => {
      reviewMap.set(e.id, e);
    });

    // Update gold_standard entries
    const updatedLines = goldLines.map((line, index) => {
      const lineNum = index + 1;
      const reviewed = reviewMap.get(lineNum);

      if (reviewed) {
        try {
          const original = JSON.parse(line);

          // Build new analysis string
          const newAnalysis = [
            reviewed.observation ? `**Observation:** ${reviewed.observation}` : '',
            `**Handling:** ${reviewed.handling}`,
            `**Mekanism:** ${reviewed.mekanism}`,
            `**Varför:** ${reviewed.varfor}`,
            `**Målgrupp:** ${reviewed.malgrupp}`
          ].filter(Boolean).join('\n');

          return JSON.stringify({
            ...original,
            analysis: newAnalysis,
            enriched_at: new Date().toISOString(),
            enrichment_source: 'manual-review'
          });
        } catch (e) {
          return line;
        }
      }

      return line;
    });

    // Backup original
    const backupPath = GOLD_STANDARD_FILE.replace('.jsonl', '_backup_' + Date.now() + '.jsonl');
    fs.copyFileSync(GOLD_STANDARD_FILE, backupPath);

    // Save updated gold_standard
    fs.writeFileSync(GOLD_STANDARD_FILE, updatedLines.join('\n'));

    return NextResponse.json({
      success: true,
      applied: reviewedEntries.length,
      backup: backupPath
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
