'use client';

import { useState, useEffect, useCallback } from 'react';

interface Video {
  id: string;
  video_url: string;
  video_id: string;
  platform: string;
  metadata: {
    title?: string;
    author?: string;
    description?: string;
    thumbnail_url?: string;
  } | null;
  gcs_uri: string | null;
  visual_analysis: {
    feature_count?: number;
    analyzed_at?: string;
    analysis_model?: string;
    // Deep analysis fields from Gemini
    visual?: {
      hookStrength?: number;
      overallQuality?: number;
    };
    script?: {
      conceptCore?: string;
    };
    engagement?: {
      attentionRetention?: number;
    };
  } | null;
  rating: {
    overall_score: number;
    dimensions: Record<string, number>;
    notes: string | null;
    rated_at: string;
  } | null;
}

type AnalysisStatus = 'idle' | 'analyzing' | 'complete' | 'error';

interface VideoAnalysisState {
  [videoId: string]: {
    status: AnalysisStatus;
    error?: string;
  };
}

export default function LibraryPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideos, setSelectedVideos] = useState<Set<string>>(new Set());
  const [analysisState, setAnalysisState] = useState<VideoAnalysisState>({});
  const [filterAnalyzed, setFilterAnalyzed] = useState<'all' | 'analyzed' | 'not-analyzed'>('all');
  const [sortBy, setSortBy] = useState<'rated_at' | 'score' | 'title'>('rated_at');
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  
  // Batch progress tracking
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentVideoTitle: string;
    completed: number;
    failed: number;
  } | null>(null);

  // Fetch rated videos
  const fetchVideos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ratings?limit=100');
      if (!res.ok) throw new Error('Failed to fetch videos');
      const data = await res.json();
      
      // Transform the data to match our Video interface
      const transformedVideos: Video[] = data.map((r: any) => ({
        id: r.video?.id || r.video_id, // Use video.id from the join, fallback to video_id
        video_url: r.video?.video_url || '',
        video_id: r.video?.video_id || '',
        platform: r.video?.platform || 'unknown',
        metadata: r.video?.metadata || null,
        gcs_uri: r.video?.gcs_uri || null,
        visual_analysis: r.video?.visual_analysis || null,
        rating: {
          overall_score: r.overall_score,
          dimensions: r.dimensions || {},
          notes: r.notes,
          rated_at: r.rated_at,
        },
      }));
      
      setVideos(transformedVideos);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load videos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Check if video has deep analysis (Gemini comprehensive analysis)
  const hasDeepAnalysis = (video: Video): boolean => {
    const va = video.visual_analysis;
    if (!va) return false;
    
    // Check for Gemini deep analysis fields (comprehensive analysis includes these)
    const hasVisualAnalysis = !!(va.visual?.hookStrength || va.visual?.overallQuality);
    const hasScriptAnalysis = !!va.script?.conceptCore;
    const hasEngagementAnalysis = !!va.engagement?.attentionRetention;
    
    // Also check legacy feature_count if present
    const hasFeatureCount = !!(va.feature_count && va.feature_count > 50);
    
    return hasVisualAnalysis || hasScriptAnalysis || hasEngagementAnalysis || hasFeatureCount;
  };
  
  // Count features in deep analysis for display
  const countFeatures = (video: Video): number => {
    const va = video.visual_analysis;
    if (!va) return 0;
    if (va.feature_count) return va.feature_count;
    
    // Count actual fields present in the analysis
    let count = 0;
    const countObject = (obj: any): number => {
      if (!obj || typeof obj !== 'object') return 0;
      return Object.keys(obj).reduce((acc, key) => {
        const val = obj[key];
        if (val !== null && val !== undefined && val !== '') {
          if (typeof val === 'object' && !Array.isArray(val)) {
            return acc + countObject(val);
          }
          return acc + 1;
        }
        return acc;
      }, 0);
    };
    
    count = countObject(va);
    return count;
  };

  // Filter and sort videos
  const filteredVideos = videos
    .filter(v => {
      if (filterAnalyzed === 'analyzed') return hasDeepAnalysis(v);
      if (filterAnalyzed === 'not-analyzed') return !hasDeepAnalysis(v);
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'rated_at') {
        return new Date(b.rating?.rated_at || 0).getTime() - new Date(a.rating?.rated_at || 0).getTime();
      }
      if (sortBy === 'score') {
        return (b.rating?.overall_score || 0) - (a.rating?.overall_score || 0);
      }
      if (sortBy === 'title') {
        return (a.metadata?.title || '').localeCompare(b.metadata?.title || '');
      }
      return 0;
    });

  // Toggle video selection
  const toggleSelection = (videoId: string) => {
    setSelectedVideos(prev => {
      const next = new Set(prev);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  };

  // Select all / none
  const toggleSelectAll = () => {
    if (selectedVideos.size === filteredVideos.length) {
      setSelectedVideos(new Set());
    } else {
      setSelectedVideos(new Set(filteredVideos.map(v => v.id)));
    }
  };

  // Select only not-analyzed
  const selectNotAnalyzed = () => {
    setSelectedVideos(new Set(filteredVideos.filter(v => !hasDeepAnalysis(v)).map(v => v.id)));
  };

  // Analyze single video
  const analyzeVideo = async (videoId: string) => {
    setAnalysisState(prev => ({
      ...prev,
      [videoId]: { status: 'analyzing' }
    }));

    try {
      // Step 1: Ensure video is uploaded to GCS
      const video = videos.find(v => v.id === videoId);
      if (!video?.gcs_uri) {
        const uploadRes = await fetch('/api/videos/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId })
        });
        if (!uploadRes.ok) {
          throw new Error('Failed to upload video to cloud storage');
        }
      }

      // Step 2: Run deep analysis
      const analyzeRes = await fetch('/api/videos/analyze/deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          videoId,
          detailLevel: 'comprehensive'
        })
      });

      if (!analyzeRes.ok) {
        const errorData = await analyzeRes.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      setAnalysisState(prev => ({
        ...prev,
        [videoId]: { status: 'complete' }
      }));

      // Refresh the video list to show updated analysis status
      await fetchVideos();

      return true; // Success

    } catch (err) {
      setAnalysisState(prev => ({
        ...prev,
        [videoId]: { 
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error'
        }
      }));
      return false; // Failed
    }
  };

  // Batch analyze selected videos
  const batchAnalyze = async () => {
    if (selectedVideos.size === 0) return;
    
    setBatchAnalyzing(true);
    
    // Get list of video IDs to analyze (filter out already analyzed)
    const videoIdsToAnalyze = Array.from(selectedVideos).filter(id => {
      const video = videos.find(v => v.id === id);
      return video && !hasDeepAnalysis(video);
    });
    
    if (videoIdsToAnalyze.length === 0) {
      setBatchAnalyzing(false);
      return;
    }

    setBatchProgress({
      current: 0,
      total: videoIdsToAnalyze.length,
      currentVideoTitle: '',
      completed: 0,
      failed: 0,
    });
    
    let completed = 0;
    let failed = 0;

    for (let i = 0; i < videoIdsToAnalyze.length; i++) {
      const videoId = videoIdsToAnalyze[i];
      const video = videos.find(v => v.id === videoId);
      
      if (!video) {
        failed++;
        continue;
      }
      
      setBatchProgress(prev => prev ? {
        ...prev,
        current: i + 1,
        currentVideoTitle: video.metadata?.title || video.video_id || 'Unknown video',
      } : null);
      
      const success = await analyzeVideo(video.id);
      
      if (success) {
        completed++;
      } else {
        failed++;
      }
      
      setBatchProgress(prev => prev ? {
        ...prev,
        completed,
        failed,
      } : null);
      
      // Small delay between analyses to avoid overwhelming the API
      if (i < videoIdsToAnalyze.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    setBatchAnalyzing(false);
    setBatchProgress(null);
    setSelectedVideos(new Set());
  };

  // Format score display
  const formatScore = (score: number | undefined) => {
    if (score === undefined || score === null) return '-';
    return (score * 10).toFixed(1);
  };

  // Get platform icon/color
  const getPlatformStyle = (platform: string) => {
    if (platform === 'tiktok') return 'bg-black text-white';
    if (platform === 'instagram') return 'bg-gradient-to-r from-purple-500 to-pink-500 text-white';
    return 'bg-gray-500 text-white';
  };

  // Stats
  const totalVideos = videos.length;
  const analyzedCount = videos.filter(hasDeepAnalysis).length;
  const notAnalyzedCount = totalVideos - analyzedCount;
  const selectedCount = selectedVideos.size;
  const selectedNotAnalyzedCount = Array.from(selectedVideos).filter(id => {
    const v = videos.find(v => v.id === id);
    return v && !hasDeepAnalysis(v);
  }).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading video library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Video Library</h1>
              <p className="text-sm text-gray-500 mt-1">
                {totalVideos} rated videos • {analyzedCount} deep analyzed • {notAnalyzedCount} pending
              </p>
            </div>
            <a 
              href="/rate" 
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              ← Back to Rating
            </a>
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Filter:</label>
              <select
                value={filterAnalyzed}
                onChange={(e) => setFilterAnalyzed(e.target.value as 'all' | 'analyzed' | 'not-analyzed')}
                className="border rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="all">All Videos</option>
                <option value="analyzed">Deep Analyzed ({analyzedCount})</option>
                <option value="not-analyzed">Not Analyzed ({notAnalyzedCount})</option>
              </select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Sort:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'rated_at' | 'score' | 'title')}
                className="border rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="rated_at">Recently Rated</option>
                <option value="score">Highest Score</option>
                <option value="title">Title</option>
              </select>
            </div>

            <div className="flex-1" />

            {/* Selection actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {selectedVideos.size === filteredVideos.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={selectNotAnalyzed}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Select Not Analyzed
              </button>
            </div>

            {/* Batch analyze button */}
            {selectedCount > 0 && (
              <button
                onClick={batchAnalyze}
                disabled={batchAnalyzing || selectedNotAnalyzedCount === 0}
                className={`
                  px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${batchAnalyzing 
                    ? 'bg-gray-300 text-gray-500 cursor-wait'
                    : selectedNotAnalyzedCount === 0
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }
                `}
              >
                {batchAnalyzing 
                  ? 'Analyzing...' 
                  : `Deep Analyze ${selectedNotAnalyzedCount} Video${selectedNotAnalyzedCount !== 1 ? 's' : ''}`
                }
              </button>
            )}
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-red-700">
            {error}
          </div>
        )}

        {/* Batch progress bar */}
        {batchProgress && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-blue-800 font-medium">
                  Analyzing video {batchProgress.current} of {batchProgress.total}
                </span>
              </div>
              <div className="text-sm text-blue-600">
                {batchProgress.completed > 0 && (
                  <span className="text-green-600 mr-2">✓ {batchProgress.completed} done</span>
                )}
                {batchProgress.failed > 0 && (
                  <span className="text-red-600">✗ {batchProgress.failed} failed</span>
                )}
              </div>
            </div>
            
            {/* Progress bar */}
            <div className="w-full bg-blue-100 rounded-full h-2 mb-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              />
            </div>
            
            {/* Current video */}
            <p className="text-sm text-blue-700 truncate">
              Currently analyzing: <span className="font-medium">{batchProgress.currentVideoTitle}</span>
            </p>
          </div>
        )}

        {/* Video table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-12 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedVideos.size === filteredVideos.length && filteredVideos.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Video
                </th>
                <th className="w-20 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Score
                </th>
                <th className="w-32 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Analysis
                </th>
                <th className="w-32 px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredVideos.map((video) => {
                const isAnalyzed = hasDeepAnalysis(video);
                const state = analysisState[video.id];
                const isSelected = selectedVideos.has(video.id);

                return (
                  <tr 
                    key={video.id} 
                    className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(video.id)}
                        className="rounded"
                      />
                    </td>

                    {/* Video info */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {/* Thumbnail */}
                        <div className="w-16 h-10 bg-gray-200 rounded overflow-hidden flex-shrink-0">
                          {video.metadata?.thumbnail_url ? (
                            // eslint-disable-next-line @next/next/no-img-element -- external thumbnails from various domains
                            <img
                              src={video.metadata.thumbnail_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                              No img
                            </div>
                          )}
                        </div>
                        
                        {/* Title and meta */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${getPlatformStyle(video.platform)}`}>
                              {video.platform}
                            </span>
                            <a 
                              href={video.video_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate max-w-md"
                              title={video.metadata?.title || video.video_url}
                            >
                              {video.metadata?.title || video.video_id || 'Untitled'}
                            </a>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            @{typeof video.metadata?.author === 'string' 
                              ? video.metadata.author 
                              : (video.metadata?.author as any)?.username || (video.metadata?.author as any)?.displayName || 'unknown'} • 
                            Rated {video.rating?.rated_at ? new Date(video.rating.rated_at).toLocaleDateString() : 'N/A'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Score */}
                    <td className="px-4 py-3 text-center">
                      <span className={`
                        inline-block px-2 py-1 rounded text-sm font-medium
                        ${(video.rating?.overall_score || 0) >= 0.7 
                          ? 'bg-green-100 text-green-800' 
                          : (video.rating?.overall_score || 0) >= 0.5 
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }
                      `}>
                        {formatScore(video.rating?.overall_score)}
                      </span>
                    </td>

                    {/* Analysis status */}
                    <td className="px-4 py-3 text-center">
                      {state?.status === 'analyzing' ? (
                        <span className="inline-flex items-center gap-1 text-sm text-blue-600">
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Analyzing...
                        </span>
                      ) : state?.status === 'error' ? (
                        <span className="text-sm text-red-600" title={state.error}>
                          Error
                        </span>
                      ) : isAnalyzed ? (
                        <span className="inline-flex items-center gap-1 text-sm text-green-600">
                          ✓ {countFeatures(video)} features
                        </span>
                      ) : video.gcs_uri ? (
                        <span className="text-sm text-yellow-600">
                          Uploaded, not analyzed
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">
                          Not analyzed
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-center">
                      {!isAnalyzed && state?.status !== 'analyzing' && (
                        <button
                          onClick={() => analyzeVideo(video.id)}
                          disabled={batchAnalyzing}
                          className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                        >
                          Analyze
                        </button>
                      )}
                      {isAnalyzed && (
                        <button
                          onClick={() => analyzeVideo(video.id)}
                          disabled={batchAnalyzing || state?.status === 'analyzing'}
                          className="text-sm text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                          title="Re-run deep analysis"
                        >
                          Re-analyze
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredVideos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                    No videos found matching your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination hint */}
        {filteredVideos.length >= 100 && (
          <p className="text-sm text-gray-500 text-center mt-4">
            Showing first 100 videos. More videos may be available.
          </p>
        )}
      </div>
    </div>
  );
}
