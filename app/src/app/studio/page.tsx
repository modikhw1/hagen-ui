'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

interface StudioStats {
  totalConcepts: number;
  totalCustomers: number;
  pendingInvites: number;
  recentUploads: number;
  myCustomersCount: number;
}

interface CustomerRow {
  id: string;
  business_name: string;
  contact_email: string;
  status: string;
  created_at: string;
  monthly_price: number;
}

export default function StudioDashboard() {
  const [stats, setStats] = useState<StudioStats>({
    totalConcepts: 0,
    totalCustomers: 0,
    pendingInvites: 0,
    recentUploads: 0,
    myCustomersCount: 0,
  });
  const [myCustomers, setMyCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/studio-v2/dashboard', {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });

      if (res.ok) {
        const data = await res.json() as { stats: StudioStats; myCustomers: CustomerRow[] };
        setStats(data.stats);
        setMyCustomers(data.myCustomers ?? []);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      active: { bg: '#d1fae5', text: '#065f46' },
      invited: { bg: '#dbeafe', text: '#1d4ed8' },
      pending: { bg: '#fef3c7', text: '#b45309' },
      agreed: { bg: '#ede9fe', text: '#5b21b6' },
    };
    const c = colors[status] || { bg: '#f3f4f6', text: '#6b7280' };
    return (
      <span style={{ background: c.bg, color: c.text, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
        Laddar dashboard...
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '24px', color: '#1a1a2e' }}>
        CM Dashboard
      </h1>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Concepts</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a2e' }}>{stats.totalConcepts}</div>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Totalt kunder</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#1a1a2e' }}>{stats.totalCustomers}</div>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Mina kunder</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#4f46e5' }}>{stats.myCustomersCount}</div>
        </div>

        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>Väntande inbjudningar</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#f59e0b' }}>{stats.pendingInvites}</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', color: '#1a1a2e' }}>
          Snabba åtgärder
        </h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <a
            href="/studio/upload"
            style={{
              background: '#4f46e5',
              color: '#fff',
              padding: '12px 20px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            📹 Ladda upp video
          </a>
          <a
            href="/studio/concepts"
            style={{
              background: '#fff',
              color: '#1a1a2e',
              padding: '12px 20px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 500,
              border: '1px solid #e5e7eb',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            🎬 Visa concepts
          </a>
          <a
            href="/studio/customers"
            style={{
              background: '#fff',
              color: '#1a1a2e',
              padding: '12px 20px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 500,
              border: '1px solid #e5e7eb',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            👤 Hantera kunder
          </a>
        </div>
      </div>

      {/* Mina kunder */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1a1a2e', margin: 0 }}>
            Mina kunder
          </h2>
          <a href="/studio/customers" style={{ color: '#4f46e5', fontSize: '14px', textDecoration: 'none' }}>
            Visa alla →
          </a>
        </div>
        <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          {myCustomers.length === 0 ? (
            <div style={{ padding: '32px', color: '#9ca3af', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>👤</div>
              <div>Inga kunder tilldelade ännu</div>
            </div>
          ) : (
            myCustomers.map((customer, index) => (
              <div
                key={customer.id}
                style={{
                  padding: '14px 20px',
                  borderBottom: index < myCustomers.length - 1 ? '1px solid #f3f4f6' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#1a1a2e' }}>{customer.business_name}</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>{customer.contact_email}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {getStatusBadge(customer.status)}
                  <a
                    href={`/studio/customers/${customer.id}`}
                    style={{ color: '#4f46e5', fontSize: '12px', textDecoration: 'none' }}
                  >
                    Öppna →
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
