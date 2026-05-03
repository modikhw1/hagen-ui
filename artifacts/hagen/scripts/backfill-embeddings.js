/**
 * Backfill embeddings for videos that don't have them
 * Run: source .env.local && node scripts/backfill-embeddings.js
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai').default;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    encoding_format: 'float'
  });
  return response.data[0].embedding;
}

function buildEmbeddingText(video, rating) {
  const parts = [];

  // Metadata
  if (video.metadata) {
    parts.push(`Title: ${video.metadata.title || 'N/A'}`);
    parts.push(`Description: ${video.metadata.description || 'N/A'}`);
    if (video.metadata.author?.displayName) {
      parts.push(`Author: ${video.metadata.author.displayName}`);
    }
  }

  // Visual analysis summary (deep_analysis is inside visual_analysis)
  const deepAnalysis = video.visual_analysis?.deep_analysis;
  if (deepAnalysis?.script?.summary) {
    parts.push(`Summary: ${deepAnalysis.script.summary}`);
  }
  if (deepAnalysis?.script?.humor?.humorMechanism) {
    parts.push(`Humor: ${deepAnalysis.script.humor.humorMechanism}`);
  }

  // Human notes (most important!)
  if (rating?.notes) {
    parts.push(`Expert Notes: ${rating.notes}`);
  }

  return parts.join('\n');
}

async function main() {
  console.log('🔍 Finding videos without embeddings...');

  // Get videos without embeddings
  const { data: videos, error } = await supabase
    .from('analyzed_videos')
    .select('id, video_url, metadata, visual_analysis')
    .is('content_embedding', null);

  if (error) {
    console.error('Error fetching videos:', error);
    return;
  }

  console.log(`📊 Found ${videos.length} videos without embeddings`);

  if (videos.length === 0) {
    console.log('✅ All videos have embeddings!');
    return;
  }

  // Get ratings for these videos
  const videoIds = videos.map(v => v.id);
  const { data: ratings } = await supabase
    .from('video_ratings')
    .select('video_id, notes, overall_score')
    .in('video_id', videoIds);

  const ratingsMap = {};
  ratings?.forEach(r => {
    ratingsMap[r.video_id] = r;
  });

  let success = 0;
  let failed = 0;

  for (const video of videos) {
    try {
      const rating = ratingsMap[video.id];
      const text = buildEmbeddingText(video, rating);

      if (text.length < 20) {
        console.log(`⚠️ Skipping ${video.id} - insufficient text`);
        continue;
      }

      console.log(`🔄 Embedding: ${video.metadata?.title?.substring(0, 50) || video.id}...`);

      const embedding = await generateEmbedding(text);

      const { error: updateError } = await supabase
        .from('analyzed_videos')
        .update({ content_embedding: embedding })
        .eq('id', video.id);

      if (updateError) {
        console.error(`❌ Failed to update ${video.id}:`, updateError);
        failed++;
      } else {
        success++;
        console.log(`✅ Embedded (${success}/${videos.length})`);
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      console.error(`❌ Error processing ${video.id}:`, err.message);
      failed++;
    }
  }

  console.log(`\n🎉 Done! Success: ${success}, Failed: ${failed}`);
}

main();
