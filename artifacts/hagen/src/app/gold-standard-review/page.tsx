'use client';

import { useState, useEffect } from 'react';

interface ReviewEntry {
  id: number;
  url: string;
  timestamp: string;
  source: string;
  original_analysis: string;
  observation: string;
  handling: string;
  mekanism: string;
  varfor: string;
  malgrupp: string;
  reviewed: boolean;
  edited_at: string | null;
  v7b_analysis?: string;
}

export default function GoldStandardReview() {
  const [entries, setEntries] = useState<ReviewEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'reviewed'>('pending');

  // Load entries
  useEffect(() => {
    fetch('/api/fine-tuning/review')
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setEntries(data.entries || []);
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const filteredEntries = entries.filter(e => {
    if (filter === 'pending') return !e.reviewed;
    if (filter === 'reviewed') return e.reviewed;
    return true;
  });

  const current = filteredEntries[currentIndex];

  const updateField = (field: keyof ReviewEntry, value: string) => {
    if (!current) return;
    setEntries(prev => prev.map(e =>
      e.id === current.id ? { ...e, [field]: value } : e
    ));
  };

  const analyzeWithV7B = async () => {
    if (!current) return;
    setAnalyzing(true);

    try {
      const res = await fetch('/api/fine-tuning/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: current.url,
          version: 'v7.B',
          mode: 'balanced'
        })
      });

      const data = await res.json();
      if (data.analysis) {
        // Parse the V7.B analysis into fields
        const analysis = data.analysis;

        const obsMatch = analysis.match(/\*\*Observation:\*\*\s*([\s\S]*?)(?=\*\*Handling|\*\*Mekanism|$)/i);
        const handMatch = analysis.match(/\*\*Handling:\*\*\s*([\s\S]*?)(?=\*\*Mekanism|\*\*Varför|$)/i);
        const mekMatch = analysis.match(/\*\*Mekanism:\*\*\s*([\s\S]*?)(?=\*\*Varför|\*\*Målgrupp|$)/i);
        const varMatch = analysis.match(/\*\*Varför:\*\*\s*([\s\S]*?)(?=\*\*Målgrupp|$)/i);
        const malMatch = analysis.match(/\*\*Målgrupp:\*\*\s*([\s\S]*?)$/i);

        setEntries(prev => prev.map(e =>
          e.id === current.id ? {
            ...e,
            observation: obsMatch ? obsMatch[1].trim() : e.observation,
            handling: handMatch ? handMatch[1].trim() : e.handling,
            mekanism: mekMatch ? mekMatch[1].trim() : e.mekanism,
            varfor: varMatch ? varMatch[1].trim() : e.varfor,
            malgrupp: malMatch ? malMatch[1].trim() : e.malgrupp,
            v7b_analysis: analysis
          } : e
        ));
      } else if (data.error) {
        alert('V7.B Error: ' + data.error);
      }
    } catch (err: any) {
      console.error('V7.B analysis error:', err);
      alert('Error: ' + err.message);
    }

    setAnalyzing(false);
  };

  const reanalyzeFields = async () => {
    // Re-analyze just Mekanism/Varför/Målgrupp based on current Observation/Handling
    if (!current) return;
    setAnalyzing(true);

    try {
      // Build a custom prompt that includes user's edits
      // Uses text-only mode (base Gemini) to derive fields from provided text
      const customPrompt = `Du analyserar en TikTok-video baserat på given observation och handling.

**Observation:** ${current.observation}

**Handling:** ${current.handling}

Baserat på ovanstående, generera:
**Mekanism:** Vilken specifik humormekanism används? (t.ex. Subversion, Bokstavlig tolkning, Överdrift, Situationskomik, Ironi, Kontrast, etc.) Förklara kort.
**Varför:** Varför fungerar detta humoristiskt? Vad gör det effektivt?
**Målgrupp:** Vem uppskattar detta mest? Var specifik (t.ex. "Servicepersonal som känner igen situationen" istället för bara "Unga vuxna").

Svara ENDAST med de tre fälten ovan, inget annat.`;

      const res = await fetch('/api/fine-tuning/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textOnly: true,  // Use base Gemini, no video
          customPrompt
        })
      });

      const data = await res.json();
      if (data.analysis) {
        const analysis = data.analysis;

        const mekMatch = analysis.match(/\*\*Mekanism:\*\*\s*([\s\S]*?)(?=\*\*Varför|\*\*Målgrupp|$)/i);
        const varMatch = analysis.match(/\*\*Varför:\*\*\s*([\s\S]*?)(?=\*\*Målgrupp|$)/i);
        const malMatch = analysis.match(/\*\*Målgrupp:\*\*\s*([\s\S]*?)$/i);

        setEntries(prev => prev.map(e =>
          e.id === current.id ? {
            ...e,
            mekanism: mekMatch ? mekMatch[1].trim() : e.mekanism,
            varfor: varMatch ? varMatch[1].trim() : e.varfor,
            malgrupp: malMatch ? malMatch[1].trim() : e.malgrupp,
          } : e
        ));
      }
    } catch (err: any) {
      console.error('Reanalyze error:', err);
    }

    setAnalyzing(false);
  };

  const saveEntry = async () => {
    if (!current) return;
    setSaving(true);

    try {
      const res = await fetch('/api/fine-tuning/review', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: current.id,
          observation: current.observation,
          handling: current.handling,
          mekanism: current.mekanism,
          varfor: current.varfor,
          malgrupp: current.malgrupp
        })
      });

      const data = await res.json();
      if (data.success) {
        setEntries(prev => prev.map(e =>
          e.id === current.id ? { ...e, reviewed: true, edited_at: new Date().toISOString() } : e
        ));
        // Move to next
        if (currentIndex < filteredEntries.length - 1) {
          setCurrentIndex(currentIndex + 1);
        }
      }
    } catch (err: any) {
      console.error('Save error:', err);
    }

    setSaving(false);
  };

  const applyToGoldStandard = async () => {
    if (!confirm('Apply all reviewed entries to gold_standard.jsonl? A backup will be created.')) {
      return;
    }

    try {
      const res = await fetch('/api/fine-tuning/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply' })
      });

      const data = await res.json();
      if (data.success) {
        alert(`Applied ${data.applied} entries. Backup: ${data.backup}`);
      } else {
        alert('Error: ' + data.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
        <p>{error}</p>
        <p className="mt-4 text-gray-600">Run: <code>node scripts/export-weak-entries.js</code></p>
      </div>
    );
  }

  const reviewedCount = entries.filter(e => e.reviewed).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Gold Standard Review</h1>
            <p className="text-sm text-gray-600">
              {reviewedCount}/{entries.length} reviewed
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={filter}
              onChange={e => { setFilter(e.target.value as any); setCurrentIndex(0); }}
              className="border rounded px-3 py-1"
            >
              <option value="pending">Pending ({entries.length - reviewedCount})</option>
              <option value="reviewed">Reviewed ({reviewedCount})</option>
              <option value="all">All ({entries.length})</option>
            </select>
            <button
              onClick={applyToGoldStandard}
              disabled={reviewedCount === 0}
              className="bg-green-600 text-white px-4 py-1 rounded disabled:opacity-50"
            >
              Apply to Gold Standard
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white border-b px-6 py-2 flex items-center gap-4">
        <button
          onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          ← Previous
        </button>
        <span className="text-sm">
          {currentIndex + 1} / {filteredEntries.length}
        </span>
        <button
          onClick={() => setCurrentIndex(Math.min(filteredEntries.length - 1, currentIndex + 1))}
          disabled={currentIndex >= filteredEntries.length - 1}
          className="px-3 py-1 border rounded disabled:opacity-50"
        >
          Next →
        </button>
        <span className="ml-4 text-sm text-gray-500">
          {current?.reviewed ? '✓ Reviewed' : '○ Pending'}
        </span>
      </div>

      {current && (
        <div className="p-6 grid grid-cols-2 gap-6">
          {/* Left: Video & Original */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-semibold mb-2">Video</h2>
              <a
                href={current.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm break-all"
              >
                {current.url}
              </a>
              <p className="text-xs text-gray-500 mt-1">
                {current.timestamp} • {current.source}
              </p>
            </div>

            <div className="bg-white rounded-lg border p-4">
              <h2 className="font-semibold mb-2">Original Analysis</h2>
              <pre className="text-sm whitespace-pre-wrap bg-gray-50 p-3 rounded">
                {current.original_analysis}
              </pre>
            </div>
          </div>

          {/* Right: Edit Fields */}
          <div className="space-y-4">
            {/* V7.B Analysis Button */}
            <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-blue-900">Get Fresh V7.B Analysis</p>
                  <p className="text-xs text-blue-700">Re-analyze video and populate all fields</p>
                </div>
                <button
                  onClick={analyzeWithV7B}
                  disabled={analyzing}
                  className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                  {analyzing ? '⏳ Analyzing...' : '🎬 Analyze with V7.B'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg border p-4">
              <label className="block font-semibold mb-1">Observation</label>
              <p className="text-xs text-gray-500 mb-2">Vad händer konkret? Visuella/auditiva detaljer.</p>
              <textarea
                value={current.observation}
                onChange={e => updateField('observation', e.target.value)}
                className="w-full border rounded p-2 h-24"
                placeholder="Beskriv vad som syns och hörs i videon..."
              />
            </div>

            <div className="bg-white rounded-lg border p-4">
              <label className="block font-semibold mb-1">Handling</label>
              <p className="text-xs text-gray-500 mb-2">Vad är poängen/skämtet?</p>
              <textarea
                value={current.handling}
                onChange={e => updateField('handling', e.target.value)}
                className="w-full border rounded p-2 h-24"
              />
            </div>

            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="font-semibold">Mekanism & Målgrupp</label>
                <button
                  onClick={reanalyzeFields}
                  disabled={analyzing || !current.handling}
                  className="text-sm bg-purple-600 text-white px-3 py-1 rounded disabled:opacity-50"
                >
                  {analyzing ? '⏳ Analyzing...' : '🔄 Update from V7.B'}
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">Mekanism</label>
                  <textarea
                    value={current.mekanism}
                    onChange={e => updateField('mekanism', e.target.value)}
                    className="w-full border rounded p-2 h-20 resize-y"
                    placeholder="Vilken humorteknisk mekanism används?"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Varför</label>
                  <textarea
                    value={current.varfor}
                    onChange={e => updateField('varfor', e.target.value)}
                    className="w-full border rounded p-2 h-20 resize-y"
                    placeholder="Varför fungerar humorn?"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Målgrupp</label>
                  <textarea
                    value={current.malgrupp}
                    onChange={e => updateField('malgrupp', e.target.value)}
                    className="w-full border rounded p-2 h-20 resize-y"
                    placeholder="Vem tilltalar detta mest?"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={saveEntry}
              disabled={saving}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save & Next →'}
            </button>
          </div>
        </div>
      )}

      {filteredEntries.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          No entries match current filter.
        </div>
      )}
    </div>
  );
}
