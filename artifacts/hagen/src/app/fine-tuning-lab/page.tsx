'use client';

import { useState, useEffect, useCallback } from 'react';

// Batch queue item type
interface QueueItem {
  url: string;
  status: 'pending' | 'processing' | 'generated' | 'approved' | 'skipped' | 'error';
  analysis?: string;
  error?: string;
}

export default function FineTuningLab() {
  const [url, setUrl] = useState('');
  const [analysisMode, setAnalysisMode] = useState<'concise' | 'balanced' | 'detailed'>('balanced');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [modelId, setModelId] = useState('');
  const [modelVersion, setModelVersion] = useState<'v5' | 'v6' | 'v7.B'>('v7.B');

  // New state for batch mode
  const [batchMode, setBatchMode] = useState(false);
  const [batchUrls, setBatchUrls] = useState('');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);

  // New state for quick approval mode
  const [quickApprovalMode, setQuickApprovalMode] = useState(true);

  // Refinement controls - for when model gets concept but misses the punchline
  const [showRefinement, setShowRefinement] = useState(false);
  const [refinementNote, setRefinementNote] = useState('');
  const [refinementType, setRefinementType] = useState<'focus' | 'layer' | 'context' | null>(null);

  // Dataset statistics
  const [datasetStats, setDatasetStats] = useState<{
    total: number;
    bySource: Record<string, number>;
    byMechanism: Record<string, number>;
    testSetSize: number;
    stagingSize: number;
    recentAdditions: number;
  } | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [prefetchedAnalysis, setPrefetchedAnalysis] = useState<{ url: string; analysis: string } | null>(null);
  const [prefetching, setPrefetching] = useState(false);

  // Prefetch next video in background
  const prefetchNext = async (nextIndex: number) => {
    if (nextIndex >= queue.length) return;
    const nextUrl = queue[nextIndex].url;

    // Don't prefetch if already prefetched this URL
    if (prefetchedAnalysis?.url === nextUrl) return;

    console.log('Prefetching:', nextUrl);
    setPrefetching(true);
    try {
      const res = await fetch('/api/fine-tuning/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: nextUrl, version: modelVersion })
      });
      const data = await res.json();
      if (data.analysis) {
        setPrefetchedAnalysis({ url: nextUrl, analysis: data.analysis });
        console.log('Prefetched ready:', nextUrl);
      }
    } catch (e) {
      console.error('Prefetch failed:', e);
    } finally {
      setPrefetching(false);
    }
  };

  // Fetch dataset stats on mount and after saves
  useEffect(() => {
    fetchStats();
  }, [savedCount]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/fine-tuning/stats');
      if (res.ok) {
        const data = await res.json();
        setDatasetStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  };

  // Load draft from localStorage on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem('fine-tuning-draft');
    const savedUrl = localStorage.getItem('fine-tuning-url');
    if (savedDraft) setDraft(savedDraft);
    if (savedUrl) setUrl(savedUrl);
  }, []);

  // Auto-save draft to localStorage
  useEffect(() => {
    if (draft) {
      localStorage.setItem('fine-tuning-draft', draft);
    }
    if (url) {
      localStorage.setItem('fine-tuning-url', url);
    }
  }, [draft, url]);

  // Clear localStorage after successful save
  const clearLocalStorage = () => {
    localStorage.removeItem('fine-tuning-draft');
    localStorage.removeItem('fine-tuning-url');
  };

  const handleGenerate = async () => {
    if (!url) return;
    setLoading(true);
    setDraft(''); // Clear previous draft to avoid confusion
    setStatus(`Analyzing: ${url}...`);
    
    try {
      const res = await fetch('/api/fine-tuning/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode: analysisMode, version: modelVersion })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate');
      
      setDraft(data.analysis);
      if (data.model) setModelId(data.model);
      setStatus('Draft generated. Please review and edit.');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRewrite = async () => {
    if (!draft) return;
    setLoading(true);
    setStatus('Neutralizing tone...');
    
    try {
      const res = await fetch('/api/fine-tuning/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to rewrite');
      
      setDraft(data.rewritten);
      setStatus('Tone neutralized. Review before saving.');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    console.log('handleSave called. draft:', !!draft, 'url:', url);
    if (!draft) {
      console.log('No draft, returning early');
      return;
    }
    setLoading(true);
    setStatus('Saving to dataset...');

    try {
      console.log('Fetching /api/fine-tuning/save...');
      const res = await fetch('/api/fine-tuning/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, analysis: draft })
      });

      console.log('Save response status:', res.status);
      if (!res.ok) throw new Error('Failed to save');

      setStatus('Saved successfully! Ready for next video.');
      setSavedCount(prev => prev + 1);
      clearLocalStorage();

      // If in batch mode, mark as approved and move to next
      console.log('Save complete. batchMode:', batchMode, 'queue.length:', queue.length, 'currentQueueIndex:', currentQueueIndex);
      if (batchMode && queue.length > 0) {
        console.log('Advancing to next in queue...');
        setQueue(prev => prev.map((item, i) =>
          i === currentQueueIndex ? { ...item, status: 'approved' } : item
        ));
        handleNextInQueue();
      } else {
        setUrl('');
        setDraft('');
      }
    } catch (e: any) {
      setStatus(`Error saving: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Quick approval - save without editing
  const handleQuickApprove = async () => {
    await handleSave();
  };

  // Apply refinement to the draft and save
  const applyRefinement = async () => {
    if (!refinementNote.trim()) return;

    // Insert the refinement into the analysis naturally
    // This teaches the model to identify the actual comedic payload
    let refinedDraft = draft;

    if (refinementType === 'focus') {
      // The model got the scene but missed what's actually funny
      refinedDraft = draft.replace(
        /^(.+?)(\n|$)/,
        `$1 Det som gör det roligt är specifikt: ${refinementNote}$2`
      );
    } else if (refinementType === 'layer') {
      // The model got the obvious joke but missed the subtle layer
      refinedDraft += `\n\nDet som verkligen får det att landa: ${refinementNote}`;
    } else if (refinementType === 'context') {
      // Missing context that makes it hit harder
      refinedDraft += `\n\nViktig kontext: ${refinementNote}`;
    }

    // Update draft state
    setDraft(refinedDraft);
    setRefinementNote('');
    setRefinementType(null);
    setShowRefinement(false);

    // Save immediately with the refined draft
    setLoading(true);
    setStatus('Saving refined analysis...');
    try {
      const res = await fetch('/api/fine-tuning/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, analysis: refinedDraft })
      });
      if (!res.ok) throw new Error('Failed to save');

      setStatus('Saved with refinement! Ready for next video.');
      setSavedCount(prev => prev + 1);
      clearLocalStorage();

      if (batchMode && queue.length > 0) {
        setQueue(prev => prev.map((item, i) =>
          i === currentQueueIndex ? { ...item, status: 'approved' } : item
        ));
        handleNextInQueue();
      } else {
        setUrl('');
        setDraft('');
      }
    } catch (e: any) {
      setStatus(`Error saving: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Skip current video
  const handleSkip = () => {
    if (batchMode && queue.length > 0) {
      setQueue(prev => prev.map((item, i) =>
        i === currentQueueIndex ? { ...item, status: 'skipped' } : item
      ));
      handleNextInQueue();
    } else {
      setUrl('');
      setDraft('');
      clearLocalStorage();
      setStatus('Skipped. Enter next URL.');
    }
  };

  // Clear and start fresh
  const handleClearNext = () => {
    setUrl('');
    setDraft('');
    clearLocalStorage();
    setStatus('Ready for next video.');
  };

  // Batch mode: parse URLs and start queue
  const handleStartBatch = async () => {
    console.log('handleStartBatch called. batchUrls:', batchUrls);
    const urls = batchUrls
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.startsWith('http'));

    console.log('Parsed URLs:', urls);

    if (urls.length === 0) {
      setStatus('No valid URLs found. Paste TikTok URLs, one per line.');
      return;
    }

    const newQueue: QueueItem[] = urls.map(u => ({ url: u, status: 'pending' }));
    setQueue(newQueue);
    setCurrentQueueIndex(0);
    setBatchMode(true);
    setBatchUrls('');

    // Load first URL and auto-generate
    const firstUrl = newQueue[0].url;
    setUrl(firstUrl);
    setStatus(`Batch mode: ${urls.length} videos queued. Generating #1...`);

    // Auto-generate for first video too
    setLoading(true);
    try {
      const res = await fetch('/api/fine-tuning/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: firstUrl, version: modelVersion })
      });
      const data = await res.json();
      if (data.analysis) {
        setDraft(data.analysis);
        setStatus(`Batch mode: Video 1 of ${urls.length} - Ready to review`);
        // Start prefetching next video
        if (urls.length > 1) {
          prefetchNext(1);
        }
      } else {
        setStatus(`Batch mode: Video 1 of ${urls.length} - Error: ${data.error || 'Unknown'}`);
      }
    } catch (e: any) {
      setStatus(`Batch mode: Error generating: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Move to next item in queue
  const handleNextInQueue = async () => {
    const nextIndex = currentQueueIndex + 1;

    // Reset refinement state for new video
    setShowRefinement(false);
    setRefinementNote('');
    setRefinementType(null);

    if (nextIndex < queue.length) {
      setCurrentQueueIndex(nextIndex);
      const nextUrl = queue[nextIndex].url;
      setUrl(nextUrl);

      // Check if we have prefetched this URL
      if (prefetchedAnalysis?.url === nextUrl) {
        console.log('Using prefetched analysis for:', nextUrl);
        setDraft(prefetchedAnalysis.analysis);
        setPrefetchedAnalysis(null);
        setStatus(`Batch mode: Video ${nextIndex + 1} of ${queue.length} - Ready to review (prefetched)`);
        // Start prefetching the NEXT one
        if (nextIndex + 1 < queue.length) {
          prefetchNext(nextIndex + 1);
        }
      } else {
        // No prefetch available, generate now
        setDraft('');
        setStatus(`Batch mode: Video ${nextIndex + 1} of ${queue.length} - Generating...`);
        setLoading(true);
        try {
          const res = await fetch('/api/fine-tuning/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: nextUrl, version: modelVersion })
          });
          const data = await res.json();
          if (data.analysis) {
            setDraft(data.analysis);
            setStatus(`Batch mode: Video ${nextIndex + 1} of ${queue.length} - Ready to review`);
            // Start prefetching next
            if (nextIndex + 1 < queue.length) {
              prefetchNext(nextIndex + 1);
            }
          } else {
            setStatus(`Batch mode: Video ${nextIndex + 1} of ${queue.length} - Error: ${data.error || 'Unknown'}`);
          }
        } catch (e: any) {
          setStatus(`Batch mode: Video ${nextIndex + 1} of ${queue.length} - Error: ${e.message}`);
        } finally {
          setLoading(false);
        }
      }
    } else {
      // Queue complete
      const approved = queue.filter(q => q.status === 'approved').length;
      const skipped = queue.filter(q => q.status === 'skipped').length;
      setStatus(`Batch complete! ${approved} approved, ${skipped} skipped.`);
      setBatchMode(false);
      setQueue([]);
      setUrl('');
      setDraft('');
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in textarea or input
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA') return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'enter':
            e.preventDefault();
            if (!loading && url) handleGenerate();
            break;
          case 's':
            e.preventDefault();
            if (!loading && draft) handleSave();
            break;
          case 'n':
            e.preventDefault();
            handleClearNext();
            break;
          case 'r':
            e.preventDefault();
            if (!loading && draft) handleRewrite();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, url, draft]);

  return (
    <div className="max-w-5xl mx-auto p-8">
      <header className="mb-6 border-b pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold mb-2">Fine-Tuning Lab 🧪</h1>
          <p className="text-gray-600">
            Active Learning Interface: Generate drafts, refine them, and build the Gold Standard dataset.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-mono text-gray-400 mb-1">Model Version</div>
          <select
            value={modelVersion}
            onChange={(e) => setModelVersion(e.target.value as 'v5' | 'v6' | 'v7.B')}
            className="text-sm font-medium border rounded px-2 py-1 bg-white"
          >
            <option value="v5">v5 (345 ex)</option>
            <option value="v6">v6 (659 ex)</option>
            <option value="v7.B">v7.B (675 ex)</option>
          </select>
          <div className="text-xs text-gray-400 mt-1">
            Session: {savedCount} saved
          </div>
        </div>
      </header>

      {/* Keyboard Shortcuts Help */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg border text-xs text-gray-600 flex justify-between items-center">
        <div className="flex gap-6">
          <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700">Ctrl+Enter</kbd> Generate</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700">Ctrl+S</kbd> Save</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700">Ctrl+N</kbd> Clear/Next</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700">Ctrl+R</kbd> Rewrite</span>
        </div>
        <button
          onClick={() => setShowStats(!showStats)}
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          {showStats ? 'Hide Stats' : 'Show Stats'} {datasetStats && `(${datasetStats.total})`}
        </button>
      </div>

      {/* Dataset Statistics Panel */}
      {showStats && datasetStats && (
        <div className="mb-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg border border-purple-200">
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-700">{datasetStats.total}</div>
              <div className="text-xs text-gray-600">Total Examples</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">+{datasetStats.recentAdditions}</div>
              <div className="text-xs text-gray-600">Last 7 Days</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{datasetStats.testSetSize}</div>
              <div className="text-xs text-gray-600">Test Set</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{datasetStats.stagingSize}</div>
              <div className="text-xs text-gray-600">Staging</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="font-medium text-gray-700 mb-1">By Source</div>
              {Object.entries(datasetStats.bySource).map(([source, count]) => (
                <div key={source} className="flex justify-between text-gray-600">
                  <span>{source}</span>
                  <span className="font-mono">{count}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="font-medium text-gray-700 mb-1">Top Mechanisms</div>
              {Object.entries(datasetStats.byMechanism).slice(0, 5).map(([mech, count]) => (
                <div key={mech} className="flex justify-between text-gray-600">
                  <span className="capitalize">{mech}</span>
                  <span className="font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-purple-200 text-xs text-gray-500">
            Target: 500 examples for optimal fine-tuning | Progress: {Math.round((datasetStats.total / 500) * 100)}%
            <div className="w-full bg-purple-200 rounded-full h-1.5 mt-1">
              <div
                className="bg-purple-600 h-1.5 rounded-full transition-all"
                style={{ width: `${Math.min(100, (datasetStats.total / 500) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Batch Mode Queue Progress */}
      {batchMode && queue.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-blue-800">
              Batch Progress: {currentQueueIndex + 1} of {queue.length}
              {loading && <span className="ml-2 text-blue-600 animate-pulse">⏳ Processing...</span>}
              {prefetching && !loading && <span className="ml-2 text-green-600 text-xs">🔄 Preloading next...</span>}
              {prefetchedAnalysis && !loading && <span className="ml-2 text-green-600 text-xs">✓ Next ready</span>}
            </span>
            <button
              onClick={() => { setBatchMode(false); setQueue([]); }}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Exit Batch Mode
            </button>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${((currentQueueIndex + 1) / queue.length) * 100}%` }}
            />
          </div>
          {/* Status message */}
          <div className="mt-2 text-sm text-blue-700">{status}</div>
        </div>
      )}

      {/* Loading overlay when processing */}
      {loading && (
        <div className="mb-4 p-4 bg-yellow-50 rounded-lg border border-yellow-300 flex items-center gap-3">
          <div className="animate-spin h-5 w-5 border-2 border-yellow-600 border-t-transparent rounded-full"></div>
          <span className="text-yellow-800 font-medium">{status || 'Processing...'}</span>
        </div>
      )}

      <div className="grid gap-6">
        {/* Batch Import Section */}
        {!batchMode && (
          <div className="bg-gray-50 p-4 rounded-lg border">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Batch Import (paste multiple URLs)</label>
              <button
                onClick={handleStartBatch}
                disabled={!batchUrls.trim()}
                className="text-sm bg-purple-600 text-white px-4 py-1.5 rounded hover:bg-purple-700 disabled:opacity-50"
              >
                Start Batch
              </button>
            </div>
            <textarea
              value={batchUrls}
              onChange={(e) => setBatchUrls(e.target.value)}
              placeholder="Paste TikTok URLs here, one per line..."
              rows={3}
              className="w-full p-2 border rounded font-mono text-xs bg-white"
            />
          </div>
        )}

        {/* Input Section */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <label className="block text-sm font-medium mb-2">TikTok URL</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@user/video/..."
              className="flex-1 p-2 border rounded font-mono text-sm"
              disabled={batchMode}
            />
            {url && !batchMode && (
              <button
                onClick={() => setUrl('')}
                className="px-3 text-gray-400 hover:text-gray-600 border rounded"
                title="Clear URL"
              >
                ✕
              </button>
            )}
            <select
              value={analysisMode}
              onChange={(e) => setAnalysisMode(e.target.value as 'concise' | 'balanced' | 'detailed')}
              className="border rounded px-3 py-2 bg-white text-sm"
            >
              <option value="concise">Short & Sharp</option>
              <option value="balanced">Balanced (recommended)</option>
              <option value="detailed">Detailed Analysis</option>
            </select>
            <button
              onClick={handleGenerate}
              disabled={loading || !url}
              className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Working...' : 'Generate'}
            </button>
          </div>
          {status && (
            <div className={`mt-4 p-3 rounded text-sm ${status.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
              {status}
            </div>
          )}
        </div>

        {/* Editor Section */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium">
              Analysis Editor (Gold Standard)
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleRewrite}
                disabled={loading || !draft}
                className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded text-gray-700 border"
              >
                ✨ Neutralize Tone
              </button>
              <label className="flex items-center gap-1 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={quickApprovalMode}
                  onChange={(e) => setQuickApprovalMode(e.target.checked)}
                  className="rounded"
                />
                Quick Approval Mode
              </label>
            </div>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={12}
            className="w-full p-4 border rounded font-mono text-sm bg-gray-50 focus:bg-white transition-colors"
            placeholder="Generated analysis will appear here..."
          />

          {/* Quick Approval Buttons */}
          {quickApprovalMode && draft && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="text-sm text-green-800 mb-3">
                Quick Approval: Is this analysis good enough to save as-is?
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleQuickApprove}
                  disabled={loading}
                  className="flex-1 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-lg"
                >
                  ✓ Approve & Save
                </button>
                <button
                  onClick={() => setShowRefinement(!showRefinement)}
                  disabled={loading}
                  className={`flex-1 py-3 rounded-lg disabled:opacity-50 font-medium ${showRefinement ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-800 hover:bg-orange-200'}`}
                >
                  🎯 Close, but...
                </button>
                <button
                  onClick={() => setQuickApprovalMode(false)}
                  disabled={loading}
                  className="flex-1 bg-yellow-500 text-white py-3 rounded-lg hover:bg-yellow-600 disabled:opacity-50 font-medium"
                >
                  ✎ Edit First
                </button>
                <button
                  onClick={handleSkip}
                  disabled={loading}
                  className="flex-1 bg-gray-400 text-white py-3 rounded-lg hover:bg-gray-500 disabled:opacity-50 font-medium"
                >
                  ⏭ Skip
                </button>
              </div>

              {/* Refinement Panel - for when model is close but misses the punchline */}
              {showRefinement && (
                <div className="mt-4 p-4 bg-orange-50 rounded-lg border border-orange-300">
                  <div className="text-sm text-orange-900 mb-3 font-medium">
                    What did the model miss?
                  </div>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setRefinementType('focus')}
                      className={`px-3 py-1.5 rounded text-sm ${refinementType === 'focus' ? 'bg-orange-600 text-white' : 'bg-white border border-orange-300 text-orange-800 hover:bg-orange-100'}`}
                    >
                      Wrong focus
                    </button>
                    <button
                      onClick={() => setRefinementType('layer')}
                      className={`px-3 py-1.5 rounded text-sm ${refinementType === 'layer' ? 'bg-orange-600 text-white' : 'bg-white border border-orange-300 text-orange-800 hover:bg-orange-100'}`}
                    >
                      Missed the layer
                    </button>
                    <button
                      onClick={() => setRefinementType('context')}
                      className={`px-3 py-1.5 rounded text-sm ${refinementType === 'context' ? 'bg-orange-600 text-white' : 'bg-white border border-orange-300 text-orange-800 hover:bg-orange-100'}`}
                    >
                      Missing context
                    </button>
                  </div>
                  {refinementType && (
                    <>
                      <div className="text-xs text-orange-700 mb-2">
                        {refinementType === 'focus' && 'Got the scene but missed what\'s actually funny. What should the focus be?'}
                        {refinementType === 'layer' && 'Got the obvious joke but missed the subtle detail that makes it land. What is it?'}
                        {refinementType === 'context' && 'What context makes this hit harder that the model missed?'}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={refinementNote}
                          onChange={(e) => setRefinementNote(e.target.value)}
                          placeholder={
                            refinementType === 'focus' ? 'The background staffer\'s visible annoyance...' :
                            refinementType === 'layer' ? 'The timing of the eye-roll at 0:03...' :
                            'This is a known format where...'
                          }
                          className="flex-1 p-2 border border-orange-300 rounded text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && applyRefinement()}
                        />
                        <button
                          onClick={applyRefinement}
                          disabled={!refinementNote.trim()}
                          className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 text-sm font-medium"
                        >
                          Apply & Save
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Standard Save Button (when not in quick approval) */}
          {(!quickApprovalMode || !draft) && (
            <div className="mt-4 flex justify-between items-center">
              <div className="text-sm text-gray-500">
                {draft && <span className="text-green-600">● Draft auto-saved</span>}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSkip}
                  disabled={loading}
                  className="bg-gray-200 text-gray-700 px-6 py-2 rounded hover:bg-gray-300 disabled:opacity-50"
                >
                  Skip
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading || !draft}
                  className="bg-green-600 text-white px-8 py-2 rounded hover:bg-green-700 disabled:opacity-50 font-medium"
                >
                  Save to Dataset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
