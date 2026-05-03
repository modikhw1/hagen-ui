import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all rated videos, ordered by most recent first
    // Join with video_ratings table to get ratings
    const { data: videos, error } = await supabase
      .from('analyzed_videos')
      .select(`
        id, 
        video_url, 
        platform, 
        metadata, 
        rated_at, 
        visual_analysis, 
        user_notes,
        rating:video_ratings(overall_score, dimensions, notes)
      `)
      .not('rating', 'is', null)
      .order('rated_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch library:', error);
      return NextResponse.json(
        { error: 'Failed to fetch video library' },
        { status: 500 }
      );
    }

    // Transform videos to include has_deep_analysis flag
    const transformedVideos = (videos || []).map(video => {
      // Check if visual_analysis has deep_analysis data (150+ features)
      const hasDeepAnalysis = video.visual_analysis?.deep_analysis || 
        (video.visual_analysis?.analysis?.features && 
         Object.keys(video.visual_analysis.analysis.features).length > 50);
      
      return {
        id: video.id,
        video_url: video.video_url,
        platform: video.platform,
        metadata: video.metadata,
        rated_at: video.rated_at,
        rating: video.rating,
        user_notes: video.user_notes,
        has_deep_analysis: !!hasDeepAnalysis
      };
    });

    return NextResponse.json({ videos: transformedVideos });
  } catch (error) {
    console.error('Library API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('id');

    if (!videoId) {
      return NextResponse.json(
        { error: 'Video ID is required' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Delete from video_ratings first (if exists)
    await supabase
      .from('video_ratings')
      .delete()
      .eq('video_id', videoId);

    // Delete from analyzed_videos
    const { error } = await supabase
      .from('analyzed_videos')
      .delete()
      .eq('id', videoId);

    if (error) {
      console.error('Failed to delete video:', error);
      return NextResponse.json(
        { error: 'Failed to delete video' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, deleted: videoId });
  } catch (error) {
    console.error('Delete API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
