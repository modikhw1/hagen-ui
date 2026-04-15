'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchAndCacheClient, readClientCache } from '@/lib/client-cache';
import { LeTrendColors, LeTrendRadius, LeTrendTypography } from '@/styles/letrend-design-system';

interface CustomerProfile {
  id: string;
  business_name: string;
  contact_email: string;
  account_manager?: string;
  account_manager_profile_id?: string;
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
  profile_id?: string;
  avatar_url?: string;
  invited_at?: string;
  bio?: string;
  region?: string;
  expertise?: string[];
  start_date?: string;
  notes?: string;
}

interface CachePayload {
  customers: CustomerProfile[];
  teamMembers: TeamMember[];
  archivedTeamMembers: TeamMember[];
}

const CACHE_KEY = 'admin:team:v2';
const CACHE_TTL_MS = 2 * 60_000;
const CACHE_MAX_STALE_MS = 10 * 60_000;

type Toast = { type: 'success' | 'error' | 'warning'; message: string };

async function performReassign(
  customerIds: string[],
  target: TeamMember,
  accessToken: string
): Promise<{ succeeded: number; failed: number }> {
  const results = await Promise.allSettled(
    customerIds.map(id =>
      fetch(`/api/admin/customers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
        body: JSON.stringify({ account_manager: target.email || target.name }),
      })
    )
  );
  const failed = results.filter(r => r.status === 'rejected').length;
  return { succeeded: results.length - failed, failed };
}

function getCMStatus(cm: TeamMember): { label: string; color: string } {
  if (cm.profile_id) return { label: 'Aktiv', color: '#22c55e' };
  if (cm.invited_at) return { label: 'Inviterad', color: '#f59e0b' };
  return { label: 'Ej inviterad', color: '#9ca3af' };
}

const inputStyle = {
  width: '100%', padding: '9px 11px', borderRadius: LeTrendRadius.md,
  border: `1px solid ${LeTrendColors.border}`, fontSize: '13px', outline: 'none', boxSizing: 'border-box' as const,
};
const labelStyle = {
  display: 'block', fontSize: '12px', color: LeTrendColors.textSecondary,
  fontWeight: 600 as const, marginBottom: '5px',
};

export default function AdminTeamPage() {
  const { user } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [archivedTeamMembers, setArchivedTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [reassignMode, setReassignMode] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<TeamMember | null>(null);
  const [reassignLoading, setReassignLoading] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newCM, setNewCM] = useState({ name: '', email: '', phone: '', sendInvite: false });
  const [addLoading, setAddLoading] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cmToDelete, setCmToDelete] = useState<TeamMember | null>(null);
  const [deleteReassignTarget, setDeleteReassignTarget] = useState<TeamMember | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [cmToEdit, setCmToEdit] = useState<TeamMember | null>(null);
  const [editForm, setEditForm] = useState({
    name: '', email: '', phone: '',
    bio: '', region: '', expertiseInput: '', start_date: '', notes: '',
  });
  const [editLoading, setEditLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [resendLoadingId, setResendLoadingId] = useState<string | null>(null);
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
      setArchivedTeamMembers(cached.value.archivedTeamMembers ?? []);
      setLoading(false);
    }
  }, []);

  const fetchData = useCallback(async (force = false) => {
    try {
      const payload = await fetchAndCacheClient<CachePayload>(
        CACHE_KEY,
        async () => {
          // Try extended columns (migration 040), fall back to base if not yet migrated
          let teamData: TeamMember[] | null = null;
          const { data: teamExtended, error: teamExtendedError } = await supabase
            .from('team_members')
            .select('id, name, email, phone, role, color, is_active, created_at, profile_id, avatar_url, invited_at, bio, region, expertise, start_date, notes')
            .order('created_at', { ascending: true });

          if (teamExtendedError) {
            const { data: teamBase } = await supabase
              .from('team_members')
              .select('id, name, email, phone, role, color, is_active, created_at, profile_id, avatar_url')
              .order('created_at', { ascending: true });
            teamData = (teamBase ?? []) as TeamMember[];
          } else {
            teamData = (teamExtended ?? []) as TeamMember[];
          }

          const { data: customersData } = await supabase
            .from('customer_profiles')
            .select('id, business_name, contact_email, account_manager, account_manager_profile_id, monthly_price, status')
            .order('created_at', { ascending: false });

          const allMembers = teamData ?? [];
          return {
            customers: (customersData ?? []) as CustomerProfile[],
            teamMembers: allMembers.filter(m => m.is_active),
            archivedTeamMembers: allMembers.filter(m => !m.is_active),
          };
        },
        CACHE_TTL_MS,
        { force }
      );
      setCustomers(payload.customers);
      setTeamMembers(payload.teamMembers);
      setArchivedTeamMembers(payload.archivedTeamMembers ?? []);
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

  const matchesCM = (c: CustomerProfile, cm: TeamMember) =>
    (cm.profile_id != null && c.account_manager_profile_id === cm.profile_id) ||
    (cm.profile_id == null && c.account_manager === cm.name);

  const filteredCustomers = customers.filter(c =>
    !searchQuery ||
    c.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.contact_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleCustomer = (id: string) => {
    setSelectedCustomers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
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
      const { data: { session } } = await supabase.auth.getSession();
      const { succeeded, failed } = await performReassign(selectedCustomers, reassignTarget, session?.access_token || '');
      if (failed > 0) showToast('warning', `${succeeded} omdelade, ${failed} misslyckades`);
      else showToast('success', `${selectedCustomers.length} kund${selectedCustomers.length > 1 ? 'er' : ''} omdelade till ${reassignTarget.name}`);
      setSelectedCustomers([]);
      setReassignMode(false);
      setReassignTarget(null);
      void fetchData(true);
    } catch {
      showToast('error', 'Kunde inte omdela kunder');
    } finally {
      setReassignLoading(false);
    }
  };

  const handleAddCM = async () => {
    if (!newCM.name.trim()) { showToast('error', 'Namn krävs'); return; }
    if (!newCM.email.trim()) { showToast('error', 'E-post är obligatoriskt'); return; }
    setAddLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ name: newCM.name.trim(), email: newCM.email.trim() || undefined, phone: newCM.phone.trim() || undefined, role: 'content_manager', sendInvite: newCM.sendInvite }),
      });
      const result = await res.json();
      if (!res.ok) { showToast('error', result.error || 'Kunde inte lägga till teammedlem'); return; }
      if (result.warning) showToast('warning', result.warning);
      else if (result.invited) showToast('success', `${newCM.name} tillagd och inbjudan skickad till ${newCM.email}`);
      else showToast('success', `${newCM.name} tillagd i teamet`);
      setNewCM({ name: '', email: '', phone: '', sendInvite: false });
      setShowAddModal(false);
      void fetchData(true);
    } catch {
      showToast('error', 'Kunde inte lägga till teammedlem');
    } finally {
      setAddLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cmToEdit) return;
    setAvatarUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `team-members/${cmToEdit.id}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`/api/admin/team/${cmToEdit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ name: editForm.name || cmToEdit.name, avatar_url: publicUrl }),
      });
      setCmToEdit({ ...cmToEdit, avatar_url: publicUrl });
      showToast('success', 'Profilbild uppdaterad');
      void fetchData(true);
    } catch {
      showToast('error', 'Kunde inte ladda upp bild');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleEditCM = async () => {
    if (!cmToEdit || !editForm.name.trim()) { showToast('error', 'Namn krävs'); return; }
    setEditLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/team/${cmToEdit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          name: editForm.name.trim(),
          email: editForm.email.trim() || undefined,
          phone: editForm.phone.trim() || undefined,
          bio: editForm.bio.trim() || undefined,
          region: editForm.region.trim() || undefined,
          expertise: editForm.expertiseInput.trim()
            ? editForm.expertiseInput.split(',').map(s => s.trim()).filter(Boolean)
            : undefined,
          start_date: editForm.start_date || undefined,
          notes: editForm.notes.trim() || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) showToast('error', result.error || 'Kunde inte spara ändringar');
      else {
        showToast('success', 'Ändringar sparade');
        setShowEditModal(false);
        setCmToEdit(null);
        void fetchData(true);
      }
    } catch {
      showToast('error', 'Kunde inte spara ändringar');
    } finally {
      setEditLoading(false);
    }
  };

  const handleResendInvite = async (cm: TeamMember) => {
    if (!cm.email) { showToast('error', 'Ingen e-post registrerad'); return; }
    setResendLoadingId(cm.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ resend: true, team_member_id: cm.id, email: cm.email, name: cm.name, role: cm.role }),
      });
      const result = await res.json();
      if (!res.ok) showToast('error', result.error || 'Kunde inte skicka inbjudan');
      else { showToast('success', `Ny inbjudan skickad till ${cm.email}`); void fetchData(true); }
    } catch {
      showToast('error', 'Kunde inte skicka inbjudan');
    } finally {
      setResendLoadingId(null);
    }
  };

  const handleReactivateCM = async (memberId: string) => {
    try {
      const { error } = await supabase.from('team_members').update({ is_active: true }).eq('id', memberId);
      if (error) throw error;
      showToast('success', 'Teammedlem återaktiverad');
      void fetchData(true);
    } catch {
      showToast('error', 'Kunde inte återaktivera teammedlem');
    }
  };

  const deleteCM = async (memberId: string) => {
    const { error } = await supabase.from('team_members').update({ is_active: false }).eq('id', memberId);
    if (error) throw error;
  };

  const handleConfirmDelete = async () => {
    if (!cmToDelete) return;
    setDeleteLoading(true);
    try {
      const assignedCustomers = customers.filter(c => matchesCM(c, cmToDelete));
      if (assignedCustomers.length > 0) {
        if (!deleteReassignTarget) {
          showToast('error', 'Välj vem kunderna ska omdelas till');
          setDeleteLoading(false);
          return;
        }
        const { data: { session } } = await supabase.auth.getSession();
        const { succeeded, failed } = await performReassign(assignedCustomers.map(c => c.id), deleteReassignTarget, session?.access_token || '');
        if (failed > 0) showToast('warning', `${succeeded} kunder omdelade, ${failed} misslyckades.`);
      }
      await deleteCM(cmToDelete.id);
      showToast('success',
        assignedCustomers.length > 0 && deleteReassignTarget
          ? `${cmToDelete.name} avslutad. ${assignedCustomers.length} kund${assignedCustomers.length > 1 ? 'er' : ''} omdelade till ${deleteReassignTarget.name}.`
          : `${cmToDelete.name} avslutad från teamet.`
      );
      setShowDeleteModal(false);
      setCmToDelete(null);
      setDeleteReassignTarget(null);
      void fetchData(true);
    } catch {
      showToast('error', 'Kunde inte slutföra avslutningen');
    } finally {
      setDeleteLoading(false);
    }
  };

  const customersByCM = teamMembers.map(cm => {
    const cmCustomers = filteredCustomers.filter(c => matchesCM(c, cm));
    return {
      ...cm,
      customers: cmCustomers,
      mrr: cmCustomers.filter(c => c.status === 'active' || c.status === 'agreed').reduce((s, c) => s + (c.monthly_price || 0), 0),
    };
  });

  const unassigned = filteredCustomers.filter(c => !c.account_manager_profile_id && !c.account_manager);

  // local variable used in delete modal
  const assignedCustomers = cmToDelete ? customers.filter(c => matchesCM(c, cmToDelete)) : [];

  const statusDot = (s: string) => {
    const c = s === 'active' || s === 'agreed' ? '#22c55e' : s === 'pending' ? '#f59e0b' : s === 'invited' ? '#3b82f6' : LeTrendColors.textMuted;
    return <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'inline-block', flexShrink: 0 }} />;
  };

  const Avatar = ({ cm, size = 32 }: { cm: TeamMember; size?: number }) =>
    cm.avatar_url ? (
      <img src={cm.avatar_url} alt={cm.name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    ) : (
      <div style={{ width: size, height: size, borderRadius: '50%', background: cm.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.44, flexShrink: 0 }}>
        {cm.name.charAt(0).toUpperCase()}
      </div>
    );

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: LeTrendColors.textMuted }}>Laddar...</div>;

  return (
    <div style={{ maxWidth: '1200px' }}>
      {/* Hidden file input for avatar upload */}
      <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 2000, background: toast.type === 'success' ? '#22c55e' : toast.type === 'warning' ? '#f59e0b' : LeTrendColors.error, color: '#fff', padding: '10px 16px', borderRadius: LeTrendRadius.md, fontSize: '13px', fontWeight: 500, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', maxWidth: '360px' }}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: LeTrendColors.brownDark, margin: 0, fontFamily: LeTrendTypography.fontFamily.heading }}>Team</h1>
          <p style={{ color: LeTrendColors.textMuted, fontSize: '13px', margin: '2px 0 0' }}>Hantera Content Managers och fördela kunder</p>
        </div>
        <button onClick={() => setShowAddModal(true)} style={{ background: LeTrendColors.brownDark, color: LeTrendColors.cream, padding: '8px 16px', borderRadius: LeTrendRadius.md, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}>
          + Lägg till
        </button>
      </div>

      {/* Toolbar */}
      <div style={{ background: '#fff', borderRadius: LeTrendRadius.md, padding: '10px 14px', border: `1px solid ${LeTrendColors.border}`, marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <input type="text" placeholder="Sök kund..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '13px', minWidth: '200px', outline: 'none', background: LeTrendColors.surface }} />

        {selectedCustomers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: LeTrendColors.textSecondary, fontWeight: 500 }}>{selectedCustomers.length} vald{selectedCustomers.length !== 1 ? 'a' : ''}</span>
            {!reassignMode ? (
              <button onClick={() => setReassignMode(true)} style={{ background: LeTrendColors.brownDark, color: '#fff', padding: '6px 12px', borderRadius: LeTrendRadius.md, border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>Omdela →</button>
            ) : (
              <>
                <span style={{ fontSize: '12px', color: LeTrendColors.textMuted }}>Till:</span>
                {teamMembers.map(cm => (
                  <button key={cm.id} onClick={() => setReassignTarget(cm)} style={{ padding: '5px 10px', borderRadius: LeTrendRadius.md, border: 'none', background: reassignTarget?.id === cm.id ? cm.color : LeTrendColors.surface, color: reassignTarget?.id === cm.id ? '#fff' : LeTrendColors.textSecondary, cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}>{cm.name}</button>
                ))}
                <button onClick={handleReassign} disabled={!reassignTarget || reassignLoading} style={{ padding: '6px 12px', borderRadius: LeTrendRadius.md, border: 'none', background: reassignTarget && !reassignLoading ? LeTrendColors.success : '#9ca3af', color: '#fff', cursor: reassignTarget && !reassignLoading ? 'pointer' : 'not-allowed', fontSize: '12px', fontWeight: 500 }}>
                  {reassignLoading ? '...' : 'Bekräfta'}
                </button>
                <button onClick={() => { setReassignMode(false); setReassignTarget(null); }} style={{ padding: '6px 10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: 'pointer', fontSize: '12px' }}>Avbryt</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* CM Cards — compact grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        {customersByCM.map(cm => {
          const cmStatus = getCMStatus(cm);
          return (
            <div key={cm.id} style={{ background: '#fff', borderRadius: '10px', border: `1px solid ${LeTrendColors.border}`, borderTop: `3px solid ${cm.color}`, overflow: 'hidden' }}>
              {/* Card header */}
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Avatar cm={cm} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: LeTrendColors.brownDark, fontFamily: LeTrendTypography.fontFamily.heading, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {cm.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '999px', background: `${cmStatus.color}20`, color: cmStatus.color, whiteSpace: 'nowrap' }}>{cmStatus.label}</span>
                    <span style={{ fontSize: '11px', color: LeTrendColors.textMuted }}>
                      {cm.customers.length} kund{cm.customers.length !== 1 ? 'er' : ''} · {cm.mrr > 0 ? `${cm.mrr.toLocaleString()} kr/mån` : '0 kr/mån'}
                    </span>
                  </div>
                </div>
                {/* Actions */}
                <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                  {!cm.profile_id && cm.email && (
                    <button onClick={() => handleResendInvite(cm)} disabled={resendLoadingId === cm.id} title="Skicka ny inbjudan"
                      style={{ background: 'none', border: `1px solid ${LeTrendColors.border}`, borderRadius: '6px', padding: '4px 6px', color: '#3b82f6', cursor: 'pointer', fontSize: '12px', opacity: resendLoadingId === cm.id ? 0.4 : 1 }}>
                      {resendLoadingId === cm.id ? '·' : '📨'}
                    </button>
                  )}
                  <button onClick={() => { setCmToEdit(cm); setEditForm({ name: cm.name, email: cm.email || '', phone: cm.phone || '', bio: cm.bio || '', region: cm.region || '', expertiseInput: (cm.expertise ?? []).join(', '), start_date: cm.start_date || '', notes: cm.notes || '' }); setShowEditModal(true); }}
                    title="Redigera" style={{ background: 'none', border: `1px solid ${LeTrendColors.border}`, borderRadius: '6px', padding: '4px 6px', color: LeTrendColors.textMuted, cursor: 'pointer', fontSize: '12px' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = LeTrendColors.brownDark; e.currentTarget.style.color = LeTrendColors.brownDark; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = LeTrendColors.border; e.currentTarget.style.color = LeTrendColors.textMuted; }}>
                    ✏️
                  </button>
                  <button onClick={() => { setCmToDelete(cm); setShowDeleteModal(true); }} title="Avsluta"
                    style={{ background: 'none', border: `1px solid ${LeTrendColors.border}`, borderRadius: '6px', padding: '4px 7px', color: LeTrendColors.textMuted, cursor: 'pointer', fontSize: '11px', fontWeight: 500 }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = LeTrendColors.error; e.currentTarget.style.color = LeTrendColors.error; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = LeTrendColors.border; e.currentTarget.style.color = LeTrendColors.textMuted; }}>
                    Avsluta
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: '1px', background: LeTrendColors.border }} />

              {/* Customer list */}
              <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '6px 8px' }}>
                {cm.customers.length === 0 ? (
                  <div style={{ padding: '14px 6px', color: LeTrendColors.textMuted, fontSize: '12px', textAlign: 'center' }}>Inga kunder tilldelade</div>
                ) : cm.customers.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 6px', borderRadius: '6px', background: selectedCustomers.includes(c.id) ? `${cm.color}12` : 'transparent', marginBottom: '2px', transition: 'background 0.1s' }}>
                    <div onClick={() => toggleCustomer(c.id)} style={{ width: 15, height: 15, borderRadius: '3px', border: selectedCustomers.includes(c.id) ? `2px solid ${cm.color}` : `1.5px solid ${LeTrendColors.border}`, background: selectedCustomers.includes(c.id) ? cm.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      {selectedCustomers.includes(c.id) && <span style={{ color: '#fff', fontSize: '9px', lineHeight: 1 }}>✓</span>}
                    </div>
                    <a href={`/studio/customers/${c.id}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: LeTrendColors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{c.business_name}</span>
                    </a>
                    {statusDot(c.status)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Unassigned */}
        {unassigned.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '10px', border: `1px dashed ${LeTrendColors.border}`, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${LeTrendColors.border}` }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: LeTrendColors.textSecondary }}>Otilldelade</div>
              <div style={{ fontSize: '11px', color: LeTrendColors.textMuted, marginTop: '1px' }}>{unassigned.length} kund{unassigned.length > 1 ? 'er' : ''}</div>
            </div>
            <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '6px 8px' }}>
              {unassigned.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 6px', borderRadius: '6px', background: selectedCustomers.includes(c.id) ? 'rgba(107,114,128,0.08)' : 'transparent', marginBottom: '2px' }}>
                  <div onClick={() => toggleCustomer(c.id)} style={{ width: 15, height: 15, borderRadius: '3px', border: selectedCustomers.includes(c.id) ? '2px solid #6b7280' : `1.5px solid ${LeTrendColors.border}`, background: selectedCustomers.includes(c.id) ? '#6b7280' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    {selectedCustomers.includes(c.id) && <span style={{ color: '#fff', fontSize: '9px' }}>✓</span>}
                  </div>
                  <a href={`/studio/customers/${c.id}`} style={{ flex: 1, textDecoration: 'none' }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: LeTrendColors.textPrimary }}>{c.business_name}</span>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Select all */}
      {filteredCustomers.length > 0 && (
        <button onClick={toggleSelectAll} style={{ background: 'none', border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.md, cursor: 'pointer', padding: '6px 12px', color: LeTrendColors.textSecondary, fontSize: '12px', fontWeight: 500 }}>
          {selectedCustomers.length === filteredCustomers.length ? '☑ Avmarkera alla' : '☐ Markera alla'}
        </button>
      )}

      {/* Archived section */}
      {archivedTeamMembers.length > 0 && (
        <div style={{ marginTop: '28px' }}>
          <button onClick={() => setShowArchived(p => !p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: LeTrendColors.textMuted, fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px', padding: '0 0 10px' }}>
            {showArchived ? '▼' : '▶'} Avslutade ({archivedTeamMembers.length})
          </button>
          {showArchived && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
              {archivedTeamMembers.map(cm => (
                <div key={cm.id} style={{ background: '#fff', borderRadius: '8px', padding: '10px 14px', border: `1px solid ${LeTrendColors.border}`, opacity: 0.6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: cm.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '11px' }}>{cm.name.charAt(0).toUpperCase()}</div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: LeTrendColors.textPrimary }}>{cm.name}</div>
                      {cm.email && <div style={{ fontSize: '11px', color: LeTrendColors.textMuted }}>{cm.email}</div>}
                    </div>
                  </div>
                  <button onClick={() => handleReactivateCM(cm.id)} style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid ${LeTrendColors.brownDark}`, background: '#fff', color: LeTrendColors.brownDark, cursor: 'pointer', fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap' }}>Återaktivera</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add CM Modal ── */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: LeTrendRadius.xl, width: '100%', maxWidth: '420px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(74,47,24,0.2)' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${LeTrendColors.border}` }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: LeTrendColors.brownDark, fontFamily: LeTrendTypography.fontFamily.heading }}>Lägg till i teamet</h3>
            </div>
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Namn *</label>
                <input value={newCM.name} onChange={e => setNewCM({ ...newCM, name: e.target.value })} placeholder="Förnamn Efternamn" autoFocus style={inputStyle} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>E-post *</label>
                <input value={newCM.email} onChange={e => setNewCM({ ...newCM, email: e.target.value })} placeholder="namn@letrend.se" type="email" style={inputStyle} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Telefon</label>
                <input value={newCM.phone} onChange={e => setNewCM({ ...newCM, phone: e.target.value })} placeholder="+46 70 123 45 67" type="tel" style={inputStyle} />
              </div>
              <div onClick={() => setNewCM(p => ({ ...p, sendInvite: !p.sendInvite }))} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: LeTrendRadius.md, border: `1px solid ${newCM.sendInvite ? LeTrendColors.brownDark : LeTrendColors.border}`, background: newCM.sendInvite ? 'rgba(107,68,35,0.05)' : LeTrendColors.surface, cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ width: 18, height: 18, borderRadius: '4px', border: `2px solid ${newCM.sendInvite ? LeTrendColors.brownDark : LeTrendColors.border}`, background: newCM.sendInvite ? LeTrendColors.brownDark : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {newCM.sendInvite && <span style={{ color: '#fff', fontSize: '11px' }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: LeTrendColors.textPrimary }}>Skicka inbjudan via e-post</div>
                  <div style={{ fontSize: '11px', color: LeTrendColors.textMuted }}>CM får en länk för att skapa sitt konto</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: `1px solid ${LeTrendColors.border}`, display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAddModal(false); setNewCM({ name: '', email: '', phone: '', sendInvite: false }); }} disabled={addLoading} style={{ padding: '8px 16px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: 'pointer', fontSize: '13px', color: LeTrendColors.textSecondary, opacity: addLoading ? 0.5 : 1 }}>Avbryt</button>
              <button onClick={handleAddCM} disabled={!newCM.name.trim() || !newCM.email.trim() || addLoading} style={{ padding: '8px 18px', borderRadius: LeTrendRadius.md, border: 'none', background: newCM.name.trim() && newCM.email.trim() && !addLoading ? LeTrendColors.brownDark : '#9ca3af', color: '#fff', cursor: newCM.name.trim() && newCM.email.trim() && !addLoading ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 600 }}>
                {addLoading ? 'Lägger till...' : newCM.sendInvite ? 'Lägg till & bjud in' : 'Lägg till'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit CM Modal ── */}
      {showEditModal && cmToEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: LeTrendRadius.xl, width: '100%', maxWidth: '460px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(74,47,24,0.2)' }}>
            {/* Modal header */}
            <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${LeTrendColors.border}`, display: 'flex', alignItems: 'center', gap: '14px' }}>
              {/* Clickable avatar for upload */}
              <div
                onClick={() => avatarInputRef.current?.click()}
                title="Byt profilbild"
                style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
              >
                <Avatar cm={cmToEdit} size={48} />
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%', background: avatarUploading ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.3)'; }}
                  onMouseLeave={e => { if (!avatarUploading) (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0)'; }}
                >
                  {avatarUploading
                    ? <div style={{ width: 14, height: 14, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    : <span style={{ color: '#fff', fontSize: '16px', opacity: 0 }} className="avatar-icon">📷</span>
                  }
                </div>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: LeTrendColors.brownDark, fontFamily: LeTrendTypography.fontFamily.heading }}>{cmToEdit.name}</h3>
                <div style={{ fontSize: '11px', color: LeTrendColors.textMuted, marginTop: '2px' }}>Klicka på bilden för att byta avatar</div>
              </div>
            </div>

            {/* Scrollable form body */}
            <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ marginBottom: '10px' }}>
                <label style={labelStyle}>Namn *</label>
                <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} autoFocus style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={labelStyle}>E-post</label>
                  <input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} type="email" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Telefon</label>
                  <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} type="tel" style={inputStyle} />
                </div>
              </div>

              {/* Extended fields */}
              <div style={{ borderTop: `1px solid ${LeTrendColors.border}`, paddingTop: '14px', marginTop: '6px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: LeTrendColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '12px' }}>Profil</div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={labelStyle}>Bio</label>
                  <textarea value={editForm.bio} onChange={e => setEditForm({ ...editForm, bio: e.target.value })} placeholder="Kort beskrivning..." rows={2}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.4' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={labelStyle}>Region</label>
                    <input value={editForm.region} onChange={e => setEditForm({ ...editForm, region: e.target.value })} placeholder="t.ex. Stockholm" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Startdatum</label>
                    <input value={editForm.start_date} onChange={e => setEditForm({ ...editForm, start_date: e.target.value })} type="date" style={inputStyle} />
                  </div>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <label style={labelStyle}>Expertis <span style={{ fontWeight: 400, opacity: 0.7 }}>(kommaseparerat)</span></label>
                  <input value={editForm.expertiseInput} onChange={e => setEditForm({ ...editForm, expertiseInput: e.target.value })} placeholder="t.ex. TikTok, Mode, Beauty" style={inputStyle} />
                </div>

                <div style={{ marginBottom: '4px' }}>
                  <label style={labelStyle}>Anteckningar <span style={{ fontWeight: 400, opacity: 0.7 }}>(intern)</span></label>
                  <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Interna anteckningar..." rows={2}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.4' }} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 24px', borderTop: `1px solid ${LeTrendColors.border}`, display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowEditModal(false); setCmToEdit(null); }} disabled={editLoading} style={{ padding: '8px 16px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: 'pointer', fontSize: '13px', color: LeTrendColors.textSecondary, opacity: editLoading ? 0.5 : 1 }}>Avbryt</button>
              <button onClick={handleEditCM} disabled={!editForm.name.trim() || editLoading} style={{ padding: '8px 18px', borderRadius: LeTrendRadius.md, border: 'none', background: editForm.name.trim() && !editLoading ? LeTrendColors.brownDark : '#9ca3af', color: '#fff', cursor: editForm.name.trim() && !editLoading ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: 600 }}>
                {editLoading ? 'Sparar...' : 'Spara'}
              </button>
            </div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ── Archive CM Modal ── */}
      {showDeleteModal && cmToDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,18,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: LeTrendRadius.xl, width: '100%', maxWidth: '440px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(74,47,24,0.2)' }}>
            <div style={{ padding: '20px 24px 14px', borderBottom: `1px solid ${LeTrendColors.border}` }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: LeTrendColors.brownDark, fontFamily: LeTrendTypography.fontFamily.heading }}>Avsluta {cmToDelete.name}?</h3>
            </div>
            <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
              {assignedCustomers.length > 0 ? (
                <>
                  <p style={{ color: LeTrendColors.textSecondary, fontSize: '13px', marginBottom: '16px', lineHeight: 1.5 }}>
                    {cmToDelete.name} har {assignedCustomers.length} tilldelad{assignedCustomers.length > 1 ? 'e' : ''} kund{assignedCustomers.length > 1 ? 'er' : ''}. Välj vem de ska omdelas till:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {teamMembers.filter(tm => tm.id !== cmToDelete.id).map(cm => (
                      <button key={cm.id} onClick={() => setDeleteReassignTarget(cm)} style={{ padding: '7px 14px', borderRadius: LeTrendRadius.md, border: deleteReassignTarget?.id === cm.id ? `2px solid ${cm.color}` : `1px solid ${LeTrendColors.border}`, background: deleteReassignTarget?.id === cm.id ? cm.color : '#fff', color: deleteReassignTarget?.id === cm.id ? '#fff' : LeTrendColors.textPrimary, cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                        {cm.name}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{ color: LeTrendColors.textSecondary, fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
                  Inga kunder tilldelade. Teammedlemmen avslutas och arkiveras.
                </p>
              )}
            </div>
            <div style={{ padding: '12px 24px', borderTop: `1px solid ${LeTrendColors.border}`, display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowDeleteModal(false); setCmToDelete(null); setDeleteReassignTarget(null); }} disabled={deleteLoading} style={{ padding: '8px 16px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: 'pointer', fontSize: '13px', color: LeTrendColors.textSecondary, opacity: deleteLoading ? 0.5 : 1 }}>Avbryt</button>
              <button onClick={handleConfirmDelete} disabled={deleteLoading || (assignedCustomers.length > 0 && !deleteReassignTarget)}
                style={{ padding: '8px 18px', borderRadius: LeTrendRadius.md, border: 'none', background: !deleteLoading && (assignedCustomers.length === 0 || deleteReassignTarget) ? LeTrendColors.error : '#9ca3af', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                {deleteLoading ? 'Avslutar...' : 'Avsluta'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
