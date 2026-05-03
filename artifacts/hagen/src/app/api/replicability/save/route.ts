import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATASET_PATH = path.join(process.cwd(), 'datasets/replicability_dataset_2025-12-23.json');

export async function POST(request: Request) {
  try {
    const { video_id, new_analysis } = await request.json();

    if (!fs.existsSync(DATASET_PATH)) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
    }

    const replicabilityData = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'));
    const index = replicabilityData.findIndex((d: any) => d.video_id === video_id);

    if (index !== -1) {
      replicabilityData[index].replicability_analysis = new_analysis;
      replicabilityData[index].translation_status = 'verified'; // Mark as manually verified/saved
      fs.writeFileSync(DATASET_PATH, JSON.stringify(replicabilityData, null, 2));
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
