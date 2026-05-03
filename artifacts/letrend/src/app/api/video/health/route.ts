import { NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';

const GCS_PROJECT_ID = 'gen-lang-client-0853618366';
const TEST_BUCKET = 'hagen-video-analysis';

/**
 * Health check endpoint for GCS configuration
 * GET /api/video/health
 */
export async function GET() {
  const status: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    hasBase64Creds: !!process.env.GCS_CREDENTIALS_BASE64,
    hasJsonCreds: !!process.env.GCS_CREDENTIALS_JSON,
    base64Length: process.env.GCS_CREDENTIALS_BASE64?.length || 0,
    jsonLength: process.env.GCS_CREDENTIALS_JSON?.length || 0,
  };

  try {
    let storage: Storage;

    if (process.env.GCS_CREDENTIALS_BASE64) {
      status.initMethod = 'base64';
      const decoded = Buffer.from(process.env.GCS_CREDENTIALS_BASE64, 'base64').toString('utf-8');
      status.decodedLength = decoded.length;

      try {
        const credentials = JSON.parse(decoded);
        status.credentialsValid = true;
        status.projectId = credentials.project_id;
        status.clientEmail = credentials.client_email?.slice(0, 30) + '...';

        storage = new Storage({
          projectId: GCS_PROJECT_ID,
          credentials,
        });
      } catch (parseErr) {
        status.credentialsValid = false;
        status.parseError = parseErr instanceof Error ? parseErr.message : 'parse failed';
        return NextResponse.json({ ...status, ok: false }, { status: 500 });
      }
    } else if (process.env.GCS_CREDENTIALS_JSON) {
      status.initMethod = 'json';
      try {
        const credentials = JSON.parse(process.env.GCS_CREDENTIALS_JSON);
        status.credentialsValid = true;
        status.projectId = credentials.project_id;

        storage = new Storage({
          projectId: GCS_PROJECT_ID,
          credentials,
        });
      } catch (parseErr) {
        status.credentialsValid = false;
        status.parseError = parseErr instanceof Error ? parseErr.message : 'parse failed';
        return NextResponse.json({ ...status, ok: false }, { status: 500 });
      }
    } else {
      status.initMethod = 'default';
      storage = new Storage({ projectId: GCS_PROJECT_ID });
    }

    // Test bucket access
    const bucket = storage.bucket(TEST_BUCKET);
    const [exists] = await bucket.exists();
    status.bucketExists = exists;

    if (exists) {
      // List one file to verify read access
      const [files] = await bucket.getFiles({ maxResults: 1 });
      status.canListFiles = true;
      status.sampleFile = files[0]?.name || 'no files';
    }

    return NextResponse.json({ ...status, ok: true });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'unknown';
    return NextResponse.json({ ...status, ok: false, error: errorMsg }, { status: 500 });
  }
}
