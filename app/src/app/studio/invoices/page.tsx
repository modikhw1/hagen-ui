'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { isStripeTestMode, stripeEnvironment } from '@/lib/stripe/dynamic-config';

interface Invoice {
  id: string;
  stripe_invoice_id: string;
  stripe_customer_id: string;
  customer_profile_id: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  hosted_invoice_url: string;
  invoice_pdf: string;
  due_date: string;
  paid_at: string;
  created_at: string;
  // Populated joins
  customer_name?: string;
}

export default function StudioInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'paid' | 'void'>('all');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    try {
      // Fetch invoices with customer info
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Get customer names from customer_profiles
      const customerIds = [...new Set(data?.map(i => i.customer_profile_id).filter(Boolean))];
      if (customerIds.length > 0) {
        const { data: customers } = await supabase
          .from('customer_profiles')
          .select('id, business_name')
          .in('id', customerIds);

        const customerMap = new Map(customers?.map(c => [c.id, c.business_name]));
        
        setInvoices((data || []).map(inv => ({
          ...inv,
          customer_name: customerMap.get(inv.customer_profile_id) || 'Okänd kund'
        })));
      } else {
        setInvoices(data || []);
      }
    } catch (err) {
      console.error('Error fetching invoices:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/studio/stripe/sync-invoices', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        alert(`Synkade ${data.synced || 0} fakturor från Stripe!`);
        fetchInvoices();
      } else {
        alert(data.error || 'Synk misslyckades');
      }
    } catch (err) {
      alert('Synk misslyckades');
    } finally {
      setSyncing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return { bg: '#d1fae5', text: '#065f46' };
      case 'open': return { bg: '#fef3c7', text: '#92400e' };
      case 'void': return { bg: '#f3f4f6', text: '#6b7280' };
      case 'draft': return { bg: '#e0e7ff', text: '#3730a3' };
      default: return { bg: '#f3f4f6', text: '#6b7280' };
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid': return 'Betald';
      case 'open': return 'Obetald';
      case 'void': return 'Annullerad';
      case 'draft': return 'Utkast';
      default: return status;
    }
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('sv-SE', { 
      style: 'currency', 
      currency: currency.toUpperCase() 
    }).format(amount / 100);
  };

  const filteredInvoices = invoices.filter(inv => 
    filter === 'all' || inv.status === filter
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e' }}>Fakturor</h1>
          <p style={{ color: '#6b7280', marginTop: '4px' }}>
            Stripe → Supabase synkronisering
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            background: syncing ? '#9ca3af' : '#4f46e5',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: '8px',
            border: 'none',
            fontWeight: 500,
            cursor: syncing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {syncing ? 'Synkar...' : '🔄 Synka från Stripe'}
        </button>
      </div>

      {/* Environment Badge */}
      <div style={{ 
        background: isStripeTestMode ? '#fef3c7' : '#d1fae5', 
        padding: '8px 12px', 
        borderRadius: '8px',
        marginBottom: '24px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <span style={{ fontSize: '14px', fontWeight: 600, color: isStripeTestMode ? '#92400e' : '#065f46' }}>
          {isStripeTestMode ? '🧪 TESTMODE' : '🔴 LIVE'}
        </span>
        <span style={{ fontSize: '13px', color: isStripeTestMode ? '#b45309' : '#047857' }}>
          {isStripeTestMode ? 'Test-data only' : 'Production data'}
        </span>
      </div>

      {/* Stats */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '12px', 
        marginBottom: '24px' 
      }}>
        {[
          { label: 'Totalt', value: invoices.length, color: '#1a1a2e' },
          { label: 'Obetalda', value: invoices.filter(i => i.status === 'open').length, color: '#f59e0b' },
          { label: 'Betalda', value: invoices.filter(i => i.status === 'paid').length, color: '#10b981' },
          { label: 'Summa', value: formatAmount(invoices.reduce((sum, i) => sum + i.amount_paid, 0), 'sek'), color: '#4f46e5' }
        ].map((stat) => (
          <div key={stat.label} style={{ 
            background: '#fff', 
            borderRadius: '12px', 
            padding: '16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>{stat.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        {['all', 'open', 'paid', 'void'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status as any)}
            style={{
              background: filter === status ? '#4f46e5' : '#fff',
              color: filter === status ? '#fff' : '#6b7280',
              border: filter === status ? 'none' : '1px solid #e5e7eb',
              padding: '8px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {status === 'all' ? 'Alla' : getStatusLabel(status)}
          </button>
        ))}
      </div>

      {/* Invoice List */}
      <div style={{ 
        background: '#fff', 
        borderRadius: '12px', 
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '2fr 1fr 1fr 1fr 100px',
          gap: '16px',
          padding: '12px 20px',
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          fontSize: '12px',
          fontWeight: 600,
          color: '#6b7280',
          textTransform: 'uppercase'
        }}>
          <div>Faktura</div>
          <div>Kund</div>
          <div>Belopp</div>
          <div>Förfall</div>
          <div>Status</div>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            Laddar...
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            Inga fakturor hittades. Klicka på "Synka från Stripe" för att hämta.
          </div>
        ) : (
          filteredInvoices.map((invoice, index) => {
            const statusStyle = getStatusColor(invoice.status);
            return (
              <div
                key={invoice.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 100px',
                  gap: '16px',
                  padding: '14px 20px',
                  borderBottom: index < filteredInvoices.length - 1 ? '1px solid #f3f4f6' : 'none',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: '14px' }}>
                    {invoice.stripe_invoice_id}
                  </div>
                  <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                    {new Date(invoice.created_at).toLocaleDateString('sv-SE')}
                  </div>
                </div>
                <div style={{ fontSize: '14px', color: '#374151' }}>
                  {invoice.customer_name || 'Okänd'}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1a1a2e' }}>
                  {formatAmount(invoice.amount_due, invoice.currency)}
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('sv-SE') : '-'}
                </div>
                <div>
                  <span style={{
                    background: statusStyle.bg,
                    color: statusStyle.text,
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 500,
                    display: 'inline-block'
                  }}>
                    {getStatusLabel(invoice.status)}
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
