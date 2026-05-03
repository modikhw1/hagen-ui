#!/usr/bin/env node
/**
 * Export Dataset with Signed Video URLs
 * 
 * Generates a dataset JSON with signed GCS URLs that work across codespaces
 * 
 * Usage:
 *   node scripts/export-with-signed-urls.js [--days=7]
 * 
 * Output: exports/dataset_with_urls_YYYY-MM-DD.json
 */

const { createClient } = require('@supabase/supabase-js');
const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');

// Load env
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    process.env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize GCS
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

async function generateSignedUrl(gcsUri, expiresInDays = 7) {
  try {
    const [bucketName, ...pathParts] = gcsUri.replace('gs://', '').split('/');
    const filePath = pathParts.join('/');
    
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(filePath);
    
    const [exists] = await file.exists();
    if (!exists) {
      console.warn(`⚠️  Video not found: ${gcsUri}`);
      return null;
    }
    
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    });
    
    return url;
  } catch (error) {
    console.error(`❌ Failed to generate signed URL for ${gcsUri}:`, error.message);
    return null;
  }
}

async function exportData() {
  // Parse command line args
  const args = process.argv.slice(2);
  const daysArg = args.find(arg => arg.startsWith('--days='));
  const expiresInDays = daysArg ? parseInt(daysArg.split('=')[1]) : 7;
  
  console.log(`🚀 Exporting dataset with signed URLs (expires in ${expiresInDays} days)...\n`);
  
  // Fetch all videos
  const { data: videos, error } = await supabase
    .from('analyzed_videos')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching videos:', error);
    process.exit(1);
  }

  console.log(`📊 Processing ${videos.length} videos...\n`);

  let successCount = 0;
  let failCount = 0;
  
  // Generate signed URLs for all videos with GCS URIs
  const videosWithUrls = await Promise.all(
    videos.map(async (video, index) => {
      if (video.gcs_uri) {
        process.stdout.write(`\rProcessing: ${index + 1}/${videos.length}`);
        const signedUrl = await generateSignedUrl(video.gcs_uri, expiresInDays);
        
        if (signedUrl) {
          successCount++;
          return {
            ...video,
            video_player_url: signedUrl,
            url_expires_at: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
          };
        } else {
          failCount++;
        }
      }
      return video;
    })
  );

  console.log('\n');

  const exportData = {
    exportedAt: new Date().toISOString(),
    source: 'supabase + gcs',
    urlExpiresInDays: expiresInDays,
    totalVideos: videos.length,
    videosWithSignedUrls: successCount,
    videosMissingUrls: failCount,
    videos: videosWithUrls,
  };

  // Ensure exports directory exists
  if (!fs.existsSync('exports')) {
    fs.mkdirSync('exports');
  }

  const filename = `exports/dataset_with_urls_${new Date().toISOString().split('T')[0]}.json`;
  fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
  
  console.log(`✅ Exported to: ${filename}\n`);
  console.log('📈 Summary:');
  console.log(`   - Total videos: ${videos.length}`);
  console.log(`   - With signed URLs: ${successCount}`);
  console.log(`   - Missing GCS URIs: ${videos.length - successCount - failCount}`);
  console.log(`   - Failed to generate: ${failCount}`);
  console.log(`   - URL expires: ${new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()}`);
  console.log('\n💡 Use these signed URLs in any codespace for the next', expiresInDays, 'days');
}

exportData().catch(console.error);
