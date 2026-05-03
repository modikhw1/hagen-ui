import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATASET_PATH = path.join(process.cwd(), 'datasets/replicability_dataset_2025-12-23.json');
const ORIGINAL_DATASET_PATH = path.join(process.cwd(), 'datasets/dataset_2025-12-18.json');

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter'); // 'unverified' or null

    if (!fs.existsSync(DATASET_PATH)) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    const replicabilityData = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
    let originalData: any[] = [];
    
    if (fs.existsSync(ORIGINAL_DATASET_PATH)) {
      const raw = JSON.parse(fs.readFileSync(ORIGINAL_DATASET_PATH, 'utf8'));
      originalData = raw.videos || [];
    }

    let candidates = replicabilityData;
    if (filter === 'unverified') {
      candidates = replicabilityData.filter((d: any) => d.translation_status !== 'verified');
      if (candidates.length === 0) {
        // Fallback if all are verified
        candidates = replicabilityData;
      }
    }

    const randomIndex = Math.floor(Math.random() * candidates.length);
    const entry = candidates[randomIndex];
    const original = originalData.find((v: any) => v.id === entry.video_id);

    return NextResponse.json({
      ...entry,
      url: original ? original.video_url : null,
      remaining_unverified: replicabilityData.filter((d: any) => d.translation_status !== 'verified').length
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
