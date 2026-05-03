import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Use untyped client for this route to avoid schema sync issues
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface VideoRating {
  id: string;
  overall_score: number;
  dimensions: Record<string, number>;
  notes: string | null;
  video: {
    id: string;
    video_url: string;
    video_id: string;
    platform: string;
    gcs_uri?: string;
    metadata?: { title?: string };
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'jsonl';
    const markExported = searchParams.get('mark') === 'true';
    const all = searchParams.get('all') === 'true';
    
    // Build query
    let query = supabase
      .from('video_ratings')
      .select(`
        id,
        overall_score,
        dimensions,
        notes,
        video:analyzed_videos(id, video_url, video_id, platform, gcs_uri, metadata)
      `)
      .not('overall_score', 'is', null);
    
    // Only get unexported unless 'all' is specified
    if (!all) {
      query = query.eq('training_exported', false);
    }
    
    const { data: ratings, error } = await query;
    
    if (error) {
      console.error('Export query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    if (!ratings || ratings.length === 0) {
      return NextResponse.json({ 
        message: 'No ratings to export',
        count: 0 
      });
    }
    
    // Type assertion after validation
    const typedRatings = ratings as unknown as VideoRating[];
    
    if (format === 'json') {
      // Return as regular JSON for inspection
      return NextResponse.json({
        count: typedRatings.length,
        ratings: typedRatings
      });
    }
    
    // Convert to Vertex AI JSONL format
    const jsonlLines = typedRatings.map(r => {
      // Use GCS URI if available, otherwise video URL
      // Note: For actual Vertex training, videos need to be in GCS
      const videoUri = r.video.gcs_uri || r.video.video_url;
      
      return JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { 
                text: "Rate this video for content quality and engagement potential. Analyze the hook, pacing, originality, payoff, and rewatchability." 
              },
              { 
                fileData: { 
                  mimeType: "video/mp4", 
                  fileUri: videoUri 
                }
              }
            ]
          }
        ],
        generationConfig: {
          mediaResolution: "MEDIA_RESOLUTION_LOW"
        },
        response: JSON.stringify({
          overall: r.overall_score,
          dimensions: r.dimensions,
          reasoning: r.notes || ""
        })
      });
    });
    
    // Mark as exported if requested
    if (markExported && typedRatings.length > 0) {
      const { error: updateError } = await supabase
        .from('video_ratings')
        .update({ 
          training_exported: true,
          exported_at: new Date().toISOString()
        })
        .in('id', typedRatings.map(r => r.id));
      
      if (updateError) {
        console.error('Failed to mark as exported:', updateError);
      }
    }
    
    // Return as downloadable JSONL
    const jsonlContent = jsonlLines.join('\n');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    return new NextResponse(jsonlContent, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': `attachment; filename="hagen_training_${timestamp}.jsonl"`,
        'X-Record-Count': typedRatings.length.toString()
      }
    });
  } catch (err) {
    console.error('Export error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Stats endpoint
export async function POST(request: NextRequest) {
  try {
    const { data: stats, error } = await supabase
      .from('video_ratings')
      .select('training_exported, overall_score')
      .not('overall_score', 'is', null);
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    const total = stats?.length || 0;
    const exported = stats?.filter((s: { training_exported: boolean }) => s.training_exported).length || 0;
    const pending = total - exported;
    const avgScore = stats && stats.length > 0 
      ? stats.reduce((sum: number, s: { overall_score: number | null }) => sum + (s.overall_score || 0), 0) / stats.length 
      : 0;
    
    return NextResponse.json({
      total_ratings: total,
      exported: exported,
      pending_export: pending,
      average_score: avgScore.toFixed(3)
    });
  } catch (err) {
    console.error('Stats error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
