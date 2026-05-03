import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: NextRequest) {
  try {
    const { url, analysis } = await req.json();
    
    if (!url || !analysis) {
      return NextResponse.json({ error: 'Missing url or analysis' }, { status: 400 });
    }

    const datasetDir = path.join(process.cwd(), 'datasets/fine-tuning');
    if (!fs.existsSync(datasetDir)) {
      fs.mkdirSync(datasetDir, { recursive: true });
    }

    const filePath = path.join(datasetDir, 'gold_standard.jsonl');
    
    const entry = {
      url,
      analysis,
      timestamp: new Date().toISOString(),
      source: 'fine-tuning-lab'
    };

    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Save error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
