'use client';

import { useState, useEffect } from 'react';

export default function ReplicabilityLab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [originalAnalysis, setOriginalAnalysis] = useState('');
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState('');
  const [filter, setFilter] = useState<'all' | 'unverified'>('unverified');
  const [remainingUnverified, setRemainingUnverified] = useState<number | null>(null);

  const loadRandomVideo = async () => {
    setLoading(true);
    setStatus('Laddar video...');
    try {
      const res = await fetch(`/api/replicability/random?filter=${filter}`);
      const json = await res.json();
      setData(json);
      if (json.remaining_unverified !== undefined) {
        setRemainingUnverified(json.remaining_unverified);
      }
      
      const original = json.replicability_analysis || '';
      setOriginalAnalysis(original);

      // If already verified, use the saved analysis. Otherwise, predict.
      if (json.translation_status === 'verified') {
          setAnalysis(original);
          setStatus('Laddade verifierad analys.');
      } else {
          // Fetch Model Prediction
          setStatus('Kör modellen (Vertex AI)...');
          try {
            const predRes = await fetch('/api/replicability/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ video_id: json.video_id })
            });
            
            if (predRes.ok) {
                const predJson = await predRes.json();
                setAnalysis(predJson.analysis); // Set as default
                setStatus('Modellens analys laddad.');
            } else {
                console.error("Prediction failed");
                setAnalysis(original); // Fallback
                setStatus('Kunde inte köra modellen. Visar original.');
            }
          } catch (predErr) {
              console.error(predErr);
              setAnalysis(original);
              setStatus('Fel vid modellkörning.');
          }
      }

      setFeedback('');
    } catch (e) {
      console.error(e);
      setStatus('Fel vid laddning av video.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!feedback) return;
    setLoading(true);
    setStatus('Genererar om analys...');
    try {
      const res = await fetch('/api/replicability/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: data.video_id,
          feedback,
          current_analysis: analysis,
          signals: data.signals,
          notes: data.original_data.notes
        })
      });
      const json = await res.json();
      setAnalysis(json.analysis);
      setStatus('Analys uppdaterad baserat på feedback.');
    } catch (e) {
      console.error(e);
      setStatus('Fel vid regenerering.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setStatus('Sparar...');
    try {
      await fetch('/api/replicability/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_id: data.video_id,
          new_analysis: analysis
        })
      });
      setStatus('Sparat! Laddar nästa...');
      setTimeout(loadRandomVideo, 1000);
    } catch (e) {
      console.error(e);
      setStatus('Fel vid sparning.');
      setLoading(false);
    }
  };

  const handleTranslate = async () => {
    if (!analysis) return;
    setLoading(true);
    setStatus('Översätter...');
    try {
      const res = await fetch('/api/replicability/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: analysis })
      });
      const json = await res.json();
      setAnalysis(json.analysis);
      setStatus('Översatt till svenska.');
    } catch (e) {
      console.error(e);
      setStatus('Fel vid översättning.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRandomVideo();
  }, [filter]); // Reload when filter changes

  if (!data && loading) return <div className="p-8 text-center">Laddar labbet...</div>;
  if (!data) return <div className="p-8 text-center">Kunde inte ladda data.</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-900">🧪 Replikerbarhets-labbet</h1>
                <p className="text-gray-500">Finjustera träningsdata för replikerbarhetsmodellen</p>
                {remainingUnverified !== null && (
                    <p className="text-xs text-orange-600 mt-1 font-medium">
                        {remainingUnverified} overifierade videor kvar
                    </p>
                )}
            </div>
            <div className="flex gap-4 items-center">
                <div className="flex items-center gap-2 bg-white px-3 py-2 rounded border border-gray-200">
                    <label className="text-sm text-gray-600">Visa:</label>
                    <select 
                        value={filter} 
                        onChange={(e) => setFilter(e.target.value as any)}
                        className="text-sm bg-transparent font-medium outline-none"
                    >
                        <option value="unverified">Endast Overifierade</option>
                        <option value="all">Alla Videor</option>
                    </select>
                </div>
                <button 
                    onClick={loadRandomVideo} 
                    className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-50 transition-colors"
                >
                    Hoppa över / Nästa
                </button>
            </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Vänster Kolumn: Kontext */}
            <div className="space-y-6">
                <div className={`bg-white p-6 rounded-xl shadow-sm border ${data.translation_status === 'verified' ? 'border-green-500 ring-1 ring-green-500' : 'border-gray-100'}`}>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-gray-800">Videokontext</h2>
                        {data.translation_status === 'verified' && (
                            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-bold">
                                VERIFIERAD
                            </span>
                        )}
                    </div>
                    <div className="mb-4 bg-black h-64 flex items-center justify-center text-white rounded-lg overflow-hidden relative group">
                        {data.url && data.url.includes('tiktok.com') ? (
                             <a href={data.url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 text-blue-300 hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                <span>Öppna video i ny flik</span>
                             </a>
                        ) : (
                            <span className="text-gray-500">Ingen URL tillgänglig</span>
                        )}
                    </div>
                    <div className="text-xs text-gray-500 font-mono">
                        ID: {data.video_id}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold mb-4 text-gray-800">Originalanteckningar</h2>
                    <div className="text-gray-600 text-sm bg-gray-50 p-4 rounded-lg border border-gray-100 whitespace-pre-wrap">
                        {data.original_data.notes || 'Inga anteckningar'}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h2 className="text-lg font-semibold mb-4 text-gray-800">Signaler (Teknisk Data)</h2>
                    <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto max-h-64 font-mono">
                        {JSON.stringify(data.signals, null, 2)}
                    </pre>
                </div>
            </div>

            {/* Höger Kolumn: Analys & Feedback */}
            <div className="space-y-6">
                <div className={`bg-white p-6 rounded-xl shadow-sm border-2 ${data.translation_status === 'verified' ? 'border-green-200' : 'border-blue-100'}`}>
                    <div className="flex justify-between items-center mb-2">
                        <h2 className="text-lg font-semibold text-blue-900">
                            {data.translation_status === 'verified' ? 'Verifierad Analys' : 'Nuvarande Analys'}
                        </h2>
                        <div className="flex gap-2">
                            {originalAnalysis && analysis !== originalAnalysis && (
                                <button 
                                    onClick={() => setAnalysis(originalAnalysis)}
                                    className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
                                    title="Återställ till sparad version"
                                >
                                    ↺ Original
                                </button>
                            )}
                            <button 
                                onClick={handleTranslate}
                                disabled={loading || !analysis}
                                className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 transition-colors"
                            >
                                🇸🇪 Översätt
                            </button>
                            {data.translation_status === 'verified' ? (
                                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full border border-green-200 flex items-center gap-1">
                                    ✅ Verifierad
                                </span>
                            ) : data.translation_status === 'auto-generated' ? (
                                <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full border border-purple-200 flex items-center gap-1">
                                    🤖 Auto-genererad
                                </span>
                            ) : (
                                <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full border border-gray-200">
                                    Utkast
                                </span>
                            )}
                        </div>
                    </div>
                    <p className="text-xs text-gray-500 mb-4">
                        {data.translation_status === 'verified' 
                            ? 'Detta är den verifierade versionen som kommer användas för träning.' 
                            : 'Detta är vad modellen tror just nu. Redigera direkt eller använd feedback-loopen nedan.'}
                    </p>
                    <textarea 
                        value={analysis}
                        onChange={(e) => setAnalysis(e.target.value)}
                        className={`w-full h-80 p-4 border rounded-lg bg-white text-gray-800 focus:ring-2 outline-none transition-all text-sm leading-relaxed ${data.translation_status === 'verified' ? 'border-green-200 focus:ring-green-500' : 'border-gray-200 focus:ring-blue-500'}`}
                        spellCheck={false}
                    />
                </div>

                <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-200">
                    <h2 className="text-lg font-semibold mb-2 text-yellow-900">Feedback Loop</h2>
                    <p className="text-sm text-yellow-800 mb-3">Vad är fel med analysen ovan? (t.ex. &quot;För vagt&quot;, &quot;Missade ljudet&quot;, &quot;För formellt&quot;)</p>
                    
                    <textarea 
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="w-full h-24 p-3 border border-yellow-300 rounded-lg mb-4 bg-white focus:ring-2 focus:ring-yellow-500 outline-none text-sm" 
                        placeholder="Skriv din kritik här..."
                    />
                    
                    <div className="flex gap-3">
                        <button 
                            onClick={handleRegenerate} 
                            disabled={loading || !feedback}
                            className="flex-1 bg-yellow-600 text-white px-4 py-2.5 rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm flex justify-center items-center gap-2"
                        >
                            {loading && status.includes('Genererar') ? 'Genererar...' : '🔄 Regenerera med Feedback'}
                        </button>
                        <button 
                            onClick={handleSave} 
                            disabled={loading}
                            className="flex-1 bg-green-600 text-white px-4 py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm flex justify-center items-center gap-2"
                        >
                            {loading && status.includes('Sparar') ? 'Sparar...' : '✅ Verifiera & Spara'}
                        </button>
                    </div>
                    {status && <p className="text-center text-xs text-gray-500 mt-3">{status}</p>}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
