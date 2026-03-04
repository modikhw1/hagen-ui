'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';

interface Subscription {
  id: string;
  stripe_subscription_id: string;
  customer_profile_id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  customer_name?: string;
  monthly_price?: number;
}

export default function AdminSubscriptionsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!authLoading && !user) { window.location.href = '/login'; return; }
    fetchSubscriptions();
  }, [authLoading, user]);

  const fetchSubscriptions = async () => {
    try {
      const [{ data: subs }, { data: customers }] = await Promise.all([
        supabase.from('subscriptions').select('*').order('created', { ascending: false }),
        supabase.from('customer_profiles').select('id, business_name, monthly_price')
      ]);
      
      const customerMap = new Map(customers?.map(c => [c.id, c]));
      setSubscriptions((subs || []).map(s => ({
        ...s,
        customer_name: customerMap.get(s.customer_profile_id)?.business_name || 'Okänd',
        monthly_price: customerMap.get(s.customer_profile_id)?.monthly_price || 0
      })));
    } catch (err) { console.error('Error:', err); }
    finally { setLoading(false); }
  };

  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

  const filtered = subscriptions.filter(s => {
    const matchFilter = filter === 'all' || (filter === 'active' && s.status === 'active' && !s.cancel_at_period_end) || (filter === 'canceled' && (s.status === 'canceled' || s.cancel_at_period_end)) || (filter === 'trialing' && s.status === 'trialing');
    const matchSearch = !searchQuery || s.customer_name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchFilter && matchSearch;
  });

  const activeCount = subscriptions.filter(s => s.status === 'active' && !s.cancel_at_period_end).length;
  const mrr = subscriptions.filter(s => s.status === 'active').reduce((sum, s) => sum + (s.monthly_price || 0), 0);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Laddar...</div>;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <a href="/admin" style={{ color: '#6b7280', fontSize: '14px', textDecoration: 'none' }}>← Tillbaka till admin</a>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e', margin: '8px 0 4px' }}>Abonnemang</h1>
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>Hantering av prenumerationer</p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>MRR</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#4f46e5' }}>{mrr.toLocaleString()} kr</div>
        </div>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Aktiva</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>{activeCount}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Avslutas</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#f59e0b' }}>{subscriptions.filter(s => s.cancel_at_period_end).length}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Sök kund..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px', minWidth: '200px', outline: 'none' }}
        />
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '4px' }}>
          {[
            { key: 'all', label: 'Alla' },
            { key: 'active', label: 'Aktiva' },
            { key: 'trialing', label: 'Prov' },
            { key: 'canceled', label: 'Avslutade' }
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                background: filter === f.key ? '#fff' : 'transparent',
                color: filter === f.key ? '#1a1a2e' : '#6b7280',
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: '13px',
                boxShadow: filter === f.key ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px', gap: '16px', padding: '14px 20px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
          <div>Kund</div>
          <div>Pris</div>
          <div>Period</div>
          <div>Nästa betalning</div>
          <div>Status</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Inga abonnemang</div>
        ) : (
          filtered.map((sub, i) => {
            const statusConfig = sub.cancel_at_period_end 
              ? { bg: '#fef3c7', text: '#92400e', label: 'Avslutas' }
              : sub.status === 'active' 
                ? { bg: '#d1fae5', text: '#065f46', label: 'Aktiv' }
                : sub.status === 'trialing'
                  ? { bg: '#dbeafe', text: '#1e40af', label: 'Prov' }
                  : { bg: '#f3f4f6', text: '#6b7280', label: sub.status };
            
            return (
              <div key={sub.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px', gap: '16px', padding: '16px 20px', borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: '15px' }}>{sub.customer_name}</div>
                </div>
                <div style={{ fontWeight: 600, color: '#1a1a2e' }}>{(sub.monthly_price || 0).toLocaleString()} kr</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>{formatDate(sub.current_period_start)} – {formatDate(sub.current_period_end)}</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>{formatDate(sub.current_period_end)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: statusConfig.bg, color: statusConfig.text }}>
                    {statusConfig.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
