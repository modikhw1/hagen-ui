# Component 10: Subtitle Generation Deep Dive

> **Parent Document**: [MVP Master Specification](../MVP_MASTER_SPECIFICATION.md)  
> **Component**: Subtitle Translation and Overlay System  
> **Last Updated**: December 3, 2025

---

## Overview

The subtitle generation system automatically translates video concepts into buyer-relevant languages and overlays subtitles directly in the viewer component. This removes language barriers and enhances concept comprehension without allowing downloads.

---

## WHY SUBTITLES MATTER FOR CROSS-BORDER

### The Cross-Border Arbitrage Model

The marketplace sells **US-origin concepts to global buyers**. But:
- Source videos are mostly English
- Indonesian buyer may not understand English
- The script/dialogue IS the concept in many skits

**Without subtitles**: Buyer can't fully understand what they're buying.

**With subtitles**: 
- Buyer sees translation overlay in real-time
- Script panel shows translated transcript
- Concept becomes accessible regardless of source language

### Integration with View-Only Model

Subtitles are rendered **client-side as overlays**, not burned into video:

```typescript
// Client renders subtitles on top of video
// Buyer sees: Video + Floating subtitle text
// Buyer CANNOT: Download video with subtitles baked in

// This maintains view-only constraint:
// - No downloadable file with translations
// - Subtitle data is separate from video stream
// - Viewing requires platform access
```

See [04_CONCEPT_VIEWER.md](./04_CONCEPT_VIEWER.md#critical-design-constraint-view-only-platform) for view-only enforcement details.

### Cost Efficiency

| Approach | Cost | Problem |
|----------|------|---------|
| Human translation | $20-50/video | Doesn't scale |
| Burn-in subtitles | $0 but manual | No language switching |
| **On-demand translation** | ~$0.01/language | Scales, cached |

We translate ONCE per concept×language, then cache for all future viewers.

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         SUBTITLE GENERATION PIPELINE                                     │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│   │   SOURCE     │───▶│  TRANSCRIBE  │───▶│  TRANSLATE   │───▶│   OVERLAY    │          │
│   │   VIDEO      │    │   (Whisper)  │    │   (Gemini)   │    │   (Client)   │          │
│   └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘          │
│         │                    │                   │                   │                   │
│         ▼                    ▼                   ▼                   ▼                   │
│   • Original audio    • Source text       • Target langs      • Real-time render       │
│   • Language detect   • Timestamps        • Preserve timing   • Style customization    │
│                       • Word-level        • Adapt nuance      • No download            │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Transcription Process

### 2.1 Whisper Transcription

```typescript
interface TranscriptionOptions {
  videoUrl: string;
  sourceLanguage?: string;          // Auto-detect if not provided
  wordLevelTimestamps: boolean;     // For precise subtitle alignment
  maxDuration?: number;             // Limit for long videos
}

interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
  segments: TranscriptionSegment[];
  words?: WordTimestamp[];
}

interface TranscriptionSegment {
  id: number;
  start: number;                    // Seconds
  end: number;
  text: string;
  confidence: number;
}

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
}
```

### 2.2 Whisper API Call

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeVideo(videoUrl: string): Promise<TranscriptionResult> {
  // Download audio from video
  const audioBuffer = await extractAudio(videoUrl);
  
  // Create file for API
  const audioFile = new File([audioBuffer], 'audio.mp3', { type: 'audio/mp3' });
  
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word', 'segment']
  });
  
  return {
    text: transcription.text,
    language: transcription.language,
    confidence: 1.0, // Whisper doesn't provide overall confidence
    segments: transcription.segments.map(seg => ({
      id: seg.id,
      start: seg.start,
      end: seg.end,
      text: seg.text,
      confidence: 1.0
    })),
    words: transcription.words?.map(w => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: 1.0
    }))
  };
}

async function extractAudio(videoUrl: string): Promise<Buffer> {
  // Use ffmpeg to extract audio
  const response = await fetch(videoUrl);
  const videoBuffer = Buffer.from(await response.arrayBuffer());
  
  // Save temp file
  const tempVideoPath = `/tmp/${Date.now()}.mp4`;
  const tempAudioPath = `/tmp/${Date.now()}.mp3`;
  
  await fs.writeFile(tempVideoPath, videoBuffer);
  
  // Extract audio with ffmpeg
  await execAsync(`ffmpeg -i ${tempVideoPath} -vn -acodec mp3 ${tempAudioPath}`);
  
  const audioBuffer = await fs.readFile(tempAudioPath);
  
  // Cleanup
  await fs.unlink(tempVideoPath);
  await fs.unlink(tempAudioPath);
  
  return audioBuffer;
}
```

---

## 3. Translation Process

### 3.1 Target Language Selection

```typescript
const SUPPORTED_LANGUAGES = {
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese (Simplified)',
  ar: 'Arabic',
  hi: 'Hindi',
  ru: 'Russian',
  id: 'Indonesian',
  th: 'Thai',
  vi: 'Vietnamese',
  tr: 'Turkish',
  pl: 'Polish',
  nl: 'Dutch'
};

interface MarketLanguageMapping {
  [market: string]: {
    primary: string;
    secondary?: string[];
  };
}

const MARKET_LANGUAGES: MarketLanguageMapping = {
  US: { primary: 'en' },
  MX: { primary: 'es' },
  BR: { primary: 'pt' },
  ES: { primary: 'es' },
  FR: { primary: 'fr' },
  DE: { primary: 'de' },
  IT: { primary: 'it' },
  JP: { primary: 'ja' },
  KR: { primary: 'ko' },
  CN: { primary: 'zh' },
  IN: { primary: 'en', secondary: ['hi'] },
  // ... more markets
};

function getTargetLanguages(buyerMarket: string, sourceLanguage: string): string[] {
  const marketConfig = MARKET_LANGUAGES[buyerMarket];
  if (!marketConfig) return ['en']; // Default to English
  
  const languages = [marketConfig.primary, ...(marketConfig.secondary || [])];
  
  // Filter out source language (no need to translate to same language)
  return languages.filter(lang => lang !== sourceLanguage);
}
```

### 3.2 Gemini Translation

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface TranslationResult {
  targetLanguage: string;
  segments: TranslatedSegment[];
}

interface TranslatedSegment {
  id: number;
  start: number;
  end: number;
  sourceText: string;
  translatedText: string;
}

async function translateSegments(
  segments: TranscriptionSegment[],
  sourceLanguage: string,
  targetLanguage: string
): Promise<TranslationResult> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  
  const prompt = `Translate the following video subtitles from ${SUPPORTED_LANGUAGES[sourceLanguage]} to ${SUPPORTED_LANGUAGES[targetLanguage]}.

IMPORTANT GUIDELINES:
1. Maintain the EXACT same number of segments
2. Keep translations concise to fit in subtitle format (max ~42 characters per line)
3. Preserve the comedic timing and tone
4. Adapt cultural references if needed for the target audience
5. Keep natural, conversational language

Source segments (JSON format):
${JSON.stringify(segments.map(s => ({ id: s.id, text: s.text })), null, 2)}

Return ONLY a JSON array with the translated segments in this format:
[
  { "id": 1, "text": "translated text here" },
  { "id": 2, "text": "translated text here" }
]`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();
  
  // Parse JSON from response
  const translatedTexts = JSON.parse(
    response.replace(/```json\n?|\n?```/g, '').trim()
  );
  
  // Merge with original timing
  return {
    targetLanguage,
    segments: segments.map((seg, i) => ({
      id: seg.id,
      start: seg.start,
      end: seg.end,
      sourceText: seg.text,
      translatedText: translatedTexts[i]?.text || seg.text
    }))
  };
}
```

---

## 4. Subtitle Storage

### 4.1 Database Schema

```sql
-- Store transcription and translations
CREATE TABLE video_subtitles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES analyzed_videos(id),
  
  -- Source transcription
  source_language TEXT NOT NULL,
  source_text TEXT NOT NULL,
  transcription_confidence FLOAT,
  
  -- Raw segment data
  segments JSONB NOT NULL,          -- Original segments with timing
  words JSONB,                      -- Word-level timestamps if available
  
  -- Metadata
  transcribed_at TIMESTAMPTZ DEFAULT NOW(),
  transcription_model TEXT DEFAULT 'whisper-1',
  duration_seconds FLOAT
);

-- Translations for each language
CREATE TABLE subtitle_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subtitle_id UUID NOT NULL REFERENCES video_subtitles(id),
  
  target_language TEXT NOT NULL,
  translated_segments JSONB NOT NULL,  -- Array of { id, start, end, text }
  
  translated_at TIMESTAMPTZ DEFAULT NOW(),
  translation_model TEXT DEFAULT 'gemini-2.0-flash',
  
  UNIQUE(subtitle_id, target_language)
);

-- Indexes
CREATE INDEX idx_video_subtitles_video ON video_subtitles(video_id);
CREATE INDEX idx_subtitle_translations_language ON subtitle_translations(target_language);
```

### 4.2 Store Subtitles

```typescript
async function storeSubtitles(
  videoId: string,
  transcription: TranscriptionResult
): Promise<string> {
  const { data: subtitle, error } = await supabase
    .from('video_subtitles')
    .insert({
      video_id: videoId,
      source_language: transcription.language,
      source_text: transcription.text,
      transcription_confidence: transcription.confidence,
      segments: transcription.segments,
      words: transcription.words || null
    })
    .select('id')
    .single();
  
  if (error) throw error;
  
  return subtitle.id;
}

async function storeTranslation(
  subtitleId: string,
  translation: TranslationResult
): Promise<void> {
  await supabase
    .from('subtitle_translations')
    .upsert({
      subtitle_id: subtitleId,
      target_language: translation.targetLanguage,
      translated_segments: translation.segments
    }, {
      onConflict: 'subtitle_id,target_language'
    });
}
```

---

## 5. On-Demand Processing

### 5.1 Process Subtitles When Needed

```typescript
async function ensureSubtitles(
  videoId: string,
  buyerMarket: string
): Promise<{
  sourceSubtitles: TranscriptionSegment[];
  translations: Map<string, TranslatedSegment[]>;
}> {
  // Check if transcription exists
  let { data: existingSubtitle } = await supabase
    .from('video_subtitles')
    .select('*')
    .eq('video_id', videoId)
    .single();
  
  if (!existingSubtitle) {
    // Get video URL
    const video = await getVideo(videoId);
    
    // Transcribe
    const transcription = await transcribeVideo(video.video_url);
    
    // Store
    const subtitleId = await storeSubtitles(videoId, transcription);
    
    existingSubtitle = {
      id: subtitleId,
      source_language: transcription.language,
      segments: transcription.segments
    };
  }
  
  // Get target languages for this market
  const targetLanguages = getTargetLanguages(buyerMarket, existingSubtitle.source_language);
  
  // Check existing translations
  const { data: existingTranslations } = await supabase
    .from('subtitle_translations')
    .select('*')
    .eq('subtitle_id', existingSubtitle.id)
    .in('target_language', targetLanguages);
  
  const existingLangs = new Set(existingTranslations?.map(t => t.target_language) || []);
  const missingLangs = targetLanguages.filter(lang => !existingLangs.has(lang));
  
  // Translate missing languages
  for (const lang of missingLangs) {
    const translation = await translateSegments(
      existingSubtitle.segments,
      existingSubtitle.source_language,
      lang
    );
    await storeTranslation(existingSubtitle.id, translation);
  }
  
  // Get all translations
  const { data: allTranslations } = await supabase
    .from('subtitle_translations')
    .select('*')
    .eq('subtitle_id', existingSubtitle.id)
    .in('target_language', targetLanguages);
  
  const translationsMap = new Map<string, TranslatedSegment[]>();
  for (const t of allTranslations || []) {
    translationsMap.set(t.target_language, t.translated_segments);
  }
  
  return {
    sourceSubtitles: existingSubtitle.segments,
    translations: translationsMap
  };
}
```

---

## 6. Client-Side Overlay

### 6.1 Subtitle Overlay Component

```tsx
interface SubtitleOverlayProps {
  segments: TranslatedSegment[];
  currentTime: number;
  style?: SubtitleStyle;
}

interface SubtitleStyle {
  fontSize: 'small' | 'medium' | 'large';
  position: 'bottom' | 'top';
  backgroundColor: string;
  textColor: string;
  fontWeight: 'normal' | 'bold';
}

const defaultStyle: SubtitleStyle = {
  fontSize: 'medium',
  position: 'bottom',
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  textColor: '#ffffff',
  fontWeight: 'bold'
};

function SubtitleOverlay({ segments, currentTime, style = defaultStyle }: SubtitleOverlayProps) {
  const currentSegment = useMemo(() => {
    return segments.find(
      seg => currentTime >= seg.start && currentTime < seg.end
    );
  }, [segments, currentTime]);
  
  if (!currentSegment) return null;
  
  const fontSizeMap = {
    small: '14px',
    medium: '18px',
    large: '24px'
  };
  
  return (
    <div 
      className="subtitle-overlay"
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        [style.position]: '10%',
        maxWidth: '90%',
        textAlign: 'center',
        zIndex: 10
      }}
    >
      <span
        style={{
          display: 'inline-block',
          padding: '8px 16px',
          borderRadius: '4px',
          backgroundColor: style.backgroundColor,
          color: style.textColor,
          fontSize: fontSizeMap[style.fontSize],
          fontWeight: style.fontWeight,
          lineHeight: 1.4,
          textShadow: '1px 1px 2px rgba(0,0,0,0.5)'
        }}
      >
        {currentSegment.translatedText}
      </span>
    </div>
  );
}
```

### 6.2 Video Player with Subtitles

```tsx
function VideoPlayerWithSubtitles({ 
  videoUrl, 
  subtitles,
  availableLanguages,
  defaultLanguage
}: {
  videoUrl: string;
  subtitles: Map<string, TranslatedSegment[]>;
  availableLanguages: string[];
  defaultLanguage: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState(defaultLanguage);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(defaultStyle);
  
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };
    
    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, []);
  
  const currentSubtitles = subtitles.get(selectedLanguage) || [];
  
  return (
    <div className="video-container" style={{ position: 'relative' }}>
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        style={{ width: '100%', display: 'block' }}
        // Disable download
        controlsList="nodownload"
        onContextMenu={e => e.preventDefault()}
      />
      
      {subtitlesEnabled && (
        <SubtitleOverlay
          segments={currentSubtitles}
          currentTime={currentTime}
          style={subtitleStyle}
        />
      )}
      
      <div className="subtitle-controls">
        <button onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}>
          {subtitlesEnabled ? 'CC ✓' : 'CC'}
        </button>
        
        <select 
          value={selectedLanguage}
          onChange={e => setSelectedLanguage(e.target.value)}
        >
          {availableLanguages.map(lang => (
            <option key={lang} value={lang}>
              {SUPPORTED_LANGUAGES[lang]}
            </option>
          ))}
        </select>
        
        <SubtitleStyleMenu
          style={subtitleStyle}
          onChange={setSubtitleStyle}
        />
      </div>
    </div>
  );
}
```

### 6.3 Style Customization Menu

```tsx
function SubtitleStyleMenu({ 
  style, 
  onChange 
}: { 
  style: SubtitleStyle; 
  onChange: (style: SubtitleStyle) => void;
}) {
  const [open, setOpen] = useState(false);
  
  return (
    <div className="style-menu">
      <button onClick={() => setOpen(!open)}>⚙️</button>
      
      {open && (
        <div className="style-options">
          <div className="option">
            <label>Size</label>
            <select 
              value={style.fontSize}
              onChange={e => onChange({ ...style, fontSize: e.target.value as any })}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
          
          <div className="option">
            <label>Position</label>
            <select 
              value={style.position}
              onChange={e => onChange({ ...style, position: e.target.value as any })}
            >
              <option value="bottom">Bottom</option>
              <option value="top">Top</option>
            </select>
          </div>
          
          <div className="option">
            <label>Background</label>
            <input 
              type="color"
              value={style.backgroundColor.replace(/rgba?\([^)]+\)/, '#000000')}
              onChange={e => onChange({ 
                ...style, 
                backgroundColor: `${e.target.value}cc` // Add transparency
              })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 7. API Endpoints

### 7.1 Get Subtitles for Video

```typescript
// GET /api/videos/:id/subtitles?market=US
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const url = new URL(request.url);
  const market = url.searchParams.get('market') || 'US';
  
  try {
    const { sourceSubtitles, translations } = await ensureSubtitles(params.id, market);
    
    return NextResponse.json({
      videoId: params.id,
      sourceLanguage: sourceSubtitles[0]?.sourceText ? 'detected' : 'unknown',
      availableLanguages: Array.from(translations.keys()),
      subtitles: Object.fromEntries(translations)
    });
  } catch (error) {
    console.error('Failed to get subtitles:', error);
    return NextResponse.json({ error: 'Failed to process subtitles' }, { status: 500 });
  }
}
```

### 7.2 Request Translation

```typescript
// POST /api/videos/:id/subtitles/translate
// Request additional language translation
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const { targetLanguage } = body;
  
  if (!SUPPORTED_LANGUAGES[targetLanguage]) {
    return NextResponse.json({ error: 'Unsupported language' }, { status: 400 });
  }
  
  // Get existing subtitle
  const { data: subtitle } = await supabase
    .from('video_subtitles')
    .select('*')
    .eq('video_id', params.id)
    .single();
  
  if (!subtitle) {
    return NextResponse.json({ error: 'Video not transcribed' }, { status: 404 });
  }
  
  // Check if translation already exists
  const { data: existing } = await supabase
    .from('subtitle_translations')
    .select('id')
    .eq('subtitle_id', subtitle.id)
    .eq('target_language', targetLanguage)
    .single();
  
  if (existing) {
    return NextResponse.json({ 
      message: 'Translation already exists',
      translationId: existing.id 
    });
  }
  
  // Translate
  const translation = await translateSegments(
    subtitle.segments,
    subtitle.source_language,
    targetLanguage
  );
  
  await storeTranslation(subtitle.id, translation);
  
  return NextResponse.json({
    success: true,
    targetLanguage,
    segments: translation.segments
  });
}
```

---

## 8. Preprocessing Pipeline

### 8.1 Batch Processing for New Videos

```typescript
// Process subtitles for newly analyzed videos
async function processNewVideoSubtitles(videoId: string): Promise<void> {
  console.log(`Processing subtitles for video ${videoId}`);
  
  // Get video
  const video = await getVideo(videoId);
  
  // Transcribe
  const transcription = await transcribeVideo(video.video_url);
  console.log(`Transcribed: ${transcription.language}, ${transcription.segments.length} segments`);
  
  // Store
  const subtitleId = await storeSubtitles(videoId, transcription);
  
  // Pre-translate to common languages
  const preTranslateLanguages = ['en', 'es', 'pt'];
  
  for (const lang of preTranslateLanguages) {
    if (lang === transcription.language) continue;
    
    try {
      const translation = await translateSegments(
        transcription.segments,
        transcription.language,
        lang
      );
      await storeTranslation(subtitleId, translation);
      console.log(`Translated to ${lang}`);
    } catch (error) {
      console.error(`Failed to translate to ${lang}:`, error);
    }
  }
}
```

### 8.2 Cron Job for Batch Processing

```typescript
// Run daily to process any videos without subtitles
async function batchProcessSubtitles(): Promise<void> {
  // Find videos without subtitles
  const { data: videosWithoutSubtitles } = await supabase
    .from('analyzed_videos')
    .select('id')
    .not('id', 'in', 
      supabase.from('video_subtitles').select('video_id')
    )
    .limit(10);  // Process 10 at a time
  
  for (const video of videosWithoutSubtitles || []) {
    try {
      await processNewVideoSubtitles(video.id);
    } catch (error) {
      console.error(`Failed to process ${video.id}:`, error);
    }
  }
}
```

---

## 9. Error Handling

### 9.1 Fallback Strategies

```typescript
async function getSubtitlesWithFallback(
  videoId: string,
  targetLanguage: string
): Promise<TranslatedSegment[]> {
  try {
    // Try to get translated subtitles
    const { data: translation } = await supabase
      .from('subtitle_translations')
      .select('translated_segments')
      .eq('subtitle_id', await getSubtitleId(videoId))
      .eq('target_language', targetLanguage)
      .single();
    
    if (translation) {
      return translation.translated_segments;
    }
    
    // Fallback 1: Return English if available
    const { data: englishTranslation } = await supabase
      .from('subtitle_translations')
      .select('translated_segments')
      .eq('subtitle_id', await getSubtitleId(videoId))
      .eq('target_language', 'en')
      .single();
    
    if (englishTranslation) {
      console.warn(`Falling back to English for video ${videoId}`);
      return englishTranslation.translated_segments;
    }
    
    // Fallback 2: Return source language subtitles
    const { data: source } = await supabase
      .from('video_subtitles')
      .select('segments')
      .eq('video_id', videoId)
      .single();
    
    if (source) {
      console.warn(`Falling back to source language for video ${videoId}`);
      return source.segments.map(s => ({
        ...s,
        sourceText: s.text,
        translatedText: s.text
      }));
    }
    
    // Fallback 3: No subtitles available
    console.warn(`No subtitles available for video ${videoId}`);
    return [];
    
  } catch (error) {
    console.error('Subtitle retrieval failed:', error);
    return [];
  }
}
```

### 9.2 Error States in UI

```tsx
function SubtitleErrorBoundary({ children, videoId }: { 
  children: React.ReactNode; 
  videoId: string;
}) {
  const [error, setError] = useState<Error | null>(null);
  
  if (error) {
    return (
      <div className="subtitle-error">
        <p>Subtitles unavailable</p>
        <button onClick={() => retrySubtitles(videoId)}>
          Retry
        </button>
      </div>
    );
  }
  
  return (
    <ErrorBoundary onError={setError}>
      {children}
    </ErrorBoundary>
  );
}
```

---

## 10. Performance Optimizations

### 10.1 Caching

```typescript
// Cache subtitles in memory for frequently accessed videos
const subtitleCache = new Map<string, {
  data: Map<string, TranslatedSegment[]>;
  timestamp: number;
}>();

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getCachedSubtitles(
  videoId: string,
  targetLanguage: string
): Promise<TranslatedSegment[] | null> {
  const cached = subtitleCache.get(videoId);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data.get(targetLanguage) || null;
  }
  
  return null;
}

function setCachedSubtitles(
  videoId: string,
  translations: Map<string, TranslatedSegment[]>
): void {
  subtitleCache.set(videoId, {
    data: translations,
    timestamp: Date.now()
  });
}
```

### 10.2 Lazy Loading

```tsx
// Load subtitles only when video starts playing
function useLazySubtitles(videoId: string, market: string) {
  const [subtitles, setSubtitles] = useState<Map<string, TranslatedSegment[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  
  const loadSubtitles = useCallback(async () => {
    if (loaded || loading) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/videos/${videoId}/subtitles?market=${market}`);
      const data = await response.json();
      setSubtitles(new Map(Object.entries(data.subtitles)));
      setLoaded(true);
    } catch (error) {
      console.error('Failed to load subtitles:', error);
    } finally {
      setLoading(false);
    }
  }, [videoId, market, loaded, loading]);
  
  return { subtitles, loading, loaded, loadSubtitles };
}
```

---

## 11. Analytics

### 11.1 Track Subtitle Usage

```sql
-- Track which languages are most used
CREATE TABLE subtitle_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES analyzed_videos(id),
  language TEXT NOT NULL,
  viewer_market TEXT,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics query
SELECT 
  language,
  COUNT(*) as usage_count,
  COUNT(DISTINCT video_id) as unique_videos,
  COUNT(DISTINCT viewer_market) as unique_markets
FROM subtitle_usage
GROUP BY language
ORDER BY usage_count DESC;
```

---

## Related Documents

- [Concept Viewer Deep Dive](./04_CONCEPT_VIEWER.md) - Video player component
- [API Endpoints Deep Dive](./05_API_ENDPOINTS.md) - All API routes
- [Database Schema Deep Dive](./02_DATABASE_SCHEMA.md) - Table definitions

---

*This document provides exhaustive detail on subtitle generation. Refer to specific component documents for related systems.*
