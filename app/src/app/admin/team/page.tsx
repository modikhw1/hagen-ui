'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchAndCacheClient, readClientCache } from '@/lib/client-cache';
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

interface CachePayload {
  customers: CustomerProfile[];
  teamMembers: TeamMember[];
}

const CACHE_KEY = 'admin:team:v1';
const CACHE_TTL_MS = 2 * 60_000;
const CACHE_MAX_STALE_MS = 10 * 60_000;

type Toast = { type: 'success' | 'error' | 'warning'; message: string };

export default function AdminTeamPage() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [reassignMode, setReassignMode] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<string | null>(null);
  const [reassignLoading, setReassignLoading] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newCM, setNewCM] = useState({ name: '', email: '', phone: '', sendInvite: false });
  const [addLoading, setAddLoading] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cmToDelete, setCmToDelete] = useState<TeamMember | null>(null);
  const [deleteReassignTarget, setDeleteReassignTarget] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  const showToast = (type: Toast['type'], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadFromCache = useCallback(() => {
    const cached = readClientCache<CachePayload>(CACHE_KEY, { allowExpired: true, maxStaleMs: CACHE_MAX_STALE_MS });
    if (cached) {
      setCustomers(cached.value.customers);
      setTeamMembers(cached.value.teamMembers);
      setLoading(false);
    }
  }, []);

  const fetchData = useCallback(async (force = false) => {
    try {
      const payload = await fetchAndCacheClient<CachePayload>(
        CACHE_KEY,
        async () => {
          const [{ data: customersData }, { data: teamData }] = await Promise.all([
            supabase
              .from('customer_profiles')
              .select('id, business_name, contact_email, account_manager, monthly_price, status')
              .order('created_at', { ascending: false }),
            supabase
              .from('team_members')
              .select('id, name, email, phone, role, color, is_active, created_at')
              .eq('is_active', true)
              .order('created_at', { ascending: true }),
          ]);
          return {
            customers: (customersData ?? []) as CustomerProfile[],
            teamMembers: (teamData ?? []) as TeamMember[],
          };
        },
        CACHE_TTL_MS,
        { force }
      );
      setCustomers(payload.customers);
      setTeamMembers(payload.teamMembers);
    } catch (err) {
      console.error('Error fetching team data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFromCache();
    void fetchData();
  }, [loadFromCache, fetchData]);

  const toggleCustomer = (id: string) => {
    setSelectedCustomers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedCustomers(prev =>
      prev.length === filteredCustomers.length ? [] : filteredCustomers.map(c => c.id)
    );
  };

  const handleReassign = async () => {
    if (!reassignTarget || selectedCustomers.length === 0) return;
    setReassignLoading(true);
    try {
      for (const id of selectedCustomers) {
        await supabase
          .from('customer_profiles')
          .update({ account_manager: reassignTarget })
          .eq('id', id);
      }
      showToast('success', `${selectedCustomers.length} kund${selectedCustomers.length > 1 ? 'er' : ''} omdelade till ${reassignTarget}`);
      setSelectedCustomers([]);
      setReassignMode(false);
      setReassignTarget(null);
      void fetchData();
    } catch {
      showToast('error', 'Kunde inte omdela kunder');
    } finally {
      setReassignLoading(false);
    }
  };

  const handleAddCM = async () => {
    if (!newCM.name.trim()) {
      showToast('error', 'Namn krävs');
      return;
    }
    if (newCM.sendInvite && !newCM.email.trim()) {
      showToast('error', 'E-post krävs för att skicka inbjudan');
      return;
    }

    setAddLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          name: newCM.name.trim(),
          email: newCM.email.trim() || undefined,
          phone: newCM.phone.trim() || undefined,
          role: 'content_manager',
          sendInvite: newCM.sendInvite,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        showToast('error', result.error || 'Kunde inte lägga till teammedlem');
        return;
      }

      if (result.warning) {
        showToast('warning', result.warning);
      } else if (result.invited) {
        showToast('success', `${newCM.name} tillagd och inbjudan skickad till ${newCM.email}`);
      } else {
        showToast('success', `${newCM.name} tillagd i teamet`);
      }

      setNewCM({ name: '', email: '', phone: '', sendInvite: false });
      setShowAddModal(false);
      void fetchData();
    } catch {
      showToast('error', 'Kunde inte lägga till teammedlem');
    } finally {
      setAddLoading(false);
    }
  };

  const initiateDeleteCM = (member: TeamMember) => {
    const assignedCount = customers.filter(c => c.account_manager === member.name).length;
    if (assignedCount > 0) {
      setCmToDelete(member);
      setShowDeleteModal(true);
    } else {
      setCmToDelete(member);
      setShowDeleteModal(true);
    }
  };

  const deleteCM = async (memberId: string) => {
    const { error } = await supabase
      .from('team_members')
      .update({ is_active: false })
      .eq('id', memberId);
    if (error) throw error;
  };

  const handleConfirmDelete = async () => {
    if (!cmToDelete) return;
    setDeleteLoading(true);
    try {
      const assignedCustomers = customers.filter(c => c.account_manager === cmToDelete.name);

      if (assignedCustomers.length > 0) {
        if (!deleteReassignTarget) {
          showToast('error', 'Välj vem kunderna ska omdelas till');
          setDeleteLoading(false);
          return;
        }
        for (const customer of assignedCustomers) {
          await supabase
            .from('customer_profiles')
            .update({ account_manager: deleteReassignTarget })
            .eq('id', customer.id);
        }
      }

      await deleteCM(cmToDelete.id);

      showToast('success',
        assignedCustomers.length > 0
          ? `${cmToDelete.name} borttagen. ${assignedCustomers.length} kund${assignedCustomers.length > 1 ? 'er' : ''} omdelade till ${deleteReassignTarget}.`
          : `${cmToDelete.name} borttagen från teamet.`
      );
      setShowDeleteModal(false);
      setCmToDelete(null);
      setDeleteReassignTarget(null);
      void fetchData();
    } catch {
      showToast('error', 'Kunde inte slutföra borttagningen');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredCustomers = customers.filter(c =>
    !searchQuery ||
    c.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.contact_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const customersByCM = teamMembers.map(cm => ({
    ...cm,
    customers: filteredCustomers.filter(c => c.account_manager === cm.name),
    mrr: filteredCustomers
      .filter(c => c.account_manager === cm.name && (c.status === 'active' || c.status === 'agreed'))
      .reduce((sum, c) => sum + (c.monthly_price || 0), 0),
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

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: LeTrendColors.textMuted }}>Laddar...</div>
  );

  return (
    <div style={{ maxWidth: '1200px' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 2000,
          background: toast.type === 'success' ? '#22c55e' : toast.type === 'warning' ? '#f59e0b' : LeTrendColors.error,
          color: '#fff',
          padding: '12px 20px',
          borderRadius: LeTrendRadius.md,
          fontSize: '14px',
          fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          maxWidth: '400px',
        }}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 700, color: LeTrendColors.brownDark, margin: 0, fontFamily: LeTrendTypography.fontFamily.heading }}>Team</h1>
          <p style={{ color: LeTrendColors.textSecondary, fontSize: '14px', margin: '4px 0 0' }}>Hantera Content Managers och fördela kunder</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            background: LeTrendColors.brownDark,
            color: LeTrendColors.cream,
            padding: '10px 20px',
            borderRadius: LeTrendRadius.md,
            border: 'none',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          + Lägg till i teamet
        </button>
      </div>

      {/* Search & bulk reassign toolbar */}
      <div style={{
        background: '#fff',
        borderRadius: LeTrendRadius.lg,
        padding: '14px 16px',
        border: `1px solid ${LeTrendColors.border}`,
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <input
          type="text"
          placeholder="Sök kund..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            padding: '9px 14px',
            borderRadius: LeTrendRadius.md,
            border: `1px solid ${LeTrendColors.border}`,
            fontSize: '14px',
            minWidth: '240px',
            outline: 'none',
            background: LeTrendColors.surface,
          }}
        />

        {selectedCustomers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: LeTrendColors.textSecondary, fontWeight: 500 }}>
              {selectedCustomers.length} vald{selectedCustomers.length !== 1 ? 'a' : ''}
            </span>
            {!reassignMode ? (
              <button
                onClick={() => setReassignMode(true)}
                style={{ background: LeTrendColors.brownDark, color: '#fff', padding: '7px 14px', borderRadius: LeTrendRadius.md, border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
              >
                Omdela →
              </button>
            ) : (
              <>
                <span style={{ fontSize: '13px', color: LeTrendColors.textMuted }}>Till:</span>
                {teamMembers.map(cm => (
                  <button
                    key={cm.name}
                    onClick={() => setReassignTarget(cm.name)}
                    style={{
                      padding: '7px 12px',
                      borderRadius: LeTrendRadius.md,
                      border: 'none',
                      background: reassignTarget === cm.name ? cm.color : LeTrendColors.surface,
                      color: reassignTarget === cm.name ? '#fff' : LeTrendColors.textSecondary,
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                    }}
                  >
                    {cm.name}
                  </button>
                ))}
                <button
                  onClick={handleReassign}
                  disabled={!reassignTarget || reassignLoading}
                  style={{
                    padding: '7px 14px',
                    borderRadius: LeTrendRadius.md,
                    border: 'none',
                    background: reassignTarget && !reassignLoading ? LeTrendColors.success : '#9ca3af',
                    color: '#fff',
                    cursor: reassignTarget && !reassignLoading ? 'pointer' : 'not-allowed',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  {reassignLoading ? 'Omdelar...' : 'Bekräfta'}
                </button>
                <button
                  onClick={() => { setReassignMode(false); setReassignTarget(null); }}
                  style={{ padding: '7px 12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: 'pointer', fontSize: '13px' }}
                >
                  Avbryt
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Team Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        {customersByCM.map(cm => (
          <div
            key={cm.name}
            style={{
              background: '#fff',
              borderRadius: LeTrendRadius.xl,
              padding: '24px',
              border: `1px solid ${LeTrendColors.border}`,
              borderTop: `3px solid ${cm.color}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: LeTrendColors.brownDark, fontFamily: LeTrendTypography.fontFamily.heading }}>{cm.name}</div>
                <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginTop: '2px' }}>Content Manager</div>
                {cm.email && (
                  <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginTop: '6px' }}>
                    <a href={`mailto:${cm.email}`} style={{ color: LeTrendColors.textMuted, textDecoration: 'none' }}>
                      {cm.email}
                    </a>
                  </div>
                )}
                {cm.phone && (
                  <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginTop: '2px' }}>
                    <a href={`tel:${cm.phone}`} style={{ color: LeTrendColors.textMuted, textDecoration: 'none' }}>
                      {cm.phone}
                    </a>
                  </div>
                )}
              </div>
              <button
                onClick={() => initiateDeleteCM(cm)}
                style={{
                  background: 'none',
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.md,
                  padding: '5px 9px',
                  color: LeTrendColors.textMuted,
                  cursor: 'pointer',
                  fontSize: '14px',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = LeTrendColors.error; e.currentTarget.style.color = LeTrendColors.error; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = LeTrendColors.border; e.currentTarget.style.color = LeTrendColors.textMuted; }}
                title="Ta bort från teamet"
              >
                🗑
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div style={{ background: LeTrendColors.surface, borderRadius: LeTrendRadius.md, padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: LeTrendColors.textPrimary }}>{cm.customers.length}</div>
                <div style={{ fontSize: '11px', color: LeTrendColors.textMuted, marginTop: '2px' }}>kunder</div>
              </div>
              <div style={{ background: LeTrendColors.surface, borderRadius: LeTrendRadius.md, padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: cm.color }}>{cm.mrr.toLocaleString()}</div>
                <div style={{ fontSize: '11px', color: LeTrendColors.textMuted, marginTop: '2px' }}>kr/mån</div>
              </div>
            </div>

            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {cm.customers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: LeTrendColors.textMuted, fontSize: '13px' }}>Inga kunder än</div>
              ) : (
                cm.customers.map(c => (
                  <div
                    key={c.id}
                    onClick={() => toggleCustomer(c.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: LeTrendRadius.md,
                      cursor: 'pointer',
                      background: selectedCustomers.includes(c.id) ? `${cm.color}15` : 'transparent',
                      marginBottom: '4px',
                      border: selectedCustomers.includes(c.id) ? `1px solid ${cm.color}40` : '1px solid transparent',
                      transition: 'background 0.1s ease',
                    }}
                  >
                    <div style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      border: selectedCustomers.includes(c.id) ? `2px solid ${cm.color}` : `2px solid ${LeTrendColors.border}`,
                      background: selectedCustomers.includes(c.id) ? cm.color : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {selectedCustomers.includes(c.id) && <span style={{ color: '#fff', fontSize: '11px' }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: LeTrendColors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.business_name}</div>
                      {c.monthly_price > 0 && <div style={{ fontSize: '11px', color: LeTrendColors.textMuted }}>{c.monthly_price.toLocaleString()} kr/mån</div>}
                    </div>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: getStatusColor(c.status), flexShrink: 0 }} />
                  </div>
                ))
              )}
            </div>
          </div>
        ))}

        {unassigned.length > 0 && (
          <div style={{
            background: '#fff',
            borderRadius: LeTrendRadius.xl,
            padding: '24px',
            border: `1px dashed ${LeTrendColors.border}`,
          }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: LeTrendColors.textSecondary, fontFamily: LeTrendTypography.fontFamily.heading }}>Otilldelade</div>
              <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginTop: '2px' }}>{unassigned.length} kund{unassigned.length > 1 ? 'er' : ''}</div>
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
                    padding: '8px 10px',
                    borderRadius: LeTrendRadius.md,
                    cursor: 'pointer',
                    background: selectedCustomers.includes(c.id) ? 'rgba(107,114,128,0.08)' : 'transparent',
                    marginBottom: '4px',
                    border: selectedCustomers.includes(c.id) ? '1px solid #6b728040' : '1px solid transparent',
                    transition: 'background 0.1s ease',
                  }}
                >
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    border: selectedCustomers.includes(c.id) ? '2px solid #6b7280' : `2px solid ${LeTrendColors.border}`,
                    background: selectedCustomers.includes(c.id) ? '#6b7280' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {selectedCustomers.includes(c.id) && <span style={{ color: '#fff', fontSize: '11px' }}>✓</span>}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: LeTrendColors.textPrimary }}>{c.business_name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Select all */}
      {filteredCustomers.length > 0 && (
        <button
          onClick={toggleSelectAll}
          style={{
            background: 'none',
            border: `1px solid ${LeTrendColors.border}`,
            borderRadius: LeTrendRadius.md,
            cursor: 'pointer',
            padding: '8px 14px',
            color: LeTrendColors.textSecondary,
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          {selectedCustomers.length === filteredCustomers.length ? '☑ Avmarkera alla' : '☐ Markera alla'}
        </button>
      )}

      {/* Add CM Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26,22,18,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: '#fff',
            padding: '32px',
            borderRadius: LeTrendRadius.xl,
            width: '460px',
            maxWidth: '90%',
            boxShadow: '0 8px 32px rgba(74,47,24,0.2)',
          }}>
            <h3 style={{ margin: '0 0 24px', fontSize: '20px', fontWeight: 700, color: LeTrendColors.brownDark, fontFamily: LeTrendTypography.fontFamily.heading }}>
              Lägg till i teamet
            </h3>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: LeTrendColors.textSecondary, fontWeight: 600, marginBottom: '6px' }}>Namn *</label>
              <input
                value={newCM.name}
                onChange={e => setNewCM({ ...newCM, name: e.target.value })}
                placeholder="Förnamn Efternamn"
                autoFocus
                style={{ width: '100%', padding: '11px 12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: LeTrendColors.textSecondary, fontWeight: 600, marginBottom: '6px' }}>E-post{newCM.sendInvite ? ' *' : ''}</label>
              <input
                value={newCM.email}
                onChange={e => setNewCM({ ...newCM, email: e.target.value })}
                placeholder="namn@letrend.se"
                type="email"
                style={{ width: '100%', padding: '11px 12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: LeTrendColors.textSecondary, fontWeight: 600, marginBottom: '6px' }}>Telefon</label>
              <input
                value={newCM.phone}
                onChange={e => setNewCM({ ...newCM, phone: e.target.value })}
                placeholder="+46 70 123 45 67"
                type="tel"
                style={{ width: '100%', padding: '11px 12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Send invite toggle */}
            <div
              onClick={() => setNewCM(prev => ({ ...prev, sendInvite: !prev.sendInvite }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: LeTrendRadius.md,
                border: `1px solid ${newCM.sendInvite ? LeTrendColors.brownDark : LeTrendColors.border}`,
                background: newCM.sendInvite ? 'rgba(107,68,35,0.05)' : LeTrendColors.surface,
                cursor: 'pointer',
                marginBottom: '24px',
                userSelect: 'none',
              }}
            >
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: `2px solid ${newCM.sendInvite ? LeTrendColors.brownDark : LeTrendColors.border}`,
                background: newCM.sendInvite ? LeTrendColors.brownDark : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                {newCM.sendInvite && <span style={{ color: '#fff', fontSize: '12px' }}>✓</span>}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: LeTrendColors.textPrimary }}>Skicka inbjudan via e-post</div>
                <div style={{ fontSize: '12px', color: LeTrendColors.textMuted }}>CM får en länk för att skapa sitt konto</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowAddModal(false); setNewCM({ name: '', email: '', phone: '', sendInvite: false }); }}
                disabled={addLoading}
                style={{ padding: '10px 20px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: addLoading ? 'not-allowed' : 'pointer', fontSize: '14px', color: LeTrendColors.textSecondary, opacity: addLoading ? 0.6 : 1 }}
              >
                Avbryt
              </button>
              <button
                onClick={handleAddCM}
                disabled={!newCM.name.trim() || addLoading}
                style={{
                  padding: '10px 22px',
                  borderRadius: LeTrendRadius.md,
                  border: 'none',
                  background: newCM.name.trim() && !addLoading ? LeTrendColors.brownDark : '#9ca3af',
                  color: '#fff',
                  cursor: newCM.name.trim() && !addLoading ? 'pointer' : 'not-allowed',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                {addLoading ? 'Lägger till...' : newCM.sendInvite ? 'Lägg till & skicka inbjudan' : 'Lägg till'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete CM Modal */}
      {showDeleteModal && cmToDelete && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(26,22,18,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: '#fff',
            padding: '32px',
            borderRadius: LeTrendRadius.xl,
            width: '480px',
            maxWidth: '90%',
            boxShadow: '0 8px 32px rgba(74,47,24,0.2)',
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '20px', fontWeight: 700, color: LeTrendColors.brownDark, fontFamily: LeTrendTypography.fontFamily.heading }}>
              Ta bort {cmToDelete.name}?
            </h3>

            {(() => {
              const assignedCount = customers.filter(c => c.account_manager === cmToDelete.name).length;
              return assignedCount > 0 ? (
                <>
                  <p style={{ color: LeTrendColors.textSecondary, fontSize: '14px', marginBottom: '20px', lineHeight: 1.5 }}>
                    {cmToDelete.name} har {assignedCount} tilldelad{assignedCount > 1 ? 'e' : ''} kund{assignedCount > 1 ? 'er' : ''}. Välj vem de ska omdelas till:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
                    {teamMembers.filter(tm => tm.id !== cmToDelete.id).map(cm => (
                      <button
                        key={cm.name}
                        onClick={() => setDeleteReassignTarget(cm.name)}
                        style={{
                          padding: '9px 16px',
                          borderRadius: LeTrendRadius.md,
                          border: deleteReassignTarget === cm.name ? `2px solid ${cm.color}` : `1px solid ${LeTrendColors.border}`,
                          background: deleteReassignTarget === cm.name ? cm.color : '#fff',
                          color: deleteReassignTarget === cm.name ? '#fff' : LeTrendColors.textPrimary,
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 500,
                        }}
                      >
                        {cm.name}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ color: LeTrendColors.textSecondary, fontSize: '14px', marginBottom: '24px' }}>
                  Inga kunder tilldelade. Teammedlemmen tas bort.
                </p>
              );
            })()}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowDeleteModal(false); setCmToDelete(null); setDeleteReassignTarget(null); }}
                disabled={deleteLoading}
                style={{ padding: '10px 20px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: deleteLoading ? 'not-allowed' : 'pointer', fontSize: '14px', color: LeTrendColors.textSecondary, opacity: deleteLoading ? 0.6 : 1 }}
              >
                Avbryt
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteLoading || (customers.filter(c => c.account_manager === cmToDelete.name).length > 0 && !deleteReassignTarget)}
                style={{
                  padding: '10px 22px',
                  borderRadius: LeTrendRadius.md,
                  border: 'none',
                  background: (!deleteLoading && (customers.filter(c => c.account_manager === cmToDelete.name).length === 0 || deleteReassignTarget)) ? LeTrendColors.error : '#9ca3af',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                {deleteLoading ? 'Tar bort...' : 'Ta bort'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
