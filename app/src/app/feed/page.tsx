'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface FeedSlot {
  id: string;
  customer_concept_id: string;
  feed_order: number;
  headline_sv: string | null;
  description_sv: string | null;
  status: string;
  match_percentage: number;
  source_url: string | null;
  tiktok_url: string | null;
  sent_at: string | null;
  produced_at: string | null;
  cm_note: string | null;
}

const STATUS_LABEL: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: 'Planerad', bg: '#dbeafe', text: '#1d4ed8' },
  sent: { label: 'Skickad', bg: '#fef3c7', text: '#b45309' },
  produced: { label: 'Filmad', bg: '#d1fae5', text: '#065f46' },
  archived: { label: 'Arkiverad', bg: '#f3f4f6', text: '#6b7280' },
};

export default function CustomerFeedPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [slots, setSlots] = useState<FeedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    fetch('/api/customer/feed')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => setSlots((data.slots ?? []) as FeedSlot[]))
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [user]);

  const currentSlot = slots.find(s => s.feed_order === 0);
  const futureSlots = slots.filter(s => s.feed_order > 0).sort((a, b) => a.feed_order - b.feed_order);
  const historySlots = slots.filter(s => s.feed_order < 0).sort((a, b) => b.feed_order - a.feed_order);

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <p style={{ color: '#6b7280' }}>Laddar din plan...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <p style={{ color: '#ef4444' }}>Kunde inte ladda planen: {error}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <button
          onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '14px', marginBottom: '12px', padding: 0 }}
        >
          ← Tillbaka
        </button>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Min plan</h1>
        <p style={{ color: '#6b7280', marginTop: '6px', fontSize: '14px' }}>
          Din TikTok-kalender — planerade och producerade videokoncept
        </p>
      </div>

      {slots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 24px', color: '#9ca3af' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📅</div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' }}>
            Ingen plan ännu
          </div>
          <div style={{ fontSize: '14px' }}>
            Din content manager håller på att planera ditt innehåll.
          </div>
        </div>
      ) : (
        <>
          {/* Current concept */}
          {currentSlot && (
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#374151', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nu</h2>
              <SlotCard slot={currentSlot} highlight />
            </div>
          )}

          {/* Upcoming */}
          {futureSlots.length > 0 && (
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#374151', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kommande</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {futureSlots.map(slot => <SlotCard key={slot.id} slot={slot} />)}
              </div>
            </div>
          )}

          {/* History */}
          {historySlots.length > 0 && (
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#374151', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Historik</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {historySlots.map(slot => <SlotCard key={slot.id} slot={slot} dimmed />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SlotCard({ slot, highlight = false, dimmed = false }: { slot: FeedSlot; highlight?: boolean; dimmed?: boolean }) {
  const status = STATUS_LABEL[slot.status] ?? { label: slot.status, bg: '#f3f4f6', text: '#6b7280' };

  return (
    <div style={{
      background: highlight ? '#faf5ff' : '#fff',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: highlight ? '0 0 0 2px #8b5cf6, 0 4px 12px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.1)',
      opacity: dimmed ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a2e', margin: 0, lineHeight: 1.4 }}>
          {slot.headline_sv ?? 'Koncept'}
        </h3>
        <span style={{ background: status.bg, color: status.text, padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, flexShrink: 0, marginLeft: '12px' }}>
          {status.label}
        </span>
      </div>

      {slot.description_sv && (
        <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: 1.5, margin: '0 0 12px' }}>
          {slot.description_sv}
        </p>
      )}

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: '#9ca3af' }}>
        {slot.produced_at && (
          <span>Filmad {new Date(slot.produced_at).toLocaleDateString('sv-SE')}</span>
        )}
        {slot.sent_at && !slot.produced_at && (
          <span>Skickad {new Date(slot.sent_at).toLocaleDateString('sv-SE')}</span>
        )}
        {slot.tiktok_url && (
          <a href={slot.tiktok_url} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', textDecoration: 'none' }}>
            Se på TikTok →
          </a>
        )}
      </div>

      {slot.cm_note && (
        <div style={{ marginTop: '12px', background: '#fffbeb', borderRadius: '8px', padding: '10px 12px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', margin: '0 0 2px' }}>Notering från CM</p>
          <p style={{ fontSize: '13px', color: '#78350f', margin: 0, lineHeight: 1.5 }}>{slot.cm_note}</p>
        </div>
      )}
    </div>
  );
}
