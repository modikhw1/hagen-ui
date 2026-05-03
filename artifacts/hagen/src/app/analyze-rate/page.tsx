'use client';

import { useState } from 'react';

// Matches actual Gemini visual_analysis output structure
interface GeminiAnalysis {
  script?: {
    structure?: {
      hook?: string;
      setup?: string;
      payoff?: string;
      payoffType?: string;
      payoffStrength?: number;
    };
    humor?: {
      humorType?: string;
      humorMechanism?: string;
      isHumorous?: boolean;
      comedyTiming?: number;
    };
    originality?: {
      score?: number;
      novelElements?: string[];
    };
    replicability?: {
      score?: number;
      template?: string;
      requiredElements?: string[];
    };
  };
  visual?: {
    hookStrength?: number;
    overallQuality?: number;
    summary?: string;
  };
  technical?: {
    pacing?: number;
  };
  engagement?: {
    replayValue?: number;
    shareability?: number;
    attentionRetention?: number;
  };
  content?: {
    keyMessage?: string;
    emotionalTone?: string;
  };
  // Allow any other properties from Gemini
  [key: string]: unknown;
}

interface RAGReference {
  title: string;
  score: number;
  similarity: number;
}

interface ApiResponse {
  success: boolean;
  url: string;
  analysis: GeminiAnalysis;
  rag_context: {
    similar_count: number;
    references: RAGReference[];
  };
}

type QualityTier = 'excellent' | 'good' | 'mediocre' | 'bad';

export default function AnalyzeRatePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  
  // Rating state
  const [qualityTier, setQualityTier] = useState<QualityTier | null>(null);
  const [notes, setNotes] = useState('');
  const [replicabilityNotes, setReplicabilityNotes] = useState('');
  const [brandToneNotes, setBrandToneNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  // NEW v1.1: Structured replicability state
  const [actorCount, setActorCount] = useState<string | null>(null);
  const [setupComplexity, setSetupComplexity] = useState<string | null>(null);
  const [skillRequired, setSkillRequired] = useState<string | null>(null);
  const [settingType, setSettingType] = useState<string | null>(null);
  const [equipmentNeeded, setEquipmentNeeded] = useState<string[]>([]);
  
  // Analysis notes/corrections state
  const [analysisNotes, setAnalysisNotes] = useState('');
  const [editingAnalysis, setEditingAnalysis] = useState(false);

  const handleAnalyze = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setQualityTier(null);
    setNotes('');
    setReplicabilityNotes('');
    setBrandToneNotes('');
    setSubmitted(false);

    try {
      // Step 1: Create minimal video record (no expensive metadata fetch)
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

      // If already has analysis, use it
      if (createData.hasAnalysis) {
        setStatus('Found existing analysis, fetching similar videos...');
        
        // Fetch full record
        const fullRes = await fetch(`/api/videos/analyze?id=${videoId}`);
        if (fullRes.ok) {
          const fullData = await fullRes.json();
          console.log('Full video data:', fullData);
          console.log('visual_analysis:', fullData.visual_analysis);
          
          const ragContext = await fetchSimilarVideos(videoId);
          
          const analysisResult = {
            success: true,
            url: fullData.video_url,
            analysis: fullData.visual_analysis,
            rag_context: ragContext
          };
          console.log('Setting result:', analysisResult);
          
          setResult(analysisResult);
          setStatus('');
          setLoading(false);  // Ensure loading is reset
          return;
        } else {
          console.error('Failed to fetch full video data:', await fullRes.text());
        }
      }

      // Step 2: Run deep analysis (download → Gemini → save)
      setStatus('Downloading and analyzing with Gemini (this may take 30-60s)...');
      const deepRes = await fetch('/api/videos/analyze/deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId })
      });

      const deepData = await deepRes.json();

      if (!deepRes.ok) {
        throw new Error(deepData.message || deepData.error || 'Deep analysis failed');
      }

      // Step 4: Fetch similar videos for RAG context
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

  const handleSubmitRating = async () => {
    if (!result || !qualityTier) return;
    
    setSubmitting(true);
    try {
      const response = await fetch('/api/analyze-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: result.url,
          quality_tier: qualityTier,
          notes,
          replicability_notes: replicabilityNotes,
          brand_tone_notes: brandToneNotes,
          analysis_notes: analysisNotes,
          gemini_analysis: result.analysis,
          similar_videos: result.rag_context?.references || [],
          // NEW v1.1: Structured replicability data
          structured_replicability: {
            actor_count: actorCount,
            setup_complexity: setupComplexity,
            skill_required: skillRequired,
            setting_type: settingType,
            equipment_needed: equipmentNeeded
          }
        })
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
    setQualityTier(null);
    setNotes('');
    setReplicabilityNotes('');
    setBrandToneNotes('');
    setAnalysisNotes('');
    setEditingAnalysis(false);
    setSubmitted(false);
    setError(null);
    // Reset structured replicability fields
    setActorCount(null);
    setSetupComplexity(null);
    setSkillRequired(null);
    setSettingType(null);
    setEquipmentNeeded([]);
  };

  // Gemini returns 0-10 scores, normalize to 0-100%
  const ScoreBar = ({ label, value }: { label: string; value: number }) => {
    const normalizedValue = Math.min(value * 10, 100); // 0-10 → 0-100%
    return (
      <div className="flex items-center gap-3">
        <span className="w-28 text-sm text-gray-400">{label}</span>
        <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
            style={{ width: `${normalizedValue}%` }}
          />
        </div>
        <span className="w-12 text-right text-sm font-mono text-white">
          {value}/10
        </span>
      </div>
    );
  };

  const tierColors: Record<QualityTier, string> = {
    excellent: 'bg-green-600 hover:bg-green-700',
    good: 'bg-blue-600 hover:bg-blue-700',
    mediocre: 'bg-yellow-600 hover:bg-yellow-700',
    bad: 'bg-red-600 hover:bg-red-700'
  };

  const tierLabels: Record<QualityTier, string> = {
    excellent: 'Excellent',
    good: 'Good',
    mediocre: 'Mediocre',
    bad: 'Bad'
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
                <span className="text-xs font-normal px-2 py-0.5 bg-gray-600 rounded-full">Legacy</span>
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                Analyze video, then rate with your interpretation
              </p>
            </div>
            <a 
              href="/analyze-rate-v1" 
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <span>Use Enhanced v1.1</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
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
              
              {/* Scores - mapped from actual Gemini structure */}
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

              {/* Humor Analysis - mapped from actual Gemini structure */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <span className="text-sm text-gray-400">Humor Type</span>
                  <p className="text-white">{result.analysis.script?.humor?.humorType || 'Unknown'}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-400">Comedy Timing</span>
                  <p className="text-white">{result.analysis.script?.humor?.comedyTiming || 0}/10</p>
                </div>
              </div>

              {/* Why It Works */}
              <div className="mb-4">
                <span className="text-sm text-gray-400">Humor Mechanism</span>
                <p className="text-white text-sm mt-1">{result.analysis.script?.humor?.humorMechanism || 'N/A'}</p>
              </div>

              {/* Visual Summary */}
              {result.analysis.visual?.summary && (
                <div className="mb-4">
                  <span className="text-sm text-gray-400">Visual Summary</span>
                  <p className="text-white text-sm mt-1">{result.analysis.visual.summary}</p>
                </div>
              )}

              {/* Replicability */}
              {result.analysis.script?.replicability?.template && (
                <div className="mb-4">
                  <span className="text-sm text-gray-400">Replicability Template</span>
                  <p className="text-white text-sm mt-1">{result.analysis.script.replicability.template}</p>
                </div>
              )}

              {/* Analysis Notes/Corrections */}
              {editingAnalysis && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <label className="block text-sm text-gray-400 mb-2">
                    Correct Gemini&apos;s Analysis
                    <span className="text-gray-500 ml-2">(corrections will be saved for model learning)</span>
                  </label>
                  <textarea
                    value={analysisNotes}
                    onChange={(e) => setAnalysisNotes(e.target.value)}
                    placeholder="e.g., 'The humor is actually self-deprecating, not contrast-based' or 'Missing: the callback to their previous viral video'..."
                    className="w-full h-32 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <div className="flex gap-2 mt-2">
                    {/* Confirm as Correct button */}
                    <button
                      onClick={async () => {
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
                        } catch (e) {
                          console.error('Failed to confirm analysis:', e);
                        }
                      }}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Analysis is Correct
                    </button>
                    
                    {/* Save Correction button - only when notes exist */}
                    {analysisNotes && (
                      <button
                        onClick={async () => {
                          try {
                            await fetch('/api/corrections', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                videoUrl: result.url,
                                originalAnalysis: result.analysis,
                                correction: {
                                  humor_type: analysisNotes.includes('humor') ? analysisNotes : undefined,
                                  joke_structure: analysisNotes.includes('structure') || analysisNotes.includes('setup') || analysisNotes.includes('payoff') ? analysisNotes : undefined
                                },
                                correctionType: 'humor_analysis',
                                notes: analysisNotes
                              })
                            });
                            setEditingAnalysis(false);
                          } catch (e) {
                            console.error('Failed to save correction:', e);
                          }
                        }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                      >
                        Save Correction
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Show saved notes even when not editing */}
              {!editingAnalysis && analysisNotes && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <span className="text-sm text-gray-400">Your Notes</span>
                  <p className="text-white text-sm mt-1 bg-gray-800 p-3 rounded-lg">{analysisNotes}</p>
                </div>
              )}
            </div>

            {/* Rating Section */}
            {!submitted ? (
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h2 className="text-lg font-semibold mb-4">Your Rating</h2>
                
                {/* Quality Tier */}
                <div className="mb-6">
                  <label className="block text-sm text-gray-400 mb-2">Quality Tier</label>
                  <div className="flex gap-3">
                    {(['excellent', 'good', 'mediocre', 'bad'] as QualityTier[]).map((tier) => (
                      <button
                        key={tier}
                        onClick={() => setQualityTier(tier)}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                          qualityTier === tier
                            ? tierColors[tier] + ' ring-2 ring-white'
                            : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                      >
                        {tierLabels[tier]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">
                    Your Interpretation / Notes
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Why did you rate it this way? What makes it work or not work?"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={3}
                  />
                </div>

                {/* Replicability - Structured Inputs */}
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">
                    Replicability Assessment
                  </label>
                  
                  {/* Actor Count */}
                  <div className="mb-3">
                    <span className="text-xs text-gray-500 block mb-1">How many people appear?</span>
                    <div className="flex flex-wrap gap-2">
                      {(['solo', 'duo', 'small_team', 'large_team'] as const).map((option) => (
                        <button
                          key={option}
                          onClick={() => setActorCount(option)}
                          className={`px-3 py-1 text-sm rounded-lg transition-all ${
                            actorCount === option
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {option === 'solo' ? '1 Person' : option === 'duo' ? '2 People' : option === 'small_team' ? '3-5' : '5+'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Setup Complexity */}
                  <div className="mb-3">
                    <span className="text-xs text-gray-500 block mb-1">Equipment needed?</span>
                    <div className="flex flex-wrap gap-2">
                      {(['phone_only', 'basic_tripod', 'lighting_setup', 'full_studio'] as const).map((option) => (
                        <button
                          key={option}
                          onClick={() => setSetupComplexity(option)}
                          className={`px-3 py-1 text-sm rounded-lg transition-all ${
                            setupComplexity === option
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {option === 'phone_only' ? 'Phone Only' : option === 'basic_tripod' ? 'Tripod' : option === 'lighting_setup' ? 'Lighting' : 'Studio'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Skill Required */}
                  <div className="mb-3">
                    <span className="text-xs text-gray-500 block mb-1">Skill level to recreate?</span>
                    <div className="flex flex-wrap gap-2">
                      {(['anyone', 'basic_editing', 'intermediate', 'professional'] as const).map((option) => (
                        <button
                          key={option}
                          onClick={() => setSkillRequired(option)}
                          className={`px-3 py-1 text-sm rounded-lg transition-all ${
                            skillRequired === option
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {option === 'anyone' ? 'Anyone' : option === 'basic_editing' ? 'Basic' : option === 'intermediate' ? 'Intermediate' : 'Pro'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Setting Type */}
                  <div className="mb-3">
                    <span className="text-xs text-gray-500 block mb-1">Environment required?</span>
                    <div className="flex flex-wrap gap-2">
                      {(['kitchen', 'dining_room', 'bar', 'storefront', 'outdoor', 'mixed'] as const).map((option) => (
                        <button
                          key={option}
                          onClick={() => setSettingType(option)}
                          className={`px-3 py-1 text-sm rounded-lg transition-all ${
                            settingType === option
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {option.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Additional notes */}
                  <textarea
                    value={replicabilityNotes}
                    onChange={(e) => setReplicabilityNotes(e.target.value)}
                    placeholder="Any additional notes on replicability..."
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                    rows={2}
                  />
                </div>

                {/* Brand/Tone */}
                <div className="mb-6">
                  <label className="block text-sm text-gray-400 mb-2">
                    Brand / Tone / Audience Notes
                  </label>
                  <textarea
                    value={brandToneNotes}
                    onChange={(e) => setBrandToneNotes(e.target.value)}
                    placeholder="What type of business could use this? Any risks? Gen Z specific? Broad appeal?"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={2}
                  />
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmitRating}
                  disabled={!qualityTier || submitting}
                  className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                >
                  {submitting ? 'Saving...' : 'Save Rating'}
                </button>
              </div>
            ) : (
              <div className="bg-green-900/30 rounded-xl p-6 border border-green-800">
                <h2 className="text-lg font-semibold text-green-300 mb-2">Rating Saved</h2>
                <p className="text-gray-300 mb-4">This video has been added to your training data.</p>
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
