/**
 * Enrich Gold Standard with Richer Annotations
 *
 * 1. Use V7.B to get video analysis for weak entries
 * 2. Use Claude to refine mechanism labels based on humor taxonomy
 * 3. Output enriched gold_standard
 */

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config({ path: '.env.local' });

const CONFIG = {
  goldStandardPath: path.join(__dirname, '../datasets/fine-tuning/gold_standard.jsonl'),
  outputPath: path.join(__dirname, '../datasets/fine-tuning/gold_standard_enriched.jsonl'),
  comparisonPath: path.join(__dirname, '../datasets/fine-tuning/comparison_v7b_v7x_1767206332339.json'),
  apiBase: 'http://localhost:3000/api/fine-tuning/generate',
  delayBetweenVideos: 3000, // ms
  delayBetweenClaude: 1000, // ms
};

// Humor taxonomy from Simpsons analysis
const HUMOR_TAXONOMY = `
## Humor Mechanism Taxonomy

### Structural Patterns
- **CALLBACK_PAYOFF**: Plant specific detail early → return later with confirmation
- **ESCALATION_SUBVERSION**: Build expectation of escalation → deliver anticlimactic subversion
- **DEADPAN_NON_REACTION**: Absurd situation → expected reaction → non-reaction IS the joke
- **RULE_OF_THREE_BREAK**: Establish pattern with 2 items → break pattern on 3rd

### Linguistic Mechanisms
- **WORDPLAY_VISUAL_DISAMBIGUATION**: Ambiguous phrase → visual evidence confirms alternative meaning
- **LITERAL_INTERPRETATION**: Take figurative phrase literally for comic effect
- **TASK_INTERPRETATION_AMBIGUITY**: Instruction has multiple meanings → "wrong" interpretation executed

### Character/Social Mechanisms
- **HIDDEN_MOTIVE_REVEAL**: Apparent good intention → weak execution → reveal true motive
- **COORDINATED_DECEPTION**: Multiple parties coordinate fake scenario for viewer
- **PERFORMATIVE_HONESTY**: Character performs honesty while obviously lying
- **STATUS_INVERSION**: Expected power dynamic reversed

### Timing/Delivery Mechanisms
- **BEAT_PAUSE**: Strategic pause lets absurdity sink in
- **SMASH_CUT**: Instant transition for comic contrast
- **DELAYED_REACTION**: Character's reaction comes after expected timing

### Meta/Structural
- **EXPECTATION_SUBVERSION**: Setup creates expectation → subvert with unexpected outcome
- **RELATABLE_FRUSTRATION**: Universal experience depicted with exaggeration
- **BEHIND_THE_SCENES**: Show perspective customer/audience doesn't normally see
`;

const CLAUDE_PROMPT = `You are analyzing a TikTok video's humor mechanism. Given the current analysis, provide a RICHER annotation.

${HUMOR_TAXONOMY}

## Current Analysis:
{CURRENT_ANALYSIS}

## Your Task:
Rewrite this analysis with:

1. **Observation:** What SPECIFICALLY happens visually/audibly? Quote text overlays. Describe facial expressions, timing, camera angles.

2. **Handling:** What is the CORE joke? Not just "what happens" but "why this specific execution is funny". Be specific about the twist/subversion/reveal.

3. **Mekanism:** Pick 1-2 PRIMARY mechanisms from the taxonomy above. Explain briefly why this mechanism applies. Avoid generic terms like "humor" or "igenkänning" alone.

4. **Varför:** Why does THIS specific video work? What would make it NOT work? What's the key element?

5. **Målgrupp:** Be specific - not just "service workers" but what aspect they'd recognize.

Keep response in Swedish. Be concise but specific. ~400-600 chars total.`;

class GoldStandardEnricher {
  constructor() {
    this.anthropic = new Anthropic();
    this.comparison = this.loadComparison();
    this.stats = { processed: 0, enriched: 0, errors: 0 };
  }

  loadComparison() {
    try {
      const data = JSON.parse(fs.readFileSync(CONFIG.comparisonPath, 'utf-8'));
      const map = new Map();
      data.results.forEach(r => {
        map.set(r.url, r.v7b.analysis);
        map.set(r.url.split('?')[0], r.v7b.analysis);
      });
      return map;
    } catch (e) {
      console.log('No comparison file found, will analyze all videos');
      return new Map();
    }
  }

  loadGoldStandard() {
    return fs.readFileSync(CONFIG.goldStandardPath, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map((l, i) => {
        try {
          const parsed = JSON.parse(l);
          parsed._lineNum = i + 1;
          return parsed;
        } catch (e) { return null; }
      })
      .filter(Boolean);
  }

  isWeak(entry) {
    const a = entry.analysis || '';
    const date = entry.timestamp?.split('T')[0];
    return (date === '2025-12-22' || date === '2025-12-23') &&
           a.length < 600 &&
           !a.includes('**Observation:**');
  }

  async getV7BAnalysis(url) {
    try {
      const response = await fetch(CONFIG.apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url,
          version: 'v7.B',
          mode: 'balanced'
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.analysis;
    } catch (e) {
      console.error(`  Failed to get V7.B analysis: ${e.message}`);
      return null;
    }
  }

  async enrichWithClaude(currentAnalysis) {
    try {
      const message = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: CLAUDE_PROMPT.replace('{CURRENT_ANALYSIS}', currentAnalysis)
        }]
      });

      return message.content[0].text;
    } catch (e) {
      console.error(`  Claude error: ${e.message}`);
      return null;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async run() {
    console.log('='.repeat(60));
    console.log('GOLD STANDARD ENRICHMENT');
    console.log('='.repeat(60));

    const entries = this.loadGoldStandard();
    const tiktok = entries.filter(e =>
      e.url && !e.url.startsWith('simpsons://') && e.url.includes('tiktok')
    );
    const weak = tiktok.filter(e => this.isWeak(e));

    console.log(`\nTotal entries: ${entries.length}`);
    console.log(`TikTok entries: ${tiktok.length}`);
    console.log(`Weak entries to enrich: ${weak.length}`);
    console.log(`Already have V7.B from comparison: ${this.comparison.size}`);

    // Process weak entries
    const enriched = [];

    for (let i = 0; i < weak.length; i++) {
      const entry = weak[i];
      console.log(`\n[${i + 1}/${weak.length}] ${entry.url.substring(0, 50)}...`);

      // Step 1: Get V7.B analysis (from comparison or new)
      let v7bAnalysis = this.comparison.get(entry.url) ||
                        this.comparison.get(entry.url.split('?')[0]);

      if (!v7bAnalysis) {
        console.log('  Getting V7.B analysis...');
        v7bAnalysis = await this.getV7BAnalysis(entry.url);
        await this.delay(CONFIG.delayBetweenVideos);
      } else {
        console.log('  Using cached V7.B analysis');
      }

      if (!v7bAnalysis) {
        console.log('  ⚠️ Skipping - no V7.B analysis');
        this.stats.errors++;
        enriched.push(entry); // Keep original
        continue;
      }

      // Step 2: Enrich with Claude
      console.log('  Enriching with Claude...');
      const enrichedAnalysis = await this.enrichWithClaude(v7bAnalysis);
      await this.delay(CONFIG.delayBetweenClaude);

      if (enrichedAnalysis) {
        enriched.push({
          ...entry,
          analysis: enrichedAnalysis,
          original_analysis: entry.analysis,
          enriched_at: new Date().toISOString(),
          enrichment_source: 'claude-taxonomy'
        });
        this.stats.enriched++;
        console.log('  ✓ Enriched');
      } else {
        // Fall back to V7.B analysis
        enriched.push({
          ...entry,
          analysis: v7bAnalysis,
          original_analysis: entry.analysis,
          enriched_at: new Date().toISOString(),
          enrichment_source: 'v7b-fallback'
        });
        this.stats.enriched++;
        console.log('  ✓ Used V7.B fallback');
      }

      this.stats.processed++;
    }

    // Rebuild full gold_standard with enriched entries
    console.log('\n\nRebuilding gold_standard...');

    const enrichedMap = new Map();
    enriched.forEach(e => enrichedMap.set(e.url, e));

    const finalEntries = entries.map(e => {
      if (enrichedMap.has(e.url)) {
        return enrichedMap.get(e.url);
      }
      return e;
    });

    // Save
    const output = finalEntries.map(e => JSON.stringify(e)).join('\n');
    fs.writeFileSync(CONFIG.outputPath, output);

    console.log('\n' + '='.repeat(60));
    console.log('COMPLETE');
    console.log('='.repeat(60));
    console.log(`Processed: ${this.stats.processed}`);
    console.log(`Enriched: ${this.stats.enriched}`);
    console.log(`Errors: ${this.stats.errors}`);
    console.log(`\nSaved to: ${CONFIG.outputPath}`);
    console.log('\nTo replace original:');
    console.log('  cp datasets/fine-tuning/gold_standard_enriched.jsonl datasets/fine-tuning/gold_standard.jsonl');
  }
}

// CLI
async function main() {
  const enricher = new GoldStandardEnricher();
  await enricher.run();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
