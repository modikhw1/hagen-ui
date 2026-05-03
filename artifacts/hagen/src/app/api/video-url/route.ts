/**
 * Video URL API
 * 
 * Generates signed URLs for GCS videos
 * Use this endpoint to get accessible video URLs from any codespace
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSignedVideoUrl, getSignedVideoUrls } from '@/lib/gcs/video-access';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gcs_uri, gcs_uris, expires_in_days } = body;

    // Batch request
    if (gcs_uris && Array.isArray(gcs_uris)) {
      const urlMap = await getSignedVideoUrls(gcs_uris, {
        expiresInDays: expires_in_days || 7,
      });

      return NextResponse.json({
        success: true,
        urls: Object.fromEntries(urlMap),
      });
    }

    // Single request
    if (gcs_uri) {
      const signedUrl = await getSignedVideoUrl(gcs_uri, {
        expiresInDays: expires_in_days || 7,
      });

      return NextResponse.json({
        success: true,
        url: signedUrl,
        expires_in_days: expires_in_days || 7,
      });
    }

    return NextResponse.json(
      { error: 'Either gcs_uri or gcs_uris is required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate signed URL',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const gcsUri = searchParams.get('gcs_uri');
  const expiresInDays = parseInt(searchParams.get('expires_in_days') || '7');

  if (!gcsUri) {
    return NextResponse.json(
      { error: 'gcs_uri parameter is required' },
      { status: 400 }
    );
  }

  try {
    const signedUrl = await getSignedVideoUrl(gcsUri, {
      expiresInDays,
    });

    return NextResponse.json({
      success: true,
      url: signedUrl,
      expires_in_days: expiresInDays,
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate signed URL',
      },
      { status: 500 }
    );
  }
}
