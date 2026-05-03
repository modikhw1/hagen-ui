/**
 * Question Battery Generator
 * 
 * Creates a structured document showing the gaps between AI understanding and human notes.
 * This serves as an "exploratory zone" to identify what's missing in the current prompt.
 * 
 * Outputs:
 *   1. datasets/question_battery.json - Full structured data
 *   2. datasets/question_battery.md - Readable document with video links
 * 
 * Categories of gaps identified:
 *   - Cultural context missing (tropes, references, generational humor)
 *   - Visual reveals not captured (punchline is visual, not verbal)
 *   - Social dynamics missed (mean humor, embarrassment, power dynamics)
 *   - Quality assessment wrong (AI said funny, human said weak/relatable)
 *   - Mechanism fundamentally wrong (subversion vs mean humor, etc.)
 *   - Subtle elements missed (between-the-lines, tone, delivery)
 * 
 * Usage:
 *   node scripts/generate-question-battery.js               # Generate full battery
 *   node scripts/generate-question-battery.js --low-only    # Only <60% understanding
 *   node scripts/generate-question-battery.js --categorize  # Group by gap type
 *   node scripts/generate-question-battery.js --hypotheses  # Generate prompt hypotheses
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OUTPUT_JSON = path.join(__dirname, '..', 'datasets', 'question_battery.json');
const OUTPUT_MD = path.join(__dirname, '..', 'datasets', 'question_battery.md');

// Parse args
const args = {
  lowOnly: process.argv.includes('--low-only'),
  categorize: process.argv.includes('--categorize'),
  hypotheses: process.argv.includes('--hypotheses'),
  threshold: parseInt(process.argv.find(a => a.startsWith('--threshold='))?.split('=')[1] || '70'),
};

/**
 * Gap categories for classification
 */
const GAP_CATEGORIES = {
  CULTURAL_CONTEXT: {
    name: 'Cultural Context Missing',
    description: 'AI missed cultural references, tropes, generational humor, or in-group knowledge',
    keywords: ['cultural', 'trope', 'reference', 'generation', 'meme', 'in-group', 'niche'],
    promptSection: 'Add cultural context awareness in deep reasoning chain'
  },
  VISUAL_REVEAL: {
    name: 'Visual Reveal Not Captured',
    description: 'Punchline or key element is visual, not verbal - AI focused on words',
    keywords: ['visual', 'see', 'look', 'expression', 'reaction', 'face', 'gesture', 'background'],
    promptSection: 'Strengthen STEP 4: EDITING AS COMEDY to include visual-only punchlines'
  },
  SOCIAL_DYNAMICS: {
    name: 'Social Dynamics Missed',
    description: 'Mean humor, embarrassment, rejection, power dynamics not named',
    keywords: ['mean', 'embarrass', 'reject', 'cruel', 'power', 'status', 'put down', 'humiliate'],
    promptSection: 'STEP 6: SOCIAL DYNAMICS & CRUELTY needs stronger examples'
  },
  QUALITY_MISJUDGED: {
    name: 'Quality Assessment Wrong',
    description: 'AI said something was funny/clever when human said weak/relatable',
    keywords: ['weak', 'not funny', 'relatable', 'thin', 'lazy', 'execution', 'delivery-dependent'],
    promptSection: 'STEP 7: CONTENT QUALITY ASSESSMENT needs calibration'
  },
  MECHANISM_WRONG: {
    name: 'Mechanism Fundamentally Wrong',
    description: 'AI identified a completely different type of humor',
    keywords: ['not', 'actually', 'wrong', 'incorrect', 'instead', 'different'],
    promptSection: 'Core mechanism identification needs work'
  },
  SUBTLE_ELEMENTS: {
    name: 'Subtle Elements Missed',
    description: 'Between-the-lines meaning, tone, delivery, implication',
    keywords: ['subtle', 'imply', 'tone', 'delivery', 'between', 'implication', 'suggest', 'deadpan'],
    promptSection: 'Add step for subtext and implied meaning'
  },
  FORMAT_SUBVERSION: {
    name: 'Format Subversion Missed',
    description: 'The structure/format of the video is part of the joke',
    keywords: ['format', 'structure', 'pattern', 'break', 'POV', 'cut', 'edit'],
    promptSection: 'STEP 3: FORMAT PARTICIPATION needs examples'
  }
};

/**
 * Use LLM to classify what type of gap exists
 */
async function classifyGap(example) {
  const prompt = `Analyze this gap between AI understanding and human correction:

VIDEO: ${example.video_summary}

AI ANALYSIS:
${example.gemini_interpretation || 'No interpretation recorded'}

HUMAN CORRECTION:
${example.correct_interpretation}
${example.explanation ? `\nExplanation: ${example.explanation}` : ''}

CATEGORIES TO CHOOSE FROM:
1. CULTURAL_CONTEXT - AI missed cultural references, tropes, generational humor
2. VISUAL_REVEAL - Punchline was visual, AI focused on words
3. SOCIAL_DYNAMICS - Mean humor, embarrassment, rejection not named
4. QUALITY_MISJUDGED - AI said funny when human said weak/relatable
5. MECHANISM_WRONG - AI identified completely different type of humor
6. SUBTLE_ELEMENTS - Between-the-lines meaning, tone, delivery missed
7. FORMAT_SUBVERSION - Video structure/format was part of the joke

Respond with JSON:
{
  "primary_gap": "CATEGORY_NAME",
  "secondary_gap": "CATEGORY_NAME or null",
  "gap_description": "One sentence explaining what specifically was missed",
  "what_ai_should_learn": "What instruction or example would fix this?",
  "diagnostic_question": "A question that if answered correctly, proves understanding"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('Classification error:', error.message);
    return {
      primary_gap: 'MECHANISM_WRONG',
      secondary_gap: null,
      gap_description: 'Unable to classify automatically',
      what_ai_should_learn: 'Manual review needed',
      diagnostic_question: 'What makes this funny?'
    };
  }
}

/**
 * Fetch all examples with corrections
 */
async function fetchExamplesWithCorrections() {
  const { data, error } = await supabase
    .from('video_analysis_examples')
    .select(`
      id,
      video_id,
      video_url,
      video_summary,
      gemini_interpretation,
      correct_interpretation,
      explanation,
      humor_type_correction,
      cultural_context,
      visual_elements,
      tags,
      humor_types,
      example_type,
      created_at
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Database error:', error);
    return [];
  }

  return data || [];
}

/**
 * Load existing understanding scores
 */
function loadUnderstandingScores() {
  const scoresFile = path.join(__dirname, '..', 'datasets', 'understanding_scores.json');
  if (fs.existsSync(scoresFile)) {
    return JSON.parse(fs.readFileSync(scoresFile, 'utf-8'));
  }
  return { scores: {} };
}

/**
 * Generate signed URL for video if possible
 */
async function getVideoLink(example) {
  // First try video_url
  if (example.video_url) {
    return example.video_url;
  }
  
  // Try to get from analyzed_videos if we have video_id
  if (example.video_id) {
    const { data } = await supabase
      .from('analyzed_videos')
      .select('gcs_uri, tiktok_url, source_url')
      .eq('id', example.video_id)
      .single();
    
    if (data) {
      return data.tiktok_url || data.source_url || data.gcs_uri || 'No URL available';
    }
  }
  
  return 'No URL available';
}

/**
 * Generate the question battery
 */
async function generateQuestionBattery() {
  console.log('📋 Generating Question Battery...\n');
  
  // Load data
  const examples = await fetchExamplesWithCorrections();
  const scores = loadUnderstandingScores();
  
  console.log(`Found ${examples.length} examples with corrections\n`);
  
  // Filter if needed
  let filtered = examples;
  if (args.lowOnly) {
    filtered = examples.filter(e => {
      const score = scores.scores[e.id]?.score || 100;
      return score < 60;
    });
    console.log(`Filtered to ${filtered.length} low-scoring examples (<60%)\n`);
  }
  
  // Process each example
  const battery = [];
  let processed = 0;
  
  for (const example of filtered) {
    processed++;
    const score = scores.scores[example.id]?.score || null;
    
    // Skip if above threshold unless categorizing everything
    if (!args.categorize && score && score > args.threshold) {
      continue;
    }
    
    console.log(`[${processed}/${filtered.length}] Processing: ${example.video_summary?.slice(0, 50)}...`);
    
    // Classify the gap
    let classification = null;
    if (args.categorize || args.hypotheses) {
      classification = await classifyGap(example);
      // Rate limit
      await new Promise(r => setTimeout(r, 200));
    }
    
    // Get video link
    const videoLink = await getVideoLink(example);
    
    battery.push({
      id: example.id,
      video_id: example.video_id,
      video_url: videoLink,
      video_summary: example.video_summary,
      understanding_score: score,
      
      // The gap analysis
      gemini_said: example.gemini_interpretation,
      human_said: example.correct_interpretation,
      explanation: example.explanation,
      
      // Classification (if requested)
      gap_classification: classification,
      
      // Metadata
      humor_types: example.humor_types,
      tags: example.tags,
      cultural_context: example.cultural_context,
      visual_elements: example.visual_elements,
      created_at: example.created_at
    });
  }
  
  console.log(`\n✅ Processed ${battery.length} examples\n`);
  
  // Generate statistics
  const stats = generateStats(battery);
  
  // Generate hypotheses if requested
  let hypotheses = [];
  if (args.hypotheses) {
    hypotheses = generateHypotheses(battery, stats);
  }
  
  // Save JSON output
  const output = {
    generated_at: new Date().toISOString(),
    total_examples: battery.length,
    threshold_used: args.threshold,
    statistics: stats,
    hypotheses: hypotheses,
    examples: battery
  };
  
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2));
  console.log(`📄 Saved JSON: ${OUTPUT_JSON}`);
  
  // Generate Markdown document
  generateMarkdownDocument(battery, stats, hypotheses);
  console.log(`📝 Saved Markdown: ${OUTPUT_MD}`);
  
  // Print summary
  printSummary(stats, hypotheses);
}

/**
 * Generate statistics from the battery
 */
function generateStats(battery) {
  const gapCounts = {};
  const scoreDistribution = { 
    critical: [], // <40
    poor: [],     // 40-55
    weak: [],     // 55-70
    ok: [],       // 70-85
    good: []      // >85
  };
  
  for (const item of battery) {
    // Count gaps
    if (item.gap_classification?.primary_gap) {
      const gap = item.gap_classification.primary_gap;
      gapCounts[gap] = (gapCounts[gap] || 0) + 1;
    }
    
    // Score distribution
    const score = item.understanding_score || 50;
    if (score < 40) scoreDistribution.critical.push(item.id);
    else if (score < 55) scoreDistribution.poor.push(item.id);
    else if (score < 70) scoreDistribution.weak.push(item.id);
    else if (score < 85) scoreDistribution.ok.push(item.id);
    else scoreDistribution.good.push(item.id);
  }
  
  return {
    total: battery.length,
    gap_counts: gapCounts,
    score_distribution: {
      critical: scoreDistribution.critical.length,
      poor: scoreDistribution.poor.length,
      weak: scoreDistribution.weak.length,
      ok: scoreDistribution.ok.length,
      good: scoreDistribution.good.length
    },
    top_gaps: Object.entries(gapCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  };
}

/**
 * Generate hypotheses for prompt improvement
 */
function generateHypotheses(battery, stats) {
  const hypotheses = [];
  
  // Group by gap type
  const gapGroups = {};
  for (const item of battery) {
    const gap = item.gap_classification?.primary_gap;
    if (gap) {
      if (!gapGroups[gap]) gapGroups[gap] = [];
      gapGroups[gap].push(item);
    }
  }
  
  // Generate hypothesis for each common gap
  for (const [gapType, items] of Object.entries(gapGroups)) {
    if (items.length < 2) continue;
    
    const category = GAP_CATEGORIES[gapType];
    const learnings = items
      .filter(i => i.gap_classification?.what_ai_should_learn)
      .map(i => i.gap_classification.what_ai_should_learn)
      .slice(0, 3);
    
    hypotheses.push({
      gap_type: gapType,
      category_name: category?.name || gapType,
      occurrence_count: items.length,
      prompt_section_to_modify: category?.promptSection || 'General improvement needed',
      sample_learnings: learnings,
      hypothesis: `Adding ${items.length} teaching examples for ${category?.name || gapType} 
                   could improve understanding by targeting the ${category?.promptSection || 'prompt'}.`,
      priority: items.length >= 5 ? 'HIGH' : items.length >= 3 ? 'MEDIUM' : 'LOW'
    });
  }
  
  return hypotheses.sort((a, b) => b.occurrence_count - a.occurrence_count);
}

/**
 * Generate readable Markdown document
 */
function generateMarkdownDocument(battery, stats, hypotheses) {
  let md = `# Question Battery: AI Understanding Gaps

Generated: ${new Date().toISOString()}

## Summary

- **Total examples analyzed**: ${stats.total}
- **Score threshold**: ${args.threshold}%

### Score Distribution

| Category | Count | Description |
|----------|-------|-------------|
| 🔴 Critical | ${stats.score_distribution.critical} | <40% - Major misunderstanding |
| 🟠 Poor | ${stats.score_distribution.poor} | 40-55% - Significant gaps |
| 🟡 Weak | ${stats.score_distribution.weak} | 55-70% - Partial understanding |
| 🟢 OK | ${stats.score_distribution.ok} | 70-85% - Mostly correct |
| ✅ Good | ${stats.score_distribution.good} | >85% - Strong understanding |

### Top Gap Categories

| Category | Count |
|----------|-------|
${stats.top_gaps.map(([gap, count]) => `| ${GAP_CATEGORIES[gap]?.name || gap} | ${count} |`).join('\n')}

---

`;

  // Add hypotheses section if generated
  if (hypotheses.length > 0) {
    md += `## Hypotheses for Improvement

These are ranked by frequency - address HIGH priority items first.

`;
    for (const h of hypotheses) {
      md += `### ${h.priority === 'HIGH' ? '🔥' : h.priority === 'MEDIUM' ? '⚡' : '💡'} ${h.category_name} (${h.occurrence_count} occurrences)

**Prompt section**: \`${h.prompt_section_to_modify}\`

**Sample learnings to add**:
${h.sample_learnings.map(l => `- ${l}`).join('\n')}

---

`;
    }
  }

  // Add individual examples
  md += `## Individual Examples

`;

  // Sort by score (lowest first)
  const sorted = [...battery].sort((a, b) => 
    (a.understanding_score || 0) - (b.understanding_score || 0)
  );

  for (const item of sorted) {
    const scoreEmoji = (item.understanding_score || 0) < 40 ? '🔴' : 
                       (item.understanding_score || 0) < 55 ? '🟠' : 
                       (item.understanding_score || 0) < 70 ? '🟡' : '🟢';
    
    md += `### ${scoreEmoji} Score: ${item.understanding_score ?? 'N/A'}% - ${item.video_summary?.slice(0, 60)}...

**Video**: ${item.video_url !== 'No URL available' ? `[Watch](${item.video_url})` : 'URL not available'}

**AI Said**:
> ${item.gemini_said?.slice(0, 300) || 'No interpretation recorded'}${item.gemini_said?.length > 300 ? '...' : ''}

**Human Correction**:
> ${item.human_said?.slice(0, 500) || 'No correction recorded'}${item.human_said?.length > 500 ? '...' : ''}

${item.explanation ? `**Why**: ${item.explanation}\n` : ''}
${item.gap_classification ? `**Gap Type**: ${GAP_CATEGORIES[item.gap_classification.primary_gap]?.name || item.gap_classification.primary_gap}
**Diagnostic Question**: ${item.gap_classification.diagnostic_question}
**What AI Should Learn**: ${item.gap_classification.what_ai_should_learn}` : ''}

---

`;
  }

  fs.writeFileSync(OUTPUT_MD, md);
}

/**
 * Print summary to console
 */
function printSummary(stats, hypotheses) {
  console.log('\n' + '═'.repeat(60));
  console.log('QUESTION BATTERY SUMMARY');
  console.log('═'.repeat(60));
  
  console.log(`\n📊 Score Distribution:`);
  console.log(`   🔴 Critical (<40%): ${stats.score_distribution.critical}`);
  console.log(`   🟠 Poor (40-55%):   ${stats.score_distribution.poor}`);
  console.log(`   🟡 Weak (55-70%):   ${stats.score_distribution.weak}`);
  console.log(`   🟢 OK (70-85%):     ${stats.score_distribution.ok}`);
  console.log(`   ✅ Good (>85%):     ${stats.score_distribution.good}`);
  
  if (stats.top_gaps.length > 0) {
    console.log(`\n🎯 Top Gap Categories:`);
    for (const [gap, count] of stats.top_gaps) {
      console.log(`   - ${GAP_CATEGORIES[gap]?.name || gap}: ${count}`);
    }
  }
  
  if (hypotheses.length > 0) {
    console.log(`\n💡 Top Hypotheses for Improvement:`);
    for (const h of hypotheses.slice(0, 3)) {
      console.log(`   ${h.priority === 'HIGH' ? '🔥' : '⚡'} ${h.category_name} (${h.occurrence_count}x)`);
      console.log(`      → Modify: ${h.prompt_section_to_modify}`);
    }
  }
  
  console.log(`\n📁 Output files:`);
  console.log(`   - ${OUTPUT_JSON}`);
  console.log(`   - ${OUTPUT_MD}`);
  console.log('');
}

// Run
generateQuestionBattery().catch(console.error);
