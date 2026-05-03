'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type Field = 'headline_sv' | 'description_sv' | 'whyItWorks_sv' | 'script_sv';
type Model = 'gemini' | 'hagen-finetuned';

interface Regeneration {
  id: string;
  model: string;
  output: string;
  output_chars: number;
  was_picked: boolean;
  created_at: string;
}

interface Props {
  conceptId: string;
  field: Field;
  currentValue: string;
  onPick: (text: string) => void;
}

const MODELS: Array<{ key: Model; label: string }> = [
  { key: 'gemini', label: 'Gemini' },
  { key: 'hagen-finetuned', label: 'Hagen-finetuned' },
];

export function RegenerateField({ conceptId, field, currentValue, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Model | null>(null);
  const [items, setItems] = useState<Regeneration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadHistory = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`/api/admin/concepts/${conceptId}/regenerations?field=${field}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await resp.json();
      if (resp.ok) setItems(data.regenerations || []);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  };

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) void loadHistory();
  };

  const handleRegenerate = async (model: Model) => {
    setBusy(model);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`/api/admin/concepts/${conceptId}/regenerate-field`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ field, model }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Misslyckades');
    } finally {
      setBusy(null);
    }
  };

  const handlePick = async (item: Regeneration) => {
    onPick(item.output);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`/api/admin/concepts/${conceptId}/regenerations/${item.id}/pick`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
    } catch {
      /* noop */
    }
  };

  const grouped: Record<Model, Regeneration[]> = { gemini: [], 'hagen-finetuned': [] };
  for (const item of items) {
    if (item.model in grouped) grouped[item.model as Model].push(item);
  }

  return (
    <div style={{ marginTop: 6 }}>
      <button
        type="button"
        onClick={handleToggle}
        style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
      >
        {open ? '▲ Dölj AI-förslag' : '✨ Generera om med AI'}
      </button>

      {open ? (
        <div style={{ marginTop: 8, padding: 12, borderRadius: 8, border: '1px solid #e0e7ff', background: '#f5f3ff' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {MODELS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => void handleRegenerate(m.key)}
                disabled={busy !== null}
                style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #c7d2fe', background: busy === m.key ? '#c7d2fe' : '#fff', color: '#4338ca', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer' }}
              >
                {busy === m.key ? '...' : `Generera (${m.label})`}
              </button>
            ))}
          </div>
          {error ? (
            <div style={{ marginBottom: 8, padding: '6px 8px', borderRadius: 6, background: '#fee2e2', color: '#991b1b', fontSize: 11 }}>
              {error}
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {MODELS.map((m) => (
              <div key={m.key}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>{m.label}</div>
                {grouped[m.key].length === 0 ? (
                  <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', padding: 8 }}>
                    {loaded ? 'Inga förslag än.' : 'Laddar…'}
                  </div>
                ) : (
                  grouped[m.key].slice(0, 3).map((item) => {
                    const isCurrent = item.output.trim() === currentValue.trim();
                    return (
                      <div
                        key={item.id}
                        style={{ marginBottom: 6, padding: 8, borderRadius: 6, border: `1px solid ${item.was_picked ? '#10b981' : '#e5e7eb'}`, background: '#fff' }}
                      >
                        <div style={{ fontSize: 12, color: '#111827', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 6 }}>
                          {item.output}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: '#9ca3af' }}>
                            {item.output_chars} tecken{item.was_picked ? ' · ✓ vald' : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handlePick(item)}
                            disabled={isCurrent}
                            style={{ border: 'none', background: 'none', color: isCurrent ? '#9ca3af' : '#4f46e5', fontSize: 11, fontWeight: 700, cursor: isCurrent ? 'default' : 'pointer', padding: 0 }}
                          >
                            {isCurrent ? 'Använd' : 'Använd →'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
