'use client';

import { useState, useEffect } from 'react';
import { 
  ApiResponse, 
  GeminiAnalysis 
} from './types';
import {
  ScoreBar,
  QualityRatingSection,
  ReplicabilitySection,
  EnvironmentSection,
  RiskLevelSection,
  TargetAudienceSection,
  SignalCompletionIndicator
} from './components';
import {
  useSignalState,
  populateFromGeminiAnalysis,
  buildApiPayload
} from './hooks';

export default function AnalyzeRateV1Page() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [editingAnalysis, setEditingAnalysis] = useState(false);
  
  // UI section expansion state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['replicability', 'environment', 'risk', 'audience'])
  );

  // Use the modular signal state hook
  const {
    qualityRating,
    replicability,
    environment,
    riskLevel,
    targetAudience,
    analysisNotes,
    setQualityRating,
    setReplicability,
    setEnvironment,
    setRiskLevel,
    setTargetAudience,
    setAnalysisNotes,
    resetAllSignals,
    getCombinedSignals
  } = useSignalState();

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const handleAnalyze = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setSubmitted(false);
    resetAllSignals();

    try {
      setStatus('Creating video record...');
      const createRes = await fetch('/api/videos/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });

      if (!createRes.ok) {
        const error = await createRes.json();
        throw new Error(error.message || 'Failed to create video record');
      }

      const createData = await createRes.json();
      const videoId = createData.id;

      if (createData.hasAnalysis) {
        setStatus('Found existing analysis, checking format...');
        
        const fullRes = await fetch(`/api/videos/analyze?id=${videoId}`);
        if (fullRes.ok) {
          const fullData = await fullRes.json();
          const cachedAnalysis = fullData.visual_analysis;
          
          // Check if cached analysis has legacy display fields (from GeminiVideoAnalyzer)
          const hasLegacyFields = cachedAnalysis?.visual?.hookStrength !== undefined 
            || cachedAnalysis?.script?.humor?.humorType !== undefined
            || cachedAnalysis?.visual?.summary !== undefined;
          
          if (hasLegacyFields) {
            setStatus('Using cached analysis, fetching similar videos...');
            const ragContext = await fetchSimilarVideos(videoId);
            
            setResult({
              success: true,
              url: fullData.video_url,
              analysis: cachedAnalysis,
              rag_context: ragContext
            });
            setStatus('');
            setLoading(false);
            return;
          } else {
            setStatus('Cached analysis missing display fields, re-analyzing...');
          }
        }
      }

      setStatus('Downloading and analyzing with Gemini (this may take 30-60s)...');
      const deepRes = await fetch('/api/videos/analyze/deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          videoId,
          useSchemaV1: true
        })
      });

      const deepData = await deepRes.json();

      if (!deepRes.ok) {
        throw new Error(deepData.message || deepData.error || 'Deep analysis failed');
      }

      setStatus('Finding similar videos...');
      const ragContext = await fetchSimilarVideos(videoId);

      setResult({
        success: true,
        url: url.trim(),
        analysis: deepData.analysis,
        rag_context: ragContext
      });
      setStatus('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  const fetchSimilarVideos = async (videoId: string) => {
    try {
      const res = await fetch(`/api/videos/similar?videoId=${videoId}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        return {
          similar_count: data.videos?.length || 0,
          references: data.videos || []
        };
      }
    } catch (e) {
      console.error('Failed to fetch similar videos:', e);
    }
    return { similar_count: 0, references: [] };
  };

  // Pre-populate signals from Gemini analysis when available
  useEffect(() => {
    if (!result?.analysis) return;
    
    populateFromGeminiAnalysis(
      result.analysis,
      setReplicability,
      setEnvironment,
      setRiskLevel,
      setTargetAudience
    );
  }, [result?.analysis, setReplicability, setEnvironment, setRiskLevel, setTargetAudience]);

  const handleSubmitRating = async () => {
    if (!result || !qualityRating.qualityTier) return;
    
    setSubmitting(true);
    try {
      const payload = buildApiPayload(
        result.url,
        getCombinedSignals(),
        result.analysis,
        result.rag_context?.references || []
      );

      const response = await fetch('/api/analyze-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setSubmitted(true);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save rating');
      }
    } catch (err) {
      setError('Failed to submit rating');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setUrl('');
    setResult(null);
    setSubmitted(false);
    setError(null);
    resetAllSignals();
  };

  const handleConfirmAnalysis = async () => {
    if (!result) return;
    try {
      await fetch('/api/corrections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: result.url,
          analysis: result.analysis,
          notes: analysisNotes || undefined
        })
      });
      setEditingAnalysis(false);
      setAnalysisNotes('✓ Confirmed correct');
      setStatus('✅ Analysis confirmed as correct');
      setTimeout(() => setStatus(''), 2000);
    } catch (e) {
      console.error('Failed to confirm analysis:', e);
      setError('Failed to confirm analysis');
    }
  };

  const handleSaveCorrection = async () => {
    if (!result || !analysisNotes) return;
    try {
      await fetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: result.url,
          originalAnalysis: result.analysis,
          correction: {
            humor_type: analysisNotes.includes('humor') ? analysisNotes : undefined,
            joke_structure: analysisNotes.includes('structure') || analysisNotes.includes('setup') || analysisNotes.includes('payoff') || analysisNotes.includes('hook') ? analysisNotes : undefined
          },
          correctionType: 'humor_analysis',
          notes: analysisNotes
        })
      });
      setEditingAnalysis(false);
      setStatus('✅ Correction saved for model learning');
      setTimeout(() => setStatus(''), 2000);
    } catch (e) {
      console.error('Failed to save correction:', e);
      setError('Failed to save correction');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                Analyze + Rate
                <span className="text-xs font-normal px-2 py-0.5 bg-purple-600 rounded-full">v1.1</span>
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Enhanced data collection with complete fingerprint signals
              </p>
            </div>
            <a 
              href="/analyze-rate" 
              className="text-sm text-gray-500 hover:text-gray-400 flex items-center gap-1"
            >
              <span>Legacy version</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Input Section */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Video URL
          </label>
          <div className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@user/video/123..."
              className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading || submitted}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            />
            <button
              onClick={handleAnalyze}
              disabled={loading || submitted}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>
        </div>

        {/* Status */}
        {status && (
          <div className="mt-6 flex items-center gap-3 text-gray-400">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            {status}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {/* Results */}
        {result && result.analysis && (
          <div className="mt-8 space-y-6">
            {/* Gemini Analysis */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Gemini Analysis</h2>
                <button
                  onClick={() => setEditingAnalysis(!editingAnalysis)}
                  className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  {editingAnalysis ? 'Done' : 'Add Notes'}
                </button>
              </div>
              
              <div className="space-y-3 mb-6">
                <ScoreBar label="Hook" value={result.analysis.visual?.hookStrength || 0} />
                <ScoreBar label="Pacing" value={result.analysis.technical?.pacing || 0} />
                <ScoreBar label="Originality" value={result.analysis.script?.originality?.score || 0} />
                <ScoreBar label="Payoff" value={result.analysis.script?.structure?.payoffStrength || 0} />
                <ScoreBar label="Rewatchable" value={result.analysis.engagement?.replayValue || 0} />
                <div className="pt-2 border-t border-gray-700">
                  <ScoreBar label="Quality" value={result.analysis.visual?.overallQuality || 0} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <span className="text-sm text-gray-400">Humor Type</span>
                  <p className="text-white">{result.analysis.script?.humor?.humorType || 'Unknown'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-400">Comedy Timing</span>
                  <p className="text-white">{result.analysis.script?.humor?.comedyTiming || 0}/10</p>
                </div>
                {result.analysis.script?.humor?.humorMechanism && (
                  <div className="col-span-2">
                    <span className="text-sm text-gray-400">Humor Mechanism</span>
                    <p className="text-white text-sm">{result.analysis.script.humor.humorMechanism}</p>
                  </div>
                )}
              </div>

              {result.analysis.visual?.summary && (
                <div className="mb-4">
                  <span className="text-sm text-gray-400">Visual Summary</span>
                  <p className="text-white text-sm mt-1">{result.analysis.visual.summary}</p>
                </div>
              )}
              
              {result.analysis.script?.replicability?.template && (
                <div className="mb-4">
                  <span className="text-sm text-gray-400">Replicability Template</span>
                  <p className="text-white text-sm mt-1">{result.analysis.script.replicability.template}</p>
                  {result.analysis.script.replicability.score && (
                    <span className="text-xs text-gray-500 mt-1">
                      Replicability Score: {result.analysis.script.replicability.score}/10
                    </span>
                  )}
                </div>
              )}

              {editingAnalysis && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <label className="block text-sm text-gray-400 mb-2">
                    Correct Gemini&apos;s Analysis
                    <span className="text-gray-500 ml-2">(corrections help improve future analysis)</span>
                  </label>
                  <textarea
                    value={analysisNotes}
                    onChange={(e) => setAnalysisNotes(e.target.value)}
                    placeholder="e.g., 'The humor is actually self-deprecating, not contrast-based' or 'The hook works because of the unexpected reveal'..."
                    className="w-full h-32 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleConfirmAnalysis}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Analysis is Correct
                    </button>
                    
                    {analysisNotes && (
                      <button
                        onClick={handleSaveCorrection}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                      >
                        Save Correction
                      </button>
                    )}
                  </div>
                </div>
              )}
              
              {!editingAnalysis && analysisNotes && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <span className="text-sm text-gray-400">Your Corrections</span>
                  <p className="text-white text-sm mt-1 bg-gray-800 p-3 rounded-lg">{analysisNotes}</p>
                </div>
              )}
            </div>

            {/* Rating Section */}
            {!submitted ? (
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 space-y-6">
                <h2 className="text-lg font-semibold">Complete Signal Assessment</h2>
                
                {/* Quality Rating (modular component) */}
                <QualityRatingSection 
                  data={qualityRating} 
                  onChange={setQualityRating} 
                />

                {/* Replicability Signals (modular component) */}
                <ReplicabilitySection
                  data={replicability}
                  onChange={setReplicability}
                  expanded={expandedSections.has('replicability')}
                  onToggle={() => toggleSection('replicability')}
                />

                {/* Environment Signals (modular component) */}
                <EnvironmentSection
                  data={environment}
                  onChange={setEnvironment}
                  expanded={expandedSections.has('environment')}
                  onToggle={() => toggleSection('environment')}
                />

                {/* Risk Level Signals (modular component) */}
                <RiskLevelSection
                  data={riskLevel}
                  onChange={setRiskLevel}
                  expanded={expandedSections.has('risk')}
                  onToggle={() => toggleSection('risk')}
                />

                {/* Target Audience Signals (modular component) */}
                <TargetAudienceSection
                  data={targetAudience}
                  onChange={setTargetAudience}
                  expanded={expandedSections.has('audience')}
                  onToggle={() => toggleSection('audience')}
                />

                {/* Signal Completion Indicator (modular component) */}
                <SignalCompletionIndicator
                  replicability={replicability}
                  environment={environment}
                  riskLevel={riskLevel}
                  targetAudience={targetAudience}
                />

                {/* Submit */}
                <button
                  onClick={handleSubmitRating}
                  disabled={!qualityRating.qualityTier || submitting}
                  className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  {submitting ? 'Saving...' : 'Save Complete Rating'}
                </button>
              </div>
            ) : (
              <div className="bg-green-900/30 rounded-xl p-6 border border-green-800">
                <h2 className="text-lg font-semibold text-green-300 mb-2">Rating Saved</h2>
                <p className="text-gray-300 mb-4">
                  This video has been added with complete fingerprint signals.
                </p>
                <button
                  onClick={handleReset}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                >
                  Rate Another Video
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
