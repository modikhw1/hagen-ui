import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Use untyped client for this route to avoid schema sync issues
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { 
      video_id, 
      overall_score, 
      dimensions, 
      tags, 
      notes, 
      rater_id, 
      ai_prediction,
      replicability_notes,
      brand_context,
      humor_type
    } = body;
    
    if (!video_id) {
      return NextResponse.json({ error: 'video_id is required' }, { status: 400 });
    }
    
    if (overall_score !== null && (overall_score < 0 || overall_score > 1)) {
      return NextResponse.json({ error: 'overall_score must be between 0 and 1' }, { status: 400 });
    }
    
    // Store AI prediction with disagreement data embedded
    let aiPredictionWithDelta = ai_prediction ? { ...ai_prediction } : null;
    if (ai_prediction && overall_score !== null) {
      aiPredictionWithDelta = {
        ...ai_prediction,
        user_disagreement: {
          overall_delta: overall_score - ai_prediction.overall,
          dimension_deltas: dimensions ? Object.fromEntries(
            Object.entries(dimensions).map(([key, val]) => [
              key,
              (val as number) - (ai_prediction.dimensions?.[key] || 0.5)
            ])
          ) : {},
        }
      };
    }
    
    const { data, error } = await supabase
      .from('video_ratings')
      .upsert({
        video_id,
        overall_score,
        dimensions: dimensions || {},
        tags: tags || [],
        notes: notes || null,
        replicability_notes: replicability_notes || null,
        brand_context: brand_context || null,
        humor_type: humor_type || null,
        rated_at: new Date().toISOString(),
        rater_id: rater_id || 'primary',
        ai_prediction: aiPredictionWithDelta,
      }, {
        onConflict: 'video_id,rater_id'
      })
      .select()
      .single();
    
    if (error) {
      console.error('Rating save error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    const delta = aiPredictionWithDelta?.user_disagreement?.overall_delta;
    console.log(`✅ Rating saved for video ${video_id}`, delta !== undefined ? `(delta: ${delta.toFixed(2)})` : '');
    
    return NextResponse.json(data);
  } catch (err) {
    console.error('Rating API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const unrated = searchParams.get('unrated') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const raterId = searchParams.get('rater_id') || 'primary';
    
    if (unrated) {
      // Get videos that don't have a rating from this rater
      const { data, error } = await supabase
        .from('analyzed_videos')
        .select(`
          id,
          video_url,
          video_id,
          platform,
          metadata,
          gcs_uri,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      // Filter out already rated videos
      const { data: ratings } = await supabase
        .from('video_ratings')
        .select('video_id')
        .eq('rater_id', raterId);
      
      const ratedIds = new Set(ratings?.map((r: { video_id: string }) => r.video_id) || []);
      const unratedVideos = (data || []).filter((v: { id: string }) => !ratedIds.has(v.id));
      
      // Transform to match expected format
      const transformed = unratedVideos.map((v: {
        id: string;
        video_url: string;
        video_id: string;
        platform: string;
        metadata?: { title?: string; thumbnail_url?: string };
        gcs_uri?: string;
        created_at: string;
      }) => ({
        id: v.id,
        source_url: v.video_url,
        title: v.metadata?.title || v.video_id,
        platform: v.platform,
        thumbnail_url: v.metadata?.thumbnail_url,
        gcs_uri: v.gcs_uri,
        created_at: v.created_at
      }));
      
      return NextResponse.json(transformed);
    }
    
    // Get all ratings with video info (including visual_analysis for correlation)
    const { data, error } = await supabase
      .from('video_ratings')
      .select(`
        *,
        video:analyzed_videos(id, video_url, video_id, platform, metadata, visual_analysis, gcs_uri)
      `)
      .eq('rater_id', raterId)
      .order('rated_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(data);
  } catch (err) {
    console.error('Rating fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
