/**
 * Video Upload API
 * 
 * Uploads videos to Google Cloud Storage for Vertex AI training
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { VideoDownloader, createVideoDownloader } from '@/lib/services/video/downloader';
import { VideoStorageService, createVideoStorageService } from '@/lib/services/video/storage';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * POST /api/videos/upload
 * 
 * Download a video and upload to GCS
 * Body: { videoId: string } or { videoUrl: string, platform: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoId, videoUrl, platform } = body;

    let sourceUrl = videoUrl;
    let dbVideoId = videoId;

    // If videoId provided, get the video URL from database
    if (videoId && !videoUrl) {
      const { data, error } = await supabase
        .from('analyzed_videos')
        .select('id, video_url, platform, gcs_uri')
        .eq('id', videoId)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: 'Video not found' }, { status: 404 });
      }

      // Already uploaded?
      if (data.gcs_uri) {
        return NextResponse.json({
          success: true,
          message: 'Video already uploaded to GCS',
          gcsUri: data.gcs_uri
        });
      }

      sourceUrl = data.video_url;
      dbVideoId = data.id;
    }

    if (!sourceUrl) {
      return NextResponse.json({ error: 'videoUrl or videoId is required' }, { status: 400 });
    }

    console.log(`📥 Processing video upload: ${sourceUrl}`);

    // Initialize services
    const downloader = createVideoDownloader();
    const storage = createVideoStorageService();

    // Download the video
    const downloadResult = await downloader.downloadWithYtDlp(sourceUrl);

    if (!downloadResult.success || !downloadResult.filePath) {
      console.error('[videos/upload] Download failed', {
        sourceUrl,
        platform,
        details: downloadResult.error,
      });

      return NextResponse.json({
        error: 'Failed to download video',
        details: downloadResult.error,
        sourceUrl,
        platform,
      }, { status: 500 });
    }

    console.log(`✅ Downloaded: ${downloadResult.filePath}`);

    // Upload to GCS
    const videoFileName = dbVideoId || `video_${Date.now()}`;
    const uploadResult = await storage.uploadVideo(downloadResult.filePath, videoFileName);

    // Clean up local file
    await downloader.cleanup(downloadResult.filePath);

    if (!uploadResult.success || !uploadResult.gsUrl) {
      return NextResponse.json({
        error: 'Failed to upload to GCS',
        details: uploadResult.error
      }, { status: 500 });
    }

    console.log(`☁️ Uploaded to GCS: ${uploadResult.gsUrl}`);

    // Update database with GCS URI
    if (dbVideoId) {
      await supabase
        .from('analyzed_videos')
        .update({ gcs_uri: uploadResult.gsUrl })
        .eq('id', dbVideoId);
    }

    return NextResponse.json({
      success: true,
      gcsUri: uploadResult.gsUrl,
      publicUrl: uploadResult.publicUrl,
      videoId: dbVideoId
    });

  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Upload failed'
    }, { status: 500 });
  }
}

/**
 * GET /api/videos/upload
 * 
 * Get upload status and stats
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'stats') {
      // Get upload statistics
      const { data: total } = await supabase
        .from('analyzed_videos')
        .select('id', { count: 'exact' });

      const { data: uploaded } = await supabase
        .from('analyzed_videos')
        .select('id', { count: 'exact' })
        .not('gcs_uri', 'is', null);

      const { data: rated } = await supabase
        .from('video_ratings')
        .select('video_id', { count: 'exact' });

      return NextResponse.json({
        totalVideos: total?.length || 0,
        uploadedToGcs: uploaded?.length || 0,
        rated: rated?.length || 0,
        pendingUpload: (total?.length || 0) - (uploaded?.length || 0)
      });
    }

    if (action === 'pending') {
      // Get videos pending upload
      const { data, error } = await supabase
        .from('analyzed_videos')
        .select('id, video_url, platform, created_at')
        .is('gcs_uri', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        pending: data || [],
        count: data?.length || 0
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (err) {
    console.error('Upload stats error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to get stats'
    }, { status: 500 });
  }
}

/**
 * PUT /api/videos/upload
 * 
 * Bulk upload videos to GCS
 * Body: { videoIds: string[] } or { limit: number } to upload pending
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoIds, limit = 10 } = body;

    let videosToUpload: Array<{ id: string; video_url: string }> = [];

    if (videoIds && Array.isArray(videoIds)) {
      // Upload specific videos
      const { data, error } = await supabase
        .from('analyzed_videos')
        .select('id, video_url')
        .in('id', videoIds)
        .is('gcs_uri', null);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      videosToUpload = data || [];
    } else {
      // Upload pending videos up to limit
      const { data, error } = await supabase
        .from('analyzed_videos')
        .select('id, video_url')
        .is('gcs_uri', null)
        .limit(limit);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      videosToUpload = data || [];
    }

    if (videosToUpload.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No videos to upload',
        results: []
      });
    }

    const downloader = createVideoDownloader();
    const storage = createVideoStorageService();

    const results: Array<{
      videoId: string;
      success: boolean;
      gcsUri?: string;
      error?: string;
    }> = [];

    // Process videos sequentially to avoid overwhelming resources
    for (const video of videosToUpload) {
      try {
        console.log(`📥 Processing: ${video.id}`);

        // Download
        const downloadResult = await downloader.downloadWithYtDlp(video.video_url);
        
        if (!downloadResult.success || !downloadResult.filePath) {
          results.push({
            videoId: video.id,
            success: false,
            error: downloadResult.error || 'Download failed'
          });
          continue;
        }

        // Upload
        const uploadResult = await storage.uploadVideo(downloadResult.filePath, video.id);
        
        // Cleanup
        await downloader.cleanup(downloadResult.filePath);

        if (!uploadResult.success || !uploadResult.gsUrl) {
          results.push({
            videoId: video.id,
            success: false,
            error: uploadResult.error || 'Upload failed'
          });
          continue;
        }

        // Update database
        await supabase
          .from('analyzed_videos')
          .update({ gcs_uri: uploadResult.gsUrl })
          .eq('id', video.id);

        results.push({
          videoId: video.id,
          success: true,
          gcsUri: uploadResult.gsUrl
        });

      } catch (err) {
        results.push({
          videoId: video.id,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      summary: {
        total: results.length,
        successful,
        failed
      },
      results
    });

  } catch (err) {
    console.error('Bulk upload error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Bulk upload failed'
    }, { status: 500 });
  }
}
