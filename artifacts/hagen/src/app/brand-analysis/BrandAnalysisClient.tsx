'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Types
interface Video {
  id: string;
  video_url: string;
  video_id: string;
  platform: string;
  gcs_uri?: string | null;
  metadata: {
    title?: string;
    author?: {
      username?: string;
      displayName?: string;
    } | string;
    thumbnail_url?: string;
  } | null;
  visual_analysis: Record<string, unknown> | null;
  rating: {
    overall_score: number;
    notes: string | null;
    rated_at: string;
    humor_type?: string | null;
    dimensions?: Record<string, unknown> | null;
    tags?: string[] | null;
  } | null;
}

interface BrandRating {
  id: string;
  video_id: string;
  personality_notes: string;
  statement_notes: string;
  corrections?: string;
  ai_analysis?: unknown;
  extracted_signals?: Record<string, unknown>;
  created_at: string;
}

interface SimilarVideo {
  video_id: string;
  video_url: string;
  personality_notes: string;
  statement_notes: string;
  similarity: number;
}

// Custom Slider Component
function Slider({ 
  value, 
  onChange, 
  min = 1, 
  max = 10,
  labels 
}: { 
  value: number; 
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  labels?: { left: string; right: string };
}) {
  const percentage = ((value - min) / (max - min)) * 100;
  
  return (
    <div className="space-y-2">
      {labels && (
        <div className="flex justify-between text-xs text-gray-500">
          <span>{labels.left}</span>
          <span>{labels.right}</span>
        </div>
      )}
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${percentage}%, #374151 ${percentage}%, #374151 100%)`
          }}
        />
        <div className="flex justify-between mt-1">
          {Array.from({ length: max - min + 1 }, (_, i) => i + min).map((n) => (
            <span 
              key={n} 
              className={`text-xs ${value === n ? 'text-blue-400 font-bold' : 'text-gray-600'}`}
            >
              {n}
            </span>
          ))}
        </div>
      </div>
      <div className="text-center">
        <span className="text-2xl font-bold text-white">{value}</span>
        <span className="text-gray-400 text-sm ml-1">/ {max}</span>
      </div>
    </div>
  );
}

// Age Range Slider Component
function AgeRangeSlider({
  minAge,
  maxAge,
  onChange
}: {
  minAge: number;
  maxAge: number;
  onChange: (min: number, max: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'min' | 'max' | null>(null);
  
  const ageMin = 12;
  const ageMax = 65;
  
  const getPercentage = (age: number) => ((age - ageMin) / (ageMax - ageMin)) * 100;
  
  const handleMouseDown = (handle: 'min' | 'max') => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(handle);
  };
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging || !trackRef.current) return;
    
    const rect = trackRef.current.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const age = Math.round(ageMin + (percentage / 100) * (ageMax - ageMin));
    
    if (dragging === 'min') {
      onChange(Math.min(age, maxAge - 1), maxAge);
    } else {
      onChange(minAge, Math.max(age, minAge + 1));
    }
  }, [dragging, minAge, maxAge, onChange]);
  
  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);
  
  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);
  
  const ageMarkers = [12, 18, 25, 35, 45, 55, 65];
  
  return (
    <div className="space-y-4">
      <div className="flex justify-between text-xs text-gray-500">
        <span>Youth (12)</span>
        <span>Senior (65)</span>
      </div>
      
      <div 
        ref={trackRef}
        className="relative h-2 bg-gray-700 rounded-full cursor-pointer"
      >
        {/* Selected range */}
        <div 
          className="absolute h-full bg-blue-500 rounded-full"
          style={{
            left: `${getPercentage(minAge)}%`,
            width: `${getPercentage(maxAge) - getPercentage(minAge)}%`
          }}
        />
        
        {/* Min handle */}
        <div
          className={`absolute w-5 h-5 bg-white rounded-full shadow-lg cursor-grab transform -translate-x-1/2 -translate-y-1/2 top-1/2 border-2 border-blue-500 ${dragging === 'min' ? 'cursor-grabbing scale-110' : 'hover:scale-110'} transition-transform`}
          style={{ left: `${getPercentage(minAge)}%` }}
          onMouseDown={handleMouseDown('min')}
        />
        
        {/* Max handle */}
        <div
          className={`absolute w-5 h-5 bg-white rounded-full shadow-lg cursor-grab transform -translate-x-1/2 -translate-y-1/2 top-1/2 border-2 border-blue-500 ${dragging === 'max' ? 'cursor-grabbing scale-110' : 'hover:scale-110'} transition-transform`}
          style={{ left: `${getPercentage(maxAge)}%` }}
          onMouseDown={handleMouseDown('max')}
        />
      </div>
      
      {/* Age markers */}
      <div className="flex justify-between">
        {ageMarkers.map((age) => (
          <span 
            key={age}
            className={`text-xs ${age >= minAge && age <= maxAge ? 'text-blue-400' : 'text-gray-600'}`}
          >
            {age}
          </span>
        ))}
      </div>
      
      {/* Display selected range */}
      <div className="text-center">
        <span className="text-2xl font-bold text-white">{minAge} - {maxAge}</span>
        <span className="text-gray-400 text-sm ml-2">years old</span>
      </div>
    </div>
  );
}

function HelpTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center group">
      <span
        className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full border border-gray-700 bg-gray-800 text-gray-300 text-xs select-none"
        aria-label="Help"
      >
        i
      </span>
      <span className="pointer-events-none absolute left-0 top-7 z-20 hidden w-72 rounded-lg border border-gray-700 bg-gray-900 p-3 text-xs text-gray-200 group-hover:block">
        {text}
      </span>
    </span>
  );
}

// Helper function for deep merging objects (moved outside component to avoid dependency issues)
const deepMerge = (base: unknown, patch: unknown): unknown => {
  if (patch === null || patch === undefined) return base;
  if (Array.isArray(patch)) return patch;
  if (typeof patch !== 'object') return patch;
  if (base === null || base === undefined) return patch;
  if (Array.isArray(base)) return patch;

  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(patch as Record<string, unknown>)) {
    result[key] = deepMerge((base as Record<string, unknown>)[key], (patch as Record<string, unknown>)[key]);
  }
  return result;
};

export default function BrandAnalysisClient() {
  // Video list state
  const [videos, setVideos] = useState<Video[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  
  // Selection state
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  
  // NEW: Analysis state
  const [survivalScore, setSurvivalScore] = useState(5);
  const [survivalNotes, setSurvivalNotes] = useState('');
  
  const [coolnessScore, setCoolnessScore] = useState(5);
  const [coolnessNotes, setCoolnessNotes] = useState('');
  
  const [targetAgeMin, setTargetAgeMin] = useState(18);
  const [targetAgeMax, setTargetAgeMax] = useState(35);
  const [audienceNotes, setAudienceNotes] = useState('');
  
  // LEGACY: Brand rating state (still supported)
  const [personalityNotes, setPersonalityNotes] = useState('');
  const [statementNotes, setStatementNotes] = useState('');
  const [corrections, setCorrections] = useState('');
  const [existingRating, setExistingRating] = useState<BrandRating | null>(null);

  // Schema v1 AI analysis state
  const [schemaV1ModelAnalysis, setSchemaV1ModelAnalysis] = useState<unknown | null>(null);
  const [schemaV1HumanPatch, setSchemaV1HumanPatch] = useState<Record<string, unknown> | null>(null);
  const [schemaV1Loading, setSchemaV1Loading] = useState(false);
  const [schemaV1Error, setSchemaV1Error] = useState<string | null>(null);
  
  // Similar videos
  const [similarVideos, setSimilarVideos] = useState<SimilarVideo[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  
  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'profile' | 'schema' | 'signals' | 'brand'>('profile');

  // Profile fingerprint state
  const [profileVideoUrls, setProfileVideoUrls] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileFingerprint, setProfileFingerprint] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const [prepareLoading, setPrepareLoading] = useState(false);
  const [prepareResult, setPrepareResult] = useState<{ 
    embeddings_backfilled: number; 
    schema_v1_analyzed: number; 
    videos_found: number;
    videos_checked_for_embedding: number;
    videos_checked_for_schema_v1: number;
    videos_needing_gcs: number;
    errors: string[] 
  } | null>(null);

  const isObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
  };

  const getModelObservation = (analysis: unknown): any | null => {
    if (!isObject(analysis)) return null;
    // Expected VideoBrandAnalysis shape: { raw_output: VideoBrandObservationV1 }
    const raw = (analysis as any).raw_output;
    return isObject(raw) ? raw : null;
  };

  const setDeep = (obj: any, path: string[], value: any): any => {
    const root = isObject(obj) ? { ...(obj as any) } : {};
    let cursor: any = root;

    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      const existing = cursor[key];
      cursor[key] = isObject(existing) ? { ...(existing as any) } : {};
      cursor = cursor[key];
    }

    cursor[path[path.length - 1]] = value;
    return root;
  };

  const updateSchemaPatch = (path: string[], value: any) => {
    setSchemaV1HumanPatch((prev) => setDeep(prev, path, value));
  };

  const parseCommaList = (value: string): string[] => {
    const parts = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts;
  };

  const getDeep = (obj: any, ...path: string[]) => {
    let cur = obj;
    for (const key of path) {
      if (!cur || typeof cur !== 'object') return undefined;
      cur = cur[key];
    }
    return cur;
  };

  const seedSchemaFromAnalyzeRate = useCallback(() => {
    if (!selectedVideo) return;

    const raw = selectedVideo.visual_analysis || {};
    const humorType =
      getDeep(raw, 'script', 'humor', 'humorType') ||
      getDeep(raw, 'humor_analysis', 'primary_type') ||
      (selectedVideo.rating as any)?.humor_type ||
      null;

    const contentFormat =
      getDeep(raw, 'content', 'format') ||
      getDeep(raw, 'format') ||
      null;

    const patch: Record<string, unknown> = {
      schema_version: 1,
      video: {
        video_id: selectedVideo.id,
        platform: selectedVideo.platform,
        video_url: selectedVideo.video_url,
        gcs_uri: selectedVideo.gcs_uri || undefined
      },
      signals: {
        humor: {
          present: humorType ? humorType !== 'none' : null,
          humor_types: humorType ? [String(humorType)] : [],
          target: null,
          age_code: 'unknown',
          meanness_risk: 'unknown'
        },
        execution: {
          has_repeatable_format: null,
          format_name_if_any: contentFormat ? String(contentFormat) : null
        }
      }
    };

    // Merge into existing patch (user edits win after merge)
    setSchemaV1HumanPatch((prev) => deepMerge(patch, prev) as Record<string, unknown> | null);
  }, [selectedVideo]);

  const [uploadingGcs, setUploadingGcs] = useState(false);
  const [uploadGcsError, setUploadGcsError] = useState<string | null>(null);

  const uploadSelectedVideoToGcs = useCallback(async () => {
    if (!selectedVideo) return;
    setUploadingGcs(true);
    setUploadGcsError(null);

    try {
      const res = await fetch('/api/videos/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: selectedVideo.id })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to upload');
      }

      const gcsUri = data.gcsUri as string | undefined;
      if (gcsUri) {
        setSelectedVideo((prev) => (prev ? { ...prev, gcs_uri: gcsUri } : prev));
        setVideos((prev) => prev.map((v) => (v.id === selectedVideo.id ? { ...v, gcs_uri: gcsUri } : v)));
      }
    } catch (err) {
      setUploadGcsError(err instanceof Error ? err.message : 'Failed to upload');
    } finally {
      setUploadingGcs(false);
    }
  }, [selectedVideo]);

  // Profile fingerprint computation
  const computeProfileFingerprint = useCallback(async () => {
    const urls = profileVideoUrls
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http'));

    if (urls.length === 0) {
      setProfileError('Enter at least one video URL');
      return;
    }

    setProfileLoading(true);
    setProfileError(null);

    try {
      const res = await fetch('/api/brand-analysis/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_name: profileName || undefined,
          video_urls: urls
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to compute fingerprint');

      setProfileFingerprint(data.fingerprint);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setProfileLoading(false);
    }
  }, [profileVideoUrls, profileName]);

  // Match all videos against profile fingerprint
  const runBatchMatch = useCallback(async () => {
    if (!profileFingerprint) return;

    setMatchLoading(true);
    try {
      const videoIds = videos.map((v) => v.id);
      const res = await fetch('/api/brand-analysis/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_video_ids: videoIds,
          fingerprint: profileFingerprint
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to match');

      setMatchResults(data.matches || []);
    } catch (err) {
      console.error('Batch match error:', err);
    } finally {
      setMatchLoading(false);
    }
  }, [profileFingerprint, videos]);

  // Prepare profile: backfill embeddings + run Schema v1
  const prepareProfile = useCallback(async () => {
    if (!profileFingerprint?.urls_found?.length) return;

    setPrepareLoading(true);
    setPrepareResult(null);

    try {
      const res = await fetch('/api/brand-analysis/prepare-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_urls: profileFingerprint.urls_found
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Preparation failed');

      setPrepareResult({
        embeddings_backfilled: data.embeddings_backfilled || 0,
        schema_v1_analyzed: data.schema_v1_analyzed || 0,
        videos_found: data.videos_found || 0,
        videos_checked_for_embedding: data.videos_checked_for_embedding || 0,
        videos_checked_for_schema_v1: data.videos_checked_for_schema_v1 || 0,
        videos_needing_gcs: data.videos_needing_gcs || 0,
        errors: data.errors || []
      });

      // Auto-recompute fingerprint if anything was updated
      if (data.embeddings_backfilled > 0 || data.schema_v1_analyzed > 0) {
        // Small delay then re-compute
        setTimeout(() => {
          computeProfileFingerprint();
        }, 500);
      }
    } catch (err) {
      console.error('Prepare profile error:', err);
      setPrepareResult({
        embeddings_backfilled: 0,
        schema_v1_analyzed: 0,
        videos_found: 0,
        videos_checked_for_embedding: 0,
        videos_checked_for_schema_v1: 0,
        videos_needing_gcs: 0,
        errors: [err instanceof Error ? err.message : 'Unknown error']
      });
    } finally {
      setPrepareLoading(false);
    }
  }, [profileFingerprint, computeProfileFingerprint]);


  // Fetch rated videos from library
  const fetchVideos = useCallback(async () => {
    setLoadingVideos(true);
    try {
      const res = await fetch('/api/ratings?limit=100');
      if (!res.ok) throw new Error('Failed to fetch videos');
      const data = await res.json();
      
      const transformedVideos: Video[] = data.map((r: any) => ({
        id: r.video?.id || r.video_id,
        video_url: r.video?.video_url || '',
        video_id: r.video?.video_id || '',
        platform: r.video?.platform || 'unknown',
        metadata: r.video?.metadata || null,
        visual_analysis: r.video?.visual_analysis || null,
        gcs_uri: r.video?.gcs_uri || null,
        rating: {
          overall_score: r.overall_score,
          notes: r.notes,
          rated_at: r.rated_at,
          humor_type: r.humor_type || null,
          dimensions: r.dimensions || null,
          tags: r.tags || null,
        },
      }));
      
      setVideos(transformedVideos);
      setVideoError(null);
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : 'Failed to load videos');
    } finally {
      setLoadingVideos(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Reset form
  const resetForm = useCallback(() => {
    setExistingRating(null);
    setPersonalityNotes('');
    setStatementNotes('');
    setCorrections('');
    setSchemaV1ModelAnalysis(null);
    setSchemaV1HumanPatch(null);
    setSchemaV1Error(null);
    setSurvivalScore(5);
    setSurvivalNotes('');
    setCoolnessScore(5);
    setCoolnessNotes('');
    setTargetAgeMin(18);
    setTargetAgeMax(35);
    setAudienceNotes('');
  }, []);

  // Load existing rating when video is selected
  const loadExistingRating = useCallback(async (videoId: string) => {
    try {
      // Use fallback to surface the latest schema_v1 batch result when there is no human/primary rating yet.
      const res = await fetch(`/api/brand-analysis?video_id=${videoId}&fallback=true`);
      if (res.ok) {
        const data = await res.json();
        if (data.rating) {
          setExistingRating(data.rating);
          setPersonalityNotes(data.rating.personality_notes || '');
          setStatementNotes(data.rating.statement_notes || '');
          setCorrections(data.rating.corrections || '');

          // ai_analysis can be stored in multiple formats; keep backwards compatibility.
          const aiAnalysis = data.rating.ai_analysis as unknown;
          let modelAnalysis: unknown | null = null;
          let humanPatch: Record<string, unknown> | null = null;

          if (aiAnalysis) {
            if (isObject(aiAnalysis) && (aiAnalysis as any).kind === 'schema_v1_review') {
              modelAnalysis = (aiAnalysis as any).model_analysis ?? null;
              humanPatch = (aiAnalysis as any).human_patch ?? null;
            } else if (isObject(aiAnalysis) && 'raw_output' in aiAnalysis) {
              modelAnalysis = aiAnalysis;
            }
          }

          setSchemaV1ModelAnalysis(modelAnalysis);
          setSchemaV1HumanPatch(humanPatch);
          
          // Load signal data if exists
          if (data.rating.extracted_signals) {
            const signals = data.rating.extracted_signals;
            if (signals.survival_score) setSurvivalScore(signals.survival_score);
            if (signals.survival_notes) setSurvivalNotes(signals.survival_notes);
            if (signals.coolness_score) setCoolnessScore(signals.coolness_score);
            if (signals.coolness_notes) setCoolnessNotes(signals.coolness_notes);
            if (signals.target_age_min) setTargetAgeMin(signals.target_age_min);
            if (signals.target_age_max) setTargetAgeMax(signals.target_age_max);
            if (signals.audience_notes) setAudienceNotes(signals.audience_notes);
          }
        } else {
          resetForm();
        }
      }
    } catch (e) {
      console.error('Failed to load existing rating:', e);
    }
  }, [resetForm]);

  const runSchemaV1Analysis = useCallback(async () => {
    if (!selectedVideo) return;

    setSchemaV1Loading(true);
    setSchemaV1Error(null);

    try {
      const res = await fetch('/api/brand-analysis/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: selectedVideo.id,
          video_url: selectedVideo.video_url
          ,gcs_uri: selectedVideo.gcs_uri
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to analyze');
      }

      setSchemaV1ModelAnalysis(data.analysis || null);
    } catch (err) {
      setSchemaV1Error(err instanceof Error ? err.message : 'Failed to analyze');
    } finally {
      setSchemaV1Loading(false);
    }
  }, [selectedVideo]);

  // Load similar videos
  const loadSimilarVideos = useCallback(async (videoId: string) => {
    setLoadingSimilar(true);
    try {
      const res = await fetch(`/api/brand-analysis/similar?video_id=${videoId}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setSimilarVideos(data.videos || []);
      }
    } catch (e) {
      console.error('Failed to load similar videos:', e);
    } finally {
      setLoadingSimilar(false);
    }
  }, []);

  // Handle video selection
  const handleSelectVideo = (video: Video) => {
    setSelectedVideoId(video.id);
    setSelectedVideo(video);
    setSubmitted(false);
    setSubmitError(null);
    setSchemaV1Error(null);
    loadExistingRating(video.id);
    loadSimilarVideos(video.id);
  };

  // Handle submission
  const handleSubmit = async () => {
    if (!selectedVideo) return;
    
    setSubmitting(true);
    setSubmitError(null);
    
    try {
      const res = await fetch('/api/brand-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: selectedVideo.id,
          video_url: selectedVideo.video_url,
          personality_notes: personalityNotes,
          statement_notes: statementNotes,
          corrections: corrections || null,
          ai_analysis: {
            kind: 'schema_v1_review',
            model_analysis: schemaV1ModelAnalysis,
            human_patch: schemaV1HumanPatch,
            updated_at: new Date().toISOString()
          },
          extracted_signals: {
            // New signal fields
            survival_score: survivalScore,
            survival_notes: survivalNotes,
            coolness_score: coolnessScore,
            coolness_notes: coolnessNotes,
            target_age_min: targetAgeMin,
            target_age_max: targetAgeMax,
            audience_notes: audienceNotes
          }
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }
      
      setSubmitted(true);
      loadSimilarVideos(selectedVideo.id);
      
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save rating');
    } finally {
      setSubmitting(false);
    }
  };

  // Get quality tier color
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-400';
    if (score >= 0.6) return 'text-blue-400';
    if (score >= 0.4) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Safely get author name from metadata
  const getAuthorName = (metadata: Video['metadata']): string => {
    if (!metadata?.author) return 'Unknown';
    if (typeof metadata.author === 'string') return metadata.author;
    return metadata.author.displayName || metadata.author.username || 'Unknown';
  };

  const modelObservation = getModelObservation(schemaV1ModelAnalysis);
  const effectiveObservation = deepMerge(modelObservation, schemaV1HumanPatch) as Record<string, unknown> | null;
  const effectiveSignals = effectiveObservation?.signals as Record<string, any> | undefined;
  const effectiveEvidence: any[] = Array.isArray(effectiveObservation?.evidence) ? effectiveObservation.evidence : [];
  const effectiveUncertainties: string[] = Array.isArray(effectiveObservation?.uncertainties)
    ? effectiveObservation.uncertainties as string[]
    : [];

  const addEvidenceItem = () => {
    const next = [...effectiveEvidence, { type: 'other', start_s: null, end_s: null, text: '', supports: [] }];
    updateSchemaPatch(['evidence'], next);
  };

  const removeEvidenceItem = (index: number) => {
    const next = effectiveEvidence.filter((_, i) => i !== index);
    updateSchemaPatch(['evidence'], next);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Custom slider styles */}
      <style jsx global>{`
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: 2px solid #3b82f6;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        input[type="range"]::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: 2px solid #3b82f6;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
      `}</style>

      {/* Header */}
      <div className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold">Brand Analysis</h1>
          <p className="text-gray-400 text-sm mt-1">
            Analyze survival instinct, social positioning, and target audience signals
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Panel: Video List */}
          <div className="lg:col-span-1">
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <div className="p-4 border-b border-gray-800">
                <h2 className="font-semibold">Rated Videos</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {videos.length} videos available
                </p>
              </div>
              
              {loadingVideos ? (
                <div className="p-4 text-gray-400">Loading...</div>
              ) : videoError ? (
                <div className="p-4 text-red-400">{videoError}</div>
              ) : (
                <div className="max-h-[700px] overflow-y-auto">
                  {videos.map((video) => (
                    <button
                      key={video.id}
                      onClick={() => handleSelectVideo(video)}
                      className={`w-full p-4 text-left border-b border-gray-800 hover:bg-gray-800 transition-colors ${
                        selectedVideoId === video.id ? 'bg-gray-800' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-16 h-16 bg-gray-700 rounded flex-shrink-0 flex items-center justify-center">
                          <span className="text-2xl">▶</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {video.metadata?.title || video.video_id}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {video.platform} • {getAuthorName(video.metadata)}
                          </p>
                          {video.rating && (
                            <p className={`text-xs mt-1 ${getScoreColor(video.rating.overall_score)}`}>
                              Score: {Math.round(video.rating.overall_score * 100)}%
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Center + Right: Analysis Form */}
          <div className="lg:col-span-2 space-y-6">
            {!selectedVideo ? (
              <>
                {/* Profile Matching - Standalone (no video selected) */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
                  <div>
                    <h3 className="font-semibold text-lg mb-2">Profile Fingerprint Matching</h3>
                    <p className="text-sm text-gray-400">
                      Create a fingerprint from a brand&apos;s videos, then match your library against it.
                      Paste 5-10 video URLs from the target profile (one per line).
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Profile Name (optional)
                    </label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="e.g., @espressobar_berlin"
                      className="w-full p-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Video URLs (one per line)
                    </label>
                    <textarea
                      value={profileVideoUrls}
                      onChange={(e) => setProfileVideoUrls(e.target.value)}
                      placeholder="https://www.tiktok.com/@username/video/12345...
https://www.tiktok.com/@username/video/67890..."
                      rows={6}
                      className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Warning: Videos must already be in the system (analyzed via /analyze-rate first)
                    </p>
                  </div>

                  <button
                    onClick={computeProfileFingerprint}
                    disabled={profileLoading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg"
                  >
                    {profileLoading ? 'Computing…' : 'Compute Fingerprint'}
                  </button>

                  {profileError && (
                    <p className="text-sm text-red-400">{profileError}</p>
                  )}

                  {profileFingerprint && (
                    <div className="border border-gray-700 rounded-lg p-4 space-y-3 mt-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-green-400">
                          ✓ Fingerprint Ready {profileFingerprint.profile_name && `(${profileFingerprint.profile_name})`}
                        </h4>
                        <span className="text-xs text-gray-400">
                          {profileFingerprint.video_count} videos • {Math.round(profileFingerprint.confidence * 100)}% confidence
                        </span>
                      </div>

                      {/* Personality Summary */}
                      {profileFingerprint.personality_summary && (
                        <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-3">
                          <p className="text-sm text-blue-200">
                            <span className="font-medium">Profile Personality: </span>
                            {profileFingerprint.personality_summary}
                          </p>
                        </div>
                      )}

                      {/* Layer Cards with Tooltips */}
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div className="bg-gray-800/50 p-3 rounded group relative">
                          <div className="text-gray-400 text-xs mb-1 flex items-center gap-1">
                            L1: Quality
                            <span className="cursor-help text-gray-500 hover:text-gray-300" title="Content quality & virality. Based on /analyze-rate scores and execution coherence. Higher = proven performance.">ⓘ</span>
                          </div>
                          <div className="text-white">
                            {Math.round((profileFingerprint.layers.l1_quality.avg_quality_score || 0) * 100)}% avg
                          </div>
                        </div>
                        <div className="bg-gray-800/50 p-3 rounded group relative">
                          <div className="text-gray-400 text-xs mb-1 flex items-center gap-1">
                            L2: Likeness
                            <span className="cursor-help text-gray-500 hover:text-gray-300" title="Personality & tone match. Includes energy, warmth, humor type, age targeting, and vibe. This is the 'would I be friends with them?' layer.">ⓘ</span>
                          </div>
                          <div className="text-white">
                            Energy {profileFingerprint.layers.l2_likeness.avg_energy?.toFixed(1) || '—'}/10
                          </div>
                        </div>
                        <div className="bg-gray-800/50 p-3 rounded group relative">
                          <div className="text-gray-400 text-xs mb-1 flex items-center gap-1">
                            L3: Visual
                            <span className="cursor-help text-gray-500 hover:text-gray-300" title="Production style match. How polished vs raw the content is. Less important than concept/personality.">ⓘ</span>
                          </div>
                          <div className="text-white">
                            Production {profileFingerprint.layers.l3_visual.avg_production_investment?.toFixed(1) || '—'}/10
                          </div>
                        </div>
                      </div>

                      {/* Additional L2 details */}
                      <div className="flex flex-wrap gap-2 text-xs">
                        {profileFingerprint.layers.l2_likeness.dominant_humor_types?.length > 0 && (
                          <span className="px-2 py-1 bg-purple-900/30 border border-purple-700/50 rounded">
                            Humor: {profileFingerprint.layers.l2_likeness.dominant_humor_types.join(', ')}
                          </span>
                        )}
                        {profileFingerprint.layers.l2_likeness.dominant_vibe?.length > 0 && (
                          <span className="px-2 py-1 bg-green-900/30 border border-green-700/50 rounded">
                            Vibe: {profileFingerprint.layers.l2_likeness.dominant_vibe.join(', ')}
                          </span>
                        )}
                        {profileFingerprint.layers.l2_likeness.dominant_age_code && (
                          <span className="px-2 py-1 bg-orange-900/30 border border-orange-700/50 rounded">
                            Age: {profileFingerprint.layers.l2_likeness.dominant_age_code}
                          </span>
                        )}
                        {profileFingerprint.layers.l2_likeness.dominant_price_tier && profileFingerprint.layers.l2_likeness.dominant_price_tier !== 'mixed' && (
                          <span className="px-2 py-1 bg-yellow-900/30 border border-yellow-700/50 rounded">
                            Tier: {profileFingerprint.layers.l2_likeness.dominant_price_tier}
                          </span>
                        )}
                      </div>

                      {/* URLs Not Found */}
                      {profileFingerprint.urls_not_found?.length > 0 && (
                        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3">
                          <p className="text-xs text-red-300 font-medium mb-2">
                            Error: {profileFingerprint.urls_not_found.length} URL(s) not found in database:
                          </p>
                          <ul className="text-xs text-red-400/80 space-y-1 font-mono">
                            {profileFingerprint.urls_not_found.map((url: string, i: number) => (
                              <li key={i} className="truncate">• {url}</li>
                            ))}
                          </ul>
                          <p className="text-xs text-gray-500 mt-2">
                            → Analyze these via /analyze-rate first, then recompute fingerprint
                          </p>
                        </div>
                      )}

                      {/* Other warnings */}
                      {profileFingerprint.missing_data_notes?.length > 0 && (
                        <div className="text-xs text-yellow-400/70">
                          Warning: {profileFingerprint.missing_data_notes.join('; ')}
                        </div>
                      )}

                      {/* Prepare Profile Button - shows when there's missing embeddings or Schema v1 */}
                      {profileFingerprint.missing_data_notes?.some((n: string) => 
                        n.includes('missing embeddings') || n.includes('missing Schema v1')
                      ) && (
                        <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-4">
                          <p className="text-sm text-amber-200 mb-3">
                            <strong>Data Incomplete</strong> — Some videos are missing embeddings or Schema v1 analysis, 
                            which reduces matching accuracy.
                          </p>
                          <button
                            onClick={prepareProfile}
                            disabled={prepareLoading}
                            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg text-sm"
                          >
                            {prepareLoading ? 'Preparing… (may take a minute)' : '🔧 Prepare Profile Data'}
                          </button>
                          <p className="text-xs text-gray-500 mt-2">
                            This will backfill embeddings and run Schema v1 analysis for videos in this profile.
                          </p>
                          
                          {/* Prepare result feedback */}
                          {prepareResult && (
                            <div className="mt-3 p-3 bg-gray-800/50 rounded text-xs space-y-1">
                              <p className="text-gray-300 font-medium mb-2">Preparation Results:</p>
                              <p className="text-gray-400">Videos found in DB: {prepareResult.videos_found}</p>
                              
                              {/* Embeddings section */}
                              <p className={prepareResult.videos_checked_for_embedding > 0 ? 'text-yellow-400' : 'text-gray-500'}>
                                🧠 Videos needing embeddings: {prepareResult.videos_checked_for_embedding}
                              </p>
                              {prepareResult.embeddings_backfilled > 0 && (
                                <p className="text-green-400 ml-4">✓ {prepareResult.embeddings_backfilled} embedding(s) backfilled</p>
                              )}
                              
                              {/* Schema v1 section */}
                              <p className={prepareResult.videos_checked_for_schema_v1 > 0 ? 'text-yellow-400' : 'text-gray-500'}>
                                Videos eligible for Schema v1: {prepareResult.videos_checked_for_schema_v1}
                              </p>
                              {prepareResult.schema_v1_analyzed > 0 && (
                                <p className="text-green-400 ml-4">✓ {prepareResult.schema_v1_analyzed} video(s) analyzed</p>
                              )}
                              
                              {/* GCS warning */}
                              {prepareResult.videos_needing_gcs > 0 && (
                                <p className="text-orange-400">
                                  Warning: {prepareResult.videos_needing_gcs} video(s) need GCS upload first (no gcs_uri)
                                </p>
                              )}
                              
                              {/* Errors */}
                              {prepareResult.errors.length > 0 && (
                                <div className="text-red-400 mt-2 border-t border-gray-700 pt-2">
                                  {prepareResult.errors.map((e, i) => <p key={i}>Error: {e}</p>)}
                                </div>
                              )}
                              
                              {/* All good message */}
                              {prepareResult.embeddings_backfilled === 0 && 
                               prepareResult.schema_v1_analyzed === 0 && 
                               prepareResult.videos_checked_for_embedding === 0 &&
                               prepareResult.videos_checked_for_schema_v1 === 0 &&
                               prepareResult.errors.length === 0 && (
                                <p className="text-green-400">✓ All videos already have complete data!</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* How Matching Works */}
                      <div className="border-t border-gray-700 pt-3 mt-3">
                        <p className="text-xs text-gray-500 mb-2">
                          <strong>How matching works:</strong> Each library video is compared using a weighted formula:
                          L1 Quality (25%) + L2 Likeness (35%) + L3 Visual (10%) + Embedding similarity (30%).
                          Scores ≥85% are strong matches; 70-84% are worth considering.
                        </p>
                      </div>

                      <button
                        onClick={runBatchMatch}
                        disabled={matchLoading || videos.length === 0}
                        className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg mt-2"
                      >
                        {matchLoading ? 'Matching…' : `Match Against ${videos.length} Library Videos`}
                      </button>
                    </div>
                  )}
                </div>

                {/* Match Results */}
                {matchResults.length > 0 && (
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                    <h3 className="font-semibold text-lg mb-4">
                      Match Results
                      <span className="text-gray-400 font-normal text-sm ml-2">
                        (sorted by match % • target ≥85%)
                      </span>
                    </h3>

                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {matchResults.map((m: any) => {
                        const video = videos.find((v) => v.id === m.candidate_video_id);
                        const matchPct = Math.round(m.overall_match * 100);
                        const isGoodMatch = matchPct >= 85;
                        const isOkMatch = matchPct >= 70;

                        return (
                          <div
                            key={m.candidate_video_id}
                            className={`p-4 rounded-lg border ${
                              isGoodMatch
                                ? 'border-green-700 bg-green-900/20'
                                : isOkMatch
                                ? 'border-yellow-700 bg-yellow-900/10'
                                : 'border-gray-700 bg-gray-800/30'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">
                                  {video?.metadata?.title || video?.video_id || m.candidate_video_id}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  {m.explanation}
                                </p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div
                                  className={`text-2xl font-bold ${
                                    isGoodMatch
                                      ? 'text-green-400'
                                      : isOkMatch
                                      ? 'text-yellow-400'
                                      : 'text-gray-400'
                                  }`}
                                >
                                  {matchPct}%
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  L1:{Math.round(m.layer_scores.l1_quality_compatible * 100)}
                                  {' '}L2:{Math.round(m.layer_scores.l2_likeness_match * 100)}
                                  {' '}L3:{Math.round(m.layer_scores.l3_visual_proximity * 100)}
                                </div>
                              </div>
                            </div>
                            {video && (
                              <a
                                href={video.video_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 text-xs mt-2 inline-block"
                              >
                                Open Video ↗
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Hint to select a video */}
                {matchResults.length === 0 && !profileFingerprint && (
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
                    <div className="text-6xl mb-4">👈</div>
                    <h3 className="text-lg font-medium text-gray-300">Or Select a Video</h3>
                    <p className="text-gray-500 mt-2">
                      Choose a rated video from the list to analyze its individual brand signals
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Selected Video Info */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-24 bg-gray-700 rounded flex-shrink-0 flex items-center justify-center">
                      <span className="text-4xl">▶</span>
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold">
                        {selectedVideo.metadata?.title || selectedVideo.video_id}
                      </h2>
                      <p className="text-sm text-gray-400 mt-1">
                        {selectedVideo.platform} • {getAuthorName(selectedVideo.metadata)}
                      </p>
                      <a
                        href={selectedVideo.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block"
                      >
                        Open Video ↗
                      </a>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`px-2 py-1 rounded border ${
                            selectedVideo.gcs_uri
                              ? 'border-green-800 bg-green-900/20 text-green-300'
                              : 'border-gray-700 bg-gray-800/40 text-gray-400'
                          }`}
                        >
                          {selectedVideo.gcs_uri ? 'GCS ready' : 'No GCS URI in record'}
                        </span>

                        {!selectedVideo.gcs_uri && (
                          <button
                            onClick={uploadSelectedVideoToGcs}
                            disabled={uploadingGcs}
                            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded"
                          >
                            {uploadingGcs ? 'Uploading…' : 'Upload to GCS'}
                          </button>
                        )}
                      </div>

                      {uploadGcsError && (
                        <p className="text-xs text-red-300 mt-2">{uploadGcsError}</p>
                      )}

                      {existingRating && (
                        <p className="text-xs text-green-400 mt-2">
                          ✓ Previously rated on {new Date(existingRating.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Back to Fingerprint Matching Button */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedVideoId(null)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Fingerprint Matching
                  </button>
                  <div className="flex-1 text-sm text-gray-400">
                    Schema v1 Review for this video
                  </div>
                </div>

                {/* Schema v1 Content - Direct view without tabs */}
                <>
                    {/* Schema v1 Instructions */}
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="text-lg font-semibold">Schema v1 Review</h2>
                          <p className="text-sm text-gray-400 mt-1">
                            Your job is to correct the model into an evidence-backed, comparable record.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={seedSchemaFromAnalyzeRate}
                            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            Seed from /analyze-rate
                          </button>
                          <button
                            onClick={runSchemaV1Analysis}
                            disabled={schemaV1Loading}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            {schemaV1Loading ? 'Running...' : 'Run AI (Schema v1)'}
                          </button>
                        </div>
                      </div>

                      <div className="text-sm text-gray-300 space-y-1">
                        <p>What’s expected of you (keep it lightweight):</p>
                        <ul className="text-sm text-gray-400 list-disc pl-5 space-y-1">
                          <li>Fix the <span className="text-gray-200">big obvious</span> fields first (business_type, vibe, humor type, format).</li>
                          <li>If you can’t justify a value, set it to <span className="text-gray-200">null</span> and add a short uncertainty note.</li>
                          <li>Evidence is optional. If it feels tedious, skip it or add 1–2 “anchor” items with no timestamps (start/end blank).</li>
                        </ul>
                      </div>

                      {schemaV1Error && (
                        <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
                          {schemaV1Error}
                        </div>
                      )}

                      {!schemaV1ModelAnalysis ? (
                        <p className="text-sm text-gray-500">Run AI to generate a starting point, then correct it.</p>
                      ) : null}
                    </div>

                    {/* Core fields: hospitality + humor + execution */}
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">Key Fields</h3>
                        <HelpTip text="These are the highest-impact fields for comparing hospitality brands. Don’t overthink it—pick the closest option, or set it to null if you can’t tell." />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-300">
                            Hospitality: business_type
                            <HelpTip text="What kind of place is this? Cafe = coffee/tea focus, Restaurant = meals, Bar = alcohol/nightlife focus, Hotel = lodging. If it’s unclear, leave it blank." />
                          </label>
                          <select
                            value={effectiveSignals?.hospitality?.business_type ?? ''}
                            onChange={(e) => updateSchemaPatch(['signals', 'hospitality', 'business_type'], e.target.value ? e.target.value : null)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={!schemaV1ModelAnalysis}
                          >
                            <option value="">(unset / null)</option>
                            <option value="restaurant">restaurant</option>
                            <option value="cafe">cafe</option>
                            <option value="bar">bar</option>
                            <option value="hotel">hotel</option>
                            <option value="other">other</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-300">
                            Hospitality: price_tier
                            <HelpTip text="Your best guess of how expensive it seems (based on vibe, presentation, language, setting). If you can’t tell from the video, set it to null." />
                          </label>
                          <select
                            value={effectiveSignals?.hospitality?.price_tier ?? ''}
                            onChange={(e) => updateSchemaPatch(['signals', 'hospitality', 'price_tier'], e.target.value ? e.target.value : null)}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={!schemaV1ModelAnalysis}
                          >
                            <option value="">(unset / null)</option>
                            <option value="budget">budget</option>
                            <option value="mid">mid</option>
                            <option value="premium">premium</option>
                            <option value="luxury">luxury</option>
                            <option value="unknown">unknown</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-300">
                            Humor: present
                            <HelpTip text="Is the goal to be funny? If it’s mostly informational or aesthetic, set false. If unclear, null." />
                          </label>
                          <select
                            value={effectiveSignals?.humor?.present === null || effectiveSignals?.humor?.present === undefined ? '' : String(effectiveSignals?.humor?.present)}
                            onChange={(e) => {
                              const v = e.target.value;
                              updateSchemaPatch(['signals', 'humor', 'present'], v === '' ? null : v === 'true');
                            }}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={!schemaV1ModelAnalysis}
                          >
                            <option value="">(unset / null)</option>
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-300">
                            Execution: has_repeatable_format
                            <HelpTip text="Could they post this same template again and again (like a series)? If it’s a one-off, set false. If you’re not sure, null." />
                          </label>
                          <select
                            value={effectiveSignals?.execution?.has_repeatable_format === null || effectiveSignals?.execution?.has_repeatable_format === undefined ? '' : String(effectiveSignals?.execution?.has_repeatable_format)}
                            onChange={(e) => {
                              const v = e.target.value;
                              updateSchemaPatch(['signals', 'execution', 'has_repeatable_format'], v === '' ? null : v === 'true');
                            }}
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={!schemaV1ModelAnalysis}
                          >
                            <option value="">(unset / null)</option>
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-300">
                            Hospitality: vibe (comma-separated)
                            <HelpTip text="Simple adjectives for the atmosphere (cozy, premium, playful, busy, romantic). This is subjective—pick what most viewers would feel." />
                          </label>
                          <input
                            value={(effectiveSignals?.hospitality?.vibe || []).join(', ')}
                            onChange={(e) => updateSchemaPatch(['signals', 'hospitality', 'vibe'], parseCommaList(e.target.value))}
                            placeholder="cozy, friendly, premium"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={!schemaV1ModelAnalysis}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-300">
                            Humor: humor_types (comma-separated)
                            <HelpTip text="What kind of comedy is it? Examples: skit, observational, parody, deadpan, contrast. If you don’t know, leave it empty." />
                          </label>
                          <input
                            value={(effectiveSignals?.humor?.humor_types || []).join(', ')}
                            onChange={(e) => updateSchemaPatch(['signals', 'humor', 'humor_types'], parseCommaList(e.target.value))}
                            placeholder="sketch, observational"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={!schemaV1ModelAnalysis}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-300">
                            Execution: format_name_if_any
                            <HelpTip text="A short name for the template (e.g., “POV customer”, “what we say vs what we mean”). If none, leave blank." />
                          </label>
                          <input
                            value={effectiveSignals?.execution?.format_name_if_any ?? ''}
                            onChange={(e) => updateSchemaPatch(['signals', 'execution', 'format_name_if_any'], e.target.value ? e.target.value : null)}
                            placeholder="POV: customer order skit"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={!schemaV1ModelAnalysis}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-300">
                            Hospitality: occasion (comma-separated)
                            <HelpTip text="What situation is this place for? (date night, quick coffee, family dinner, study/work). If it’s not shown, leave it blank." />
                          </label>
                          <input
                            value={(effectiveSignals?.hospitality?.occasion || []).join(', ')}
                            onChange={(e) => updateSchemaPatch(['signals', 'hospitality', 'occasion'], parseCommaList(e.target.value))}
                            placeholder="quick coffee, study"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={!schemaV1ModelAnalysis}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Evidence */}
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold">Evidence</h3>
                          <HelpTip text="Evidence is optional. Think of it like ‘receipts’ for your most important claims. You can leave timestamps blank if you’re just anchoring an overall impression." />
                        </div>
                        <button
                          onClick={addEvidenceItem}
                          disabled={!schemaV1ModelAnalysis}
                          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          + Add evidence
                        </button>
                      </div>

                      {!schemaV1ModelAnalysis ? (
                        <p className="text-sm text-gray-500">Run AI first to edit evidence.</p>
                      ) : effectiveEvidence.length === 0 ? (
                        <p className="text-sm text-gray-500">No evidence yet. Add 1–2 items for the main claims.</p>
                      ) : (
                        <div className="space-y-3">
                          {effectiveEvidence.map((ev, idx) => (
                            <div key={idx} className="p-3 bg-gray-800/40 border border-gray-700 rounded-lg space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-gray-200">Evidence #{idx + 1}</p>
                                <button
                                  onClick={() => removeEvidenceItem(idx)}
                                  className="text-xs text-gray-400 hover:text-red-300"
                                >
                                  Remove
                                </button>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                <select
                                  value={ev.type || 'other'}
                                  onChange={(e) => {
                                    const next = [...effectiveEvidence];
                                    next[idx] = { ...(next[idx] || {}), type: e.target.value };
                                    updateSchemaPatch(['evidence'], next);
                                  }}
                                  className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="quote">quote</option>
                                  <option value="ocr">ocr</option>
                                  <option value="visual">visual</option>
                                  <option value="audio">audio</option>
                                  <option value="caption">caption</option>
                                  <option value="thumbnail">thumbnail</option>
                                  <option value="bio">bio</option>
                                  <option value="other">other</option>
                                </select>
                                <input
                                  value={ev.start_s ?? ''}
                                  onChange={(e) => {
                                    const next = [...effectiveEvidence];
                                    const v = e.target.value;
                                    next[idx] = { ...(next[idx] || {}), start_s: v === '' ? null : Number(v) };
                                    updateSchemaPatch(['evidence'], next);
                                  }}
                                  placeholder="start_s"
                                  className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <input
                                  value={ev.end_s ?? ''}
                                  onChange={(e) => {
                                    const next = [...effectiveEvidence];
                                    const v = e.target.value;
                                    next[idx] = { ...(next[idx] || {}), end_s: v === '' ? null : Number(v) };
                                    updateSchemaPatch(['evidence'], next);
                                  }}
                                  placeholder="end_s"
                                  className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <input
                                  value={(ev.supports || []).join(', ')}
                                  onChange={(e) => {
                                    const next = [...effectiveEvidence];
                                    next[idx] = { ...(next[idx] || {}), supports: parseCommaList(e.target.value) };
                                    updateSchemaPatch(['evidence'], next);
                                  }}
                                  placeholder="supports (comma paths)"
                                  className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>

                              <textarea
                                value={ev.text || ''}
                                onChange={(e) => {
                                  const next = [...effectiveEvidence];
                                  next[idx] = { ...(next[idx] || {}), text: e.target.value };
                                  updateSchemaPatch(['evidence'], next);
                                }}
                                placeholder="What was said / shown?"
                                className="w-full h-20 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Uncertainties */}
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">Uncertainties</h3>
                        <HelpTip text="This is where you say ‘I can’t actually tell from the video.’ It’s not a failure—it prevents fake precision and keeps the dataset honest." />
                      </div>
                      <p className="text-sm text-gray-500">Use this to keep the framework honest when things are subjective or unobservable.</p>
                      <textarea
                        value={effectiveUncertainties.join('\n')}
                        onChange={(e) => updateSchemaPatch(['uncertainties'], e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
                        placeholder="One per line..."
                        className="w-full h-24 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                        disabled={!schemaV1ModelAnalysis}
                      />
                    </div>

                    {/* JSON snapshots */}
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-3">
                      <h3 className="text-lg font-semibold">JSON Snapshot</h3>
                      {!schemaV1ModelAnalysis ? (
                        <p className="text-sm text-gray-500">No analysis yet.</p>
                      ) : (
                        <pre className="text-xs bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                          {JSON.stringify(
                            {
                              kind: 'schema_v1_review',
                              model_analysis: schemaV1ModelAnalysis,
                              human_patch: schemaV1HumanPatch
                            },
                            null,
                            2
                          )}
                        </pre>
                      )}
                    </div>
                  </>
                {/* Submit */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                  {submitError && (
                    <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-300 text-sm">
                      {submitError}
                    </div>
                  )}
                  
                  {submitted ? (
                    <div className="p-4 bg-green-900/30 border border-green-800 rounded-lg">
                      <p className="text-green-300 font-medium">✓ Analysis saved!</p>
                      <p className="text-gray-400 text-sm mt-1">
                        This data will be used for RAG and model training.
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                    >
                      {submitting ? 'Saving...' : existingRating ? 'Update Analysis' : 'Save Analysis'}
                    </button>
                  )}
                </div>

                {/* Similar Videos */}
                <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
                  <h3 className="font-semibold mb-4">
                    Similar Videos
                    <span className="text-gray-400 font-normal ml-2 text-sm">(RAG context)</span>
                  </h3>
                  
                  {loadingSimilar ? (
                    <div className="text-gray-400">Loading...</div>
                  ) : similarVideos.length === 0 ? (
                    <div className="text-gray-500 text-sm">
                      No similar videos found yet. Rate more videos to build context.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {similarVideos.map((sv) => (
                        <div
                          key={sv.video_id}
                          className="p-3 bg-gray-800/50 rounded-lg border border-gray-700"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <a
                              href={sv.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 text-sm"
                            >
                              View Video ↗
                            </a>
                            <span className="text-xs text-gray-400">
                              {Math.round(sv.similarity * 100)}% similar
                            </span>
                          </div>
                          {sv.personality_notes && (
                            <p className="text-xs text-gray-400 line-clamp-2">
                              {sv.personality_notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
