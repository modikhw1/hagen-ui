# Component 07: Evergreen Logic Deep Dive

> **Parent Document**: [MVP Master Specification](../MVP_MASTER_SPECIFICATION.md)  
> **Component**: Evergreen Concept Detection  
> **Last Updated**: December 3, 2025

---

## Overview

The Evergreen Logic determines whether a concept is timeless (evergreen) or trend-dependent. This classification affects how long concepts remain viable in the marketplace and their pricing.

---

## WHY EVERGREEN MATTERS

### Business Rationale

The marketplace has a **72-hour listing window**. This creates urgency, but also raises a question: what if a concept is only viable for 24 hours because the meme/trend it references is dying?

Evergreen classification answers:
1. **For buyers**: "Will this still work when I produce it next week?"
2. **For pricing**: Evergreen concepts deserve a premium (they have unlimited shelf life)
3. **For catalog**: Trend-dependent concepts need faster rotation

### Owner's Known Preferences (From AI_HANDOFF.md)

The owner has explicitly stated **dislikes** that align with "not evergreen":

```typescript
const ownerDislikes = [
  'Meme-dependent content (needs context)',     // → memeDependent = true
  'Trending sounds (dates quickly)',             // → usesPremadeSound = true
];
```

This means:
- Concepts the owner rates highly are **more likely to be evergreen**
- The trained model will naturally favor evergreen content
- Evergreen detection aligns with preference learning

---

## 1. What Makes a Concept Evergreen?

### Definition

An **evergreen concept** is a video idea that:
- Works without reference to current trends, memes, or sounds
- Doesn't rely on audience familiarity with a specific cultural moment
- Can be produced and published at any time with similar effectiveness
- Has no expiration date on its relevance

### Contrast with Trend-Dependent Concepts

| Characteristic | Evergreen | Trend-Dependent |
|---------------|-----------|-----------------|
| Meme reference | None | Requires knowledge of meme |
| Sound requirement | Original or generic | Specific trending sound |
| Cultural context | Universal | Time/culture specific |
| Shelf life | Unlimited | Days to weeks |
| Replication window | Anytime | While trend is active |

---

## 2. Detection Logic

### 2.1 Primary Signals from Deep Analysis

```typescript
interface EvergreenSignals {
  // Primary disqualifiers (any true = NOT evergreen)
  memeDependent: boolean;           // trends.memeDependent
  usesPremadeSound: boolean;        // trends.usesPremadeSound
  trendParticipation: boolean;      // trends.trendParticipation
  
  // Secondary signals (used for confidence)
  requiresContextKnowledge: boolean; // standalone.requiresContextKnowledge
  culturalReference: boolean;        // standalone.culturalReference
  timelySatire: boolean;            // Could become irrelevant
}
```

### 2.2 Evergreen Score Calculation

```typescript
interface EvergreenResult {
  isEvergreen: boolean;
  confidence: number;               // 0-1
  disqualifiers: string[];          // List of reasons if not evergreen
  boostFactors: string[];           // List of reasons if evergreen
}

function calculateEvergreenStatus(analysis: DeepAnalysis): EvergreenResult {
  const disqualifiers: string[] = [];
  const boostFactors: string[] = [];
  
  // Check primary disqualifiers
  if (analysis.trends?.memeDependent) {
    disqualifiers.push('Relies on meme knowledge');
  }
  
  if (analysis.trends?.usesPremadeSound) {
    disqualifiers.push('Uses trending/premade sound');
  }
  
  if (analysis.trends?.trendParticipation) {
    disqualifiers.push('Participates in current trend');
  }
  
  // Check secondary disqualifiers
  if (analysis.standalone?.requiresContextKnowledge) {
    disqualifiers.push('Requires context knowledge');
  }
  
  if (analysis.standalone?.culturalReference) {
    disqualifiers.push('Contains cultural reference');
  }
  
  // Check positive signals
  if (analysis.standalone?.worksWithoutContext) {
    boostFactors.push('Works without context');
  }
  
  if (analysis.standalone?.universalAppeal) {
    boostFactors.push('Universal appeal');
  }
  
  if (analysis.audio?.voiceoverUsed && !analysis.trends?.usesPremadeSound) {
    boostFactors.push('Original audio/voiceover');
  }
  
  if (analysis.script?.replicability?.independentOfPlatform) {
    boostFactors.push('Platform independent');
  }
  
  // Calculate result
  const isEvergreen = disqualifiers.length === 0;
  
  // Confidence calculation
  let confidence = isEvergreen ? 0.5 : 0.5;  // Start at 50%
  
  // Increase confidence for each boost factor
  confidence += boostFactors.length * 0.1;
  
  // Decrease confidence for secondary disqualifiers (already counted in disqualifiers)
  // Decrease further for multiple disqualifiers
  confidence -= (disqualifiers.length - 1) * 0.1;
  
  // Clamp
  confidence = Math.max(0.1, Math.min(1, confidence));
  
  return {
    isEvergreen,
    confidence,
    disqualifiers,
    boostFactors
  };
}
```

---

## 3. Example Classifications

### Example 1: Evergreen Concept ✅

**Video**: A person pretends to drop something, catches it mid-air, and looks at the camera smugly.

```json
{
  "trends": {
    "memeDependent": false,
    "usesPremadeSound": false,
    "trendParticipation": false,
    "platformSpecificFormat": false,
    "soundId": null
  },
  "standalone": {
    "worksWithoutContext": true,
    "requiresContextKnowledge": false,
    "culturalReference": false,
    "universalAppeal": true
  },
  "audio": {
    "voiceoverUsed": false,
    "soundEffects": ["catch", "smug-look-ding"],
    "musicType": "none"
  }
}
```

**Result**:
```json
{
  "isEvergreen": true,
  "confidence": 0.8,
  "disqualifiers": [],
  "boostFactors": [
    "Works without context",
    "Universal appeal",
    "Original audio/voiceover"
  ]
}
```

---

### Example 2: NOT Evergreen (Meme-Dependent) ❌

**Video**: Person lip-syncs to "Oh no, oh no, oh no no no no no" sound while something bad happens.

```json
{
  "trends": {
    "memeDependent": false,
    "usesPremadeSound": true,
    "trendParticipation": true,
    "platformSpecificFormat": true,
    "soundId": "oh-no-tiktok"
  },
  "standalone": {
    "worksWithoutContext": false,
    "requiresContextKnowledge": true,
    "culturalReference": true
  }
}
```

**Result**:
```json
{
  "isEvergreen": false,
  "confidence": 0.9,
  "disqualifiers": [
    "Uses trending/premade sound",
    "Participates in current trend",
    "Requires context knowledge",
    "Contains cultural reference"
  ],
  "boostFactors": []
}
```

---

### Example 3: Edge Case - Original but Cultural ⚠️

**Video**: A parody of a common work-from-home experience (Zoom call disasters).

```json
{
  "trends": {
    "memeDependent": false,
    "usesPremadeSound": false,
    "trendParticipation": false
  },
  "standalone": {
    "worksWithoutContext": true,
    "requiresContextKnowledge": true,  // Need to know about WFH culture
    "culturalReference": true,          // References COVID-era WFH
    "universalAppeal": true             // But most people understand it
  }
}
```

**Result**:
```json
{
  "isEvergreen": false,
  "confidence": 0.6,
  "disqualifiers": [
    "Requires context knowledge",
    "Contains cultural reference"
  ],
  "boostFactors": [
    "Works without context",
    "Universal appeal"
  ]
}
```

**Decision**: Classified as NOT evergreen, but with lower confidence. Could be manually overridden to evergreen if the cultural reference is considered permanent (WFH is now mainstream).

---

## 4. Override Mechanism

### Manual Override

```typescript
interface EvergreenOverride {
  conceptId: string;
  originalStatus: boolean;
  overriddenStatus: boolean;
  reason: string;
  overriddenBy: string;           // 'owner' or admin username
  overriddenAt: string;           // ISO timestamp
}

// Store override in concept_metadata
async function overrideEvergreenStatus(
  conceptId: string,
  newStatus: boolean,
  reason: string
): Promise<void> {
  await supabase
    .from('concepts')
    .update({
      is_evergreen: newStatus,
      evergreen_override_reason: reason,
      evergreen_overridden_at: new Date().toISOString()
    })
    .eq('id', conceptId);
}
```

### UI for Override

```typescript
// In concept detail view
function EvergreenOverridePanel({ concept }: { concept: Concept }) {
  const [showOverride, setShowOverride] = useState(false);
  const [reason, setReason] = useState('');
  
  return (
    <div className="evergreen-panel">
      <div className="current-status">
        <Badge variant={concept.is_evergreen ? 'success' : 'warning'}>
          {concept.is_evergreen ? '🌲 Evergreen' : '📈 Trend-Dependent'}
        </Badge>
        <span className="confidence">
          {(concept.evergreen_confidence * 100).toFixed(0)}% confident
        </span>
      </div>
      
      {concept.evergreen_disqualifiers?.length > 0 && (
        <div className="disqualifiers">
          <h4>Disqualifiers:</h4>
          <ul>
            {concept.evergreen_disqualifiers.map(d => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      )}
      
      <button onClick={() => setShowOverride(true)}>
        Override Classification
      </button>
      
      {showOverride && (
        <div className="override-form">
          <textarea
            placeholder="Reason for override..."
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
          <button onClick={() => handleOverride(!concept.is_evergreen, reason)}>
            Change to {concept.is_evergreen ? 'Trend-Dependent' : 'Evergreen'}
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## 5. Impact on Marketplace

### Pricing Impact

```typescript
function calculateEvergreenPriceModifier(evergreen: EvergreenResult): number {
  if (evergreen.isEvergreen) {
    // Evergreen concepts have a premium
    // More confident = higher premium
    return 1 + (evergreen.confidence * 0.2);  // 1.02 to 1.2x
  } else {
    // Trend-dependent concepts may have a discount
    // Depends on how many disqualifiers
    const discount = Math.min(evergreen.disqualifiers.length * 0.05, 0.2);
    return 1 - discount;  // 0.8 to 1.0x
  }
}
```

### Listing Strategy

| Classification | Strategy | Rationale |
|---------------|----------|-----------|
| Evergreen (high confidence) | List anytime | No time pressure |
| Evergreen (medium confidence) | List normally | Slight uncertainty acceptable |
| Trend-dependent | List immediately | Trend may expire |
| Trend-dependent (multiple disqualifiers) | Consider not listing | May already be stale |

---

## 6. Database Schema

### Fields in `concepts` Table

```sql
-- Evergreen-related fields
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS is_evergreen BOOLEAN;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS evergreen_confidence FLOAT;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS evergreen_disqualifiers TEXT[];
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS evergreen_boost_factors TEXT[];
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS evergreen_override_reason TEXT;
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS evergreen_overridden_at TIMESTAMPTZ;
```

### Example Record

```sql
INSERT INTO concepts (
  video_id,
  core_mechanic,
  is_evergreen,
  evergreen_confidence,
  evergreen_disqualifiers,
  evergreen_boost_factors
) VALUES (
  'uuid-1234',
  'Person pretends to drop something, catches it mid-air, smug look',
  true,
  0.85,
  '{}',
  '{"Works without context", "Universal appeal", "Original audio"}'
);
```

---

## 7. API Endpoints

### Check Evergreen Status

```typescript
// GET /api/concepts/:id/evergreen
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const concept = await getConcept(params.id);
  const analysis = await getAnalysisForConcept(params.id);
  
  const evergreenResult = calculateEvergreenStatus(analysis);
  
  return NextResponse.json({
    conceptId: params.id,
    ...evergreenResult,
    overridden: concept.evergreen_overridden_at !== null,
    overrideReason: concept.evergreen_override_reason
  });
}
```

### Override Evergreen Status

```typescript
// POST /api/concepts/:id/evergreen/override
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const { newStatus, reason } = body;
  
  await overrideEvergreenStatus(params.id, newStatus, reason);
  
  return NextResponse.json({
    success: true,
    conceptId: params.id,
    isEvergreen: newStatus
  });
}
```

---

## 8. Gemini Prompt for Evergreen Detection

The deep analysis prompt should include:

```
For the "trends" section, analyze:
- memeDependent: Does this video require knowledge of a specific meme or internet joke to be funny?
- usesPremadeSound: Does this video use a pre-existing trending sound or audio clip that the creator did not make?
- trendParticipation: Is this video participating in a current platform trend or challenge?
- platformSpecificFormat: Does this video use a format that only works on TikTok (like duets, stitches, specific transitions)?
- soundId: If a trending sound is used, provide its identifier or name

For the "standalone" section, analyze:
- worksWithoutContext: Would this video be equally funny to someone who has never used TikTok or social media?
- requiresContextKnowledge: Does understanding this video require prior knowledge of a specific topic, event, or cultural phenomenon?
- culturalReference: Does this video reference specific cultural events, celebrities, or time-sensitive content?
- universalAppeal: Would this video be understood and appreciated across different cultures and age groups?
```

---

## 9. Monitoring and Analytics

### Track Classification Accuracy

```typescript
interface EvergreenAnalytics {
  // Distribution
  totalConcepts: number;
  evergreenCount: number;
  trendDependentCount: number;
  overrideCount: number;
  
  // Confidence distribution
  highConfidenceCount: number;    // >= 0.8
  mediumConfidenceCount: number;  // 0.5-0.8
  lowConfidenceCount: number;     // < 0.5
  
  // Most common disqualifiers
  disqualifierFrequency: Record<string, number>;
  
  // Override analysis
  overrideToEvergreen: number;
  overrideToTrendDependent: number;
}

async function getEvergreenAnalytics(): Promise<EvergreenAnalytics> {
  const { data: concepts } = await supabase
    .from('concepts')
    .select('is_evergreen, evergreen_confidence, evergreen_disqualifiers, evergreen_overridden_at');
  
  // Calculate analytics
  // ...
}
```

---

## 10. Edge Cases and Handling

| Edge Case | Handling |
|-----------|----------|
| Mixed signals | Use confidence score; flag for review if < 0.6 |
| Missing `trends` data | Default to NOT evergreen (conservative) |
| Sound is original but sounds like trending | Trust Gemini analysis; allow override |
| Timeless format, timely reference | NOT evergreen (reference ages poorly) |
| Cultural reference is permanent (e.g., "Monday mornings") | Manual override to evergreen |

---

## Related Documents

- [Pricing Logic Deep Dive](./03_PRICING_LOGIC.md) - Evergreen pricing modifier
- [Rotation Logic Deep Dive](./08_ROTATION_LOGIC.md) - How evergreen affects listing duration
- [Database Schema Deep Dive](./02_DATABASE_SCHEMA.md) - Table definitions

---

*This document provides exhaustive detail on evergreen classification. Refer to specific component documents for related systems.*
