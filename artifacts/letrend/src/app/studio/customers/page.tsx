'use client';

import { Link } from 'wouter';
import { useEffect, useState } from 'react';
import { useAdminPageHeader } from '@/admin-ui';
import { useAuth } from '@/contexts/AuthContext';
import { getStudioCustomerStatusMeta, normalizeStudioCustomerStatus } from '@/lib/studio/customer-status';
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

const STATUS_LABELS: Record<string, string> = {
  all: 'Alla',
  active: 'Aktiva',
  agreed: 'Avtal',
  invited: 'Inbjudna',
  pending: 'Väntande',
  archived: 'Arkiverade',
};

type ExtendedCustomerListItem = StudioCustomerListItem & {
  account_manager_avatar_url?: string | null;
  account_manager_display_name?: string | null;
  account_manager_city?: string | null;
  last_email_at?: string | null;
  last_email_sent_at?: string | null;
  next_planned_at?: string | null;
};

export default function StudioCustomersPage() {
  useAdminPageHeader({ title: 'Kundarbete', eyebrow: 'LeTrend Studio' }, []);
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<ExtendedCustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<CustomerStatusFilter>('all');
  const [cmFilter, setCmFilter] = useState<string>('all');
  const [cityFilter, setCityFilter] = useState<string>('all');

  const isAdmin = Boolean(profile?.is_admin || profile?.role === 'admin');

  useEffect(() => {
    void fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/studio-v2/customers');
      const payload = (await response.json().catch(() => null)) as
        | { customers?: ExtendedCustomerListItem[]; error?: string }
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

  const cities = Array.from(
    new Set(
      customers
        .map((c) => (c as ExtendedCustomerListItem).account_manager_city?.trim())
        .filter((city): city is string => Boolean(city))
    )
  ).sort((a, b) => a.localeCompare(b, 'sv'));

  const filteredCustomers = customers
    .filter((customer) => {
      const ext = customer as ExtendedCustomerListItem;
      const cmKey = ext.account_manager_display_name?.trim() ?? customer.account_manager?.trim();
      const cmCity = ext.account_manager_city?.trim() ?? '';
      return (
        (statusFilter === 'all' || customer.status === statusFilter) &&
        (cmFilter === 'all' || cmKey === cmFilter) &&
        (cityFilter === 'all' || cmCity === cityFilter)
      );
    })
    .sort((a, b) => {
      const sa = a.concept_stats ?? { draft: 0, sent: 0, produced: 0 };
      const sb = b.concept_stats ?? { draft: 0, sent: 0, produced: 0 };

      if (sa.draft > 0 && sb.draft === 0) return -1;
      if (sb.draft > 0 && sa.draft === 0) return 1;
      if (sa.draft > 0 && sb.draft > 0) return sb.draft - sa.draft;

      if (sa.sent > 0 && sb.sent === 0) return -1;
      if (sb.sent > 0 && sa.sent === 0) return 1;
      if (sa.sent > 0 && sb.sent > 0) return sb.sent - sa.sent;

      return a.business_name.localeCompare(b.business_name, 'sv');
    });

  const accountManagers = Array.from(
    new Set(
      customers
        .map((customer) => {
          const c = customer as ExtendedCustomerListItem;
          return (c.account_manager_display_name?.trim() || c.account_manager?.trim());
        })
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => a.localeCompare(b, 'sv'));

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Laddar kunder...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>
          {isAdmin ? 'Alla kunder' : 'Mina kunder'}
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#6b7280' }}>
          {isAdmin
            ? 'Alla kunder i systemet. Klicka på en kund för att öppna arbetsytan.'
            : 'Kunder du är tilldelad. Klicka på en kund för att öppna arbetsytan.'}
        </p>
      </div>

      {/* Status filter chips */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {CUSTOMER_STATUS_FILTERS.map((status) => {
          const count =
            status === 'all'
              ? customers.length
              : customers.filter((c) => c.status === status).length;
          if (count === 0 && status !== 'all') return null;
          const statusMeta = status === 'all' ? null : getStudioCustomerStatusMeta(status);
          const isActive = statusFilter === status;

          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                background: isActive ? (statusMeta?.bg ?? '#1a1a2e') : '#fff',
                color: isActive ? (statusMeta?.text ?? '#fff') : '#6b7280',
                border: isActive
                  ? `1px solid ${statusMeta?.border ?? '#1a1a2e'}`
                  : '1px solid #e5e7eb',
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s',
              }}
            >
              {STATUS_LABELS[status] ?? status}
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  background: isActive ? 'rgba(255,255,255,0.25)' : '#f3f4f6',
                  color: isActive ? 'inherit' : '#6b7280',
                  padding: '1px 6px',
                  borderRadius: '999px',
                  minWidth: 20,
                  textAlign: 'center',
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* CM filter — admin only */}
      {isAdmin && accountManagers.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
          <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>CM:</span>
          <button
            onClick={() => setCmFilter('all')}
            style={{
              background: cmFilter === 'all' ? '#1a1a2e' : '#fff',
              color: cmFilter === 'all' ? '#fff' : '#6b7280',
              border: cmFilter === 'all' ? 'none' : '1px solid #e5e7eb',
              padding: '5px 12px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Alla
          </button>
          {accountManagers.map((cm) => {
            const matchingCustomer = customers.find((c) => {
              const ext = c as ExtendedCustomerListItem;
              return (ext.account_manager_display_name?.trim() || ext.account_manager?.trim()) === cm;
            });
            const avatarUrl = (matchingCustomer as ExtendedCustomerListItem)?.account_manager_avatar_url;
            return (
              <button
                key={cm}
                onClick={() => setCmFilter(cm)}
                style={{
                  background: cmFilter === cm ? '#1a1a2e' : '#fff',
                  color: cmFilter === cm ? '#fff' : '#6b7280',
                  border: cmFilter === cm ? 'none' : '1px solid #e5e7eb',
                  padding: '5px 12px 5px 6px',
                  borderRadius: '999px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <CmAvatar name={cm} avatarUrl={avatarUrl} size={20} />
                {cm}
              </button>
            );
          })}
        </div>
      )}

      {/* City filter — admin only, shown when CM city data is available */}
      {isAdmin && cities.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
          <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>Stad:</span>
          <button
            onClick={() => setCityFilter('all')}
            style={{
              background: cityFilter === 'all' ? '#1a1a2e' : '#fff',
              color: cityFilter === 'all' ? '#fff' : '#6b7280',
              border: cityFilter === 'all' ? 'none' : '1px solid #e5e7eb',
              padding: '5px 12px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Alla
          </button>
          {cities.map((city) => (
            <button
              key={city}
              onClick={() => setCityFilter(city)}
              style={{
                background: cityFilter === city ? '#4f46e5' : '#fff',
                color: cityFilter === city ? '#fff' : '#6b7280',
                border: cityFilter === city ? 'none' : '1px solid #e5e7eb',
                padding: '5px 12px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {city}
            </button>
          ))}
        </div>
      )}

      {/* Customer list */}
      <div
        style={{
          background: '#fff',
          borderRadius: '14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}
      >
        {filteredCustomers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            Inga kunder hittades
          </div>
        ) : (
          filteredCustomers.map((customer, index) => {
            const statusMeta = getStudioCustomerStatusMeta(normalizeStudioCustomerStatus(customer.status));
            const stats = customer.concept_stats;
            const lastEmailAt = customer.last_email_at ?? customer.last_email_sent_at;

            return (
              <Link
                key={customer.id}
                href={`/studio/customers/${customer.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: isAdmin
                    ? 'minmax(220px, 2fr) minmax(160px, 1fr) minmax(110px, 0.8fr)'
                    : 'minmax(220px, 2fr) minmax(110px, 0.8fr)',
                  gap: '16px',
                  padding: '16px 20px',
                  borderBottom: index < filteredCustomers.length - 1 ? '1px solid #f3f4f6' : 'none',
                  alignItems: 'center',
                  background: index % 2 === 0 ? '#fff' : '#fafafa',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '#f5f1eb';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = index % 2 === 0 ? '#fff' : '#fafafa';
                }}
              >
                {/* Company + concept stats */}
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      color: '#1a1a2e',
                      marginBottom: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: '15px',
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

                  {customer.tiktok_handle ? (
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      @{customer.tiktok_handle}
                    </div>
                  ) : customer.status !== 'archived' ? (
                    <div style={{ fontSize: '11px', color: '#b45309' }}>
                      ! TikTok-profil saknas
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span
                      style={{
                        background: statusMeta.bg,
                        color: statusMeta.text,
                        border: `1px solid ${statusMeta.border}`,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '11px',
                        fontWeight: 600,
                        display: 'inline-block',
                      }}
                    >
                      {statusMeta.label}
                    </span>
                    {(stats?.draft ?? 0) > 0 && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#92400e',
                          background: '#fef3c7',
                          border: '1px solid #fde68a',
                          borderRadius: '999px',
                          padding: '2px 8px',
                        }}
                      >
                        {stats.draft} utkast
                      </span>
                    )}
                    {(stats?.sent ?? 0) > 0 && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#1e40af',
                          background: '#dbeafe',
                          border: '1px solid #bfdbfe',
                          borderRadius: '999px',
                          padding: '2px 8px',
                        }}
                      >
                        {stats.sent} skickad{stats.sent > 1 ? 'e' : ''}
                      </span>
                    )}
                    {(stats?.produced ?? 0) > 0 && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#166534',
                          background: '#dcfce7',
                          border: '1px solid #bbf7d0',
                          borderRadius: '999px',
                          padding: '2px 8px',
                        }}
                      >
                        {stats.produced} producerad{stats.produced > 1 ? 'e' : ''}
                      </span>
                    )}
                  </div>

                  {lastEmailAt && (
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                      {formatLastEmail(lastEmailAt)}
                    </div>
                  )}

                  {!isAdmin && customer.next_planned_at && (
                    <div style={{ fontSize: '11px', color: '#0369a1', marginTop: '4px', fontWeight: 600 }}>
                      Nästa planerat: {new Date(customer.next_planned_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                    </div>
                  )}
                </div>

                {/* CM info — admin only */}
                {isAdmin && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CmAvatar
                      name={customer.account_manager_display_name ?? customer.account_manager ?? null}
                      avatarUrl={customer.account_manager_avatar_url}
                      size={32}
                    />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                        {customer.account_manager_display_name ?? customer.account_manager ?? '—'}
                      </div>
                      {(customer as ExtendedCustomerListItem).account_manager_city && (
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>
                          {(customer as ExtendedCustomerListItem).account_manager_city}
                        </div>
                      )}
                      {customer.customer_contact_name && (
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                          {customer.customer_contact_name}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Arrow indicator */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '18px', color: '#d1d5db' }}>›</span>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function CmAvatar({
  name,
  avatarUrl,
  size = 28,
}: {
  name: string | null | undefined;
  avatarUrl?: string | null;
  size?: number;
}) {
  const initials = name
    ? name
        .split(' ')
        .map((w) => w[0] ?? '')
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : '?';

  const colors = ['#7c3aed', '#1e40af', '#065f46', '#92400e', '#9f1239', '#1e3a5f'];
  const colorIndex = name ? name.charCodeAt(0) % colors.length : 0;
  const bg = colors[colorIndex];

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? ''}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: '#fff',
        fontSize: size * 0.38,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {initials}
    </div>
  );
}

const MONTHS_SV = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function formatLastEmail(isoString: string | undefined | null): string {
  if (!isoString) return '';
  const sent = new Date(isoString);
  const now = new Date();
  const daysDiff = Math.floor((now.getTime() - sent.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff === 0) return 'Senaste mail: idag';
  if (daysDiff === 1) return 'Senaste mail: igår';
  if (daysDiff < 14) return `Senaste mail: ${daysDiff} dagar sedan`;
  return `Senaste mail: ${sent.getDate()} ${MONTHS_SV[sent.getMonth()]}`;
}
