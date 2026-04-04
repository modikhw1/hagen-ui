'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { LeTrendColors, LeTrendRadius } from '@/styles/letrend-design-system';

interface CustomerStatusCounts {
  active: number;
  agreed: number;
  invited: number;
  pending: number;
  archived: number;
}

interface ConceptTotals {
  draft: number;
  sent: number;
  produced: number;
  archived: number;
}

interface CmWorkloadRow {
  name: string;
  customers: number;
  drafts: number;
  sent: number;
}

interface SubscriptionSummary {
  active: number;
  paused: number;
  cancelled: number;
  mrr: number;
}

export default function AdminOverviewPage() {
  const [statusCounts, setStatusCounts] = useState<CustomerStatusCounts>({ active: 0, agreed: 0, invited: 0, pending: 0, archived: 0 });
  const [conceptTotals, setConceptTotals] = useState<ConceptTotals>({ draft: 0, sent: 0, produced: 0, archived: 0 });
  const [cmWorkload, setCmWorkload] = useState<CmWorkloadRow[]>([]);
  const [subscriptionSummary, setSubscriptionSummary] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      fetchCustomerStats(),
      fetchConceptTotals(),
      fetchSubscriptionSummary(),
    ]).finally(() => setLoading(false));
  }, []);

  const fetchCustomerStats = async () => {
    const [customersResult, conceptsResult] = await Promise.all([
      supabase
        .from('customer_profiles')
        .select('id, status, account_manager'),
      supabase
        .from('customer_concepts')
        .select('customer_profile_id, status'),
    ]);

    const customers = customersResult.data ?? [];
    const concepts = conceptsResult.data ?? [];

    // Status distribution
    const counts: CustomerStatusCounts = { active: 0, agreed: 0, invited: 0, pending: 0, archived: 0 };
    for (const c of customers) {
      const s = c.status as string;
      if (s === 'active') counts.active++;
      else if (s === 'agreed') counts.agreed++;
      else if (s === 'invited') counts.invited++;
      else if (s === 'pending') counts.pending++;
      else if (s === 'archived') counts.archived++;
    }
    setStatusCounts(counts);

    // CM workload
    const conceptsByCustomer: Record<string, { draft: number; sent: number }> = {};
    for (const concept of concepts) {
      const id = concept.customer_profile_id as string;
      if (!conceptsByCustomer[id]) conceptsByCustomer[id] = { draft: 0, sent: 0 };
      const s = concept.status as string;
      if (s === 'draft' || s === 'active') conceptsByCustomer[id].draft++;
      else if (s === 'sent' || s === 'paused') conceptsByCustomer[id].sent++;
    }

    const cmMap: Record<string, CmWorkloadRow> = {};
    for (const c of customers) {
      if ((c.status as string) === 'archived') continue;
      const cm = (c.account_manager as string | null)?.trim() || '(Ingen CM)';
      if (!cmMap[cm]) cmMap[cm] = { name: cm, customers: 0, drafts: 0, sent: 0 };
      cmMap[cm].customers++;
      const cc = conceptsByCustomer[c.id];
      if (cc) {
        cmMap[cm].drafts += cc.draft;
        cmMap[cm].sent += cc.sent;
      }
    }
    setCmWorkload(
      Object.values(cmMap).sort((a, b) => b.customers - a.customers || a.name.localeCompare(b.name, 'sv'))
    );
  };

  const fetchConceptTotals = async () => {
    const { data } = await supabase
      .from('customer_concepts')
      .select('status');
    if (!data) return;
    const totals: ConceptTotals = { draft: 0, sent: 0, produced: 0, archived: 0 };
    for (const row of data) {
      const s = row.status as string;
      if (s === 'draft' || s === 'active') totals.draft++;
      else if (s === 'sent' || s === 'paused') totals.sent++;
      else if (s === 'produced' || s === 'completed') totals.produced++;
      else if (s === 'archived') totals.archived++;
    }
    setConceptTotals(totals);
  };

  const fetchSubscriptionSummary = async () => {
    const { data } = await supabase
      .from('subscriptions')
      .select('status, amount');
    if (!data) return;
    const summary: SubscriptionSummary = { active: 0, paused: 0, cancelled: 0, mrr: 0 };
    for (const row of data) {
      const s = row.status as string;
      const amt = typeof row.amount === 'number' ? row.amount : 0;
      if (s === 'active') {
        summary.active++;
        summary.mrr += amt;
      } else if (s === 'paused' || s === 'past_due') {
        summary.paused++;
      } else if (s === 'canceled' || s === 'cancelled') {
        summary.cancelled++;
      }
    }
    setSubscriptionSummary(summary);
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: LeTrendColors.textMuted }}>
        Laddar...
      </div>
    );
  }

  const activeTotal = statusCounts.active + statusCounts.agreed;
  const pipelineTotal = statusCounts.invited + statusCounts.pending;

  return (
    <div style={{ maxWidth: 960 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>
          Org-översikt
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: '#6b7280' }}>
          Operativt tillstånd och nyckeltal för LeTrend.
        </p>
      </div>

      {/* Customer status distribution */}
      <section style={{ marginBottom: 36 }}>
        <SectionHeader title="Kundstatus" linkHref="/admin/customers" linkLabel="Hantera kunder →" />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatTile value={activeTotal} label="aktiva / avtalade" accent="#166534" bg="#dcfce7" border="#bbf7d0" />
          <StatTile value={pipelineTotal} label="i pipeline" accent="#92400e" bg="#fef3c7" border="#fde68a" />
          <StatTile value={statusCounts.invited} label="inbjudna" accent="#1e40af" bg="#dbeafe" border="#bfdbfe" />
          <StatTile value={statusCounts.pending} label="väntande" accent="#6b7280" bg="#f3f4f6" border="#e5e7eb" />
          <StatTile value={statusCounts.archived} label="arkiverade" accent="#9ca3af" bg="#f9fafb" border="#f3f4f6" />
        </div>
      </section>

      {/* Concept throughput */}
      <section style={{ marginBottom: 36 }}>
        <SectionHeader title="Konceptgenomströmning" linkHref="/admin/customers" linkLabel="Öppna kundlista →" />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatTile value={conceptTotals.draft} label="utkast (ej skickade)" accent="#92400e" bg="#fef3c7" border="#fde68a" />
          <StatTile value={conceptTotals.sent} label="skickade (ej producerade)" accent="#1e40af" bg="#dbeafe" border="#bfdbfe" />
          <StatTile value={conceptTotals.produced} label="producerade" accent="#166534" bg="#dcfce7" border="#bbf7d0" />
          <StatTile value={conceptTotals.archived} label="arkiverade" accent="#9ca3af" bg="#f9fafb" border="#f3f4f6" />
        </div>
      </section>

      {/* CM workload */}
      {cmWorkload.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <SectionHeader title="CM-belastning" linkHref="/admin/team" linkLabel="Hantera team →" />
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto',
                gap: 16,
                padding: '8px 20px',
                background: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                fontSize: 11,
                fontWeight: 600,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              <div>Content Manager</div>
              <div style={{ textAlign: 'right' }}>Kunder</div>
              <div style={{ textAlign: 'right' }}>Utkast</div>
              <div style={{ textAlign: 'right' }}>Skickade</div>
            </div>
            {cmWorkload.map((row, i) => (
              <div
                key={row.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto auto',
                  gap: 16,
                  padding: '12px 20px',
                  alignItems: 'center',
                  borderBottom: i < cmWorkload.length - 1 ? '1px solid #f3f4f6' : 'none',
                }}
              >
                <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: 14 }}>{row.name}</div>
                <div style={{ textAlign: 'right', fontSize: 13, color: '#374151', fontWeight: 600 }}>{row.customers}</div>
                <div style={{ textAlign: 'right' }}>
                  {row.drafts > 0 ? (
                    <Badge value={row.drafts} accent="#92400e" bg="#fef3c7" border="#fde68a" />
                  ) : (
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>-</span>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {row.sent > 0 ? (
                    <Badge value={row.sent} accent="#1e40af" bg="#dbeafe" border="#bfdbfe" />
                  ) : (
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>-</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Revenue / subscription summary */}
      {subscriptionSummary !== null && (
        <section style={{ marginBottom: 36 }}>
          <SectionHeader title="Abonnemang" linkHref="/admin/subscriptions" linkLabel="Alla abonnemang →" />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatTile value={subscriptionSummary.active} label="aktiva abonnemang" accent="#166534" bg="#dcfce7" border="#bbf7d0" />
            <StatTile value={subscriptionSummary.paused} label="pausade / förfallna" accent="#92400e" bg="#fef3c7" border="#fde68a" />
            <StatTile value={subscriptionSummary.cancelled} label="avslutade" accent="#9ca3af" bg="#f9fafb" border="#f3f4f6" />
            {subscriptionSummary.mrr > 0 && (
              <StatTile
                value={`${Math.round(subscriptionSummary.mrr / 100).toLocaleString('sv-SE')} kr`}
                label="MRR (aktiva)"
                accent="#374151"
                bg="#f3f4f6"
                border="#e5e7eb"
              />
            )}
          </div>
        </section>
      )}

      {/* Admin surface links */}
      <section>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
          Adminverktyg
        </h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { href: '/admin/customers', label: 'Kunder' },
            { href: '/admin/team', label: 'Team' },
            { href: '/admin/invoices', label: 'Fakturor' },
            { href: '/admin/subscriptions', label: 'Abonnemang' },
            { href: '/studio', label: 'Studio (CM-yta)' },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                padding: '9px 16px',
                borderRadius: LeTrendRadius.md,
                background: '#fff',
                border: '1px solid #e5e7eb',
                fontSize: 13,
                fontWeight: 500,
                color: '#374151',
                textDecoration: 'none',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ title, linkHref, linkLabel }: { title: string; linkHref: string; linkLabel: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>{title}</h2>
      <Link href={linkHref} style={{ fontSize: 13, color: '#4f46e5', textDecoration: 'none', fontWeight: 500 }}>
        {linkLabel}
      </Link>
    </div>
  );
}

function StatTile({
  value, label, accent, bg, border,
}: {
  value: number | string;
  label: string;
  accent: string;
  bg: string;
  border: string;
}) {
  return (
    <div
      style={{
        flex: '1 1 120px',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: '16px 20px',
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: accent, marginTop: 4, opacity: 0.8 }}>{label}</div>
    </div>
  );
}

function Badge({ value, accent, bg, border }: { value: number; accent: string; bg: string; border: string }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: accent,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 999,
        padding: '2px 8px',
      }}
    >
      {value}
    </span>
  );
}
