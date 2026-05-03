/**
 * Import Video Analysis Examples
 * 
 * Bulk imports annotated videos with clarification notes into the
 * learning system for RAG-based improvement of Gemini analysis.
 * 
 * Usage:
 *   node scripts/import-learning-examples.js [input-file]
 * 
 * Expected input format (JSON):
 * [
 *   {
 *     "videoUrl": "https://...",
 *     "videoSummary": "Brief description of the video",
 *     "originalInterpretation": "What AI/Gemini said (optional)",
 *     "correctInterpretation": "What the correct interpretation is",
 *     "explanation": "Why this is correct / what was missed",
 *     "humorType": "visual-reveal",  // optional
 *     "culturalContext": "Gen Z interprets ✌️ as kawaii, not 'two'",  // optional
 *     "visualElements": ["reaction cut", "reveal shot"],  // optional
 *     "tags": ["generational", "cafe"],  // optional
 *     "industry": "restaurant",  // optional
 *     "contentFormat": "skit"  // optional
 *   }
 * ]
 */

require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Simple embedding generation (uses OpenAI)
async function generateEmbedding(text) {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    console.warn('⚠️  No OpenAI key, skipping embedding')
    return null
  }

  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text
      })
    })

    const data = await response.json()
    if (data.data?.[0]?.embedding) {
      return data.data[0].embedding
    }
    return null
  } catch (error) {
    console.error('Embedding error:', error)
    return null
  }
}

// Determine example type from content
function determineExampleType(example) {
  if (example.exampleType) return example.exampleType
  
  const text = [
    example.explanation,
    example.correctInterpretation,
    example.culturalContext
  ].join(' ').toLowerCase()

  if (example.culturalContext || text.includes('generation') || text.includes('cultural')) {
    return 'cultural_context'
  }
  if (example.visualElements?.length || text.includes('visual') || text.includes('cut') || text.includes('edit')) {
    return 'visual_punchline'
  }
  if (text.includes('misdirect') || text.includes('subvert') || text.includes('expect')) {
    return 'misdirection'
  }
  if (text.includes('replic') || text.includes('template') || text.includes('format')) {
    return 'replicability'
  }
  return 'humor_interpretation'
}

async function importExamples(inputFile) {
  console.log(`📂 Loading examples from ${inputFile}...`)
  
  const fs = require('fs')
  const examples = JSON.parse(fs.readFileSync(inputFile, 'utf-8'))
  
  console.log(`📊 Found ${examples.length} examples to import`)
  
  let imported = 0
  let failed = 0
  
  for (const example of examples) {
    try {
      // Build embedding text
      const embeddingText = [
        example.videoSummary,
        example.correctInterpretation,
        example.explanation,
        example.culturalContext,
        ...(example.visualElements || []),
        ...(example.tags || []),
        example.humorType
      ].filter(Boolean).join(' ')

      // Generate embedding
      const embedding = await generateEmbedding(embeddingText)
      
      // Prepare data
      const exampleType = determineExampleType(example)
      const humorTypes = example.humorType ? [example.humorType] : []
      
      const insertData = {
        video_url: example.videoUrl || null,
        example_type: exampleType,
        video_summary: example.videoSummary,
        gemini_interpretation: example.originalInterpretation || null,
        correct_interpretation: example.correctInterpretation,
        explanation: example.explanation,
        humor_type_correction: example.humorType && example.originalInterpretation ? {
          original: example.originalInterpretation,
          correct: example.humorType,
          why: example.explanation
        } : null,
        cultural_context: example.culturalContext || null,
        visual_elements: example.visualElements || [],
        tags: example.tags || [],
        humor_types: humorTypes,
        industry: example.industry || null,
        content_format: example.contentFormat || null,
        quality_score: example.qualityScore || 0.8,
        embedding,
        created_by: 'bulk_import'
      }

      const { error } = await supabase
        .from('video_analysis_examples')
        .insert(insertData)

      if (error) {
        console.error(`❌ Failed to import: ${example.videoSummary?.slice(0, 50)}...`)
        console.error('   Error:', error.message)
        failed++
      } else {
        imported++
        console.log(`✅ Imported: ${example.videoSummary?.slice(0, 50)}...`)
      }

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 100))

    } catch (error) {
      console.error(`❌ Error importing example:`, error)
      failed++
    }
  }

  console.log(`\n📊 Import complete:`)
  console.log(`   ✅ Imported: ${imported}`)
  console.log(`   ❌ Failed: ${failed}`)
}

// Also support importing from existing video_ratings notes
async function importFromVideoRatings() {
  console.log('📂 Looking for existing video ratings with notes...')
  
  const { data: ratings, error } = await supabase
    .from('video_ratings')
    .select(`
      id,
      video_id,
      notes,
      dimensions,
      tags,
      analyzed_videos(video_url, visual_analysis)
    `)
    .not('notes', 'is', null)
    .not('notes', 'eq', '')
  
  if (error) {
    console.error('Failed to fetch ratings:', error)
    return
  }
  
  console.log(`📊 Found ${ratings?.length || 0} ratings with notes`)
  
  let imported = 0
  
  for (const rating of ratings || []) {
    if (!rating.notes || rating.notes.trim().length < 10) continue
    
    const video = rating.analyzed_videos
    if (!video) continue
    
    const analysis = video.visual_analysis
    
    // Extract summary from analysis
    const videoSummary = analysis?.content?.keyMessage ||
                         analysis?.visual?.summary ||
                         analysis?.script?.conceptCore ||
                         'Video content'
    
    // Build embedding text
    const embeddingText = [
      videoSummary,
      rating.notes,
      ...(rating.tags || [])
    ].filter(Boolean).join(' ')

    const embedding = await generateEmbedding(embeddingText)
    
    const insertData = {
      video_id: rating.video_id,
      video_url: video.video_url,
      example_type: 'humor_interpretation',
      video_summary: videoSummary,
      gemini_interpretation: null,
      correct_interpretation: rating.notes,
      explanation: rating.notes,
      tags: rating.tags || [],
      quality_score: 0.7,
      embedding,
      created_by: 'video_ratings_import'
    }

    const { error: insertError } = await supabase
      .from('video_analysis_examples')
      .insert(insertData)

    if (!insertError) {
      imported++
      console.log(`✅ Imported from rating: ${videoSummary?.slice(0, 50)}...`)
    }
    
    await new Promise(r => setTimeout(r, 100))
  }
  
  console.log(`\n📊 Imported ${imported} examples from video_ratings`)
}

// Main
async function main() {
  const args = process.argv.slice(2)
  
  if (args.includes('--from-ratings')) {
    await importFromVideoRatings()
  } else if (args.length > 0) {
    await importExamples(args[0])
  } else {
    console.log(`
Usage:
  node scripts/import-learning-examples.js <input.json>     Import from JSON file
  node scripts/import-learning-examples.js --from-ratings  Import from existing video_ratings notes

JSON format:
[
  {
    "videoSummary": "Brief description",
    "correctInterpretation": "What it actually means",
    "explanation": "Why this is correct",
    "humorType": "visual-reveal",
    "culturalContext": "Optional cultural note",
    "visualElements": ["element1"],
    "tags": ["tag1"],
    "industry": "restaurant"
  }
]
`)
  }
}

main().catch(console.error)
