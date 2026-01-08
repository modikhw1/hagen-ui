# Component 04: Concept Viewer Deep Dive

> **Parent Document**: [MVP Master Specification](../MVP_MASTER_SPECIFICATION.md)
> **Component**: Concept Viewer
> **Last Updated**: January 1, 2026

---

## Overview

This document provides exhaustive detail on the in-platform concept viewer—the interface buyers use to study and replicate purchased concepts. The viewer is view-only (no downloads) and includes video playback, subtitles, script panels, and production checklists.

---

## CRITICAL DESIGN CONSTRAINT: View-Only Platform

### Why No Downloads?

The marketplace explicitly requires **view-only access** with no downloads. This is a core architectural decision, not an afterthought.

**Rationale:**
1. **Concept Protection, Not Video Protection** - We're selling the *idea*, not the video file. The video demonstrates the concept, but downloading it doesn't help—buyers need to create their own version anyway.
2. **Reduces Piracy Friction** - Downloaded videos can be shared, reuploaded, or used to train competitors. In-platform viewing keeps control.
3. **Enables Expiry Model** - Signed URLs expire, forcing re-authentication. This creates natural access windows.
4. **Simplifies Legal Model** - We're licensing viewing rights to understand a concept, not distributing video files.

**Implementation:**
```typescript
// NEVER expose direct GCS links
// ALWAYS use signed URLs with short expiry
// NEVER include download buttons or right-click save options

const SIGNED_URL_EXPIRY_HOURS = 4; // 4 hours per session

// Why 4 hours?
// - Long enough to study a concept in one session
// - Short enough that shared URLs become useless
// - Forces re-authentication for repeat access
// - Allows usage analytics per viewing session
```

### Technical Enforcement

```html
<!-- Video element with download prevention -->
<video 
  controlsList="nodownload"      <!-- Removes download button -->
  disablePictureInPicture        <!-- Prevents PiP extraction -->
  oncontextmenu="return false"   <!-- Disables right-click -->
>
</video>

<!-- Additional CSS protection -->
<style>
video::-webkit-media-controls-enclosure {
  display: flex;
}
/* Hide download button specifically */
video::-webkit-media-controls-download-button {
  display: none;
}
</style>
```

**Note**: These are deterrents, not DRM. A determined user with dev tools can still capture video. The goal is to prevent casual sharing, not absolute protection. True DRM (Widevine, FairPlay) is overkill for MVP and adds $10K+ complexity.

### What Happens When URLs Expire?

```typescript
interface URLExpiryFlow {
  scenario: 'URL expires during viewing';
  
  detection: {
    // Monitor video playback errors
    // HTTP 403 = URL expired
    onError: (e: Event) => {
      if (e.target.error?.code === 403) {
        showExpiryModal();
      }
    }
  };
  
  userExperience: {
    modal: 'Your viewing session has expired. Click to continue.';
    action: 'Refresh URL'; // Re-fetches signed URL, requires auth
    noLostProgress: true; // Remember playback position
  };
}
```

---

## Subtitle Overlay System

### Where Do Translations Come From?

Subtitles are generated in two phases:

**Phase 1: Source Language (English)**
- Extracted from Gemini's `script.transcript` during video analysis
- Already available in `visual_analysis` for all v3 videos
- Timestamps calculated from scene breakdown

**Phase 2: Target Language (On-Demand)**
```typescript
// When a buyer from Indonesia purchases a US-origin concept:
async function generateSubtitles(
  conceptId: string, 
  targetLanguage: 'id' | 'es' | 'pt' | 'hi' | 'ar' // etc
): Promise<ViewerOverlay[]> {
  
  // 1. Get source transcript with timestamps
  const source = await getSourceTranscript(conceptId);
  
  // 2. Translate via Google Translate API (or Gemini)
  const translated = await translateWithTimestamps(source, targetLanguage);
  
  // 3. Store for future viewers from same market
  await db.viewerOverlays.createMany({
    data: translated.map(t => ({
      concept_id: conceptId,
      language_code: targetLanguage,
      overlay_type: 'subtitle',
      content: t.text,
      timestamp_start: t.start,
      timestamp_end: t.end
    }))
  });
  
  return translated;
}

// Translation happens ONCE per concept×language pair
// Then cached for all future viewers in that market
```

**Budget Consideration:**
- Google Translate API: ~$20 per 1M characters
- Average skit transcript: ~500 characters
- Cost per translation: ~$0.01
- Amortized across all buyers in that market = negligible

---

## 1. Viewer Architecture

### Component Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONCEPT VIEWER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐   │
│  │                                 │  │         SIDEBAR PANELS          │   │
│  │         VIDEO PLAYER            │  │                                 │   │
│  │                                 │  │  ┌───────────────────────────┐  │   │
│  │  ┌───────────────────────────┐  │  │  │      SCRIPT PANEL        │  │   │
│  │  │                           │  │  │  │  - Transcript             │  │   │
│  │  │    [Video Playback]       │  │  │  │  - Visual Transcript      │  │   │
│  │  │                           │  │  │  │  - Concept Core           │  │   │
│  │  │   [Subtitle Overlay]      │  │  │  └───────────────────────────┘  │   │
│  │  │   [Scene Markers]         │  │  │                                 │   │
│  │  │                           │  │  │  ┌───────────────────────────┐  │   │
│  │  └───────────────────────────┘  │  │  │    PRODUCTION PANEL      │  │   │
│  │                                 │  │  │  - People required         │  │   │
│  │  ┌───────────────────────────┐  │  │  │  - Time to recreate       │  │   │
│  │  │      TIMELINE             │  │  │  │  - Equipment needed       │  │   │
│  │  │  [Setup][Dev][Payoff]     │  │  │  │  - Shot complexity        │  │   │
│  │  └───────────────────────────┘  │  │  └───────────────────────────┘  │   │
│  │                                 │  │                                 │   │
│  └─────────────────────────────────┘  │  ┌───────────────────────────┐  │   │
│                                       │  │     CASTING PANEL         │  │   │
│                                       │  │  - Acting skill required   │  │   │
│                                       │  │  - Personality dependency  │  │   │
│                                       │  │  - Notes                   │  │   │
│                                       │  └───────────────────────────┘  │   │
│                                       │                                 │   │
│                                       │  ┌───────────────────────────┐  │   │
│                                       │  │    FLEXIBILITY PANEL      │  │   │
│                                       │  │  - Industry examples       │  │   │
│                                       │  │  - Swappable elements      │  │   │
│                                       │  └───────────────────────────┘  │   │
│                                       │                                 │   │
│                                       │  ┌───────────────────────────┐  │   │
│                                       │  │   PRODUCTION CHECKLIST    │  │   │
│                                       │  │  ☐ 2 people minimum        │  │   │
│                                       │  │  ☐ Smartphone only         │  │   │
│                                       │  │  ☐ Indoor setting          │  │   │
│                                       │  │  ☐ 15min shoot time        │  │   │
│                                       │  └───────────────────────────┘  │   │
│                                       └─────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Interfaces

### Complete Viewer Data Structure

```typescript
interface ConceptViewerData {
  // Concept metadata
  concept: {
    id: string;
    conceptCore: string;
    templateDescription: string;
    requiredElements: string[];
    variableElements: string[];
    matchPercentage: number;       // 0-100, personalized to buyer
  };
  
  // Video access (signed URL, expires)
  video: {
    url: string;                    // GCS signed URL
    expiresAt: Date;                // When URL expires
    duration: number;               // Seconds
    thumbnail?: string;             // Preview image
  };
  
  // Script information
  script: {
    transcript: string;             // What is said
    visualTranscript: string;       // Scene-by-scene with stage directions
    conceptCore: string;            // One-line summary
    structure: {
      hook: string;
      setup: string;
      development: string;
      payoff: string;
    };
  };
  
  // Production requirements
  production: {
    minimumPeople: number;
    timeToRecreate: string;         // '15min' | '30min' | '1hr' | etc.
    equipmentNeeded: string[];
    shotComplexity: number;         // 1-10
    editingDependency: number;      // 1-10
    productionNotes: string;
  };
  
  // Casting requirements
  casting: {
    minimumPeople: number;
    requiresCustomer: boolean;
    actingSkillRequired: number;    // 1-10
    personalityDependency: number;  // 1-10
    attractivenessDependency: number; // 1-10
    castingNotes: string;
  };
  
  // Flexibility/adaptability
  flexibility: {
    industryLock: number;           // 1-10
    industryExamples: string[];
    propDependency: number;         // 1-10
    swappableCore: boolean;
    swapExamples: string;
    flexibilityNotes: string;
  };
  
  // Overlays for video player
  overlays: {
    subtitles: ViewerOverlay[];
    sceneMarkers: ViewerOverlay[];
    timingCues: ViewerOverlay[];
  };
  
  // Generated checklist
  productionChecklist: ChecklistItem[];
  
  // Purchase info
  purchase: {
    transactionId: string;
    purchasedAt: Date;
    cashbackEligible: boolean;
    cashbackAmount: number;
    cashbackStatus: 'pending' | 'claimed' | 'expired';
  };
}

interface ViewerOverlay {
  id: string;
  type: 'subtitle' | 'scene_marker' | 'timing_cue';
  content: string;
  timestampStart: number;         // Seconds
  timestampEnd: number;
  language?: string;
}

interface ChecklistItem {
  id: string;
  category: 'casting' | 'equipment' | 'location' | 'time' | 'skill';
  label: string;
  description?: string;
  required: boolean;
}
```

---

## 3. Video Player Component

### Features

```typescript
interface VideoPlayerProps {
  videoUrl: string;
  duration: number;
  overlays: ViewerOverlay[];
  onTimeUpdate?: (currentTime: number) => void;
  onSceneClick?: (scene: ViewerOverlay) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoUrl,
  duration,
  overlays,
  onTimeUpdate,
  onSceneClick
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Get current overlays based on time
  const currentSubtitles = overlays.filter(o => 
    o.type === 'subtitle' &&
    currentTime >= o.timestampStart &&
    currentTime < o.timestampEnd
  );
  
  const currentSceneMarker = overlays.find(o =>
    o.type === 'scene_marker' &&
    currentTime >= o.timestampStart &&
    currentTime < o.timestampEnd
  );
  
  // Scene markers for timeline
  const sceneMarkers = overlays.filter(o => o.type === 'scene_marker');
  
  return (
    <div className="video-player">
      {/* Main video */}
      <div className="video-container relative">
        <video
          ref={videoRef}
          src={videoUrl}
          onTimeUpdate={(e) => {
            setCurrentTime(e.currentTarget.currentTime);
            onTimeUpdate?.(e.currentTarget.currentTime);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        
        {/* Subtitle overlay */}
        {currentSubtitles.length > 0 && (
          <div className="subtitle-overlay absolute bottom-16 left-0 right-0 text-center">
            {currentSubtitles.map(sub => (
              <div key={sub.id} className="subtitle-text bg-black/70 text-white px-4 py-2 rounded">
                {sub.content}
              </div>
            ))}
          </div>
        )}
        
        {/* Scene marker badge */}
        {currentSceneMarker && (
          <div className="scene-marker absolute top-4 left-4 bg-blue-500 text-white px-3 py-1 rounded">
            {currentSceneMarker.content}
          </div>
        )}
      </div>
      
      {/* Custom timeline with scene markers */}
      <div className="timeline relative h-8 bg-gray-200 rounded mt-2">
        {/* Progress bar */}
        <div 
          className="progress-bar h-full bg-blue-500 rounded"
          style={{ width: `${(currentTime / duration) * 100}%` }}
        />
        
        {/* Scene markers on timeline */}
        {sceneMarkers.map(marker => (
          <button
            key={marker.id}
            className="scene-marker-dot absolute top-0 h-full w-1 bg-yellow-400"
            style={{ left: `${(marker.timestampStart / duration) * 100}%` }}
            onClick={() => {
              videoRef.current!.currentTime = marker.timestampStart;
              onSceneClick?.(marker);
            }}
            title={marker.content}
          />
        ))}
      </div>
      
      {/* Controls */}
      <div className="controls flex justify-center gap-4 mt-2">
        <button onClick={() => videoRef.current!.currentTime -= 5}>⏪ 5s</button>
        <button onClick={() => isPlaying ? videoRef.current!.pause() : videoRef.current!.play()}>
          {isPlaying ? '⏸️' : '▶️'}
        </button>
        <button onClick={() => videoRef.current!.currentTime += 5}>5s ⏩</button>
      </div>
    </div>
  );
};
```

### Overlay Rendering Logic

```typescript
// Subtitles appear at bottom of video
// Scene markers appear as badges (e.g., "SETUP", "PAYOFF")
// Timing cues appear as brief annotations (e.g., "Hold 2 beats")

function getActiveOverlays(overlays: ViewerOverlay[], currentTime: number) {
  return {
    subtitles: overlays.filter(o => 
      o.type === 'subtitle' && 
      currentTime >= o.timestampStart && 
      currentTime < o.timestampEnd
    ),
    sceneMarker: overlays.find(o => 
      o.type === 'scene_marker' && 
      currentTime >= o.timestampStart && 
      currentTime < o.timestampEnd
    ),
    timingCue: overlays.find(o => 
      o.type === 'timing_cue' && 
      currentTime >= o.timestampStart && 
      currentTime < o.timestampEnd
    )
  };
}
```

---

## 4. Script Panel

### Component Structure

```typescript
interface ScriptPanelProps {
  script: ConceptViewerData['script'];
  currentTime: number;
  onSceneSelect?: (timestamp: number) => void;
}

const ScriptPanel: React.FC<ScriptPanelProps> = ({
  script,
  currentTime,
  onSceneSelect
}) => {
  const [activeTab, setActiveTab] = useState<'transcript' | 'visual' | 'structure'>('transcript');
  
  return (
    <div className="script-panel">
      {/* Tabs */}
      <div className="tabs flex border-b">
        <button 
          className={activeTab === 'transcript' ? 'active' : ''}
          onClick={() => setActiveTab('transcript')}
        >
          Transcript
        </button>
        <button 
          className={activeTab === 'visual' ? 'active' : ''}
          onClick={() => setActiveTab('visual')}
        >
          Visual Script
        </button>
        <button 
          className={activeTab === 'structure' ? 'active' : ''}
          onClick={() => setActiveTab('structure')}
        >
          Structure
        </button>
      </div>
      
      {/* Content */}
      <div className="tab-content p-4">
        {activeTab === 'transcript' && (
          <div className="transcript">
            <h4 className="font-bold mb-2">Concept Core</h4>
            <p className="text-lg italic mb-4">{script.conceptCore}</p>
            
            <h4 className="font-bold mb-2">Transcript</h4>
            <p className="whitespace-pre-wrap">{script.transcript}</p>
          </div>
        )}
        
        {activeTab === 'visual' && (
          <div className="visual-transcript">
            <h4 className="font-bold mb-2">Scene-by-Scene</h4>
            <pre className="whitespace-pre-wrap text-sm bg-gray-100 p-4 rounded">
              {script.visualTranscript}
            </pre>
          </div>
        )}
        
        {activeTab === 'structure' && (
          <div className="structure">
            <div className="structure-item mb-4">
              <h4 className="font-bold text-blue-600">HOOK</h4>
              <p>{script.structure.hook}</p>
            </div>
            <div className="structure-item mb-4">
              <h4 className="font-bold text-green-600">SETUP</h4>
              <p>{script.structure.setup}</p>
            </div>
            <div className="structure-item mb-4">
              <h4 className="font-bold text-yellow-600">DEVELOPMENT</h4>
              <p>{script.structure.development}</p>
            </div>
            <div className="structure-item mb-4">
              <h4 className="font-bold text-red-600">PAYOFF</h4>
              <p>{script.structure.payoff}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
```

### Example Content

```
TRANSCRIPT:
"Hey everyone, um... Ah, I'm already crying."

VISUAL TRANSCRIPT:
[SCENE START] 
Employee stands behind the counter, looking nervous. 
Text overlay: "POV: you have to tell the kitchen you messed up". 
Employee: "Hey everyone, um..." 
[CUT] 
Employee: "Ah, I'm already crying." 
[CUT] 
Kitchen staff member looks directly at the camera with a neutral expression. 
[SCENE END]

STRUCTURE:
Hook: Text overlay and nervous expression establish relatable scenario
Setup: Employee is about to admit mistake to kitchen staff
Development: Employee expresses anxiety about the situation
Payoff: Cut to kitchen staff's neutral expression subverts expectation
```

---

## 5. Production Panel

### Component Structure

```typescript
interface ProductionPanelProps {
  production: ConceptViewerData['production'];
}

const ProductionPanel: React.FC<ProductionPanelProps> = ({ production }) => {
  // Convert technical values to plain language
  const getDifficultyLabel = (complexity: number): string => {
    if (complexity <= 3) return "Easy to film";
    if (complexity <= 6) return "Moderate";
    return "More involved";
  };

  const getEditingLabel = (dependency: number): string => {
    if (dependency <= 3) return "Minimal editing";
    if (dependency <= 6) return "Some editing";
    return "Significant editing needed";
  };

  return (
    <div className="production-panel p-4">
      <h3 className="font-bold text-lg mb-4">What You'll Need</h3>

      {/* Key metrics - PLAIN LANGUAGE */}
      <div className="metrics grid grid-cols-2 gap-4 mb-4">
        <div className="metric">
          <span className="label text-gray-500">People</span>
          <span className="value text-2xl font-bold">
            {production.minimumPeople === 1 ? "Just you" : `${production.minimumPeople} people`}
          </span>
        </div>
        <div className="metric">
          <span className="label text-gray-500">Time to film</span>
          <span className="value text-2xl font-bold">{production.timeToRecreate}</span>
        </div>
        <div className="metric">
          <span className="label text-gray-500">Difficulty</span>
          <span className="value text-lg font-semibold">{getDifficultyLabel(production.shotComplexity)}</span>
        </div>
        <div className="metric">
          <span className="label text-gray-500">Post-production</span>
          <span className="value text-lg font-semibold">{getEditingLabel(production.editingDependency)}</span>
        </div>
      </div>
      
      {/* Equipment */}
      <div className="equipment mb-4">
        <h4 className="font-semibold mb-2">Equipment Needed</h4>
        <ul className="list-disc pl-4">
          {production.equipmentNeeded.length === 0 ? (
            <li className="text-green-600">Smartphone only ✓</li>
          ) : (
            production.equipmentNeeded.map((item, i) => (
              <li key={i}>{item}</li>
            ))
          )}
        </ul>
      </div>
      
      {/* Notes */}
      {production.productionNotes && (
        <div className="notes bg-gray-100 p-3 rounded">
          <h4 className="font-semibold mb-1">Notes</h4>
          <p className="text-sm">{production.productionNotes}</p>
        </div>
      )}
    </div>
  );
};

const ComplexityMeter: React.FC<{ value: number }> = ({ value }) => {
  const getColor = (v: number) => {
    if (v <= 3) return 'bg-green-500';
    if (v <= 6) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  
  return (
    <div className="complexity-meter flex items-center gap-2">
      <div className="bar w-20 h-2 bg-gray-200 rounded">
        <div 
          className={`h-full rounded ${getColor(value)}`}
          style={{ width: `${value * 10}%` }}
        />
      </div>
      <span className="text-sm">{value}/10</span>
    </div>
  );
};
```

---

## 6. Casting Panel

### Component Structure

```typescript
interface CastingPanelProps {
  casting: ConceptViewerData['casting'];
}

const CastingPanel: React.FC<CastingPanelProps> = ({ casting }) => {
  return (
    <div className="casting-panel p-4">
      <h3 className="font-bold text-lg mb-4">Casting Requirements</h3>
      
      {/* People count */}
      <div className="people-count flex items-center gap-2 mb-4">
        <span className="text-3xl">👥</span>
        <div>
          <span className="text-2xl font-bold">{casting.minimumPeople}</span>
          <span className="text-gray-500 ml-2">people minimum</span>
        </div>
        {casting.requiresCustomer && (
          <span className="badge bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm ml-2">
            Requires customer/stranger
          </span>
        )}
      </div>
      
      {/* Skill requirements */}
      <div className="skills grid grid-cols-1 gap-3 mb-4">
        <SkillMeter 
          label="Acting Skill Required"
          value={casting.actingSkillRequired}
          lowLabel="Anyone can do it"
          highLabel="Trained actor needed"
        />
        <SkillMeter 
          label="Personality Dependency"
          value={casting.personalityDependency}
          lowLabel="Any personality"
          highLabel="Specific persona needed"
        />
        <SkillMeter 
          label="Attractiveness Dependency"
          value={casting.attractivenessDependency}
          lowLabel="Anyone works"
          highLabel="Relies on looks"
        />
      </div>
      
      {/* Notes */}
      {casting.castingNotes && (
        <div className="notes bg-gray-100 p-3 rounded">
          <h4 className="font-semibold mb-1">Casting Notes</h4>
          <p className="text-sm">{casting.castingNotes}</p>
        </div>
      )}
    </div>
  );
};

const SkillMeter: React.FC<{
  label: string;
  value: number;
  lowLabel: string;
  highLabel: string;
}> = ({ label, value, lowLabel, highLabel }) => {
  return (
    <div className="skill-meter">
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="font-bold">{value}/10</span>
      </div>
      <div className="bar-container flex items-center gap-2">
        <span className="text-xs text-gray-500 w-24">{lowLabel}</span>
        <div className="bar flex-1 h-2 bg-gray-200 rounded">
          <div 
            className="h-full bg-blue-500 rounded"
            style={{ width: `${value * 10}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 w-24 text-right">{highLabel}</span>
      </div>
    </div>
  );
};
```

---

## 7. Flexibility Panel

### Component Structure

```typescript
interface FlexibilityPanelProps {
  flexibility: ConceptViewerData['flexibility'];
}

const FlexibilityPanel: React.FC<FlexibilityPanelProps> = ({ flexibility }) => {
  return (
    <div className="flexibility-panel p-4">
      <h3 className="font-bold text-lg mb-4">Adaptability</h3>
      
      {/* Industry examples */}
      <div className="industry-examples mb-4">
        <h4 className="font-semibold mb-2">Works for these businesses:</h4>
        <div className="flex flex-wrap gap-2">
          {flexibility.industryExamples.map((industry, i) => (
            <span 
              key={i}
              className="badge bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm"
            >
              {industry}
            </span>
          ))}
        </div>
      </div>
      
      {/* Industry lock meter */}
      <div className="industry-lock mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span>Industry Lock</span>
          <span>{flexibility.industryLock}/10</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-600">Universal</span>
          <div className="bar flex-1 h-2 bg-gray-200 rounded">
            <div 
              className={`h-full rounded ${
                flexibility.industryLock <= 3 ? 'bg-green-500' :
                flexibility.industryLock <= 6 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${flexibility.industryLock * 10}%` }}
            />
          </div>
          <span className="text-xs text-red-600">Locked</span>
        </div>
      </div>
      
      {/* Swappable elements */}
      {flexibility.swappableCore && (
        <div className="swappable mb-4">
          <h4 className="font-semibold mb-2 flex items-center gap-2">
            <span className="text-green-500">✓</span> 
            Core is swappable
          </h4>
          <p className="text-sm text-gray-600">{flexibility.swapExamples}</p>
        </div>
      )}
      
      {/* Notes */}
      {flexibility.flexibilityNotes && (
        <div className="notes bg-gray-100 p-3 rounded">
          <p className="text-sm">{flexibility.flexibilityNotes}</p>
        </div>
      )}
    </div>
  );
};
```

---

## 8. Production Checklist

### Generation Logic

```typescript
function generateProductionChecklist(data: ConceptViewerData): ChecklistItem[] {
  const checklist: ChecklistItem[] = [];
  
  // Casting items
  checklist.push({
    id: 'casting-people',
    category: 'casting',
    label: `${data.casting.minimumPeople} people minimum`,
    required: true
  });
  
  if (data.casting.requiresCustomer) {
    checklist.push({
      id: 'casting-customer',
      category: 'casting',
      label: 'Customer or stranger needed',
      description: 'Someone not part of your team',
      required: true
    });
  }
  
  if (data.casting.actingSkillRequired >= 7) {
    checklist.push({
      id: 'casting-acting',
      category: 'skill',
      label: 'Strong acting ability required',
      description: 'Consider rehearsing or casting experienced performers',
      required: true
    });
  }
  
  // Equipment items
  if (data.production.equipmentNeeded.length === 0) {
    checklist.push({
      id: 'equipment-phone',
      category: 'equipment',
      label: 'Smartphone only',
      description: 'No special equipment needed',
      required: true
    });
  } else {
    data.production.equipmentNeeded.forEach((item, i) => {
      checklist.push({
        id: `equipment-${i}`,
        category: 'equipment',
        label: item,
        required: true
      });
    });
  }
  
  // Location items
  const settingType = data.concept.templateDescription?.includes('indoor') ? 'indoor' : 
                      data.concept.templateDescription?.includes('outdoor') ? 'outdoor' : 'any';
  
  checklist.push({
    id: 'location-setting',
    category: 'location',
    label: settingType === 'any' ? 'Any setting works' : `${settingType} setting required`,
    required: settingType !== 'any'
  });
  
  // Time items
  checklist.push({
    id: 'time-shoot',
    category: 'time',
    label: `${data.production.timeToRecreate} to shoot`,
    required: true
  });
  
  if (data.production.editingDependency >= 7) {
    checklist.push({
      id: 'time-editing',
      category: 'time',
      label: 'Significant editing required',
      description: 'Plan additional post-production time',
      required: true
    });
  }
  
  return checklist;
}
```

### Component Structure

```typescript
interface ProductionChecklistProps {
  items: ChecklistItem[];
  onCheck?: (itemId: string, checked: boolean) => void;
}

const ProductionChecklist: React.FC<ProductionChecklistProps> = ({ items, onCheck }) => {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  
  const toggleItem = (itemId: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      onCheck?.(itemId, next.has(itemId));
      return next;
    });
  };
  
  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);
  
  const categoryLabels: Record<string, string> = {
    casting: '👥 Casting',
    equipment: '📷 Equipment',
    location: '📍 Location',
    time: '⏱️ Time',
    skill: '🎭 Skills'
  };
  
  return (
    <div className="production-checklist p-4 bg-white rounded-lg shadow">
      <h3 className="font-bold text-lg mb-4">Production Checklist</h3>
      
      {/* Progress */}
      <div className="progress mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span>Progress</span>
          <span>{checkedItems.size}/{items.length}</span>
        </div>
        <div className="bar h-2 bg-gray-200 rounded">
          <div 
            className="h-full bg-green-500 rounded transition-all"
            style={{ width: `${(checkedItems.size / items.length) * 100}%` }}
          />
        </div>
      </div>
      
      {/* Grouped items */}
      {Object.entries(groupedItems).map(([category, categoryItems]) => (
        <div key={category} className="category mb-4">
          <h4 className="font-semibold text-sm text-gray-500 mb-2">
            {categoryLabels[category] || category}
          </h4>
          <ul className="space-y-2">
            {categoryItems.map(item => (
              <li 
                key={item.id}
                className="flex items-start gap-2 cursor-pointer"
                onClick={() => toggleItem(item.id)}
              >
                <input
                  type="checkbox"
                  checked={checkedItems.has(item.id)}
                  onChange={() => {}}
                  className="mt-1"
                />
                <div>
                  <span className={checkedItems.has(item.id) ? 'line-through text-gray-400' : ''}>
                    {item.label}
                  </span>
                  {item.description && (
                    <p className="text-xs text-gray-500">{item.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
```

---

## 9. Data Fetching

### API Endpoint

```typescript
// GET /api/concepts/:id/viewer
// Returns full ConceptViewerData for a purchased concept

async function getConceptViewerData(
  conceptId: string, 
  buyerId: string,
  language: string
): Promise<ConceptViewerData> {
  // 1. Verify purchase
  const transaction = await db.transactions.findFirst({
    where: { concept_id: conceptId, buyer_id: buyerId }
  });
  
  if (!transaction) {
    throw new Error('UNAUTHORIZED: Concept not purchased');
  }
  
  // 2. Get concept with source video
  const concept = await db.concepts.findUnique({
    where: { id: conceptId },
    include: {
      source_video: true,
      model_version: true
    }
  });
  
  // 3. Generate signed video URL
  const videoUrl = await gcs.getSignedUrl(concept.source_video.gcs_uri, {
    expires: Date.now() + 4 * 60 * 60 * 1000 // 4 hours
  });
  
  // 4. Get overlays for buyer's language
  const overlays = await db.viewerOverlays.findMany({
    where: {
      concept_id: conceptId,
      language_code: language
    }
  });
  
  // 5. Build response
  const analysis = concept.source_video.visual_analysis;
  
  return {
    concept: {
      id: concept.id,
      conceptCore: concept.concept_core,
      templateDescription: concept.template_description,
      requiredElements: concept.required_elements,
      variableElements: concept.variable_elements,
      viralityScore: concept.virality_score
    },
    video: {
      url: videoUrl,
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      duration: analysis.content.duration,
      thumbnail: null // Optional
    },
    script: {
      transcript: analysis.script.transcript,
      visualTranscript: analysis.script.visualTranscript,
      conceptCore: analysis.script.conceptCore,
      structure: {
        hook: analysis.script.structure.hook,
        setup: analysis.script.structure.setup,
        development: analysis.script.structure.development,
        payoff: analysis.script.structure.payoff
      }
    },
    production: {
      minimumPeople: analysis.casting.minimumPeople,
      timeToRecreate: analysis.production.timeToRecreate,
      equipmentNeeded: analysis.production.equipmentNeeded,
      shotComplexity: analysis.production.shotComplexity,
      editingDependency: analysis.production.editingDependency,
      productionNotes: analysis.production.productionNotes
    },
    casting: analysis.casting,
    flexibility: analysis.flexibility,
    overlays: {
      subtitles: overlays.filter(o => o.overlay_type === 'subtitle').map(mapOverlay),
      sceneMarkers: overlays.filter(o => o.overlay_type === 'scene_marker').map(mapOverlay),
      timingCues: overlays.filter(o => o.overlay_type === 'timing_cue').map(mapOverlay)
    },
    productionChecklist: generateProductionChecklist({ /* ... */ }),
    purchase: {
      transactionId: transaction.id,
      purchasedAt: transaction.purchased_at,
      cashbackEligible: transaction.cashback_eligible,
      cashbackAmount: transaction.cashback_amount,
      cashbackStatus: transaction.cashback_status
    }
  };
}
```

---

## 10. Responsive Layout

### Desktop (>1024px)
```
┌─────────────────────┬─────────────────────┐
│                     │    Sidebar          │
│   Video Player      │    - Script         │
│   (70% width)       │    - Production     │
│                     │    - Casting        │
│                     │    - Flexibility    │
│                     │    - Checklist      │
│                     │    (30% width)      │
└─────────────────────┴─────────────────────┘
```

### Tablet (768-1024px)
```
┌─────────────────────────────────────────┐
│            Video Player                  │
│            (100% width)                  │
├─────────────────────────────────────────┤
│   ┌──────┬──────┬──────┬──────┬──────┐  │
│   │Script│Prod. │Cast. │Flex. │Check │  │
│   └──────┴──────┴──────┴──────┴──────┘  │
│   [Active Tab Content]                   │
└─────────────────────────────────────────┘
```

### Mobile (<768px)
```
┌───────────────────┐
│   Video Player    │
│   (100% width)    │
├───────────────────┤
│   Collapsible     │
│   Panels          │
│   ▼ Script        │
│   ▼ Production    │
│   ▼ Casting       │
│   ▼ Flexibility   │
│   ▼ Checklist     │
└───────────────────┘
```

---

## Related Documents

- [Subtitle Generation Deep Dive](./09_SUBTITLE_GENERATION.md) - How overlays are created
- [API Endpoints Deep Dive](./05_API_ENDPOINTS.md) - Viewer data endpoints
- [Database Schema Deep Dive](./02_DATABASE_SCHEMA.md) - Overlay storage

---

*This document provides exhaustive detail on the concept viewer. Refer to specific component documents for related systems.*
