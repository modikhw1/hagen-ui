'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  colors,
  fontFamily,
  pageContainer,
  scrollContainer,
  buttonBase,
  sectionLabel,
} from '@/styles/mobile-design';

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

export default function MobileFeedPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [slots, setSlots] = useState<FeedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/m/login');
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
      <div style={{ ...pageContainer, background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: colors.textMuted, fontFamily }}>Laddar din plan...</p>
      </div>
    );
  }

  return (
    <div style={{ ...pageContainer, background: colors.bg }}>
      <div style={scrollContainer}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: colors.card,
          borderBottom: `1px solid ${colors.muted}`,
        }}>
          <button
            onClick={() => router.push('/m')}
            aria-label="Tillbaka"
            style={{ ...buttonBase, background: 'none', color: colors.text, fontSize: 15, fontWeight: 500, fontFamily, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span>←</span>
            <span>LeTrend</span>
          </button>
          <span style={{ fontSize: 15, fontWeight: 600, color: colors.text, fontFamily }}>Min plan</span>
          <div style={{ width: 60 }} />
        </div>

        <div style={{ padding: '24px 20px' }}>
          {error && (
            <div style={{ background: '#fee2e2', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
              <p style={{ color: '#991b1b', fontSize: 13, fontFamily, margin: 0 }}>Kunde inte ladda planen: {error}</p>
            </div>
          )}

          {slots.length === 0 && !error ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: colors.textMuted }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: colors.text, marginBottom: 8, fontFamily }}>
                Ingen plan ännu
              </div>
              <div style={{ fontSize: 13, fontFamily, lineHeight: 1.5 }}>
                Din content manager håller på att planera ditt innehåll.
              </div>
            </div>
          ) : (
            <>
              {/* Current */}
              {currentSlot && (
                <div style={{ marginBottom: 28 }}>
                  <p style={sectionLabel}>NU</p>
                  <SlotCard slot={currentSlot} highlight />
                </div>
              )}

              {/* Upcoming */}
              {futureSlots.length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <p style={sectionLabel}>KOMMANDE</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {futureSlots.map(s => <SlotCard key={s.id} slot={s} />)}
                  </div>
                </div>
              )}

              {/* History */}
              {historySlots.length > 0 && (
                <div>
                  <p style={sectionLabel}>HISTORIK</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {historySlots.map(s => <SlotCard key={s.id} slot={s} dimmed />)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SlotCard({ slot, highlight = false, dimmed = false }: { slot: FeedSlot; highlight?: boolean; dimmed?: boolean }) {
  const status = STATUS_LABEL[slot.status] ?? { label: slot.status, bg: '#f3f4f6', text: '#6b7280' };

  return (
    <div style={{
      background: highlight ? '#fdf4ff' : colors.card,
      borderRadius: 16,
      padding: 18,
      boxShadow: highlight ? `0 0 0 2px #c084fc, 0 4px 12px rgba(0,0,0,0.06)` : '0 1px 3px rgba(0,0,0,0.08)',
      opacity: dimmed ? 0.65 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: colors.text, margin: 0, fontFamily, lineHeight: 1.4, flex: 1, paddingRight: 8 }}>
          {slot.headline_sv ?? 'Koncept'}
        </p>
        <span style={{ background: status.bg, color: status.text, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
          {status.label}
        </span>
      </div>

      {slot.description_sv && (
        <p style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.5, margin: '0 0 10px', fontFamily }}>
          {slot.description_sv}
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: colors.textSubtle, fontFamily }}>
        {slot.produced_at && (
          <span>{new Date(slot.produced_at).toLocaleDateString('sv-SE')}</span>
        )}
        {slot.sent_at && !slot.produced_at && (
          <span>Skickad {new Date(slot.sent_at).toLocaleDateString('sv-SE')}</span>
        )}
        {slot.tiktok_url && (
          <a href={slot.tiktok_url} target="_blank" rel="noopener noreferrer"
             style={{ color: colors.primary, textDecoration: 'none', fontWeight: 500 }}>
            TikTok →
          </a>
        )}
      </div>

      {slot.cm_note && (
        <div style={{ marginTop: 12, background: '#fffbeb', borderRadius: 10, padding: '10px 12px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#92400e', margin: '0 0 2px', fontFamily }}>NOTERING FRÅN CM</p>
          <p style={{ fontSize: 13, color: '#78350f', margin: 0, fontFamily, lineHeight: 1.5 }}>{slot.cm_note}</p>
        </div>
      )}
    </div>
  );
}
