'use client';

import { useState } from 'react';

interface GeminiAnalysis {
  script?: {
    structure?: {
      hook?: string;
      setup?: string;
      payoff?: string;
      payoffType?: string;
    };
    humor?: {
      humorType?: string;
      humorMechanism?: string;
      isHumorous?: boolean;
      comedyTiming?: number;
    };
    replicability?: {
      template?: string;
    };
  };
  visual?: {
    summary?: string;
  };
  [key: string]: unknown;
}

export default function HumorAnalysisPage() {
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  
  // Analysis results
  const [analysis, setAnalysis] = useState<GeminiAnalysis | null>(null);
  
  // Correction note
  const [correctionNote, setCorrectionNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAnalyze = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);
    setVideoId(null);
    setCorrectionNote('');

    try {
      setStatus('Creating video record...');
      const createRes = await fetch('/api/videos/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.message || 'Failed to create video record');
      }

      const createData = await createRes.json();
      const vid = createData.id;
      setVideoId(vid);

      if (createData.hasAnalysis) {
        setStatus('Checking cached analysis...');
        const fullRes = await fetch(`/api/videos/analyze?id=${vid}`);
        if (fullRes.ok) {
          const fullData = await fullRes.json();
          const cached = fullData.visual_analysis;
          if (cached?.script?.humor?.humorType || cached?.visual?.summary) {
            setAnalysis(cached);
            await saveToHumorTable(vid, fullData.video_url, cached);
            setStatus('');
            setLoading(false);
            return;
          }
        }
      }

      setStatus('Analyzing with Gemini (30-60s)...');
      const deepRes = await fetch('/api/videos/analyze/deep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: vid, useSchemaV1: true })
      });

      const deepData = await deepRes.json();
      if (!deepRes.ok) {
        throw new Error(deepData.message || deepData.error || 'Analysis failed');
      }

      setAnalysis(deepData.analysis);
      await saveToHumorTable(vid, url.trim(), deepData.analysis);
      setStatus('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStatus('');
    } finally {
      setLoading(false);
    }
  };

  const saveToHumorTable = async (vid: string, videoUrl: string, geminiAnalysis: GeminiAnalysis) => {
    try {
      await fetch('/api/humor-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: vid,
          videoUrl,
          geminiAnalysis,
          analysisModel: 'gemini-2.0-flash',
          analysisVersion: 'v5.0'
        })
      });
    } catch (e) {
      console.error('Failed to save to humor table:', e);
    }
  };

  const handleSaveCorrection = async () => {
    if (!videoId || !correctionNote.trim()) return;
    
    setSaving(true);
    try {
      // Save correction to humor analysis table
      await fetch('/api/humor-analysis', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          field: 'humor_interpretation',
          originalValue: analysis?.script?.humor?.humorMechanism || '',
          correctedValue: correctionNote,
          notes: correctionNote
        })
      });

      // Also save to learning examples for RAG
      await fetch('/api/corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl: url,
          originalAnalysis: analysis,
          correction: { humor_type: correctionNote, joke_structure: correctionNote },
          correctionType: 'humor_analysis',
          notes: correctionNote
        })
      });

      setStatus('Correction saved - will improve future analysis');
      setTimeout(() => setStatus(''), 3000);
    } catch (e) {
      setError('Failed to save correction');
    } finally {
      setSaving(false);
    }
  };

  // Build the scene description from analysis
  const getSceneDescription = (): string => {
    if (!analysis) return '';
    const parts: string[] = [];
    if (analysis.visual?.summary) parts.push(analysis.visual.summary);
    if (analysis.script?.replicability?.template) parts.push(`Template: ${analysis.script.replicability.template}`);
    return parts.join('\n\n') || 'No scene description available';
  };

  // Build the humor structure description
  const getHumorStructure = (): string => {
    if (!analysis) return '';
    const parts: string[] = [];
    const humor = analysis.script?.humor;
    const structure = analysis.script?.structure;
    
    if (humor?.humorMechanism) parts.push(`Mechanism: ${humor.humorMechanism}`);
    if (structure?.hook) parts.push(`Hook: ${structure.hook}`);
    if (structure?.setup) parts.push(`Setup: ${structure.setup}`);
    if (structure?.payoff) parts.push(`Payoff: ${structure.payoff}`);
    if (structure?.payoffType) parts.push(`Payoff Type: ${structure.payoffType}`);
    
    return parts.join('\n\n') || 'No humor structure detected';
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Humor Analysis</h1>
        <p className="text-gray-400 text-sm mb-6">
          Test if the model understands joke structure. Corrections feed into RAG learning.
        </p>

        {/* URL Input */}
        <div className="mb-6">
          <div className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste video URL..."
              className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded text-white"
              disabled={loading}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
            />
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 rounded"
            >
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </div>
          {status && <p className="text-gray-500 text-sm mt-2">{status}</p>}
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>

        {/* Analysis Results */}
        {analysis && (
          <div className="space-y-6">
            {/* Humor Type */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Humor Type</label>
              <div className="px-4 py-3 bg-gray-900 border border-gray-700 rounded">
                {analysis.script?.humor?.humorType || 'Unknown'}
              </div>
            </div>

            {/* Scene Description */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Scene Description</label>
              <div className="px-4 py-3 bg-gray-900 border border-gray-700 rounded whitespace-pre-wrap min-h-[100px]">
                {getSceneDescription()}
              </div>
            </div>

            {/* Humor Structure */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Humor Structure (setup, mechanism, payoff)</label>
              <div className="px-4 py-3 bg-gray-900 border border-gray-700 rounded whitespace-pre-wrap min-h-[100px]">
                {getHumorStructure()}
              </div>
            </div>

            {/* Correction Notes */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Correction Notes (if interpretation is wrong or incomplete)
              </label>
              <textarea
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
                placeholder="Describe what the model missed or got wrong about the humor..."
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded text-white min-h-[100px]"
              />
              {correctionNote.trim() && (
                <button
                  onClick={handleSaveCorrection}
                  disabled={saving}
                  className="mt-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 rounded text-sm"
                >
                  {saving ? 'Saving...' : 'Save Correction'}
                </button>
              )}
            </div>

            {/* Reset */}
            <button
              onClick={() => {
                setUrl('');
                setVideoId(null);
                setAnalysis(null);
                setCorrectionNote('');
                setError(null);
              }}
              className="text-gray-500 hover:text-gray-400 text-sm"
            >
              Analyze another video
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
