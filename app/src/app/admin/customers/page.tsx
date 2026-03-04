'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';

interface CustomerProfile {
  id: string;
  business_name: string;
  contact_email: string;
  customer_contact_name?: string;
  account_manager?: string;
  monthly_price: number;
  status: 'pending' | 'active' | 'archived' | 'invited' | 'agreed';
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  created_at: string;
  updated_at?: string;
  game_plan?: { notes: any[] };
  concepts?: any[];
}

interface Subscription {
  id: string;
  status: string;
  current_period_start: string;
  current_period_end: string;
}

const ACCOUNT_MANAGERS = ['all', 'Mahmoud', 'Emil', 'Johanna'] as const;
type AccountManager = typeof ACCOUNT_MANAGERS[number];

export default function AdminCustomersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [subscriptions, setSubscriptions] = useState<Map<string, Subscription>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'archived' | 'invited' | 'agreed'>('all');
  const [cmFilter, setCmFilter] = useState<AccountManager>('all');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [previewCustomer, setPreviewCustomer] = useState<CustomerProfile | null>(null);
  const [inviteForm, setInviteForm] = useState({
    business_name: '',
    customer_contact_name: '',
    contact_email: '',
    account_manager: 'Mahmoud' as AccountManager,
    monthly_price: 0,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
      return;
    }
    fetchData();
  }, [authLoading, user]);

  const fetchData = async () => {
    try {
      const [{ data: customersData }, { data: subsData }] = await Promise.all([
        supabase.from('customer_profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('subscriptions').select('*')
      ]);

      const subMap = new Map();
      subsData?.forEach(s => subMap.set(s.customer_profile_id, s));
      setSubscriptions(subMap);
      setCustomers(customersData || []);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteForm.business_name || !inviteForm.contact_email) {
      alert('Fyll i företagsnamn och email');
      return;
    }

    try {
      // Step 1: Create customer_profile
      const { data: newProfile, error: profileError } = await supabase
        .from('customer_profiles')
        .insert({
          business_name: inviteForm.business_name,
          contact_email: inviteForm.contact_email,
          customer_contact_name: inviteForm.customer_contact_name,
          account_manager: inviteForm.account_manager,
          monthly_price: inviteForm.monthly_price,
          status: 'pending',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (profileError) throw profileError;

      console.log('Created customer profile:', newProfile);

      // Step 2: Send actual invite via API (creates Stripe subscription + sends email)
      const response = await fetch(`/api/admin/customers/${newProfile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_invite',
          ...inviteForm,
          subscription_interval: 'month', // Default to monthly
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send invite');
      }

      const result = await response.json();
      console.log('Invite sent:', result);

      alert(`✅ Inbjudan skickad till ${inviteForm.contact_email}!\n\nKunden har fått ett email med inloggningslänk.`);
      setShowInviteModal(false);
      setInviteForm({
        business_name: '',
        contact_email: '',
        customer_contact_name: '',
        account_manager: 'Mahmoud',
        monthly_price: 0,
      });
      fetchData();
    } catch (err: any) {
      console.error('Error inviting customer:', err);
      alert(`❌ Kunde inte skicka inbjudan: ${err.message}`);
    }
  };

  const handleDeleteCustomer = async (customerId: string, businessName: string) => {
    const confirmed = confirm(
      `⚠️ Är du säker på att du vill ta bort ${businessName}?\n\n` +
      `Detta kommer att:\n` +
      `- Ta bort kunden från databasen\n` +
      `- Ta bort alla koncept och Game Plans\n` +
      `- INTE avsluta Stripe-abonnemanget (gör det manuellt i Stripe)\n\n` +
      `Detta går INTE att ångra!`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/admin/customers/${customerId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete customer');
      }

      alert(`✅ ${businessName} har tagits bort`);
      fetchData(); // Refresh list
    } catch (err: any) {
      console.error('Error deleting customer:', err);
      alert(`❌ Kunde inte ta bort kunden: ${err.message}`);
    }
  };

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = !searchQuery ||
      c.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.contact_email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchesCM = cmFilter === 'all' || c.account_manager === cmFilter;
    return matchesSearch && matchesStatus && matchesCM;
  });

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'active': return { bg: '#d1fae5', text: '#065f46', label: 'Aktiv' };
      case 'pending': return { bg: '#fef3c7', text: '#92400e', label: 'Väntar' };
      case 'invited': return { bg: '#dbeafe', text: '#1e40af', label: 'Inbjuden' };
      case 'agreed': return { bg: '#e0e7ff', text: '#3730a3', label: 'Godkänd' };
      case 'archived': return { bg: '#f3f4f6', text: '#6b7280', label: 'Arkiverad' };
      default: return { bg: '#f3f4f6', text: '#6b7280', label: status };
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Laddar...</div>;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <a href="/admin" style={{ color: '#6b7280', fontSize: '14px', textDecoration: 'none' }}>← Tillbaka till admin</a>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Kunder</h1>
            <p style={{ color: '#6b7280', fontSize: '14px', margin: '4px 0 0' }}>Hantera och bjuda in kunder</p>
          </div>
          <button
            onClick={() => setShowInviteModal(true)}
            style={{
              background: '#4f46e5',
              color: '#fff',
              padding: '12px 20px',
              borderRadius: '8px',
              border: 'none',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            + Bjud in kund
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', borderRadius: '12px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Sök kund eller e-post..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px', minWidth: '220px', outline: 'none', flex: '1', maxWidth: '300px' }}
          />
          
          <select
            value={cmFilter}
            onChange={e => setCmFilter(e.target.value as AccountManager)}
            style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '14px', background: '#fff', outline: 'none' }}
          >
            {ACCOUNT_MANAGERS.map(cm => (
              <option key={cm} value={cm}>{cm === 'all' ? 'Alla CM' : cm}</option>
            ))}
          </select>
          
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '4px' }}>
            {[
              { key: 'all', label: 'Alla' },
              { key: 'active', label: 'Aktiva' },
              { key: 'pending', label: 'Väntar' },
              { key: 'invited', label: 'Inbjudna' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key as any)}
                style={{
                  padding: '8px 14px',
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
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <div style={{ background: '#fff', borderRadius: '8px', padding: '12px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#1a1a2e' }}>{filteredCustomers.length}</span>
          <span style={{ fontSize: '13px', color: '#6b7280', marginLeft: '6px' }}>visade</span>
        </div>
        <div style={{ background: '#fff', borderRadius: '8px', padding: '12px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#10b981' }}>{customers.filter(c => c.status === 'active' || c.status === 'agreed').length}</span>
          <span style={{ fontSize: '13px', color: '#6b7280', marginLeft: '6px' }}>aktiva</span>
        </div>
      </div>

      {/* Customer List with expandable details */}
      <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 2fr 1fr 1fr 1fr 80px 40px', gap: '16px', padding: '14px 20px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
          <div></div>
          <div>Företag</div>
          <div>Kontakt</div>
          <div>CM</div>
          <div>Pris</div>
          <div>Status</div>
          <div></div>
        </div>

        {filteredCustomers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af' }}>Inga kunder hittades</div>
        ) : (
          filteredCustomers.map((customer, index) => {
            const statusConfig = getStatusConfig(customer.status);
            const subscription = subscriptions.get(customer.id);
            const isExpanded = expandedCustomer === customer.id;
            
            return (
              <div key={customer.id}>
                <div style={{ display: 'grid', gridTemplateColumns: '40px 2fr 1fr 1fr 1fr 80px 40px', gap: '16px', padding: '16px 20px', borderBottom: index < filteredCustomers.length - 1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center', background: isExpanded ? '#fafafa' : '#fff' }}>
                  {/* Expand button */}
                  <button
                    onClick={() => setExpandedCustomer(isExpanded ? null : customer.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#6b7280', padding: 0 }}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                  
                  <div>
                    <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: '15px' }}>{customer.business_name}</div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>Skapad {formatDate(customer.created_at)}</div>
                  </div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>{customer.contact_email}</div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>{customer.account_manager || '-'}</div>
                  <div style={{ fontWeight: 600, color: '#1a1a2e' }}>{(customer.monthly_price || 0).toLocaleString()} kr</div>
                  <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: statusConfig.bg, color: statusConfig.text, width: 'fit-content' }}>
                    {statusConfig.label}
                  </span>
                  
                  {/* Preview eye button */}
                  <button
                    onClick={() => setPreviewCustomer(customer)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: 0 }}
                    title="Förhandsvisa kundvy"
                  >
                    👁
                  </button>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div style={{ padding: '20px', background: '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
                      {/* Contact Info */}
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: '12px' }}>Kontaktuppgifter</div>
                        <div style={{ fontSize: '14px', color: '#1a1a2e', marginBottom: '4px' }}><strong>E-post:</strong> {customer.contact_email}</div>
                        <div style={{ fontSize: '14px', color: '#1a1a2e', marginBottom: '4px' }}><strong>Kontaktperson:</strong> {customer.customer_contact_name || '-'}</div>
                        {subscription && (
                          <div style={{ fontSize: '14px', color: '#1a1a2e' }}><strong>Stripe ID:</strong> {customer.stripe_customer_id?.slice(0, 15)}...</div>
                        )}
                      </div>

                      {/* Subscription Info */}
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: '12px' }}>Abonnemang</div>
                        <div style={{ fontSize: '14px', color: '#1a1a2e', marginBottom: '4px' }}><strong>Pris:</strong> {customer.monthly_price} kr/mån</div>
                        <div style={{ fontSize: '14px', color: '#1a1a2e', marginBottom: '4px' }}><strong>Status:</strong> {statusConfig.label}</div>
                        {subscription && (
                          <>
                            <div style={{ fontSize: '14px', color: '#1a1a2e', marginBottom: '4px' }}><strong>Period start:</strong> {formatDate(subscription.current_period_start)}</div>
                            <div style={{ fontSize: '14px', color: '#1a1a2e' }}><strong>Nästa betalning:</strong> {formatDate(subscription.current_period_end)}</div>
                          </>
                        )}
                        {!subscription && <div style={{ fontSize: '14px', color: '#9ca3af' }}>Inget aktivt abonnemang</div>}
                      </div>

                      {/* Content */}
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: '12px' }}>Innehåll</div>
                        <div style={{ fontSize: '14px', color: '#1a1a2e', marginBottom: '4px' }}><strong>Koncept:</strong> {customer.concepts?.length || 0} st</div>
                        <div style={{ fontSize: '14px', color: '#1a1a2e', marginBottom: '4px' }}><strong>Game Plan:</strong> {customer.game_plan?.notes?.length || 0} anteckningar</div>
                        <div style={{ fontSize: '14px', color: '#1a1a2e' }}><strong>Uppdaterad:</strong> {customer.updated_at ? formatDate(customer.updated_at) : '-'}</div>
                      </div>
                    </div>
                    
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <a href={`/studio/customers/${customer.id}`} style={{ color: '#4f46e5', textDecoration: 'none', fontSize: '14px', fontWeight: 500 }}>→ Redigera i studio</a>
                      <button
                        onClick={() => handleDeleteCustomer(customer.id, customer.business_name)}
                        style={{
                          background: 'none',
                          border: '1px solid #fecaca',
                          color: '#dc2626',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                        onMouseOver={e => {
                          e.currentTarget.style.background = '#fee2e2';
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.background = 'none';
                        }}
                      >
                        🗑️ Ta bort kund
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '32px', borderRadius: '16px', width: '450px', maxWidth: '90%' }}>
            <h3 style={{ margin: '0 0 24px', fontSize: '20px', fontWeight: 600 }}>Bjud in ny kund</h3>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', fontWeight: 500, color: '#374151' }}>Företagsnamn</label>
              <input
                value={inviteForm.business_name}
                onChange={e => setInviteForm({ ...inviteForm, business_name: e.target.value })}
                placeholder="Café Månsson"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', fontWeight: 500, color: '#374151' }}>E-post</label>
              <input
                type="email"
                value={inviteForm.contact_email}
                onChange={e => setInviteForm({ ...inviteForm, contact_email: e.target.value })}
                placeholder="kontakt@foretag.se"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', fontWeight: 500, color: '#374151' }}>Kontaktperson</label>
              <input
                value={inviteForm.customer_contact_name}
                onChange={e => setInviteForm({ ...inviteForm, customer_contact_name: e.target.value })}
                placeholder="Namn"
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', fontWeight: 500, color: '#374151' }}>Content Manager</label>
                <select
                  value={inviteForm.account_manager}
                  onChange={e => setInviteForm({ ...inviteForm, account_manager: e.target.value as AccountManager })}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '15px', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                >
                  {ACCOUNT_MANAGERS.filter(cm => cm !== 'all').map(cm => (
                    <option key={cm} value={cm}>{cm}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', fontWeight: 500, color: '#374151' }}>Månadspris (kr)</label>
                <input
                  type="number"
                  value={inviteForm.monthly_price}
                  onChange={e => setInviteForm({ ...inviteForm, monthly_price: parseInt(e.target.value) || 0 })}
                  placeholder="249"
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowInviteModal(false)}
                style={{ padding: '12px 20px', borderRadius: '8px', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '14px' }}
              >
                Avbryt
              </button>
              <button 
                onClick={handleInvite}
                disabled={!inviteForm.business_name || !inviteForm.contact_email}
                style={{ 
                  padding: '12px 24px', 
                  borderRadius: '8px', 
                  border: 'none', 
                  background: '#4f46e5', 
                  color: '#fff', 
                  cursor: inviteForm.business_name && inviteForm.contact_email ? 'pointer' : 'not-allowed',
                  opacity: inviteForm.business_name && inviteForm.contact_email ? 1 : 0.5,
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Skicka inbjudan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Customer Modal - Exact replica from main page */}
      {previewCustomer && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#faf8f5', zIndex: 1000, overflow: 'auto', fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
          {/* Admin header bar */}
          <div style={{ background: '#1a1a2e', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '12px' }}>👁</span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#fff' }}>Kundvy-läge</div>
            </div>
            <button
              onClick={() => setPreviewCustomer(null)}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', width: '28px', height: '28px', borderRadius: '6px', fontSize: '16px', cursor: 'pointer', color: '#fff' }}
            >
              ×
            </button>
          </div>

          {/* Main content - exact replica */}
          <main style={{ padding: '16px', paddingBottom: '40px' }}>
            
            {/* Brand Profile Banner - exact from main page */}
            <div style={{
              margin: '16px',
              padding: '16px',
              background: 'linear-gradient(145deg, #4A2F18, #3D2510)',
              borderRadius: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'rgba(250,248,245,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FAF8F5',
                  fontSize: '20px',
                  fontWeight: '600'
                }}>
                  {previewCustomer.business_name?.charAt(0) || 'K'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: '#FAF8F5' }}>
                    @{previewCustomer.business_name?.toLowerCase().replace(/\s+/g, '') || 'foretag'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(250,248,245,0.6)' }}>
                    {previewCustomer.concepts?.length || 0} koncept · {previewCustomer.monthly_price || 0} kr/mån
                  </div>
                </div>
              </div>
            </div>

            {/* Game Plan Section - exact replica */}
            <section style={{ padding: '0 16px' }}>
              <div style={{ borderTop: '1px solid rgba(74, 47, 24, 0.08)', paddingTop: '24px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '14px' }}>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#1A1612' }}>
                    Game Plan
                  </div>
                  <div style={{ fontSize: '12px', color: '#9D8E7D' }}>
                    {previewCustomer.game_plan?.notes?.length || 0} poster
                  </div>
                </div>

                {/* Notes container - exact styling */}
                <div style={{ 
                  background: '#FFFFFF', 
                  borderRadius: '12px', 
                  border: '1px solid rgba(74,47,24,0.06)', 
                  padding: '18px 20px' 
                }}>
                  {previewCustomer.game_plan?.notes && previewCustomer.game_plan.notes.length > 0 ? (
                    previewCustomer.game_plan.notes.map((note: any, i: number) => {
                      // Heading
                      if (note.type === 'heading') {
                        return (
                          <div key={i} style={{ 
                            fontSize: '13px', 
                            fontWeight: '600', 
                            color: '#1A1612', 
                            marginTop: i === 0 ? 0 : '20px', 
                            marginBottom: '6px' 
                          }}>
                            {note.content}
                          </div>
                        );
                      }
                      // Single link
                      if (note.type === 'link') {
                        const linkIcon = note.linkType === 'tiktok' ? '🎵' : note.linkType === 'instagram' ? '📸' : note.linkType === 'youtube' ? '▶️' : note.linkType === 'article' ? '📄' : '🔗';
                        return (
                          <a 
                            key={i}
                            href={note.url} 
                            target="_blank" 
                            rel="noopener"
                            style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center', 
                              gap: '6px', 
                              padding: '6px 10px', 
                              background: '#F5F2EE', 
                              borderRadius: '6px', 
                              textDecoration: 'none', 
                              fontSize: '13px', 
                              color: '#6B4423',
                              marginBottom: '10px'
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', color: '#8B7355' }}>
                              {linkIcon}
                            </span>
                            {note.label || note.url}
                          </a>
                        );
                      }
                      // Multiple links
                      if (note.type === 'links' && note.links) {
                        return (
                          <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                            {note.links.map((link: any, j: number) => {
                              const linkIcon = link.linkType === 'tiktok' ? '🎵' : link.linkType === 'instagram' ? '📸' : link.linkType === 'youtube' ? '▶️' : link.linkType === 'article' ? '📄' : '🔗';
                              return (
                                <a 
                                  key={j}
                                  href={link.url} 
                                  target="_blank" 
                                  rel="noopener"
                                  style={{ 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '6px', 
                                    padding: '6px 10px', 
                                    background: '#F5F2EE', 
                                    borderRadius: '6px', 
                                    textDecoration: 'none', 
                                    fontSize: '13px', 
                                    color: '#6B4423' 
                                  }}
                                >
                                  <span style={{ display: 'flex', alignItems: 'center', color: '#8B7355' }}>
                                    {linkIcon}
                                  </span>
                                  {link.label}
                                </a>
                              );
                            })}
                          </div>
                        );
                      }
                      // Single image
                      if (note.type === 'image') {
                        return (
                          <div key={i} style={{ marginBottom: '12px' }}>
                            <img src={note.url} alt="" style={{ width: '100%', borderRadius: '8px', display: 'block' }} />
                            {note.caption && (
                              <div style={{ fontSize: '12px', color: '#7D6E5D', marginTop: '6px', fontStyle: 'italic' }}>
                                {note.caption}
                              </div>
                            )}
                          </div>
                        );
                      }
                      // Images grid
                      if (note.type === 'images' && note.images) {
                        return (
                          <div key={i} style={{ 
                            display: 'grid', 
                            gridTemplateColumns: `repeat(${Math.min(note.images.length, 3)}, 1fr)`, 
                            gap: '8px', 
                            marginBottom: '12px' 
                          }}>
                            {note.images.map((img: any, j: number) => (
                              <div key={j}>
                                <img src={img.url} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: '6px', display: 'block' }} />
                                {img.caption && (
                                  <div style={{ fontSize: '11px', color: '#9D8E7D', marginTop: '4px', textAlign: 'center' }}>
                                    {img.caption}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      }
                      // Text
                      if (note.type === 'text') {
                        return (
                          <p key={i} style={{ 
                            fontSize: '14px', 
                            color: '#4A4239', 
                            lineHeight: '1.6', 
                            marginBottom: '10px' 
                          }}>
                            {note.content}
                          </p>
                        );
                      }
                      return null;
                    })
                  ) : (
                    <div style={{ fontSize: '14px', color: '#9D8E7D', textAlign: 'center', padding: '20px' }}>
                      Ingen Game Plan ännu
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Concepts Section - exact replica */}
            <section style={{ padding: '24px 16px 0' }}>
              <div style={{ borderTop: '1px solid rgba(74, 47, 24, 0.08)', paddingTop: '24px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#9D8E7D', marginBottom: '2px' }}>DINA KONCEPT</div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#1A1612' }}>
                    För @{previewCustomer.business_name?.toLowerCase().replace(/\s+/g, '') || 'foretag'}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {previewCustomer.concepts && previewCustomer.concepts.length > 0 ? (
                    previewCustomer.concepts.map((concept: any, i: number) => (
                      <div 
                        key={i}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '14px', 
                          padding: '14px', 
                          background: '#FFFFFF', 
                          borderRadius: '14px', 
                          border: '1px solid rgba(74,47,24,0.08)',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '12px',
                          background: (concept.match_percentage || 85) > 85 ? '#5A8F5A' : '#F0EBE4',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: (concept.match_percentage || 85) > 85 ? '#FFF' : '#7D6E5D',
                          fontSize: '15px',
                          fontWeight: '700'
                        }}>
                          {concept.match_percentage || 85}%
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#1A1612', marginBottom: '4px' }}>
                            {concept.custom_headline || `Koncept ${i + 1}`}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {concept.custom_why_it_works && (
                              <span style={{ fontSize: '11px', color: '#6B5D4D' }}>
                                {concept.custom_why_it_works.substring(0, 60)}...
                              </span>
                            )}
                          </div>
                        </div>
                        <span style={{ color: '#9D8E7D', fontSize: '18px' }}>→</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', padding: '24px', textAlign: 'center', color: '#9D8E7D' }}>
                      Inga koncept ännu
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Bottom padding */}
            <div style={{ height: '40px' }} />
          </main>
        </div>
      )}
    </div>
  );
}
