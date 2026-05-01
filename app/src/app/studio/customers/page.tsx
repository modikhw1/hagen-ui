'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getStudioCustomerStatusMeta } from '@/lib/studio/customer-status';
import { buildStudioWorkspaceHref } from '@/lib/studio/navigation';
import type { StudioCustomerListItem } from '@/types/studio-v2';

type CustomerStatusFilter = 'all' | StudioCustomerListItem['status'];

const CUSTOMER_STATUS_FILTERS: CustomerStatusFilter[] = [
  'all',
  'active',
  'agreed',
  'invited',
  'pending',
  'archived',
];

export default function StudioCustomersPage() {
  const [customers, setCustomers] = useState<StudioCustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CustomerStatusFilter>('all');
  const [cmFilter, setCmFilter] = useState<string>('all');

  useEffect(() => {
    void fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/studio-v2/customers');
      const payload = (await response.json().catch(() => null)) as
        | { customers?: StudioCustomerListItem[]; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || 'Kunde inte ladda kunder');
      }

      setCustomers(Array.isArray(payload?.customers) ? payload.customers : []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers
    .filter((customer) =>
      (filter === 'all' || customer.status === filter) &&
      (cmFilter === 'all' || customer.account_manager === cmFilter),
    )
    .sort((a, b) => {
      const sa = a.concept_stats;
      const sb = b.concept_stats;

      if (sa.draft > 0 && sb.draft === 0) return -1;
      if (sb.draft > 0 && sa.draft === 0) return 1;
      if (sa.draft > 0 && sb.draft > 0) return sb.draft - sa.draft;

      if (sa.sent > 0 && sb.sent === 0) return -1;
      if (sb.sent > 0 && sa.sent === 0) return 1;
      if (sa.sent > 0 && sb.sent > 0) return sb.sent - sa.sent;

      return a.business_name.localeCompare(b.business_name, 'sv');
    });

  const accountManagers = [
    'all',
    ...Array.from(
      new Set(
        customers
          .map((customer) => customer.account_manager?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((a, b) => a.localeCompare(b, 'sv')),
  ];

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Laddar kunder...</div>;
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '24px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>
            Kundarbete
          </h1>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: '14px',
              color: '#6b7280',
              maxWidth: '720px',
            }}
          >
            Oppna ratt kundarbetsyta och hoppa direkt till Game Plan, konceptarbete,
            feedplan eller kommunikation.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link href="/studio/concepts" style={headerActionStyle(false)}>
            Konceptbibliotek
          </Link>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        {CUSTOMER_STATUS_FILTERS.map((status) => {
          const count =
            status === 'all'
              ? customers.length
              : customers.filter((customer) => customer.status === status).length;
          const statusMeta = status === 'all' ? null : getStudioCustomerStatusMeta(status);

          return (
            <button
              key={status}
              onClick={() => setFilter(status)}
              style={{
                background: filter === status ? statusMeta?.bg ?? '#4f46e5' : '#fff',
                color: filter === status ? statusMeta?.text ?? '#fff' : '#6b7280',
                border:
                  filter === status
                    ? `1px solid ${statusMeta?.border ?? '#4f46e5'}`
                    : '1px solid #e5e7eb',
                padding: '12px 16px',
                borderRadius: '10px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: '24px', fontWeight: 700 }}>{count}</div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                {status === 'all' ? 'Totalt' : statusMeta?.label}
              </div>
            </button>
          );
        })}
      </div>

      <div
        style={{
          marginBottom: '24px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: '14px', color: '#6b7280', marginRight: '8px' }}>
          Filtrera pa CM:
        </span>
        {accountManagers.map((cm) => (
          <button
            key={cm}
            onClick={() => setCmFilter(cm)}
            style={{
              background: cmFilter === cm ? '#1a1a2e' : '#fff',
              color: cmFilter === cm ? '#fff' : '#6b7280',
              border: cmFilter === cm ? 'none' : '1px solid #e5e7eb',
              padding: '8px 14px',
              borderRadius: '999px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {cm === 'all' ? 'Alla' : cm}
          </button>
        ))}
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: '14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'minmax(240px, 2fr) minmax(150px, 1fr) minmax(140px, 1fr) minmax(110px, 0.8fr) minmax(220px, 1.5fr)',
            gap: '16px',
            padding: '12px 20px',
            background: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            fontSize: '12px',
            fontWeight: 600,
            color: '#6b7280',
            textTransform: 'uppercase',
          }}
        >
          <div>Foretag</div>
          <div>Kontakt</div>
          <div>Account Manager</div>
          <div>Status</div>
          <div>Arbetsyta</div>
        </div>

        {filteredCustomers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            Inga kunder hittades
          </div>
        ) : (
          filteredCustomers.map((customer, index) => {
            const statusMeta = getStudioCustomerStatusMeta(customer.status);
            const stats = customer.concept_stats;
            const tiktokSummary = customer.tiktok_summary;

            return (
              <div
                key={customer.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'minmax(240px, 2fr) minmax(150px, 1fr) minmax(140px, 1fr) minmax(110px, 0.8fr) minmax(220px, 1.5fr)',
                  gap: '16px',
                  padding: '16px 20px',
                  borderBottom:
                    index < filteredCustomers.length - 1 ? '1px solid #f3f4f6' : 'none',
                  alignItems: 'center',
                  background: index % 2 === 0 ? '#fff' : '#fafafa',
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      color: '#1a1a2e',
                      marginBottom: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {customer.business_name}
                    {customer.active_signal_count > 0 ? (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#92400e',
                          background: '#fef3c7',
                          border: '1px solid #f59e0b',
                          borderRadius: '999px',
                          padding: '1px 6px',
                          lineHeight: 1.4,
                          flexShrink: 0,
                        }}
                      >
                        {customer.active_signal_count} nya klipp
                      </span>
                    ) : null}
                  </div>
                  {customer.game_plan?.title ? (
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      {customer.game_plan.title}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      {(customer.monthly_price ?? 0) > 0
                        ? `${customer.monthly_price} kr/man`
                        : 'Pris ej satt'}
                    </div>
                  )}
                  {customer.status !== 'archived' &&
                    (!customer.tiktok_handle ? (
                      <div style={{ fontSize: '11px', color: '#b45309', marginTop: '3px' }}>
                        ! Profil saknas
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px' }}>
                        @{customer.tiktok_handle} · {formatSyncRecency(customer.last_history_sync_at)}
                        {tiktokSummary
                          ? ` · ${tiktokSummary.followers.toLocaleString('sv-SE')} foljare · ${tiktokSummary.total_videos} videor`
                          : ''}
                      </div>
                    ))}
                  <ConceptStatBadges stats={stats} />
                </div>

                <div>
                  <div style={{ fontSize: '14px', color: '#374151' }}>
                    {customer.contact_email}
                  </div>
                  {customer.customer_contact_name && (
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      {customer.customer_contact_name}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '3px' }}>
                    {formatLastEmail(customer.last_email_at ?? undefined)}
                  </div>
                </div>

                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {customer.account_manager || '-'}
                </div>

                <div>
                  <span
                    style={{
                      background: statusMeta.bg,
                      color: statusMeta.text,
                      border: `1px solid ${statusMeta.border}`,
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'inline-block',
                    }}
                  >
                    {statusMeta.label}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <WorkspaceLink
                    href={buildStudioWorkspaceHref(customer.id, 'gameplan')}
                    label="Game Plan"
                  />
                  <WorkspaceLink
                    href={buildStudioWorkspaceHref(customer.id, 'feed')}
                    label="Feedplan"
                  />
                  <WorkspaceLink
                    href={buildStudioWorkspaceHref(customer.id, 'kommunikation')}
                    label="Kommunikation"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ConceptStatBadges({
  stats,
}: {
  stats?: StudioCustomerListItem['concept_stats'];
}) {
  if (!stats) return null;
  const { draft, sent, produced } = stats;
  if (draft + sent + produced === 0) return null;

  return (
    <div style={{ display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap' }}>
      {draft > 0 && (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#92400e',
            background: '#fef3c7',
            border: '1px solid #fde68a',
            borderRadius: '999px',
            padding: '1px 7px',
          }}
        >
          {draft} utkast
        </span>
      )}
      {sent > 0 && (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#1e40af',
            background: '#dbeafe',
            border: '1px solid #bfdbfe',
            borderRadius: '999px',
            padding: '1px 7px',
          }}
        >
          {sent} skickad{sent > 1 ? 'e' : ''}
        </span>
      )}
      {produced > 0 && (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#166534',
            background: '#dcfce7',
            border: '1px solid #bbf7d0',
            borderRadius: '999px',
            padding: '1px 7px',
          }}
        >
          {produced} producerad{produced > 1 ? 'e' : ''}
        </span>
      )}
    </div>
  );
}

const MONTHS_SV = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function formatLastEmail(isoString: string | undefined): string {
  if (!isoString) return 'Ingen mailhistorik';
  const sent = new Date(isoString);
  const now = new Date();
  const daysDiff = Math.floor((now.getTime() - sent.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff === 0) return 'Senaste mail: idag';
  if (daysDiff === 1) return 'Senaste mail: igar';
  if (daysDiff < 14) return `Senaste mail: ${daysDiff} dagar sedan`;
  return `Senaste mail: ${sent.getDate()} ${MONTHS_SV[sent.getMonth()]}`;
}

function formatSyncRecency(isoString: string | null | undefined): string {
  if (!isoString) return 'Aldrig observerad';
  const synced = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - synced.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return 'Obs: just nu';
  if (diffH < 24) return `Obs: ${diffH}h sedan`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Obs: igar';
  if (diffD < 14) return `Obs: ${diffD}d sedan`;
  return `Obs: ${synced.getDate()} ${MONTHS_SV[synced.getMonth()]}`;
}

function WorkspaceLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        padding: '8px 12px',
        borderRadius: '999px',
        textDecoration: 'none',
        fontSize: '12px',
        fontWeight: 600,
        color: '#4f46e5',
        background: '#eef2ff',
      }}
    >
      {label}
    </Link>
  );
}

function headerActionStyle(primary: boolean) {
  return {
    padding: '10px 14px',
    borderRadius: '10px',
    textDecoration: 'none',
    fontSize: '13px',
    fontWeight: 600,
    color: primary ? '#fff' : '#1a1a2e',
    background: primary ? '#4f46e5' : '#fff',
    border: primary ? 'none' : '1px solid #e5e7eb',
  } as const;
}
