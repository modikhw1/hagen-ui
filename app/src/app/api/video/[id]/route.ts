import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';

// GCS Configuration
const GCS_PROJECT_ID = 'gen-lang-client-0853618366';

let storage: Storage | null = null;

function getStorage(): Storage {
  if (!storage) {
    try {
      // Try environment variable first (for Railway/production)
      if (process.env.GCS_CREDENTIALS_BASE64) {
        const credentials = JSON.parse(
          Buffer.from(process.env.GCS_CREDENTIALS_BASE64, 'base64').toString('utf-8')
        );
        storage = new Storage({
          projectId: GCS_PROJECT_ID,
          credentials,
        });
      } else if (process.env.GCS_CREDENTIALS_JSON) {
        const credentials = JSON.parse(process.env.GCS_CREDENTIALS_JSON);
        storage = new Storage({
          projectId: GCS_PROJECT_ID,
          credentials,
        });
      } else {
        // Fallback: Let GCS SDK find credentials automatically
        // (works with GOOGLE_APPLICATION_CREDENTIALS env var or default credentials)
        storage = new Storage({
          projectId: GCS_PROJECT_ID,
        });
      }
    } catch (error) {
      console.error('Failed to initialize GCS:', error);
      throw new Error('GCS not available');
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
    const gcs = getStorage();
    const file = gcs.bucket(bucket).file(filePath);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json(
        { error: 'Video not found in GCS' },
        { status: 404 }
      );
    }

    // Generate signed URL (valid for 1 hour)
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    return NextResponse.json({
      id,
      signedUrl,
      expiresIn: 3600,
      bucket,
      filePath,
    });
  } catch (error) {
    console.error('GCS signing error:', error);
    return NextResponse.json(
      { error: 'Failed to generate signed URL' },
      { status: 500 }
    );
  }
}
