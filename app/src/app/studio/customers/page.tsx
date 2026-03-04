'use client';

import { useState, useEffect } from 'react';
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

const ACCOUNT_MANAGERS = ['all', 'Mahmoud', 'Emil', 'Johanna'] as const;

export default function StudioCustomersPage() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'archived'>('all');
  const [cmFilter, setCmFilter] = useState<string>('all');

  useEffect(() => {
    fetchCustomers();
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return { bg: '#d1fae5', text: '#065f46' };
      case 'pending': return { bg: '#fef3c7', text: '#92400e' };
      case 'invited': return { bg: '#dbeafe', text: '#1e40af' };
      case 'agreed': return { bg: '#e0e7ff', text: '#3730a3' };
      case 'archived': return { bg: '#f3f4f6', text: '#6b7280' };
      default: return { bg: '#f3f4f6', text: '#6b7280' };
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Aktiv';
      case 'pending': return 'Väntar';
      case 'invited': return 'Inbjuden';
      case 'agreed': return 'Godkänd';
      case 'archived': return 'Arkiverad';
      default: return status;
    }
  };

  const filteredCustomers = customers.filter(c => 
    (filter === 'all' || c.status === filter) &&
    (cmFilter === 'all' || c.account_manager === cmFilter)
  );

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Laddar kunder...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e' }}>Kunder</h1>
        <a 
          href="/admin/customers"
          target="_blank"
          style={{
            background: '#fff',
            color: '#1a1a2e',
            padding: '10px 16px',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 500,
            border: '1px solid #e5e7eb',
            fontSize: '14px'
          }}
        >
          → Hantera i admin
        </a>
      </div>

      {/* Stats */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '12px', 
        marginBottom: '16px' 
      }}>
        {['all', 'active', 'pending', 'archived'].map((status) => {
          const count = status === 'all' 
            ? customers.length 
            : customers.filter(c => c.status === status).length;
          return (
            <button
              key={status}
              onClick={() => setFilter(status as any)}
              style={{
                background: filter === status ? '#4f46e5' : '#fff',
                color: filter === status ? '#fff' : '#6b7280',
                border: filter === status ? 'none' : '1px solid #e5e7eb',
                padding: '12px 16px',
                borderRadius: '8px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: '24px', fontWeight: 700 }}>
                {count}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                {status === 'all' ? 'Totalt' : getStatusLabel(status)}
              </div>
            </button>
          );
        })}
      </div>

      {/* CM Filter */}
      <div style={{ marginBottom: '24px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', color: '#6b7280', marginRight: '8px' }}>Filtrera på CM:</span>
        {ACCOUNT_MANAGERS.map((cm) => (
          <button
            key={cm}
            onClick={() => setCmFilter(cm)}
            style={{
              background: cmFilter === cm ? '#1a1a2e' : '#fff',
              color: cmFilter === cm ? '#fff' : '#6b7280',
              border: cmFilter === cm ? 'none' : '1px solid #e5e7eb',
              padding: '8px 14px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {cm === 'all' ? 'Alla' : cm}
          </button>
        ))}
      </div>

      {/* Customer List */}
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
          <div>Företag</div>
          <div>Kontakt</div>
          <div>Account Manager</div>
          <div>Pris</div>
          <div>Status</div>
        </div>

        {filteredCustomers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            Inga kunder hittades
          </div>
        ) : (
          filteredCustomers.map((customer, index) => {
            const statusStyle = getStatusColor(customer.status);
            return (
              <a
                key={customer.id}
                href={`/studio/customers/${customer.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 100px',
                  gap: '16px',
                  padding: '16px 20px',
                  borderBottom: index < filteredCustomers.length - 1 ? '1px solid #f3f4f6' : 'none',
                  alignItems: 'center',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  background: index % 2 === 0 ? '#fff' : '#fafafa',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: '#1a1a2e', marginBottom: '2px' }}>
                    {customer.business_name}
                  </div>
                  {customer.game_plan?.title && (
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      {customer.game_plan.title}
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
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#1a1a2e' }}>
                  {customer.monthly_price > 0 ? `${customer.monthly_price} kr/mån` : '-'}
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
                    {getStatusLabel(customer.status)}
                  </span>
                </div>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
