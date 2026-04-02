'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getStudioCustomerStatusMeta } from '@/lib/studio/customer-status';
import { buildStudioWorkspaceHref } from '@/lib/studio/navigation';
import { supabase } from '@/lib/supabase/client';

interface CustomerProfile {
  id: string;
  business_name: string;
  contact_email: string;
  customer_contact_name?: string;
  account_manager?: string;
  monthly_price: number;
  status: 'pending' | 'active' | 'archived' | 'invited' | 'agreed';
  created_at: string;
  game_plan?: {
    title?: string;
    goals?: string[];
  };
}

type CustomerStatusFilter = 'all' | CustomerProfile['status'];

const CUSTOMER_STATUS_FILTERS: CustomerStatusFilter[] = [
  'all',
  'active',
  'agreed',
  'invited',
  'pending',
  'archived',
];

export default function StudioCustomersPage() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CustomerStatusFilter>('all');
  const [cmFilter, setCmFilter] = useState<string>('all');

  useEffect(() => {
    void fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customer_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter((customer) =>
    (filter === 'all' || customer.status === filter) &&
    (cmFilter === 'all' || customer.account_manager === cmFilter)
  );

  const accountManagers = [
    'all',
    ...Array.from(
      new Set(
        customers
          .map((customer) => customer.account_manager?.trim())
          .filter((value): value is string => Boolean(value))
      )
    ).sort((a, b) => a.localeCompare(b, 'sv')),
  ];

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Laddar kunder...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Kundarbete</h1>
          <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#6b7280', maxWidth: '720px' }}>
            Oppna ratt kundarbetsyta och hoppa direkt till Game Plan, konceptarbete, feedplan eller kommunikation.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link href="/studio/concepts" style={headerActionStyle(false)}>Konceptbibliotek</Link>
          <Link href="/studio/upload" style={headerActionStyle(false)}>Upload</Link>
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
          const count = status === 'all'
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
              <div style={{ fontSize: '24px', fontWeight: 700 }}>
                {count}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                {status === 'all' ? 'Totalt' : statusMeta?.label}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginBottom: '24px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px', color: '#6b7280', marginRight: '8px' }}>Filtrera pa CM:</span>
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
            gridTemplateColumns: 'minmax(240px, 2fr) minmax(150px, 1fr) minmax(140px, 1fr) minmax(110px, 0.8fr) minmax(220px, 1.5fr)',
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

            return (
              <div
                key={customer.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(240px, 2fr) minmax(150px, 1fr) minmax(140px, 1fr) minmax(110px, 0.8fr) minmax(220px, 1.5fr)',
                  gap: '16px',
                  padding: '16px 20px',
                  borderBottom: index < filteredCustomers.length - 1 ? '1px solid #f3f4f6' : 'none',
                  alignItems: 'center',
                  background: index % 2 === 0 ? '#fff' : '#fafafa',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#1a1a2e', marginBottom: '2px' }}>
                    {customer.business_name}
                  </div>
                  {customer.game_plan?.title ? (
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      {customer.game_plan.title}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      {customer.monthly_price > 0 ? `${customer.monthly_price} kr/man` : 'Pris ej satt'}
                    </div>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '14px', color: '#374151' }}>{customer.contact_email}</div>
                  {customer.customer_contact_name && (
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>{customer.customer_contact_name}</div>
                  )}
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
                  <WorkspaceLink href={buildStudioWorkspaceHref(customer.id, 'gameplan')} label="Game Plan" />
                  <WorkspaceLink href={buildStudioWorkspaceHref(customer.id, 'feed')} label="Feedplan" />
                  <WorkspaceLink href={buildStudioWorkspaceHref(customer.id, 'kommunikation')} label="Kommunikation" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
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
