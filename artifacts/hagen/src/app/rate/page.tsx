'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Video {
  id: string;
  source_url: string;
  title?: string;
  platform: string;
  thumbnail_url?: string;
  gcs_uri?: string;
  status?: 'pending' | 'uploading' | 'analyzing' | 'ready' | 'rated';
  progress?: number;
}

interface Dimensions {
  hook: number | null;
  pacing: number | null;
  originality: number | null;
  payoff: number | null;
  rewatchable: number | null;
}

interface Prediction {
  overall: number;
  dimensions: Dimensions;
  reasoning: string;
  modelUsed: 'base' | 'tuned';
}

type ViewMode = 'rate' | 'import' | 'queue';

export default function RatePage() {
  const router = useRouter();
  
  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('rate');
  
  // Video queue state
  const [videos, setVideos] = useState<Video[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Rating state
  const [overall, setOverall] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState<Dimensions>({
    hook: null, pacing: null, originality: null, payoff: null, rewatchable: null
  });
  const [notes, setNotes] = useState('');
  const [replicabilityNotes, setReplicabilityNotes] = useState('');
  const [brandContext, setBrandContext] = useState('');
  const [humorType, setHumorType] = useState('');
  const [isNotRelevant, setIsNotRelevant] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Stats
  const [stats, setStats] = useState({ total: 0, today: 0, pending: 0 });
  
  // Model prediction state
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [showPrediction, setShowPrediction] = useState(true);
  
  // Import state
  const [importUrls, setImportUrls] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  
  // Queue management
  const [removing, setRemoving] = useState<string | null>(null);
  
  // Pipeline progress for current video
  const [pipelineStage, setPipelineStage] = useState<'idle' | 'uploading' | 'analyzing' | 'ready'>('idle');
  const [pipelineProgress, setPipelineProgress] = useState(0);

  // Fetch unrated videos
  useEffect(() => {
    fetchVideos();
    fetchStats();
  }, []);

  const fetchVideos = async () => {
    try {
      const res = await fetch('/api/ratings?unrated=true');
      const data = await res.json();
      setVideos(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch videos:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/ratings/export', { method: 'POST' });
      const data = await res.json();
      
      const uploadRes = await fetch('/api/videos/upload?action=stats');
      const uploadData = await uploadRes.json();
      
      setStats({ 
        total: data.total_ratings || 0, 
        today: 0,
        pending: uploadData.pendingUpload || 0
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  // Trigger AI analysis pipeline for current video
  const startAnalysisPipeline = async () => {
    if (!videos[current]) return;
    
    const video = videos[current];
    setPipelineStage('uploading');
    setPipelineProgress(10);
    setPredicting(true);

    try {
      // Step 1: Upload to GCS if not already uploaded
      if (!video.gcs_uri) {
        setPipelineProgress(20);
        const uploadRes = await fetch('/api/videos/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId: video.id })
        });
        const uploadData = await uploadRes.json();
        
        if (uploadData.gcsUri) {
          // Update local video state
          setVideos(prev => prev.map((v, i) => 
            i === current ? { ...v, gcs_uri: uploadData.gcsUri } : v
          ));
        }
        setPipelineProgress(50);
      } else {
        setPipelineProgress(50);
      }

      // Step 2: Get AI prediction
      setPipelineStage('analyzing');
      setPipelineProgress(60);
      
      const predRes = await fetch('/api/videos/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.id })
      });
      const predData = await predRes.json();
      
      setPipelineProgress(90);
      
      if (predData.prediction) {
        setPrediction(predData.prediction);
      }
      
      setPipelineStage('ready');
      setPipelineProgress(100);

    } catch (err) {
      console.error('Pipeline failed:', err);
      setPipelineStage('idle');
      setPipelineProgress(0);
    } finally {
      setPredicting(false);
    }
  };

  const applyPrediction = useCallback(() => {
    if (!prediction) return;
    setOverall(prediction.overall);
    setDimensions({
      hook: prediction.dimensions.hook,
      pacing: prediction.dimensions.pacing,
      originality: prediction.dimensions.originality,
      payoff: prediction.dimensions.payoff,
      rewatchable: prediction.dimensions.rewatchable
    });
    if (prediction.reasoning) {
      setNotes(prediction.reasoning);
    }
  }, [prediction]);

  const submitRating = useCallback(async () => {
    if (!videos[current] || submitting) return;
    
    // For "not relevant" videos, we don't require a score
    if (!isNotRelevant && overall === null) return;
    
    const ratedVideoId = videos[current].id;
    setSubmitting(true);
    try {
      await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: ratedVideoId,
          overall_score: isNotRelevant ? null : overall,
          dimensions: isNotRelevant ? {} : Object.fromEntries(
            Object.entries(dimensions).filter(([_, v]) => v !== null)
          ),
          notes: notes || null,
          replicability_notes: replicabilityNotes || null,
          brand_context: brandContext || null,
          humor_type: humorType || null,
          tags: isNotRelevant ? ['not_relevant'] : [],
          ai_prediction: prediction || null  // Include AI prediction for disagreement tracking
        })
      });
      
      setStats(s => ({ ...s, total: s.total + 1, today: s.today + 1 }));
      
      // Remove rated video from list and reset form
      setVideos(prev => prev.filter(v => v.id !== ratedVideoId));
      resetForm();
      // Keep current index same (next video slides into current position)
      // But if we're at the end, stay at valid index
      setCurrent(c => Math.min(c, videos.length - 2));
    } catch (err) {
      console.error('Failed to submit rating:', err);
    } finally {
      setSubmitting(false);
    }
  }, [videos, current, overall, dimensions, notes, replicabilityNotes, brandContext, humorType, submitting, isNotRelevant, prediction]);

  const resetForm = () => {
    setOverall(null);
    setDimensions({ hook: null, pacing: null, originality: null, payoff: null, rewatchable: null });
    setNotes('');
    setReplicabilityNotes('');
    setBrandContext('');
    setHumorType('');
    setIsNotRelevant(false);
    setPrediction(null);
    setPipelineStage('idle');
    setPipelineProgress(0);
  };

  const nextVideo = () => {
    resetForm();
    setCurrent(c => Math.min(c + 1, videos.length - 1));
  };

  // Bulk import URLs
  const handleBulkImport = async () => {
    const urls = importUrls
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.length > 0 && (u.includes('tiktok.com') || u.includes('youtube.com') || u.includes('youtu.be')));

    if (urls.length === 0) {
      alert('No valid TikTok or YouTube URLs found');
      return;
    }

    setImporting(true);
    setImportProgress({ current: 0, total: urls.length });

    const batchSize = 10;
    const results: { success: number; failed: number } = { success: 0, failed: 0 };

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      
      for (const url of batch) {
        try {
          const platform = url.includes('tiktok.com') ? 'tiktok' : 'youtube';
          const endpoint = platform === 'tiktok' ? '/api/tiktok' : '/api/youtube';
          
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
          });
          
          if (res.ok) {
            results.success++;
          } else {
            results.failed++;
          }
        } catch {
          results.failed++;
        }
        
        setImportProgress(prev => ({ ...prev, current: prev.current + 1 }));
      }
      
      // Small delay between batches
      if (i + batchSize < urls.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    setImporting(false);
    setImportUrls('');
    alert(`Import complete: ${results.success} succeeded, ${results.failed} failed`);
    
    // Refresh video list
    fetchVideos();
    fetchStats();
  };

  // Remove video from queue
  const removeFromQueue = async (videoId: string) => {
    if (!confirm('Remove this video from queue? This will delete it from the database.')) return;
    
    setRemoving(videoId);
    try {
      const res = await fetch(`/api/videos/library?id=${videoId}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        setVideos(prev => prev.filter(v => v.id !== videoId));
        // Adjust current index if needed
        setCurrent(c => {
          const removedIndex = videos.findIndex(v => v.id === videoId);
          if (removedIndex < c) return c - 1;
          return Math.min(c, videos.length - 2);
        });
      } else {
        alert('Failed to remove video');
      }
    } catch (err) {
      console.error('Failed to remove video:', err);
      alert('Failed to remove video');
    } finally {
      setRemoving(null);
    }
  };

  // Keyboard shortcuts
  // eslint-disable-next-line react-hooks/exhaustive-deps -- nextVideo and startAnalysisPipeline are stable
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
      
      if (viewMode !== 'rate') return;
      
      // Number keys 1-9 for overall score
      if (!isTyping && e.key >= '1' && e.key <= '9' && !e.metaKey && !e.ctrlKey) {
        setOverall(parseInt(e.key) / 10);
        setIsNotRelevant(false);
      }
      if (!isTyping && e.key === '0' && !e.metaKey && !e.ctrlKey) {
        setOverall(1.0);
        setIsNotRelevant(false);
      }
      // Submit
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submitRating();
      }
      // Skip
      if (!isTyping && e.key === 's' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        nextVideo();
      }
      // Apply prediction
      if (!isTyping && e.key === 'a' && !e.metaKey && !e.ctrlKey && prediction) {
        e.preventDefault();
        applyPrediction();
      }
      // Toggle not relevant
      if (!isTyping && e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setIsNotRelevant(r => !r);
        if (!isNotRelevant) setOverall(null);
      }
      // Toggle prediction
      if (!isTyping && e.key === 'p' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowPrediction(s => !s);
      }
      // Start analysis
      if (!isTyping && e.key === 'g' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        startAnalysisPipeline();
      }
      // Dimensions
      const dimKeys: Record<string, keyof Dimensions> = {
        'q': 'hook', 'w': 'pacing', 'e': 'originality', 'r': 'payoff', 't': 'rewatchable'
      };
      if (!isTyping && dimKeys[e.key] && !e.metaKey && !e.ctrlKey) {
        const dim = dimKeys[e.key];
        setDimensions(d => {
          const val = d[dim];
          if (val === null) return { ...d, [dim]: 0.5 };
          if (val < 0.6) return { ...d, [dim]: 0.75 };
          if (val < 0.85) return { ...d, [dim]: 0.9 };
          return { ...d, [dim]: null };
        });
      }
    };
    
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [submitRating, prediction, applyPrediction, viewMode, isNotRelevant]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading videos...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Migration Notice */}
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="text-amber-600 font-semibold mt-0.5">⚠️</div>
            <div className="flex-1">
              <p className="text-sm text-amber-800 font-medium">
                This rating interface is being deprecated
              </p>
              <p className="text-xs text-amber-700 mt-1">
                The system is transitioning to <Link href="/analyze-rate" className="underline font-semibold hover:text-amber-900">/analyze-rate</Link> for improved analysis and simplified rating workflow. 
                This page remains functional for comparison purposes only.
              </p>
            </div>
            <Link 
              href="/analyze-rate"
              className="px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded hover:bg-amber-700 whitespace-nowrap"
            >
              Switch to New System
            </Link>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex justify-between items-center">
            <div className="flex gap-1">
              {(['rate', 'import', 'queue'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    viewMode === mode
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {mode === 'rate' && `Rate Videos (${videos.length - current})`}
                  {mode === 'import' && 'Import URLs'}
                  {mode === 'queue' && `Queue (${stats.pending})`}
                </button>
              ))}
            </div>
            
            {/* Version Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Mode:</span>
              <select
                value="v1"
                onChange={(e) => {
                  if (e.target.value === 'v2') {
                    router.push('/rate-v2');
                  }
                }}
                className="text-sm border rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="v1">Classic (Dimensions)</option>
                <option value="v2">Limitless (Notes → AI)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-2 flex justify-between text-sm text-gray-500">
          <span>{stats.total} rated total {stats.today > 0 && `(+${stats.today} today)`}</span>
          <span>{videos.length - current} remaining</span>
        </div>
      </div>

      {/* Import View */}
      {viewMode === 'import' && (
        <div className="max-w-3xl mx-auto p-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-4">Bulk Import Videos</h2>
            <p className="text-sm text-gray-500 mb-4">
              Paste TikTok or YouTube URLs, one per line. They will be imported in batches of 10.
            </p>
            <textarea
              value={importUrls}
              onChange={e => setImportUrls(e.target.value)}
              placeholder={`https://www.tiktok.com/@user/video/123456789\nhttps://www.youtube.com/watch?v=abc123\nhttps://youtu.be/xyz789`}
              className="w-full border rounded-lg p-3 text-sm h-64 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={importing}
            />
            <div className="flex justify-between items-center mt-4">
              <span className="text-sm text-gray-500">
                {importUrls.split('\n').filter(u => u.trim()).length} URLs detected
              </span>
              <button
                onClick={handleBulkImport}
                disabled={importing || !importUrls.trim()}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {importing 
                  ? `Importing ${importProgress.current}/${importProgress.total}...` 
                  : 'Import All'}
              </button>
            </div>
            {importing && (
              <div className="mt-4">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Queue View */}
      {viewMode === 'queue' && (
        <div className="max-w-3xl mx-auto p-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-4">Video Queue</h2>
            <p className="text-sm text-gray-500 mb-4">
              Videos waiting to be rated. Click the × to remove a video from the queue.
            </p>
            <div className="space-y-2 max-h-96 overflow-auto">
              {videos.slice(current).map((video, i) => (
                <div key={video.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg group">
                  <span className="text-xs text-gray-400 w-6">{i + 1}</span>
                  <span className="flex-1 text-sm truncate">{video.title || video.source_url}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    video.gcs_uri ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {video.gcs_uri ? 'Ready' : 'Pending'}
                  </span>
                  <button
                    onClick={() => removeFromQueue(video.id)}
                    disabled={removing === video.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-red-500 hover:bg-red-50 rounded text-sm disabled:opacity-50"
                    title="Remove from queue"
                  >
                    {removing === video.id ? '...' : '×'}
                  </button>
                </div>
              ))}
              {videos.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  No videos in queue. Import some URLs first!
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={async () => {
                  const res = await fetch('/api/videos/upload', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ limit: 10 })
                  });
                  const data = await res.json();
                  alert(`Uploaded ${data.summary?.successful || 0} videos to GCS`);
                  fetchVideos();
                }}
                className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
              >
                Upload to GCS (batch of 10)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rate View */}
      {viewMode === 'rate' && (
        <>
          {!videos[current] ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="text-5xl mb-4">🎉</div>
              <div className="text-xl text-gray-700 mb-2">All caught up!</div>
              <div className="text-gray-500 mb-6">You&apos;ve rated all available videos</div>
              <button
                onClick={() => setViewMode('import')}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Import More Videos
              </button>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto p-4">
              {/* Keyboard hints */}
              <div className="text-xs text-gray-400 mb-3 flex flex-wrap gap-3">
                <span><kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">1-9</kbd> score</span>
                <span><kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">0</kbd> perfect</span>
                <span><kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">⌘↵</kbd> submit</span>
                <span><kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">s</kbd> skip</span>
                <span><kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">n</kbd> not relevant</span>
                <span><kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">g</kbd> analyze</span>
                <span><kbd className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-600">a</kbd> apply AI</span>
              </div>

              {/* Pipeline Progress Bar */}
              <div className="bg-white rounded-xl shadow-sm border mb-4 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Analysis Pipeline</span>
                  <span className="text-xs text-gray-400">{pipelineProgress}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${
                        pipelineStage === 'ready' ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${pipelineProgress}%` }}
                    />
                  </div>
                  <button
                    onClick={startAnalysisPipeline}
                    disabled={pipelineStage !== 'idle' && pipelineStage !== 'ready'}
                    className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                      pipelineStage === 'idle'
                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                        : pipelineStage === 'ready'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {pipelineStage === 'idle' && 'Analyze with AI (G)'}
                    {pipelineStage === 'uploading' && 'Uploading...'}
                    {pipelineStage === 'analyzing' && 'Analyzing...'}
                    {pipelineStage === 'ready' && '✓ Ready'}
                  </button>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                  <span className={pipelineProgress >= 10 ? 'text-blue-500' : ''}>Upload</span>
                  <span className={pipelineProgress >= 50 ? 'text-blue-500' : ''}>AI Analysis</span>
                  <span className={pipelineProgress >= 100 ? 'text-green-500' : ''}>Ready</span>
                </div>
              </div>

              {/* Video embed */}
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden mb-4">
                <div className="aspect-video bg-gray-100">
                  {videos[current].platform === 'tiktok' ? (
                    <iframe 
                      src={`https://www.tiktok.com/embed/v2/${extractTikTokId(videos[current].source_url)}`}
                      className="w-full h-full"
                      allowFullScreen
                    />
                  ) : videos[current].platform === 'youtube' ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${extractYouTubeId(videos[current].source_url)}?autoplay=1`}
                      className="w-full h-full"
                      allowFullScreen
                      allow="autoplay"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <a 
                        href={videos[current].source_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        Open video in new tab →
                      </a>
                    </div>
                  )}
                </div>
                {videos[current].title && (
                  <div className="p-3 border-t text-sm text-gray-600 truncate">
                    {videos[current].title}
                  </div>
                )}
              </div>

              {/* AI Prediction Panel */}
              {showPrediction && (
                <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">AI Prediction</span>
                      {prediction && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          prediction.modelUsed === 'tuned' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {prediction.modelUsed === 'tuned' ? 'Fine-tuned' : 'Base model'}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {prediction && (
                        <button
                          onClick={applyPrediction}
                          className="text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                          Apply (A)
                        </button>
                      )}
                      <button
                        onClick={() => setShowPrediction(false)}
                        className="text-xs px-2 py-1 text-gray-400 hover:text-gray-600"
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                  
                  {predicting ? (
                    <div className="text-center py-4 text-gray-400">
                      <div className="animate-pulse">Analyzing video...</div>
                    </div>
                  ) : prediction ? (
                    <div>
                      <div className="flex items-center gap-4 mb-3">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-500">
                            {prediction.overall.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-400">Overall</div>
                        </div>
                        <div className="flex-1 grid grid-cols-5 gap-2 text-center">
                          {Object.entries(prediction.dimensions).map(([key, val]) => (
                            <div key={key}>
                              <div className="text-sm font-medium text-gray-700">{(val as number)?.toFixed(2) || '—'}</div>
                              <div className="text-xs text-gray-400 capitalize">{key}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {prediction.reasoning && (
                        <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                          {prediction.reasoning}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-400 text-sm">
                      Click &quot;Analyze with AI&quot; to get prediction
                    </div>
                  )}
                </div>
              )}

              {/* Not Relevant Toggle */}
              <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isNotRelevant}
                    onChange={e => {
                      setIsNotRelevant(e.target.checked);
                      if (e.target.checked) setOverall(null);
                    }}
                    className="w-5 h-5 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                  <div>
                    <span className="font-medium text-gray-700">Not relevant for my purpose</span>
                    <p className="text-xs text-gray-400">Mark this video as not useful for training, but still add notes</p>
                  </div>
                </label>
              </div>

              {/* Rating Section - Hidden if not relevant */}
              {!isNotRelevant && (
                <div className="bg-white rounded-xl shadow-sm border p-6 mb-4">
                  {/* Overall Score */}
                  <div className="text-center mb-6">
                    <div className="text-6xl font-bold text-gray-800 tabular-nums mb-1">
                      {overall !== null ? overall.toFixed(1) : '—'}
                    </div>
                    <div className="text-gray-400 text-sm">Overall Score</div>
                    <div className="flex justify-center gap-2 mt-3">
                      {[0.3, 0.5, 0.7, 0.8, 0.9, 1.0].map(score => (
                        <button
                          key={score}
                          onClick={() => setOverall(score)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            overall === score 
                              ? 'bg-blue-500 text-white' 
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {score.toFixed(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Dimension sliders */}
                  <div className="grid grid-cols-5 gap-4">
                    {(Object.entries(dimensions) as [keyof Dimensions, number | null][]).map(([key, value], i) => (
                      <div key={key} className="text-center">
                        <div className="text-xs text-gray-400 mb-1">
                          <kbd className="px-1 bg-gray-100 rounded">{['q','w','e','r','t'][i]}</kbd>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={(value ?? 50) * 100}
                          onChange={e => setDimensions(d => ({
                            ...d,
                            [key]: parseInt(e.target.value) / 100
                          }))}
                          className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
                            value !== null ? 'accent-blue-500' : 'accent-gray-300'
                          }`}
                        />
                        <div className="text-xs text-gray-500 capitalize mt-1">
                          {key} {value !== null && <span className="text-blue-500 font-medium">{value.toFixed(1)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isNotRelevant 
                    ? "Why is this video not relevant? (optional)" 
                    : "Quick notes (optional)... why this score?"}
                  className="w-full border-0 resize-none text-sm focus:outline-none focus:ring-0 p-0"
                  rows={3}
                />
              </div>

              {/* Brand Context Fields */}
              {!isNotRelevant && (
                <div className="bg-white rounded-xl shadow-sm border p-4 mb-4 space-y-4">
                  <div className="text-xs text-gray-400 uppercase tracking-wide font-medium">Brand Context (Optional)</div>
                  
                  {/* Humor Type Selector */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Humor Type</label>
                    <select
                      value={humorType}
                      onChange={(e) => setHumorType(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select humor type...</option>
                      <option value="wordplay">Wordplay / Puns</option>
                      <option value="visual">Visual Punchline</option>
                      <option value="subversion">Subversion / Misdirection</option>
                      <option value="reaction">Exaggerated Reaction</option>
                      <option value="absurd">Absurdist / Surreal</option>
                      <option value="relatable">Relatable Exaggeration</option>
                      <option value="contrast">Contrast / Juxtaposition</option>
                      <option value="deadpan">Deadpan / Understated</option>
                      <option value="escalation">Escalation / Pattern Break</option>
                      <option value="cultural">Generational / Cultural</option>
                    </select>
                  </div>
                  
                  {/* Replicability */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">
                      Replicability — How easy to recreate?
                    </label>
                    <textarea
                      value={replicabilityNotes}
                      onChange={(e) => setReplicabilityNotes(e.target.value)}
                      placeholder="e.g., &apos;Simple concept, any café can do this with 2 people&apos; or &apos;Requires specific equipment/location&apos;"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                    />
                  </div>
                  
                  {/* Brand Context */}
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">
                      Brand Fit — What type of establishment suits this? (or doesn&apos;t)
                    </label>
                    <textarea
                      value={brandContext}
                      onChange={(e) => setBrandContext(e.target.value)}
                      placeholder="e.g., &apos;Not for upscale dining, better for casual spots&apos; or &apos;Works for any restaurant willing to be playful&apos;"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={submitRating}
                  disabled={(overall === null && !isNotRelevant) || submitting}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 rounded-xl font-medium transition-colors"
                >
                  {submitting ? 'Saving...' : isNotRelevant ? 'Mark as Not Relevant' : 'Submit Rating (⌘+Enter)'}
                </button>
                <button
                  onClick={nextVideo}
                  className="px-6 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-xl transition-colors"
                >
                  Skip (S)
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function extractTikTokId(url: string): string {
  const match = url.match(/video\/(\d+)/);
  return match?.[1] || '';
}

function extractYouTubeId(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/|\/shorts\/)([^&?]+)/);
  return match?.[1] || '';
}
