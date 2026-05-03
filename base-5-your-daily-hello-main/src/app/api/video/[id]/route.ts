import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';

// GCS Configuration
const GCS_PROJECT_ID = 'gen-lang-client-0853618366';

let storage: Storage | null = null;
let initMethod: string = 'none';

function getStorage(): Storage {
  if (!storage) {
    try {
      // Try environment variable first (for Railway/production)
      if (process.env.GCS_CREDENTIALS_BASE64) {
        console.log('[GCS] Initializing with GCS_CREDENTIALS_BASE64');
        const decoded = Buffer.from(process.env.GCS_CREDENTIALS_BASE64, 'base64').toString('utf-8');
        const credentials = JSON.parse(decoded);
        storage = new Storage({
          projectId: GCS_PROJECT_ID,
          credentials,
        });
        initMethod = 'base64';
        console.log('[GCS] Successfully initialized with base64 credentials');
      } else if (process.env.GCS_CREDENTIALS_JSON) {
        console.log('[GCS] Initializing with GCS_CREDENTIALS_JSON');
        const credentials = JSON.parse(process.env.GCS_CREDENTIALS_JSON);
        storage = new Storage({
          projectId: GCS_PROJECT_ID,
          credentials,
        });
        initMethod = 'json';
        console.log('[GCS] Successfully initialized with JSON credentials');
      } else {
        // Fallback: Let GCS SDK find credentials automatically
        console.log('[GCS] No credentials env var found, using default credentials');
        storage = new Storage({
          projectId: GCS_PROJECT_ID,
        });
        initMethod = 'default';
      }
    } catch (error) {
      console.error('[GCS] Failed to initialize:', error);
      throw new Error(`GCS init failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
  return storage;
}

/**
 * Generate signed URL for a GCS video
 * GET /api/video/[id]?gcs_uri=gs://bucket/path
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const gcsUri = request.nextUrl.searchParams.get('gcs_uri');

  if (!gcsUri) {
    return NextResponse.json(
      { error: 'Missing gcs_uri parameter' },
      { status: 400 }
    );
  }

  // Parse GCS URI: gs://bucket-name/path/to/file.mp4
  const match = gcsUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
  if (!match) {
    return NextResponse.json(
      { error: 'Invalid GCS URI format' },
      { status: 400 }
    );
  }

  const [, bucket, filePath] = match;

  try {
    console.log(`[GCS] Signing request for: ${bucket}/${filePath}`);
    const gcs = getStorage();
    const file = gcs.bucket(bucket).file(filePath);

    // Check if file exists
    console.log(`[GCS] Checking if file exists...`);
    const [exists] = await file.exists();
    if (!exists) {
      console.log(`[GCS] File not found: ${bucket}/${filePath}`);
      return NextResponse.json(
        { error: 'Video not found in GCS', bucket, filePath, initMethod },
        { status: 404 }
      );
    }

    // Generate signed URL (valid for 1 hour)
    console.log(`[GCS] Generating signed URL...`);
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    console.log(`[GCS] Successfully signed URL for: ${bucket}/${filePath}`);
    return NextResponse.json({
      id,
      signedUrl,
      expiresIn: 3600,
      bucket,
      filePath,
      initMethod,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'unknown error';
    console.error(`[GCS] Signing error for ${bucket}/${filePath}:`, errorMsg);
    return NextResponse.json(
      {
        error: 'Failed to generate signed URL',
        details: errorMsg,
        bucket,
        filePath,
        initMethod,
        hasBase64Creds: !!process.env.GCS_CREDENTIALS_BASE64,
        hasJsonCreds: !!process.env.GCS_CREDENTIALS_JSON,
      },
      { status: 500 }
    );
  }
}
