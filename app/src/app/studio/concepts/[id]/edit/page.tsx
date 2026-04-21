/* eslint-disable @next/next/no-html-link-for-pages, @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { loadConcepts, type TranslatedConcept } from '@/lib/conceptLoader';

// Full concept data from JSON
interface ConceptData {
  id: string;
  url: string;
  gcs_uri?: string;
  platform?: string;
  
  // Humor analysis
  humor_analysis?: {
    handling?: string;
    mechanism?: string;
    why?: string;
    target_audience?: string;
  };
  
  // Replicability
  replicability_signals?: {
    time_investment?: number;
    skill_requirements?: number;
    budget_requirements?: number;
    equipment_requirements?: number;
  };
  
  // Audience
  audience_signals?: {
    primary_ages?: Array<{ primary: string; secondary?: string }>;
    vibe_alignments?: string[];
    engagement_style?: string;
    niche_specificity?: number;
  };
  
  // Scene breakdown
  scene_breakdown?: Array<{
    timestamp: string;
    duration?: string;
    audio: string;
    visual: string;
    narrative_function: string;
  }>;
  
  // Replicability analysis
  replicability_analysis?: string;
  
  // Meta
  origin_country?: string;
  created_at?: string;
  
  // Display/translated data
  headline?: string;
  headline_sv?: string;
  description?: string;
  description_sv?: string;
  whyItWorks?: string;
  whyItWorks_sv?: string;
  script_sv?: string;
  productionNotes_sv?: string[];
  whyItFits?: string[];
  whyItFits_sv?: string[];
  matchPercentage?: number;
  difficulty?: string;
  filmTime?: string;
  peopleNeeded?: string;
  mechanism?: string;
  market?: string;
  trendLevel?: number;
  vibeAlignments?: string[];
  price?: number;
}

export default function StudioConceptEditPage() {
  const params = useParams();
  const router = useRouter();
  const conceptId = params?.id as string;
  
  const [concept, setConcept] = useState<ConceptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  // Form state
  const [form, setForm] = useState<ConceptData>({ id: '', url: '' });
  const [activeTab, setActiveTab] = useState<'basic' | 'analysis' | 'scenes' | 'translations'>('basic');

  useEffect(() => {
    if (conceptId) {
      const allConcepts = loadConcepts();
      const found = allConcepts.find(c => c.id === conceptId);
      
      if (found) {
        // Build full concept data from the loaded concept
        const fullConcept: ConceptData = {
          id: found.id,
          url: (found as any).url || '',
          platform: (found as any).platform || 'tiktok',
          gcs_uri: (found as any).gcsUri,
          humor_analysis: (found as any).humorAnalysis || {},
          replicability_signals: (found as any).replicabilitySignals || {},
          audience_signals: (found as any).audienceSignals || {},
          scene_breakdown: (found as any).sceneBreakdown || [],
          replicability_analysis: (found as any).replicabilityAnalysis,
          origin_country: (found as any).originCountry,
          headline: found.headline,
          headline_sv: found.headline_sv,
          description: (found as any).description,
          description_sv: found.description_sv,
          whyItWorks: (found as any).whyItWorks,
          whyItWorks_sv: found.whyItWorks_sv,
          script_sv: (found as any).script_sv,
          productionNotes_sv: (found as any).productionNotes_sv,
          whyItFits: found.whyItFits,
          whyItFits_sv: found.whyItFits_sv,
          matchPercentage: found.matchPercentage,
          difficulty: found.difficulty,
          filmTime: found.filmTime,
          peopleNeeded: found.peopleNeeded,
          mechanism: found.mechanism,
          market: found.market,
          trendLevel: found.trendLevel,
          vibeAlignments: found.vibeAlignments,
          price: found.price,
        };
        
        setConcept(fullConcept);
        setForm(fullConcept);
      }
    }
    setLoading(false);
  }, [conceptId]);

  const handleSave = async () => {
    setSaving(true);

    try {
      // Build overrides object with Swedish translations and custom fields
      const overrides = {
        headline_sv: form.headline_sv,
        description_sv: form.description_sv,
        whyItWorks_sv: form.whyItWorks_sv,
        script_sv: form.script_sv,
        productionNotes_sv: form.productionNotes_sv,
        whyItFits_sv: form.whyItFits_sv,
        // Include other editable fields
        matchPercentage: form.matchPercentage,
        difficulty: form.difficulty,
        filmTime: form.filmTime,
        peopleNeeded: form.peopleNeeded,
        mechanism: form.mechanism,
        market: form.market,
        trendLevel: form.trendLevel,
        vibeAlignments: form.vibeAlignments,
        price: form.price,
      };

      const response = await fetch(`/api/admin/concepts/${conceptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overrides,
          change_summary: 'Uppdaterad från Studio',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

      // Optionally refresh or navigate back
      // router.push('/studio/concepts');
    } catch (error: any) {
      console.error('Save error:', error);
      alert(`Fel vid sparning: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Laddar...</div>;
  if (!concept) return <div style={{ padding: 40, textAlign: 'center' }}>Concept ej funnet</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <a href="/studio/concepts" style={{ color: '#6b7280', fontSize: 14 }}>← Tillbaka till concepts</a>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>Redigera: {concept.headline_sv || concept.headline}</h1>
        <div style={{ fontSize: 13, color: '#6b7280' }}>ID: {concept.id}</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #e5e7eb', paddingBottom: 12 }}>
        {[
          { id: 'basic', label: '📝 Grundläggande' },
          { id: 'analysis', label: '🔍 Analys' },
          { id: 'scenes', label: '🎬 Scener' },
          { id: 'translations', label: '🇸🇪 Översättningar' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{
            background: activeTab === tab.id ? '#4f46e5' : '#fff',
            color: activeTab === tab.id ? '#fff' : '#6b7280',
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid',
            borderColor: activeTab === tab.id ? '#4f46e5' : '#e5e7eb',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: 14,
          }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        
        {activeTab === 'basic' && (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Grundläggande info</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Rubrik (EN)</label>
                <input value={form.headline || ''} onChange={e => setForm({ ...form, headline: e.target.value })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Rubrik (SV)</label>
                <input value={form.headline_sv || ''} onChange={e => setForm({ ...form, headline_sv: e.target.value })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Beskrivning (EN)</label>
              <textarea value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical' }} />
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Beskrivning (SV)</label>
              <textarea value={form.description_sv || ''} onChange={e => setForm({ ...form, description_sv: e.target.value })} rows={3} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Varför det funkar (EN)</label>
              <textarea value={form.whyItWorks || ''} onChange={e => setForm({ ...form, whyItWorks: e.target.value })} rows={4} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Varför det funkar (SV)</label>
              <textarea value={form.whyItWorks_sv || ''} onChange={e => setForm({ ...form, whyItWorks_sv: e.target.value })} rows={4} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Match %</label>
                <input type="number" value={form.matchPercentage || 0} onChange={e => setForm({ ...form, matchPercentage: parseInt(e.target.value) })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Svårighet</label>
                <select value={form.difficulty || 'medium'} onChange={e => setForm({ ...form, difficulty: e.target.value })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Trend (1-5)</label>
                <input type="number" min="1" max="5" value={form.trendLevel || 3} onChange={e => setForm({ ...form, trendLevel: parseInt(e.target.value) })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Land</label>
                <input value={form.origin_country || ''} onChange={e => setForm({ ...form, origin_country: e.target.value })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Analysdata</h3>
            
            {/* Humor Analysis */}
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#374151' }}>Humor Analysis</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Handling</label>
                  <input value={form.humor_analysis?.handling || ''} onChange={e => setForm({ ...form, humor_analysis: { ...form.humor_analysis, handling: e.target.value } })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Mekanism</label>
                  <input value={form.humor_analysis?.mechanism || ''} onChange={e => setForm({ ...form, humor_analysis: { ...form.humor_analysis, mechanism: e.target.value } })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Why (VARFÖR det funkar)</label>
                <textarea value={form.humor_analysis?.why || ''} onChange={e => setForm({ ...form, humor_analysis: { ...form.humor_analysis, why: e.target.value } })} rows={4} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Målgrupp</label>
                <input value={form.humor_analysis?.target_audience || ''} onChange={e => setForm({ ...form, humor_analysis: { ...form.humor_analysis, target_audience: e.target.value } })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
              </div>
            </div>

            {/* Replicability Signals */}
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#374151' }}>Replikerbarhet (1-10, högre = enklare)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Tid</label>
                  <input type="number" min="1" max="10" value={form.replicability_signals?.time_investment || 0} onChange={e => setForm({ ...form, replicability_signals: { ...form.replicability_signals, time_investment: parseInt(e.target.value) } })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Kunskap</label>
                  <input type="number" min="1" max="10" value={form.replicability_signals?.skill_requirements || 0} onChange={e => setForm({ ...form, replicability_signals: { ...form.replicability_signals, skill_requirements: parseInt(e.target.value) } })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Budget</label>
                  <input type="number" min="1" max="10" value={form.replicability_signals?.budget_requirements || 0} onChange={e => setForm({ ...form, replicability_signals: { ...form.replicability_signals, budget_requirements: parseInt(e.target.value) } })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Utrustning</label>
                  <input type="number" min="1" max="10" value={form.replicability_signals?.equipment_requirements || 0} onChange={e => setForm({ ...form, replicability_signals: { ...form.replicability_signals, equipment_requirements: parseInt(e.target.value) } })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
                </div>
              </div>
            </div>

            {/* Replicability Analysis */}
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#374151' }}>Replikerbarhets-analys (fri text)</h4>
              <textarea value={form.replicability_analysis || ''} onChange={e => setForm({ ...form, replicability_analysis: e.target.value })} rows={6} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical' }} />
            </div>

            {/* Audience Signals */}
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#374151' }}>Målgruppssignaler</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Engagemangsstil</label>
                  <input value={form.audience_signals?.engagement_style || ''} onChange={e => setForm({ ...form, audience_signals: { ...form.audience_signals, engagement_style: e.target.value } })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Nisch-specifitet (1-10)</label>
                  <input type="number" min="1" max="10" value={form.audience_signals?.niche_specificity || 0} onChange={e => setForm({ ...form, audience_signals: { ...form.audience_signals, niche_specificity: parseInt(e.target.value) } })} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8 }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'scenes' && (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Scene Breakdown</h3>
            
            {form.scene_breakdown?.map((scene, i) => (
              <div key={i} style={{ background: '#f9fafb', borderRadius: 8, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>Scene {i + 1}</span>
                  <button onClick={() => {
                    const scenes = [...(form.scene_breakdown || [])];
                    scenes.splice(i, 1);
                    setForm({ ...form, scene_breakdown: scenes });
                  }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>Ta bort</button>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Timestamp</label>
                    <input value={scene.timestamp} onChange={e => {
                      const scenes = [...(form.scene_breakdown || [])];
                      scenes[i].timestamp = e.target.value;
                      setForm({ ...form, scene_breakdown: scenes });
                    }} style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Duration</label>
                    <input value={scene.duration || ''} onChange={e => {
                      const scenes = [...(form.scene_breakdown || [])];
                      scenes[i].duration = e.target.value;
                      setForm({ ...form, scene_breakdown: scenes });
                    }} style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }} />
                  </div>
                </div>
                
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Narrative Function</label>
                  <select value={scene.narrative_function} onChange={e => {
                    const scenes = [...(form.scene_breakdown || [])];
                    scenes[i].narrative_function = e.target.value;
                    setForm({ ...form, scene_breakdown: scenes });
                  }} style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}>
                    <option value="hook">Hook</option>
                    <option value="setup">Setup</option>
                    <option value="subversion">Subversion</option>
                    <option value="payoff">Payoff</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Audio/Ljud</label>
                  <textarea value={scene.audio} onChange={e => {
                    const scenes = [...(form.scene_breakdown || [])];
                    scenes[i].audio = e.target.value;
                    setForm({ ...form, scene_breakdown: scenes });
                  }} rows={2} style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, resize: 'vertical' }} />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Visual/Visuellt</label>
                  <textarea value={scene.visual} onChange={e => {
                    const scenes = [...(form.scene_breakdown || [])];
                    scenes[i].visual = e.target.value;
                    setForm({ ...form, scene_breakdown: scenes });
                  }} rows={2} style={{ width: '100%', padding: 8, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, resize: 'vertical' }} />
                </div>
              </div>
            ))}
            
            <button onClick={() => setForm({ ...form, scene_breakdown: [...(form.scene_breakdown || []), { timestamp: '0:00', duration: '', audio: '', visual: '', narrative_function: 'hook' }] })} style={{ background: '#10b981', color: '#fff', padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>+ Lägg till scene</button>
          </div>
        )}

        {activeTab === 'translations' && (
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>🇸🇪 Svenska översättningar</h3>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Manus/Script (SV)</label>
              <textarea value={form.script_sv || ''} onChange={e => setForm({ ...form, script_sv: e.target.value })} rows={6} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical' }} />
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Produktionsanteckningar (SV, en per rad)</label>
              <textarea value={form.productionNotes_sv?.join('\n') || ''} onChange={e => setForm({ ...form, productionNotes_sv: e.target.value.split('\n').filter(x => x.trim()) })} rows={4} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical' }} placeholder="Rad 1&#10;Rad 2&#10;Rad 3" />
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#6b7280', marginBottom: 6 }}>Why it fits (SV, en per rad)</label>
              <textarea value={form.whyItFits_sv?.join('\n') || ''} onChange={e => setForm({ ...form, whyItFits_sv: e.target.value.split('\n').filter(x => x.trim()) })} rows={4} style={{ width: '100%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, resize: 'vertical' }} />
            </div>
          </div>
        )}

        {/* Save Button */}
        <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          {saved && <span style={{ color: '#10b981', fontWeight: 500, alignSelf: 'center' }}>✓ Sparat!</span>}
          <button onClick={handleSave} disabled={saving} style={{ background: saving ? '#9ca3af' : '#4f46e5', color: '#fff', padding: '12px 24px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
            {saving ? 'Sparar...' : 'Spara ändringar'}
          </button>
        </div>
      </div>
    </div>
  );
}
