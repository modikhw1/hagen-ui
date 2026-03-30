'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { loadConceptById, type TranslatedConcept } from '@/lib/conceptLoader';

interface ConceptFormData {
  headline_sv: string;
  difficulty: string;
  origin_country: string;
  trend_level: number;
  film_time: string;
  people_needed: string;
  why_it_works: string;
  target_audience: string;
  scene_breakdown: string;
}

export default function StudioConceptEditPage() {
  const params = useParams();
  const router = useRouter();
  const conceptId = params?.id as string;
  
  const [concept, setConcept] = useState<TranslatedConcept | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [formData, setFormData] = useState<ConceptFormData>({
    headline_sv: '',
    difficulty: 'medium',
    origin_country: 'Sverige',
    trend_level: 3,
    film_time: '15-30 min',
    people_needed: '1-2',
    why_it_works: '',
    target_audience: '',
    scene_breakdown: '',
  });

  useEffect(() => {
    if (conceptId) {
      const found = loadConceptById(conceptId);
      if (found) {
        setConcept(found);
        setFormData({
          headline_sv: found.headline_sv || found.headline,
          difficulty: found.difficulty,
          origin_country: (found as any).originCountry || '',
          trend_level: found.trendLevel,
          film_time: found.filmTime,
          people_needed: found.peopleNeeded,
          why_it_works: found.whyItWorks_sv || (found as any).whyItWorks || '',
          target_audience: (found as any).targetAudience_sv || (found as any).targetAudience || '',
          scene_breakdown: JSON.stringify((found as any).sceneBreakdown, null, 2),
        });
      }
    }
    setLoading(false);
  }, [conceptId]);

  const handleSave = async () => {
    setSaving(true);
    
    // TODO: Save to database
    // For now, just show saved state
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Laddar...</div>;
  }

  if (!concept) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: '#1a1a2e', marginBottom: '16px' }}>Concept hittades inte</h2>
        <a href="/studio/concepts" style={{ color: '#4f46e5' }}>← Tillbaka till concepts</a>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <a href="/studio/concepts" style={{ color: '#6b7280', fontSize: '14px', textDecoration: 'none' }}>
            ← Tillbaka till concepts
          </a>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a2e', marginTop: '4px' }}>
            Redigera Concept
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {saved && (
            <span style={{ color: '#10b981', fontWeight: 500 }}>
              ✓ Sparat!
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: saving ? '#9ca3af' : '#4f46e5',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 500,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Sparar...' : 'Spara ändringar'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Left: Edit Form */}
        <div>
          {/* Basic Info */}
          <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#1a1a2e' }}>Grundläggande info</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                Svensk rubrik
              </label>
              <input
                type="text"
                value={formData.headline_sv}
                onChange={(e) => setFormData({ ...formData, headline_sv: e.target.value })}
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Svårighet
                </label>
                <select
                  value={formData.difficulty}
                  onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Trend-nivå (1-5)
                </label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={formData.trend_level}
                  onChange={(e) => setFormData({ ...formData, trend_level: parseInt(e.target.value) })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Land
                </label>
                <input
                  type="text"
                  value={formData.origin_country}
                  onChange={(e) => setFormData({ ...formData, origin_country: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Film-tid
                </label>
                <input
                  type="text"
                  value={formData.film_time}
                  onChange={(e) => setFormData({ ...formData, film_time: e.target.value })}
                  style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px' }}
                />
              </div>
            </div>
          </div>

          {/* Text Content */}
          <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#1a1a2e' }}>Text-innehåll</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                Varför det funkar
              </label>
              <textarea
                value={formData.why_it_works}
                onChange={(e) => setFormData({ ...formData, why_it_works: e.target.value })}
                rows={4}
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', resize: 'vertical' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                Målgrupp
              </label>
              <textarea
                value={formData.target_audience}
                onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
                rows={3}
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                Scene breakdown (JSON)
              </label>
              <textarea
                value={formData.scene_breakdown}
                onChange={(e) => setFormData({ ...formData, scene_breakdown: e.target.value })}
                rows={8}
                style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace', resize: 'vertical' }}
              />
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div>
          <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', position: 'sticky', top: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: '#1a1a2e' }}>Förhandsvisning</h3>
            
            {/* Video Preview */}
            <div style={{ 
              background: '#f3f4f6', 
              borderRadius: '12px', 
              height: '200px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              marginBottom: '16px'
            }}>
              <span style={{ fontSize: '48px' }}>▶️</span>
            </div>

            {/* Info */}
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '18px', fontWeight: 600, color: '#1a1a2e', marginBottom: '8px' }}>
                {formData.headline_sv || '(Ingen rubrik)'}
              </h4>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                  {formData.difficulty}
                </span>
                <span style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                  {formData.origin_country}
                </span>
                <span style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                  {formData.film_time}
                </span>
              </div>
            </div>

            {/* Match Score */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                <span style={{ color: '#6b7280' }}>Matchning</span>
                <span style={{ fontWeight: 600, color: '#1a1a2e' }}>{concept.matchPercentage}%</span>
              </div>
              <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '4px' }}>
                <div 
                  style={{ 
                    width: `${concept.matchPercentage}%`, 
                    height: '100%', 
                    background: '#10b981',
                    borderRadius: '4px'
                  }} 
                />
              </div>
            </div>

            {/* Why it works preview */}
            {formData.why_it_works && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Varför det funkar</div>
                <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: 1.5 }}>{formData.why_it_works}</p>
              </div>
            )}

            {/* Original URL */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
              <a 
                href={(concept as any).url || concept.sourceUrl}
                target="_blank" 
                rel="noopener noreferrer"
                style={{ color: '#4f46e5', fontSize: '14px', textDecoration: 'none' }}
              >
                Visa original på TikTok →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
