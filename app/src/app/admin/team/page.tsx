'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { LeTrendColors, LeTrendRadius, LeTrendTypography } from '@/styles/letrend-design-system';

interface CustomerProfile {
  id: string;
  business_name: string;
  contact_email: string;
  account_manager?: string;
  monthly_price: number;
  status: string;
}

interface TeamMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: string;
  color: string;
  is_active: boolean;
  created_at: string;
}

const TEAM_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function AdminTeamPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [reassignMode, setReassignMode] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<string | null>(null);

  // Add CM modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCM, setNewCM] = useState({ name: '', email: '', phone: '' });

  // Delete CM modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cmToDelete, setCmToDelete] = useState<TeamMember | null>(null);
  const [deleteReassignTarget, setDeleteReassignTarget] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!authLoading && !user) { window.location.href = '/login'; return; }
    fetchData();
  }, [authLoading, user]);

  const fetchData = async () => {
    try {
      const [{ data: customersData }, { data: teamData }] = await Promise.all([
        supabase.from('customer_profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('team_members').select('*').eq('is_active', true).order('created_at', { ascending: true })
      ]);
      setCustomers(customersData || []);
      setTeamMembers(teamData || []);
    } catch (err) { console.error('Error:', err); }
    finally { setLoading(false); }
  };

  const toggleCustomer = (id: string) => {
    setSelectedCustomers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    setSelectedCustomers(prev.length === filteredCustomers.length ? [] : filteredCustomers.map(c => c.id));
  };

  const handleReassign = async () => {
    if (!reassignTarget || selectedCustomers.length === 0) return;
    try {
      for (const id of selectedCustomers) {
        await supabase.from('customer_profiles').update({ account_manager: reassignTarget }).eq('id', id);
      }
      alert(`✅ Omdelade ${selectedCustomers.length} kund${selectedCustomers.length > 1 ? 'er' : ''} till ${reassignTarget}`);
      setSelectedCustomers([]);
      setReassignMode(false);
      setReassignTarget(null);
      fetchData();
    } catch (err) {
      console.error('Error:', err);
      alert('❌ Kunde inte omdela kunder');
    }
  };

  const handleAddCM = async () => {
    if (!newCM.name.trim()) {
      alert('Namn krävs');
      return;
    }

    try {
      const { error } = await supabase.from('team_members').insert({
        name: newCM.name.trim(),
        email: newCM.email.trim() || null,
        phone: newCM.phone.trim() || null,
        role: 'content_manager',
        color: TEAM_COLORS[teamMembers.length % TEAM_COLORS.length],
        is_active: true,
      });

      if (error) throw error;

      alert(`✅ ${newCM.name} tillagd i teamet`);
      setNewCM({ name: '', email: '', phone: '' });
      setShowAddModal(false);
      fetchData();
    } catch (err: any) {
      console.error('Error:', err);
      alert(`❌ Kunde inte lägga till: ${err.message}`);
    }
  };

  const initiateDeleteCM = (member: TeamMember) => {
    const assignedCustomers = customers.filter(c => c.account_manager === member.name);

    if (assignedCustomers.length > 0) {
      // Has customers - require reassignment
      setCmToDelete(member);
      setShowDeleteModal(true);
    } else {
      // No customers - direct delete with confirmation
      if (confirm(`⚠️ Är du säker på att du vill ta bort ${member.name} från teamet?`)) {
        deleteCM(member.id);
      }
    }
  };

  const deleteCM = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from('team_members')
        .update({ is_active: false })
        .eq('id', memberId);

      if (error) throw error;

      alert('✅ Teammedlem borttagen');
      setShowDeleteModal(false);
      setCmToDelete(null);
      setDeleteReassignTarget(null);
      fetchData();
    } catch (err: any) {
      console.error('Error:', err);
      alert(`❌ Kunde inte ta bort: ${err.message}`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!cmToDelete || !deleteReassignTarget) return;

    try {
      // Reassign all customers
      const assignedCustomers = customers.filter(c => c.account_manager === cmToDelete.name);

      for (const customer of assignedCustomers) {
        await supabase
          .from('customer_profiles')
          .update({ account_manager: deleteReassignTarget })
          .eq('id', customer.id);
      }

      // Delete team member
      await deleteCM(cmToDelete.id);

      alert(`✅ ${assignedCustomers.length} kund${assignedCustomers.length > 1 ? 'er' : ''} omdelad${assignedCustomers.length > 1 ? 'e' : ''} till ${deleteReassignTarget}`);
    } catch (err: any) {
      console.error('Error:', err);
      alert(`❌ Kunde inte slutföra: ${err.message}`);
    }
  };

  const filteredCustomers = customers.filter(c =>
    !searchQuery || c.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) || c.contact_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const customersByCM = teamMembers.map(cm => ({
    ...cm,
    customers: filteredCustomers.filter(c => c.account_manager === cm.name),
    mrr: filteredCustomers.filter(c => c.account_manager === cm.name && (c.status === 'active' || c.status === 'agreed')).reduce((sum, c) => sum + (c.monthly_price || 0), 0),
  }));

  const unassigned = filteredCustomers.filter(c => !c.account_manager);

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'active':
      case 'agreed':
        return LeTrendColors.success;
      case 'pending':
        return '#f59e0b';
      case 'invited':
        return '#3b82f6';
      default:
        return LeTrendColors.textMuted;
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: LeTrendColors.textMuted }}>Laddar...</div>;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <a href="/admin" style={{ color: LeTrendColors.textSecondary, fontSize: '14px', textDecoration: 'none' }}>← Tillbaka till admin</a>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 700, color: LeTrendColors.brownDark, margin: 0, fontFamily: LeTrendTypography.fontFamily.heading }}>Team</h1>
            <p style={{ color: LeTrendColors.textSecondary, fontSize: '14px', margin: '4px 0 0' }}>Hantera Content Managers och fördela kunder</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              background: LeTrendColors.brownDark,
              color: LeTrendColors.cream,
              padding: '12px 24px',
              borderRadius: LeTrendRadius.lg,
              border: 'none',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '14px',
              boxShadow: '0 2px 8px rgba(74, 47, 24, 0.2)',
              transition: 'transform 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            + Lägg till i teamet
          </button>
        </div>
      </div>

      {/* Search & Actions */}
      <div style={{
        background: LeTrendColors.cream,
        borderRadius: LeTrendRadius.lg,
        padding: '16px 20px',
        border: `1px solid ${LeTrendColors.border}`,
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <input
          type="text"
          placeholder="Sök kund..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            padding: '10px 14px',
            borderRadius: LeTrendRadius.md,
            border: `1px solid ${LeTrendColors.border}`,
            fontSize: '14px',
            minWidth: '250px',
            outline: 'none',
            background: '#fff'
          }}
        />

        {selectedCustomers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: LeTrendColors.textSecondary, fontWeight: 500 }}>
              {selectedCustomers.length} vald{selectedCustomers.length !== 1 ? 'a' : ''}
            </span>
            {!reassignMode ? (
              <button
                onClick={() => setReassignMode(true)}
                style={{
                  background: LeTrendColors.brownDark,
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: LeTrendRadius.md,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Omdela →
              </button>
            ) : (
              <>
                <span style={{ fontSize: '14px', color: LeTrendColors.textSecondary }}>Till:</span>
                {teamMembers.map(cm => (
                  <button
                    key={cm.name}
                    onClick={() => setReassignTarget(cm.name)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: LeTrendRadius.md,
                      border: 'none',
                      background: reassignTarget === cm.name ? cm.color : LeTrendColors.surface,
                      color: reassignTarget === cm.name ? '#fff' : LeTrendColors.textSecondary,
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500
                    }}
                  >
                    {cm.name}
                  </button>
                ))}
                <button
                  onClick={handleReassign}
                  disabled={!reassignTarget}
                  style={{
                    padding: '8px 16px',
                    borderRadius: LeTrendRadius.md,
                    border: 'none',
                    background: reassignTarget ? LeTrendColors.success : '#9ca3af',
                    color: '#fff',
                    cursor: reassignTarget ? 'pointer' : 'not-allowed',
                    fontSize: '14px',
                    fontWeight: 500
                  }}
                >
                  Bekräfta
                </button>
                <button
                  onClick={() => { setReassignMode(false); setReassignTarget(null); }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: LeTrendRadius.md,
                    border: `1px solid ${LeTrendColors.border}`,
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                >
                  Avbryt
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Team Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        {customersByCM.map(cm => (
          <div
            key={cm.name}
            style={{
              background: LeTrendColors.cream,
              borderRadius: LeTrendRadius.xl,
              padding: '24px',
              border: `2px solid ${LeTrendColors.border}`,
              borderTop: `4px solid ${cm.color}`,
              boxShadow: '0 2px 8px rgba(74, 47, 24, 0.08)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: LeTrendColors.brownDark, fontFamily: LeTrendTypography.fontFamily.heading }}>{cm.name}</div>
                <div style={{ fontSize: '13px', color: LeTrendColors.textSecondary, marginTop: '2px' }}>{cm.role === 'content_manager' ? 'Content Manager' : cm.role}</div>
                {cm.email && (
                  <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📧</span>
                    <a href={`mailto:${cm.email}`} style={{ color: LeTrendColors.textMuted, textDecoration: 'none' }}>{cm.email}</a>
                  </div>
                )}
                {cm.phone && (
                  <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📞</span>
                    <a href={`tel:${cm.phone}`} style={{ color: LeTrendColors.textMuted, textDecoration: 'none' }}>{cm.phone}</a>
                  </div>
                )}
              </div>
              <button
                onClick={() => initiateDeleteCM(cm)}
                style={{
                  background: 'none',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.md,
                  padding: '6px 10px',
                  color: LeTrendColors.textMuted,
                  cursor: 'pointer',
                  fontSize: '16px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = LeTrendColors.error;
                  e.currentTarget.style.color = LeTrendColors.error;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = LeTrendColors.border;
                  e.currentTarget.style.color = LeTrendColors.textMuted;
                }}
              >
                🗑️
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div style={{ background: LeTrendColors.surface, borderRadius: LeTrendRadius.md, padding: '14px', textAlign: 'center', border: `1px solid ${LeTrendColors.border}` }}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: LeTrendColors.brownDark }}>{cm.customers.length}</div>
                <div style={{ fontSize: '12px', color: LeTrendColors.textSecondary, marginTop: '2px' }}>kunder</div>
              </div>
              <div style={{ background: LeTrendColors.surface, borderRadius: LeTrendRadius.md, padding: '14px', textAlign: 'center', border: `1px solid ${LeTrendColors.border}` }}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: cm.color }}>{cm.mrr.toLocaleString()}</div>
                <div style={{ fontSize: '12px', color: LeTrendColors.textSecondary, marginTop: '2px' }}>kr/mån</div>
              </div>
            </div>

            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {cm.customers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: LeTrendColors.textMuted, fontSize: '13px' }}>Inga kunder än</div>
              ) : (
                cm.customers.map(c => (
                  <div
                    key={c.id}
                    onClick={() => toggleCustomer(c.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px',
                      borderRadius: LeTrendRadius.md,
                      cursor: 'pointer',
                      background: selectedCustomers.includes(c.id) ? 'rgba(79, 70, 229, 0.1)' : 'transparent',
                      marginBottom: '6px',
                      border: selectedCustomers.includes(c.id) ? `1px solid ${cm.color}30` : '1px solid transparent',
                    }}
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '4px',
                      border: selectedCustomers.includes(c.id) ? `2px solid ${cm.color}` : `2px solid ${LeTrendColors.border}`,
                      background: selectedCustomers.includes(c.id) ? cm.color : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {selectedCustomers.includes(c.id) && <span style={{ color: '#fff', fontSize: '12px' }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: LeTrendColors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.business_name}</div>
                      <div style={{ fontSize: '12px', color: LeTrendColors.textMuted }}>{c.monthly_price} kr/mån</div>
                    </div>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: getStatusColor(c.status), flexShrink: 0 }} />
                  </div>
                ))
              )}
            </div>
          </div>
        ))}

        {unassigned.length > 0 && (
          <div style={{
            background: LeTrendColors.cream,
            borderRadius: LeTrendRadius.xl,
            padding: '24px',
            border: `2px dashed ${LeTrendColors.border}`
          }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: LeTrendColors.textSecondary, fontFamily: LeTrendTypography.fontFamily.heading }}>Otilldelade</div>
              <div style={{ fontSize: '13px', color: LeTrendColors.textMuted, marginTop: '2px' }}>{unassigned.length} kund{unassigned.length > 1 ? 'er' : ''}</div>
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {unassigned.map(c => (
                <div
                  key={c.id}
                  onClick={() => toggleCustomer(c.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px',
                    borderRadius: LeTrendRadius.md,
                    cursor: 'pointer',
                    background: selectedCustomers.includes(c.id) ? 'rgba(107, 114, 128, 0.1)' : 'transparent',
                    marginBottom: '6px',
                    border: selectedCustomers.includes(c.id) ? '1px solid #6b728030' : '1px solid transparent',
                  }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    border: selectedCustomers.includes(c.id) ? '2px solid #6b7280' : `2px solid ${LeTrendColors.border}`,
                    background: selectedCustomers.includes(c.id) ? '#6b7280' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {selectedCustomers.includes(c.id) && <span style={{ color: '#fff', fontSize: '12px' }}>✓</span>}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: LeTrendColors.textPrimary }}>{c.business_name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Select All */}
      {filteredCustomers.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
          <button
            onClick={toggleSelectAll}
            style={{
              background: 'none',
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              cursor: 'pointer',
              padding: '8px 16px',
              color: LeTrendColors.textSecondary,
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            {selectedCustomers.length === filteredCustomers.length ? '☑️ Avmarkera alla' : '☐ Markera alla'}
          </button>
        </div>
      )}

      {/* Add CM Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(26, 22, 18, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: LeTrendColors.cream,
            padding: '32px',
            borderRadius: LeTrendRadius.xl,
            width: '460px',
            border: `2px solid ${LeTrendColors.border}`,
            boxShadow: '0 8px 32px rgba(74, 47, 24, 0.3)',
          }}>
            <h3 style={{
              margin: '0 0 24px',
              fontSize: '24px',
              fontWeight: 700,
              color: LeTrendColors.brownDark,
              fontFamily: LeTrendTypography.fontFamily.heading,
            }}>
              Lägg till i teamet
            </h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', color: LeTrendColors.textSecondary, fontWeight: 600, marginBottom: '6px', display: 'block' }}>Namn *</label>
              <input
                value={newCM.name}
                onChange={e => setNewCM({ ...newCM, name: e.target.value })}
                placeholder="Förnamn Efternamn"
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: LeTrendRadius.md,
                  border: `1px solid ${LeTrendColors.border}`,
                  fontSize: '15px',
                  outline: 'none',
                  background: '#fff',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '13px', color: LeTrendColors.textSecondary, fontWeight: 600, marginBottom: '6px', display: 'block' }}>Email</label>
              <input
                value={newCM.email}
                onChange={e => setNewCM({ ...newCM, email: e.target.value })}
                placeholder="namn@letrend.se"
                type="email"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: LeTrendRadius.md,
                  border: `1px solid ${LeTrendColors.border}`,
                  fontSize: '15px',
                  outline: 'none',
                  background: '#fff',
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '13px', color: LeTrendColors.textSecondary, fontWeight: 600, marginBottom: '6px', display: 'block' }}>Telefon</label>
              <input
                value={newCM.phone}
                onChange={e => setNewCM({ ...newCM, phone: e.target.value })}
                placeholder="+46 70 123 45 67"
                type="tel"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: LeTrendRadius.md,
                  border: `1px solid ${LeTrendColors.border}`,
                  fontSize: '15px',
                  outline: 'none',
                  background: '#fff',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewCM({ name: '', email: '', phone: '' });
                }}
                style={{
                  padding: '12px 24px',
                  borderRadius: LeTrendRadius.md,
                  border: `1px solid ${LeTrendColors.border}`,
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: LeTrendColors.textSecondary,
                }}
              >
                Avbryt
              </button>
              <button
                onClick={handleAddCM}
                disabled={!newCM.name.trim()}
                style={{
                  padding: '12px 24px',
                  borderRadius: LeTrendRadius.md,
                  border: 'none',
                  background: newCM.name.trim() ? LeTrendColors.brownDark : '#9ca3af',
                  color: '#fff',
                  cursor: newCM.name.trim() ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                Lägg till
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete CM Modal */}
      {showDeleteModal && cmToDelete && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(26, 22, 18, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: LeTrendColors.cream,
            padding: '32px',
            borderRadius: LeTrendRadius.xl,
            width: '500px',
            border: `2px solid ${LeTrendColors.border}`,
            boxShadow: '0 8px 32px rgba(74, 47, 24, 0.3)',
          }}>
            <div style={{ fontSize: '40px', marginBottom: '16px', textAlign: 'center' }}>⚠️</div>
            <h3 style={{
              margin: '0 0 12px',
              fontSize: '24px',
              fontWeight: 700,
              color: LeTrendColors.brownDark,
              fontFamily: LeTrendTypography.fontFamily.heading,
              textAlign: 'center',
            }}>
              Ta bort {cmToDelete.name}?
            </h3>

            <p style={{
              color: LeTrendColors.textSecondary,
              fontSize: '14px',
              marginBottom: '24px',
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              {cmToDelete.name} har {customers.filter(c => c.account_manager === cmToDelete.name).length} tilldelade kund{customers.filter(c => c.account_manager === cmToDelete.name).length > 1 ? 'er' : ''}.<br />
              Dessa måste omdelas innan borttagning.
            </p>

            <div style={{
              background: LeTrendColors.surface,
              borderRadius: LeTrendRadius.md,
              padding: '16px',
              marginBottom: '24px',
              border: `1px solid ${LeTrendColors.border}`,
            }}>
              <div style={{ fontSize: '13px', color: LeTrendColors.textSecondary, fontWeight: 600, marginBottom: '12px' }}>
                Omdela kunder till:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {teamMembers.filter(tm => tm.id !== cmToDelete.id).map(cm => (
                  <button
                    key={cm.name}
                    onClick={() => setDeleteReassignTarget(cm.name)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: LeTrendRadius.md,
                      border: deleteReassignTarget === cm.name ? `2px solid ${cm.color}` : `1px solid ${LeTrendColors.border}`,
                      background: deleteReassignTarget === cm.name ? cm.color : '#fff',
                      color: deleteReassignTarget === cm.name ? '#fff' : LeTrendColors.textPrimary,
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 500,
                      flex: '1 0 auto',
                    }}
                  >
                    {cm.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setCmToDelete(null);
                  setDeleteReassignTarget(null);
                }}
                style={{
                  padding: '12px 24px',
                  borderRadius: LeTrendRadius.md,
                  border: `1px solid ${LeTrendColors.border}`,
                  background: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: LeTrendColors.textSecondary,
                }}
              >
                Avbryt
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={!deleteReassignTarget}
                style={{
                  padding: '12px 24px',
                  borderRadius: LeTrendRadius.md,
                  border: 'none',
                  background: deleteReassignTarget ? LeTrendColors.error : '#9ca3af',
                  color: '#fff',
                  cursor: deleteReassignTarget ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                Omdela & Ta bort
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
