'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { buildStudioWorkspaceHref } from '@/lib/studio/navigation';
import type { StudioCustomerListItem } from '@/types/studio-v2';

type CustomerWithStats = StudioCustomerListItem & {
  stats: StudioCustomerListItem['concept_stats'];
};

interface CmWorkloadRow {
  name: string;
  draftCustomers: number;
  totalDrafts: number;
  sentCustomers: number;
  totalSent: number;
}

export default function StudioDashboard() {
  const { user, profile } = useAuth();
  const [customers, setCustomers] = useState<StudioCustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      try {
        const response = await fetch('/api/studio-v2/customers');
        const payload = (await response.json().catch(() => null)) as
          | { customers?: StudioCustomerListItem[]; error?: string }
          | null;

        if (!response.ok) {
          throw new Error(payload?.error || 'Kunde inte ladda dashboard');
        }

        if (!cancelled) {
          setCustomers(Array.isArray(payload?.customers) ? payload.customers : []);
        }
      } catch (error) {
        console.error('Error loading studio dashboard:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeCustomers = customers.filter((customer) =>
    customer.status === 'active' || customer.status === 'agreed',
  );
  const orgWideWithDrafts: CustomerWithStats[] = activeCustomers
    .filter((customer) => customer.concept_stats.draft > 0)
    .map((customer) => ({ ...customer, stats: customer.concept_stats }))
    .sort((a, b) => b.stats.draft - a.stats.draft);
  const orgWideWithSent: CustomerWithStats[] = activeCustomers
    .filter((customer) => customer.concept_stats.sent > 0)
    .map((customer) => ({ ...customer, stats: customer.concept_stats }));

  const displayName = profile?.email?.split('@')[0] ?? 'Studio';
  const isAdmin = Boolean(
    profile?.is_admin || (profile as { role?: string } | null)?.role === 'admin',
  );
  const isContentManager = !isAdmin && (profile as { role?: string } | null)?.role === 'content_manager';

  const actionableCustomersHaveAssignmentIds = [...orgWideWithDrafts, ...orgWideWithSent].every(
    (customer) => Boolean(customer.account_manager_profile_id),
  );
  const canScopeToAssignedCustomers = Boolean(
    isContentManager && user?.id && actionableCustomersHaveAssignmentIds,
  );

  const withDrafts = canScopeToAssignedCustomers
    ? orgWideWithDrafts.filter((customer) => customer.account_manager_profile_id === user?.id)
    : orgWideWithDrafts;
  const withSent = canScopeToAssignedCustomers
    ? orgWideWithSent.filter((customer) => customer.account_manager_profile_id === user?.id)
    : orgWideWithSent;

  const actionListHeading = canScopeToAssignedCustomers
    ? 'Dina kunder - vantar pa atgard'
    : 'Vantar pa atgard';
  const actionListMeta = canScopeToAssignedCustomers
    ? 'Visar kunder som ar tilldelade till dig via account manager-ID.'
    : null;
  const showAssignmentFallbackNote = Boolean(
    isContentManager &&
      !canScopeToAssignedCustomers &&
      !actionableCustomersHaveAssignmentIds &&
      (orgWideWithDrafts.length > 0 || orgWideWithSent.length > 0),
  );
  const assignmentFallbackNote =
    'Visar hela oversikten just nu eftersom tilldelning inte ar entydig for alla kunder i listan.';
  const sentListHeading = canScopeToAssignedCustomers
    ? 'Dina skickade - vantar pa produktion'
    : 'Skickade - vantar pa produktion';
  const emptyStateText = canScopeToAssignedCustomers
    ? 'Inga av dina tilldelade kunder har koncept som vantar pa atgard just nu.'
    : 'Inga koncept vantar pa atgard just nu.';

  const cmWorkload: CmWorkloadRow[] = isAdmin
    ? (() => {
        const map: Record<string, CmWorkloadRow> = {};
        for (const customer of customers) {
          const cm = customer.account_manager?.trim() || '(Ingen CM)';
          if (!map[cm]) {
            map[cm] = {
              name: cm,
              draftCustomers: 0,
              totalDrafts: 0,
              sentCustomers: 0,
              totalSent: 0,
            };
          }
          const stats = customer.concept_stats;
          if (stats.draft > 0) {
            map[cm].draftCustomers += 1;
            map[cm].totalDrafts += stats.draft;
          }
          if (stats.sent > 0) {
            map[cm].sentCustomers += 1;
            map[cm].totalSent += stats.sent;
          }
        }
        return Object.values(map).sort(
          (a, b) => b.totalDrafts - a.totalDrafts || b.totalSent - a.totalSent,
        );
      })()
    : [];

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
        Laddar...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>
          Hej, {displayName}
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: '#6b7280' }}>
          Har ar en snabb oversikt. Oppna en kund for att fortsatta arbetet.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 14, marginBottom: 36, flexWrap: 'wrap' }}>
        <SummaryCard
          value={orgWideWithDrafts.length}
          label="kunder med utkast"
          accent="#b45309"
          bg="#fef3c7"
          border="#fde68a"
          href="/studio/customers"
        />
        <SummaryCard
          value={orgWideWithSent.length}
          label="kunder med skickade"
          accent="#1e40af"
          bg="#dbeafe"
          border="#bfdbfe"
          href="/studio/customers"
        />
        <SummaryCard
          value={activeCustomers.length}
          label="aktiva kunder"
          accent="#374151"
          bg="#f3f4f6"
          border="#e5e7eb"
          href="/studio/customers"
        />
      </div>

      {isAdmin && cmWorkload.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 12,
            }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>
              Teamoversikt
            </h2>
            <Link
              href="/studio/customers"
              style={{ fontSize: 13, color: '#4f46e5', textDecoration: 'none', fontWeight: 500 }}
            >
              Se alla kunder →
            </Link>
          </div>
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: '16px',
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
              <div style={{ textAlign: 'right' }}>Utkast</div>
              <div style={{ textAlign: 'right' }}>Skickade</div>
            </div>
            {cmWorkload.map((row, index) => (
              <div
                key={row.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: '16px',
                  padding: '12px 20px',
                  alignItems: 'center',
                  borderBottom: index < cmWorkload.length - 1 ? '1px solid #f3f4f6' : 'none',
                }}
              >
                <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: 14 }}>{row.name}</div>
                <div style={{ textAlign: 'right' }}>
                  {row.draftCustomers > 0 ? (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#92400e',
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        borderRadius: 999,
                        padding: '2px 8px',
                      }}
                    >
                      {row.totalDrafts} ({row.draftCustomers} kunder)
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>-</span>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  {row.sentCustomers > 0 ? (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#1e40af',
                        background: '#dbeafe',
                        border: '1px solid #bfdbfe',
                        borderRadius: 999,
                        padding: '2px 8px',
                      }}
                    >
                      {row.totalSent} ({row.sentCustomers} kunder)
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>-</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {withDrafts.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 12,
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>
                {actionListHeading}
              </h2>
              {actionListMeta && (
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{actionListMeta}</div>
              )}
              {showAssignmentFallbackNote && (
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.5 }}>
                  {assignmentFallbackNote}
                </div>
              )}
            </div>
            <Link
              href="/studio/customers"
              style={{ fontSize: 13, color: '#4f46e5', textDecoration: 'none', fontWeight: 500 }}
            >
              Se alla kunder →
            </Link>
          </div>

          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}
          >
            {withDrafts.slice(0, 6).map((customer, index) => (
              <div
                key={customer.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 20px',
                  gap: 16,
                  borderBottom:
                    index < Math.min(withDrafts.length, 6) - 1 ? '1px solid #f3f4f6' : 'none',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: 14 }}>
                    {customer.business_name}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#92400e',
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        borderRadius: 999,
                        padding: '1px 7px',
                      }}
                    >
                      {customer.stats.draft} utkast
                    </span>
                    {customer.stats.sent > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#1e40af',
                          background: '#dbeafe',
                          border: '1px solid #bfdbfe',
                          borderRadius: 999,
                          padding: '1px 7px',
                        }}
                      >
                        {customer.stats.sent} skickad{customer.stats.sent > 1 ? 'e' : ''}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                    {formatLastEmail(customer.last_email_at ?? undefined)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <ActionLink
                    href={buildStudioWorkspaceHref(customer.id, 'koncept')}
                    label="Koncept"
                    primary
                  />
                  <ActionLink
                    href={buildStudioWorkspaceHref(customer.id, 'kommunikation')}
                    label="Kommunikation"
                    primary={false}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {withSent.length > 0 && withDrafts.length === 0 && (
        <section style={{ marginBottom: 36 }}>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>
              {sentListHeading}
            </h2>
            {showAssignmentFallbackNote && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, lineHeight: 1.5 }}>
                {assignmentFallbackNote}
              </div>
            )}
          </div>
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}
          >
            {withSent.slice(0, 4).map((customer, index) => (
              <div
                key={customer.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 20px',
                  gap: 16,
                  borderBottom:
                    index < Math.min(withSent.length, 4) - 1 ? '1px solid #f3f4f6' : 'none',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: 14 }}>
                    {customer.business_name}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      marginTop: 4,
                      display: 'inline-block',
                      color: '#1e40af',
                      background: '#dbeafe',
                      border: '1px solid #bfdbfe',
                      borderRadius: 999,
                      padding: '1px 7px',
                    }}
                  >
                    {customer.stats.sent} skickad{customer.stats.sent > 1 ? 'e' : ''}
                  </span>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                    {formatLastEmail(customer.last_email_at ?? undefined)}
                  </div>
                </div>
                <ActionLink
                  href={buildStudioWorkspaceHref(customer.id, 'feed')}
                  label="Feedplan"
                  primary={false}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {withDrafts.length === 0 && withSent.length === 0 && (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: '32px 24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 12 }}>{emptyStateText}</div>
          <Link
            href="/studio/customers"
            style={{
              display: 'inline-block',
              padding: '9px 18px',
              borderRadius: 999,
              background: '#4f46e5',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Oppna kundlistan
          </Link>
        </div>
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

function SummaryCard({
  value,
  label,
  accent,
  bg,
  border,
  href,
}: {
  value: number;
  label: string;
  accent: string;
  bg: string;
  border: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        textDecoration: 'none',
        flex: '1 1 140px',
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 12,
        padding: '16px 20px',
      }}
    >
      <div style={{ fontSize: 32, fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, color: accent, marginTop: 4, opacity: 0.85 }}>{label}</div>
    </Link>
  );
}

function ActionLink({ href, label, primary }: { href: string; label: string; primary: boolean }) {
  return (
    <Link
      href={href}
      style={{
        padding: '7px 12px',
        borderRadius: 999,
        textDecoration: 'none',
        fontSize: 12,
        fontWeight: 600,
        color: primary ? '#fff' : '#4f46e5',
        background: primary ? '#4f46e5' : '#eef2ff',
      }}
    >
      {label}
    </Link>
  );
}
