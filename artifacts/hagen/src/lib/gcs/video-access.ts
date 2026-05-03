/**
 * GCS Video Access Utilities
 * 
 * Generates signed URLs for secure video access across codespaces
 */

import { Storage } from '@google-cloud/storage';

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

export interface SignedUrlOptions {
  expiresInDays?: number;
  action?: 'read' | 'write';
}

/**
 * Generate a signed URL for a GCS video
 * @param gcsUri - Full GCS URI (gs://bucket/path/to/video.mp4)
 * @param options - Configuration options
 * @returns Signed URL that works across any environment
 */
export async function getSignedVideoUrl(
  gcsUri: string,
  options: SignedUrlOptions = {}
): Promise<string> {
  const { expiresInDays = 7, action = 'read' } = options;

  // Parse GCS URI
  const [bucketName, ...pathParts] = gcsUri.replace('gs://', '').split('/');
  const filePath = pathParts.join('/');

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(filePath);

  // Check if file exists
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`Video not found: ${gcsUri}`);
  }

  // Generate signed URL
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action,
    expires: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  });

  return url;
}

/**
 * Batch generate signed URLs for multiple videos
 */
export async function getSignedVideoUrls(
  gcsUris: string[],
  options?: SignedUrlOptions
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();

  await Promise.all(
    gcsUris.map(async (uri) => {
      try {
        const signedUrl = await getSignedVideoUrl(uri, options);
        urlMap.set(uri, signedUrl);
      } catch (error) {
        console.error(`Failed to generate signed URL for ${uri}:`, error);
        // Keep the original URI as fallback
        urlMap.set(uri, uri);
      }
    })
  );

  return urlMap;
}

/**
 * Convert GCS URI to public URL (requires bucket to be public)
 * Use this only if you've run: gsutil iam ch allUsers:objectViewer gs://bucket-name
 */
export function gcsUriToPublicUrl(gcsUri: string): string {
  const path = gcsUri.replace('gs://', '');
  return `https://storage.googleapis.com/${path}`;
}

/**
 * Check if a video is accessible at a given URL
 */
export async function checkVideoAccessibility(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}
