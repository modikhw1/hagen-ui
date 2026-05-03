/**
 * Re-analyze videos with σTaste v1.1 schema
 * 
 * This script:
 * 1. Fetches videos from Supabase that have GCS URIs
 * 2. Re-analyzes them with the sigma-taste detail level
 * 3. Saves the new analysis to analyzed_videos.visual_analysis
 * 4. Extracts signals to video_signals table with schema v1.1-sigma
 * 
 * Usage: node scripts/reanalyze-sigma-taste.js [--limit N] [--dry-run]
 */

const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
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

// Parse args
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit'));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1] || args[args.indexOf('--limit') + 1]) : null;
const DRY_RUN = args.includes('--dry-run');
const FORCE = args.includes('--force'); // Skip already-analyzed check

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}
if (!geminiKey) {
  console.error('❌ Missing GEMINI_API_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(geminiKey);

// Initialize GCS for signed URLs
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

// Generate a signed URL for GCS video
async function getSignedUrl(gcsUri) {
  const [bucketName, ...pathParts] = gcsUri.replace('gs://', '').split('/');
  const filePath = pathParts.join('/');
  
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(filePath);
  
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`Video not found: ${gcsUri}`);
  }
  
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });
  
  return url;
}

// Download video from GCS to temp file
const os = require('os');
async function downloadVideoFromGCS(gcsUri) {
  const [bucketName, ...pathParts] = gcsUri.replace('gs://', '').split('/');
  const filePath = pathParts.join('/');
  
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(filePath);
  
  const tempPath = path.join(os.tmpdir(), `video_${Date.now()}.mp4`);
  
  await file.download({ destination: tempPath });
  
  return tempPath;
}

// Upload to Gemini File API and wait for processing
async function uploadToGeminiFileAPI(localFilePath) {
  const { GoogleAIFileManager, FileState } = require('@google/generative-ai/server');
  const fileManager = new GoogleAIFileManager(geminiKey);
  
  console.log('       📤 Uploading to Gemini File API...');
  
  const uploadResult = await fileManager.uploadFile(localFilePath, {
    mimeType: 'video/mp4',
    displayName: path.basename(localFilePath),
  });
  
  // Wait for processing
  let file = uploadResult.file;
  while (file.state === FileState.PROCESSING) {
    await new Promise(r => setTimeout(r, 2000));
    file = await fileManager.getFile(file.name);
    console.log(`       ⏳ Processing: ${file.state}`);
  }
  
  if (file.state !== FileState.ACTIVE) {
    throw new Error(`File processing failed: ${file.state}`);
  }
  
  // Clean up local temp file
  fs.unlinkSync(localFilePath);
  
  return file.uri;
}

// σTaste v1.1 prompt - load from calibrated prompt file
function buildSigmaTastePrompt() {
  const promptPath = path.join(__dirname, '..', 'prompts', 'v1.1_sigma_taste_calibrated.md');
  if (fs.existsSync(promptPath)) {
    const content = fs.readFileSync(promptPath, 'utf8');
    const approxTokens = Math.round(content.length / 4);
    console.log(`       📋 Using calibrated prompt (~${approxTokens} tokens, 8 exemplars + 8 comparisons)`);
    return content;
  }
  
  // Fallback to inline basic prompt
  console.log('       ⚠️  Calibrated prompt not found, using basic prompt');
  return `You are an expert video analyst for hospitality brands (hotels, restaurants, cafes, resorts).
Analyze this video using the σTaste v1.1 framework. This framework is calibrated from 254 pairwise comparisons
to identify what makes a video genuinely impressive vs. merely adequate.

## Analysis Framework

### 1. Content Classification (Soft Ranking)
Classify the content type with nuance - most videos blend categories:
- product_showcase: Primary focus on food/drinks/rooms with aesthetic presentation
- behind_the_scenes: Kitchen prep, staff, "how it's made" moments  
- lifestyle_vibe: Atmosphere, ambiance, "feel" of being there
- ugc_style: Appears user-generated, authentic, unpolished
- narrative_story: Has arc, character, beginning/middle/end
- promotional: Direct marketing, deals, announcements
- other: Doesn't fit categories above

### 2. Replicability Assessment
Can another brand recreate this? Rate each factor 1-10:
- conceptDifficulty: How hard to conceive this idea? (higher = harder to replicate)
- executionSkill: Technical/performance skill required
- equipmentNeeds: Specialized gear beyond phone + ring light
- locationDependency: Requires unique/expensive location
- talentRequirement: Needs charismatic/trained performers
- timingComplexity: Requires perfect timing, coordination
- postProductionLevel: Editing, effects, color grading complexity
- brandEquityNeeded: Relies on existing brand recognition

Provide overall_replicability_score (1-10, lower = easier to copy)

### 3. Quality Signals (Calibrated Weights)
Rate these signals with context on what drives the score:

**High-Weight Signals (2.0x, 1.8x impact):**
- attentionRetention: Does it hold attention throughout? Or does mind wander? (1-10)
- audioQuality: Crisp, balanced, intentional sound design (1-10)

**Medium-Weight Signals (1.5x, 1.2x):**
- cutsPerMinute: Pacing rhythm (provide actual count and appropriateness)
- visualClarity: Sharp, well-lit, intentional framing (1-10)

**Context-Dependent (can hurt or help):**
- hookStrength: First 2-3 seconds grip (1-10, BUT: desperate hooks = negative)
- hookAnalysis: {
    hasHook: boolean,
    hookType: "question" | "reveal" | "action" | "statement" | "ambient" | "none",
    desperationSignals: string[] (e.g., "clickbait text", "fake reaction", "generic hook sound"),
    effectivenessRating: 1-10
  }

**Payoff Analysis:**
- payoffDelivery: {
    hasPayoff: boolean,
    payoffType: "reveal" | "punchline" | "transformation" | "satisfaction" | "emotional" | "none",
    earnedVsCheap: "earned" (built up to) | "cheap" (unearned shock) | "none",
    matchesHook: boolean (did it deliver on the hook's promise?)
  }

### 4. Execution Signals

**Narrative Flow:**
- narrativeClarity: Can you follow what's happening? (1-10)
- emotionalArc: Does it take you somewhere emotionally? (1-10)
- pacingFeel: "rushed" | "perfect" | "draggy" | "varied"

**Performer Execution (if applicable):**
- presenceScore: Charisma/camera presence (1-10, null if no performer)
- authenticityScore: Genuine vs. performing (1-10)
- deliveryTiming: Comedy timing, dramatic pauses (1-10)

**Production Polish:**
- colorGrading: Intentional color treatment (1-10)
- transitionQuality: Cuts feel natural/creative (1-10)
- soundDesign: Intentional audio layering (1-10)

### 5. Scene Breakdown
For each distinct scene/moment:
{
  timestamp: "M:SS",
  duration: "X seconds",
  visualContent: "what we see",
  audioContent: "what we hear",
  narrativeFunction: "hook" | "setup" | "development" | "climax" | "resolution" | "payoff",
  qualityNotes: "specific observations about execution"
}

## Output Format (JSON)
{
  "schema_version": "v1.1-sigma",
  "analyzed_at": "<ISO timestamp>",
  
  "content_classification": {
    "primary_type": "<type>",
    "secondary_types": ["<type>"],
    "confidence": 0.0-1.0,
    "classification_notes": "<reasoning>"
  },
  
  "replicability": {
    "concept_difficulty": 1-10,
    "execution_skill": 1-10,
    "equipment_needs": 1-10,
    "location_dependency": 1-10,
    "talent_requirement": 1-10,
    "timing_complexity": 1-10,
    "post_production_level": 1-10,
    "brand_equity_needed": 1-10,
    "overall_replicability_score": 1-10,
    "replicability_notes": "<what makes this hard/easy to copy>"
  },
  
  "quality_signals": {
    "attention_retention": 1-10,
    "audio_quality": 1-10,
    "cuts_per_minute": <number>,
    "pacing_appropriate": true/false,
    "visual_clarity": 1-10,
    "hook_strength": 1-10,
    "hook_analysis": {
      "has_hook": boolean,
      "hook_type": "<type>",
      "desperation_signals": ["<signal>"],
      "effectiveness_rating": 1-10
    },
    "payoff_analysis": {
      "has_payoff": boolean,
      "payoff_type": "<type>",
      "earned_vs_cheap": "<earned|cheap|none>",
      "matches_hook": boolean
    }
  },
  
  "execution_signals": {
    "narrative_flow": {
      "clarity": 1-10,
      "emotional_arc": 1-10,
      "pacing_feel": "<rushed|perfect|draggy|varied>"
    },
    "performer_execution": {
      "presence_score": 1-10 or null,
      "authenticity_score": 1-10 or null,
      "delivery_timing": 1-10 or null
    },
    "production_polish": {
      "color_grading": 1-10,
      "transition_quality": 1-10,
      "sound_design": 1-10
    }
  },
  
  "scenes": [<scene objects>],
  
  "overall_assessment": {
    "strengths": ["<strength>"],
    "weaknesses": ["<weakness>"],
    "standout_moment": "<timestamp and description>",
    "improvement_suggestions": ["<suggestion>"]
  }
}

Analyze the video now and respond with ONLY valid JSON.`;
}

// Parse JSON from Gemini response (handles markdown code blocks)
function parseGeminiJson(text) {
  // Remove markdown code blocks if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return JSON.parse(cleaned.trim());
}

// Analyze a single video (download -> upload to Gemini -> analyze)
async function analyzeVideo(gcsUri) {
  // Step 1: Download from GCS
  console.log('       📥 Downloading from GCS...');
  const localPath = await downloadVideoFromGCS(gcsUri);
  
  // Step 2: Upload to Gemini File API
  const fileUri = await uploadToGeminiFileAPI(localPath);
  console.log('       ✅ File ready in Gemini');
  
  // Step 3: Analyze
  console.log('       🤖 Running σTaste analysis...');
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  
  const result = await model.generateContent([
    {
      fileData: {
        mimeType: 'video/mp4',
        fileUri: fileUri
      }
    },
    { text: buildSigmaTastePrompt() }
  ]);
  
  const text = result.response.text();
  return parseGeminiJson(text);
}

// Extract signals for video_signals table (Layer B extracted JSONB)
function extractSignals(analysis) {
  const qs = analysis.quality_signals || {};
  const es = analysis.execution_signals || {};
  const rep = analysis.replicability || {};
  const cc = analysis.content_classification || {};
  
  // The extracted column is a JSONB field containing all signals
  return {
    // Quality signals
    attention_retention: qs.attention_retention,
    audio_quality: qs.audio_quality,
    visual_clarity: qs.visual_clarity,
    hook_strength: qs.hook_strength,
    cuts_per_minute: qs.cuts_per_minute,
    pacing_appropriate: qs.pacing_appropriate,
    
    // Hook analysis
    hook_analysis: qs.hook_analysis,
    
    // Payoff analysis
    payoff_analysis: qs.payoff_analysis,
    
    // Narrative flow
    narrative_flow: es.narrative_flow,
    
    // Performer execution
    performer_execution: es.performer_execution,
    
    // Production polish
    production_polish: es.production_polish,
    
    // Replicability
    replicability: rep,
    
    // Content classification
    content_classification: cc,
    
    // Scenes breakdown
    scenes: analysis.scenes,
    
    // Overall assessment
    overall_assessment: analysis.overall_assessment
  };
}

async function main() {
  console.log('🎬 σTaste v1.1 Video Re-Analysis');
  console.log('================================\n');
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - no changes will be saved\n');
  }
  
  // Fetch videos with GCS URIs
  let query = supabase
    .from('analyzed_videos')
    .select('id, video_url, gcs_uri, visual_analysis')
    .not('gcs_uri', 'is', null);
  
  if (LIMIT) {
    query = query.limit(LIMIT);
  }
  
  const { data: videos, error } = await query;
  
  if (error) {
    console.error('❌ Failed to fetch videos:', error);
    process.exit(1);
  }
  
  console.log(`📹 Found ${videos.length} videos with GCS URIs`);
  if (LIMIT) console.log(`   (limited to ${LIMIT})`);
  console.log('');
  
  const results = {
    success: [],
    failed: [],
    skipped: []
  };
  
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const progress = `[${i + 1}/${videos.length}]`;
    
    // Check if already analyzed with v1.1-sigma (skip unless --force)
    if (!FORCE && video.visual_analysis?.schema_version === 'v1.1-sigma') {
      console.log(`${progress} ⏭️  Skipping ${video.id} (already v1.1-sigma)`);
      results.skipped.push(video.id);
      continue;
    }
    
    console.log(`${progress} 🔍 Analyzing ${video.id}...`);
    console.log(`       GCS: ${video.gcs_uri}`);
    
    try {
      // Analyze with Gemini
      const analysis = await analyzeVideo(video.gcs_uri);
      console.log(`       ✅ Analysis complete`);
      
      if (!DRY_RUN) {
        // Update analyzed_videos with new visual_analysis
        const { error: updateError } = await supabase
          .from('analyzed_videos')
          .update({
            visual_analysis: analysis,
            analyzed_at: new Date().toISOString()
          })
          .eq('id', video.id);
        
        if (updateError) {
          throw new Error(`Failed to update analyzed_videos: ${updateError.message}`);
        }
        
        // Extract and save signals to Layer B (extracted JSONB column)
        const extracted = extractSignals(analysis);
        
        // Upsert to video_signals with correct schema
        const { error: signalError } = await supabase
          .from('video_signals')
          .upsert({
            video_id: video.id,
            brand_id: null, // No brand context for raw analysis
            schema_version: 'v1.1-sigma',
            extracted: extracted, // JSONB column
            source: 'ai',
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'video_id,brand_id'
          });
        
        if (signalError) {
          console.log(`       ⚠️  Signal extraction failed: ${signalError.message}`);
        } else {
          console.log(`       ✅ Signals saved to video_signals`);
        }
      }
      
      results.success.push(video.id);
      
      // Rate limit - Gemini has quotas
      if (i < videos.length - 1) {
        console.log('       ⏳ Waiting 2s (rate limit)...');
        await new Promise(r => setTimeout(r, 2000));
      }
      
    } catch (err) {
      console.log(`       ❌ Failed: ${err.message}`);
      results.failed.push({ id: video.id, error: err.message });
    }
    
    console.log('');
  }
  
  // Summary
  console.log('================================');
  console.log('📊 Summary');
  console.log('================================');
  console.log(`✅ Success: ${results.success.length}`);
  console.log(`⏭️  Skipped: ${results.skipped.length}`);
  console.log(`❌ Failed:  ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\nFailed videos:');
    results.failed.forEach(f => {
      console.log(`  - ${f.id}: ${f.error}`);
    });
  }
  
  if (DRY_RUN) {
    console.log('\n🧪 DRY RUN - no changes were saved');
  }
}

main().catch(console.error);
