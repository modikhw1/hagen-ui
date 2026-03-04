'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';

interface Invoice {
  id: string;
  stripe_invoice_id: string;
  customer_profile_id: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string;
  due_date: string;
  created_at: string;
  customer_name?: string;
}

export default function AdminInvoicesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!authLoading && !user) { window.location.href = '/login'; return; }
    fetchInvoices();
  }, [authLoading, user]);

  const fetchInvoices = async () => {
    try {
      const { data } = await supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(200);
      const customerIds = [...new Set(data?.map(i => i.customer_profile_id).filter(Boolean))];
      let customerMap = new Map();
      
      if (customerIds.length > 0) {
        const { data: customers } = await supabase.from('customer_profiles').select('id, business_name').in('id', customerIds);
        customerMap = new Map(customers?.map(c => [c.id, c.business_name]));
      }

      setInvoices((data || []).map(inv => ({ ...inv, customer_name: customerMap.get(inv.customer_profile_id) || 'Okänd' })));
    } catch (err) { console.error('Error:', err); }
    finally { setLoading(false); }
  };

  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
  const formatAmount = (a: number) => (a / 100).toLocaleString('sv-SE', { style: 'currency', currency: 'SEK' });

  const filtered = invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (searchQuery && !inv.customer_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (timeFilter !== 'all') {
      const diff = (Date.now() - new Date(inv.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (timeFilter === '7d' && diff > 7) return false;
      if (timeFilter === '30d' && diff > 30) return false;
      if (timeFilter === '90d' && diff > 90) return false;
    }
    return true;
  });

  const totalPaid = filtered.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount_paid, 0);
  const totalOpen = filtered.filter(i => i.status === 'open').reduce((sum, i) => sum + i.amount_due, 0);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Laddar...</div>;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <a href="/admin" style={{ color: '#6b7280', fontSize: '14px', textDecoration: 'none' }}>← Tillbaka till admin</a>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e', margin: '8px 0 4px' }}>Fakturor</h1>
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>Betalningshistorik</p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Totalt betalat</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#10b981' }}>{formatAmount(totalPaid)}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Utestående</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#f59e0b' }}>{formatAmount(totalOpen)}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Antal</div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: '#4f46e5' }}>{filtered.length}</div>
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
        
        <select
          value={timeFilter}
          onChange={e => setTimeFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px', background: '#fff', outline: 'none' }}
        >
          <option value="all">All tid</option>
          <option value="7d">Senaste 7 dagarna</option>
          <option value="30d">Senaste 30 dagarna</option>
          <option value="90d">Senaste 90 dagarna</option>
        </select>

        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '4px' }}>
          {[
            { key: 'all', label: 'Alla' },
            { key: 'paid', label: 'Betald' },
            { key: 'open', label: 'Obetald' },
            { key: 'void', label: 'Annullerad' }
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                background: statusFilter === f.key ? '#fff' : 'transparent',
                color: statusFilter === f.key ? '#1a1a2e' : '#6b7280',
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: '13px',
                boxShadow: statusFilter === f.key ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 100px', gap: '16px', padding: '14px 20px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
          <div>Kund</div>
          <div>Belopp</div>
          <div>Datum</div>
          <div>Förfallodatum</div>
          <div>Status</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Inga fakturor</div>
        ) : (
          filtered.map((inv, i) => {
            const statusConfig = inv.status === 'paid' 
              ? { bg: '#d1fae5', text: '#065f46', label: 'Betald' }
              : inv.status === 'open'
                ? { bg: '#fef3c7', text: '#92400e', label: 'Obetald' }
                : { bg: '#f3f4f6', text: '#6b7280', label: 'Annullerad' };
            
            return (
              <div key={inv.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 100px', gap: '16px', padding: '16px 20px', borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: '15px' }}>{inv.customer_name}</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>{inv.stripe_invoice_id?.slice(0, 20)}...</div>
                </div>
                <div style={{ fontWeight: 600, color: '#1a1a2e' }}>{formatAmount(inv.amount_due)}</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>{formatDate(inv.created_at)}</div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>{formatDate(inv.due_date)}</div>
                <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: statusConfig.bg, color: statusConfig.text, width: 'fit-content' }}>
                  {statusConfig.label}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
