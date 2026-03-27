'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { LeTrendColors, LeTrendTypography, LeTrendRadius } from '@/styles/letrend-design-system';
import Link from 'next/link';
import { fetchAndCacheClient, readClientCache } from '@/lib/client-cache';

// ============================================
// TYPES
// ============================================
interface CustomerProfile {
  id: string;
  business_name: string;
  contact_email: string;
  phone?: string;
  customer_contact_name?: string;
  account_manager?: string;
  monthly_price: number;
  pricing_status?: 'fixed' | 'unknown';
  contract_start_date?: string | null;
  billing_day_of_month?: number | null;
  first_invoice_behavior?: 'prorated' | 'full' | 'free_until_anchor' | null;
  discount_type?: 'none' | 'percent' | 'amount' | 'free_months' | null;
  discount_value?: number | null;
  discount_duration_months?: number | null;
  discount_start_date?: string | null;
  discount_end_date?: string | null;
  upcoming_monthly_price?: number | null;
  upcoming_price_effective_date?: string | null;
  status: 'pending' | 'active' | 'archived' | 'invited' | 'agreed';
  stripe_subscription_id?: string;
  created_at: string;
  next_invoice_date?: string;
  game_plan?: { notes?: unknown[] };
  concepts?: { concept_id: string }[];
}

interface InviteFormState {
  business_name: string;
  customer_contact_name: string;
  contact_email: string;
  account_manager: string;
  monthly_price: number;
  pricing_status: 'fixed' | 'unknown';
  contract_start_date: string;
  billing_day_of_month: number;
  first_invoice_behavior: 'prorated' | 'full' | 'free_until_anchor';
  discount_type: 'none' | 'percent' | 'amount' | 'free_months';
  discount_value: number;
  discount_duration_months: number;
  discount_start_date: string;
  discount_end_date: string;
}

interface ContractEditState {
  pricing_status: 'fixed' | 'unknown';
  monthly_price: number;
  contract_start_date: string;
  billing_day_of_month: number;
  first_invoice_behavior: 'prorated' | 'full' | 'free_until_anchor';
  discount_type: 'none' | 'percent' | 'amount' | 'free_months';
  discount_value: number;
  discount_duration_months: number;
  discount_start_date: string;
  discount_end_date: string;
  upcoming_monthly_price: number;
  upcoming_price_effective_date: string;
}

interface TeamMember {
  id: string;
  name: string;
  email?: string;
  role: string;
  is_active: boolean;
  avatar_url?: string;
  color?: string;
}

interface Stats {
  mrr: number;
  activeCustomers: number;
  pendingCount: number;
}

interface AdminDashboardCachePayload {
  customers: CustomerProfile[];
  teamMembers: TeamMember[];
  stats: Stats;
}

// ============================================
// CONSTANTS & HELPERS
// ============================================
const ADMIN_DASHBOARD_CACHE_KEY = 'admin:dashboard:v1';
const ADMIN_DASHBOARD_CACHE_TTL_MS = 2 * 60_000;
const ADMIN_DASHBOARD_CACHE_MAX_STALE_MS = 10 * 60_000;
const ADMIN_CUSTOMER_INVOICES_CACHE_TTL_MS = 2 * 60_000;
const ADMIN_CUSTOMER_INVOICES_CACHE_MAX_STALE_MS = 10 * 60_000;

const todayYmd = () => new Date().toISOString().split('T')[0];

const buildDefaultInviteForm = (): InviteFormState => ({
  business_name: '',
  customer_contact_name: '',
  contact_email: '',
  account_manager: '',
  monthly_price: 0,
  pricing_status: 'fixed',
  contract_start_date: todayYmd(),
  billing_day_of_month: 25,
  first_invoice_behavior: 'prorated',
  discount_type: 'none',
  discount_value: 0,
  discount_duration_months: 1,
  discount_start_date: todayYmd(),
  discount_end_date: '',
});

const buildContractEditForm = (customer: CustomerProfile): ContractEditState => ({
  pricing_status: customer.pricing_status || (customer.monthly_price > 0 ? 'fixed' : 'unknown'),
  monthly_price: Number(customer.monthly_price) || 0,
  contract_start_date: customer.contract_start_date || todayYmd(),
  billing_day_of_month: Math.max(1, Math.min(28, Number(customer.billing_day_of_month) || 25)),
  first_invoice_behavior: customer.first_invoice_behavior || 'prorated',
  discount_type: customer.discount_type || 'none',
  discount_value: Number(customer.discount_value) || 0,
  discount_duration_months: Math.max(1, Number(customer.discount_duration_months) || 1),
  discount_start_date: customer.discount_start_date || todayYmd(),
  discount_end_date: customer.discount_end_date || '',
  upcoming_monthly_price: Number(customer.upcoming_monthly_price) || 0,
  upcoming_price_effective_date: customer.upcoming_price_effective_date || '',
});

// ============================================
// MAIN COMPONENT
// ============================================
export default function AdminDashboard() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [stats, setStats] = useState<Stats>({ mrr: 0, activeCustomers: 0, pendingCount: 0 });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending'>('all');
  const [cmFilter, setCmFilter] = useState<string>('all');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const [customerInvoices, setCustomerInvoices] = useState<Record<string, unknown>[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [showOlderInvoices, setShowOlderInvoices] = useState(false);

  const [resendLoading, setResendLoading] = useState(false);

  const [sortField, setSortField] = useState<'created_at' | 'business_name' | 'monthly_price'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  const [inviteForm, setInviteForm] = useState<InviteFormState>(buildDefaultInviteForm());
  const [inviteLoading, setInviteLoading] = useState(false);
  const [contractForm, setContractForm] = useState<ContractEditState | null>(null);
  const [contractSaving, setContractSaving] = useState(false);

  // ---- Data loading ----

  const applyDashboardData = (payload: AdminDashboardCachePayload) => {
    setCustomers(payload.customers);
    setTeamMembers(payload.teamMembers);
    setStats(payload.stats);
  };

  useEffect(() => {
    const cached = readClientCache<AdminDashboardCachePayload>(ADMIN_DASHBOARD_CACHE_KEY, {
      allowExpired: true,
      maxStaleMs: ADMIN_DASHBOARD_CACHE_MAX_STALE_MS,
    });
    if (cached) {
      applyDashboardData(cached.value);
      setLoading(false);
      void fetchData(true);
      return;
    }
    void fetchData();
  }, []);

  useEffect(() => {
    if (selectedCustomer) {
      setPanelOpen(true);
      void fetchCustomerInvoices();
      setContractForm(buildContractEditForm(selectedCustomer));
    } else {
      setPanelOpen(false);
      setContractForm(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.id]);

  const fetchCustomerInvoices = async (force = false) => {
    if (!selectedCustomer) return;
    const cacheKey = `admin:customer-invoices:${selectedCustomer.id}`;

    if (!force) {
      const cached = readClientCache<Record<string, unknown>[]>(cacheKey, {
        allowExpired: true,
        maxStaleMs: ADMIN_CUSTOMER_INVOICES_CACHE_MAX_STALE_MS,
      });
      if (cached) {
        setCustomerInvoices(cached.value);
        setInvoicesLoading(false);
        void fetchCustomerInvoices(true);
        return;
      }
    }

    setInvoicesLoading(true);
    try {
      const nextInvoices = await fetchAndCacheClient<Record<string, unknown>[]>(
        cacheKey,
        async () => {
          const { data } = await supabase
            .from('invoices')
            .select('*')
            .eq('customer_profile_id', selectedCustomer.id)
            .order('created_at', { ascending: false })
            .limit(10);
          return data || [];
        },
        ADMIN_CUSTOMER_INVOICES_CACHE_TTL_MS,
        { force }
      );
      setCustomerInvoices(nextInvoices);
    } catch (err) {
      console.error('Error fetching invoices:', err);
    } finally {
      setInvoicesLoading(false);
    }
  };

  const fetchData = async (force = false) => {
    try {
      const payload = await fetchAndCacheClient<AdminDashboardCachePayload>(
        ADMIN_DASHBOARD_CACHE_KEY,
        async () => {
          const [{ data: profiles }, { data: subscriptions }, { data: team }] = await Promise.all([
            supabase.from('customer_profiles').select('*').order('created_at', { ascending: false }),
            supabase.from('subscriptions').select('customer_profile_id, current_period_end').eq('status', 'active'),
            supabase.from('team_members').select('id, name, email, role, is_active, avatar_url, color').eq('is_active', true).order('name', { ascending: true }),
          ]);

          const subMap = new Map(subscriptions?.map(s => [s.customer_profile_id, s.current_period_end]) || []);
          const allCustomers: CustomerProfile[] = (profiles || []).map(p => ({
            ...(p as CustomerProfile),
            next_invoice_date: subMap.get(p.id) || undefined,
          }));

          const active = allCustomers.filter(p => p.status === 'active' || p.status === 'agreed');
          const pending = allCustomers.filter(p => p.status === 'pending' || p.status === 'invited');

          return {
            customers: allCustomers,
            teamMembers: (team as TeamMember[]) || [],
            stats: {
              mrr: active.reduce((sum, c) => sum + (c.monthly_price || 0), 0),
              activeCustomers: active.length,
              pendingCount: pending.length,
            },
          };
        },
        ADMIN_DASHBOARD_CACHE_TTL_MS,
        { force }
      );
      applyDashboardData(payload);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ---- CM helpers ----

  const normalizeIdentifier = (value?: string | null) => (value || '').trim().toLowerCase();

  const cmOptions = [
    { value: 'all', label: 'Alla CM' },
    ...teamMembers.map(m => ({ value: (m.email || m.name || '').trim(), label: m.name })),
  ].filter(o => o.value);

  const getCMInfo = (identifier: string | undefined) => {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) return null;
    return teamMembers.find(m =>
      normalizeIdentifier(m.email) === normalized || normalizeIdentifier(m.name) === normalized
    ) || null;
  };

  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // ---- Sort / filter ----

  const sortCustomers = (list: CustomerProfile[]) =>
    [...list].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (sortField) {
        case 'created_at':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case 'business_name':
          aVal = (a.business_name || '').toLowerCase();
          bVal = (b.business_name || '').toLowerCase();
          break;
        case 'monthly_price':
          aVal = a.monthly_price || 0;
          bVal = b.monthly_price || 0;
          break;
      }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = !searchQuery ||
      c.business_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.contact_email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && (c.status === 'active' || c.status === 'agreed')) ||
      (statusFilter === 'pending' && (c.status === 'pending' || c.status === 'invited'));
    const matchesCM = cmFilter === 'all' || normalizeIdentifier(c.account_manager) === normalizeIdentifier(cmFilter);
    return matchesSearch && matchesStatus && matchesCM;
  });

  const sortedCustomers = sortCustomers(filteredCustomers);
  const totalPages = Math.ceil(sortedCustomers.length / PAGE_SIZE);
  const paginatedCustomers = sortedCustomers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSort = (field: 'created_at' | 'business_name' | 'monthly_price') => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  // ---- Status helpers ----

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'agreed':   return { bg: '#d1fae5', text: '#065f46' };
      case 'pending':
      case 'invited':  return { bg: '#fef3c7', text: '#92400e' };
      case 'archived': return { bg: '#f3f4f6', text: '#6b7280' };
      default:         return { bg: '#f3f4f6', text: '#6b7280' };
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':   return 'Aktiv';
      case 'agreed':   return 'Godkänd';
      case 'pending':  return 'Väntar';
      case 'invited':  return 'Inbjuden';
      case 'archived': return 'Arkiverad';
      default:         return status;
    }
  };

  const getStatusStep = (status: string) => {
    switch (status) {
      case 'invited': return 1;
      case 'pending': return 2;
      case 'active':
      case 'agreed':  return 3;
      default:        return 0;
    }
  };

  // ---- Date helpers ----

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  };

  const formatFullDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // ---- Invoice preview ----

  const getFirstInvoicePreview = (form: Pick<
    InviteFormState,
    'pricing_status' | 'monthly_price' | 'contract_start_date' | 'billing_day_of_month' |
    'first_invoice_behavior' | 'discount_type' | 'discount_value' | 'discount_duration_months'
  >) => {
    if (form.pricing_status === 'unknown' || form.monthly_price <= 0) {
      return { firstAmount: null as number | null, text: 'Första faktura kan inte beräknas förrän pris är satt.' };
    }

    const base = form.monthly_price;
    const startDate = form.contract_start_date ? new Date(`${form.contract_start_date}T00:00:00`) : new Date();
    const billingDay = Math.max(1, Math.min(28, Number(form.billing_day_of_month) || 25));

    let anchorDate = new Date(startDate.getFullYear(), startDate.getMonth(), billingDay);
    if (anchorDate.getTime() <= startDate.getTime()) {
      anchorDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, billingDay);
    }
    const previousAnchor = new Date(anchorDate);
    previousAnchor.setMonth(previousAnchor.getMonth() - 1);
    const msPerDay = 1000 * 60 * 60 * 24;
    const cycleDays = Math.max(Math.round((anchorDate.getTime() - previousAnchor.getTime()) / msPerDay), 1);
    const billableDays = Math.max(Math.round((anchorDate.getTime() - startDate.getTime()) / msPerDay), 1);

    let firstAmount = base;
    let detail = 'Första faktura: full månadsavgift.';

    if (form.first_invoice_behavior === 'prorated') {
      firstAmount = Math.round((base * billableDays) / cycleDays);
      detail = `Proraterad period till dag ${billingDay}: ${billableDays}/${cycleDays} av månadspriset.`;
    } else if (form.first_invoice_behavior === 'free_until_anchor') {
      firstAmount = 0;
      detail = 'Ingen kostnad fram till första ordinarie faktureringsdag.';
    }

    if (form.discount_type !== 'none') {
      if (form.discount_type === 'percent') {
        firstAmount = Math.round(firstAmount * (100 - Math.max(0, Math.min(100, form.discount_value || 0))) / 100);
      } else if (form.discount_type === 'amount') {
        firstAmount = Math.max(0, firstAmount - Math.max(0, form.discount_value || 0));
      } else if (form.discount_type === 'free_months' && (form.discount_duration_months || 0) > 0) {
        firstAmount = 0;
      }
    }

    return { firstAmount, text: detail };
  };

  // ---- Handlers ----

  const handleInvite = async () => {
    if (!inviteForm.business_name || !inviteForm.contact_email) {
      alert('Fyll i företagsnamn och e-post');
      return;
    }
    if (inviteForm.pricing_status === 'fixed' && inviteForm.monthly_price <= 0) {
      alert('Sätt ett månadspris eller välj "Pris ej satt ännu".');
      return;
    }
    setInviteLoading(true);
    try {
      const payload = {
        ...inviteForm,
        monthly_price: inviteForm.pricing_status === 'fixed' ? inviteForm.monthly_price : 0,
        discount_end_date: inviteForm.discount_end_date || null,
      };

      const createResponse = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!createResponse.ok) {
        const err = await createResponse.json();
        throw new Error(err.error || 'Kunde inte skapa kund');
      }
      const { profile: newProfile } = await createResponse.json();
      if (!newProfile?.id) throw new Error('Ingen kund returnerad');

      const inviteResponse = await fetch(`/api/admin/customers/${newProfile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'send_invite', ...payload }),
      });
      const inviteResult = await inviteResponse.json();
      if (!inviteResponse.ok) {
        if (inviteResult.error?.includes('already been registered') || inviteResult.error?.includes('already been invited')) {
          alert('Användaren har redan registrerat ett konto. De kan logga in för att fortsätta.');
        } else {
          throw new Error(inviteResult.error || 'Kunde inte skicka inbjudan');
        }
        return;
      }

      alert(`Inbjudan skickad till ${inviteForm.contact_email}`);
      setShowInviteModal(false);
      setInviteForm(buildDefaultInviteForm());
      void fetchData(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Okänt fel';
      alert(`Kunde inte skicka inbjudan: ${message}`);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleResendInvite = async (customer: CustomerProfile) => {
    if (!confirm(`Skicka ny inbjudan till ${customer.contact_email}?`)) return;
    setResendLoading(true);
    try {
      const response = await fetch(`/api/admin/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'send_invite',
          business_name: customer.business_name,
          contact_email: customer.contact_email,
          customer_contact_name: customer.customer_contact_name,
          account_manager: customer.account_manager,
          monthly_price: customer.monthly_price,
          pricing_status: customer.pricing_status || (customer.monthly_price > 0 ? 'fixed' : 'unknown'),
          contract_start_date: customer.contract_start_date || todayYmd(),
          billing_day_of_month: customer.billing_day_of_month || 25,
          first_invoice_behavior: customer.first_invoice_behavior || 'prorated',
          discount_type: customer.discount_type || 'none',
          discount_value: customer.discount_value || 0,
          discount_duration_months: customer.discount_duration_months || 1,
          discount_start_date: customer.discount_start_date || todayYmd(),
          discount_end_date: customer.discount_end_date || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.error?.includes('already been registered') || result.error?.includes('already been invited')) {
          alert('Användaren har redan registrerat ett konto. De kan logga in för att fortsätta.');
        } else {
          throw new Error(result.error || 'Kunde inte skicka inbjudan');
        }
        return;
      }
      alert(`Ny inbjudan skickad till ${customer.contact_email}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Okänt fel';
      alert(`Kunde inte skicka inbjudan: ${message}`);
    } finally {
      setResendLoading(false);
    }
  };

  const handleSaveContractTerms = async () => {
    if (!selectedCustomer || !contractForm) return;
    if (contractForm.pricing_status === 'fixed' && contractForm.monthly_price <= 0) {
      alert('Sätt ett månadspris eller välj "Pris ej satt ännu".');
      return;
    }
    if (contractForm.upcoming_monthly_price > 0 && !contractForm.upcoming_price_effective_date) {
      alert('Ange datum när planerat pris ska börja gälla.');
      return;
    }
    setContractSaving(true);
    try {
      const response = await fetch(`/api/admin/customers/${selectedCustomer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          pricing_status: contractForm.pricing_status,
          monthly_price: contractForm.pricing_status === 'fixed' ? contractForm.monthly_price : 0,
          contract_start_date: contractForm.contract_start_date || null,
          billing_day_of_month: Math.max(1, Math.min(28, Number(contractForm.billing_day_of_month) || 25)),
          first_invoice_behavior: contractForm.first_invoice_behavior,
          discount_type: contractForm.discount_type,
          discount_value: Number(contractForm.discount_value) || 0,
          discount_duration_months: Number(contractForm.discount_duration_months) || null,
          discount_start_date: contractForm.discount_start_date || null,
          discount_end_date: contractForm.discount_end_date || null,
          upcoming_monthly_price: contractForm.upcoming_monthly_price > 0 ? Number(contractForm.upcoming_monthly_price) : null,
          upcoming_price_effective_date: contractForm.upcoming_price_effective_date || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Kunde inte spara avtalsinställningar');

      const updatedProfile = result.profile as CustomerProfile;
      setSelectedCustomer(updatedProfile);
      setContractForm(buildContractEditForm(updatedProfile));
      setCustomers(prev => prev.map(c => c.id === updatedProfile.id ? updatedProfile : c));
      alert('Avtalsinställningar sparade.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Okänt fel';
      alert(`Kunde inte spara avtalsinställningar: ${message}`);
    } finally {
      setContractSaving(false);
    }
  };

  const handleArchive = async (customer: CustomerProfile) => {
    if (!confirm(`Vill du arkivera ${customer.business_name}?`)) return;
    try {
      const { error } = await supabase.from('customer_profiles').update({ status: 'archived' }).eq('id', customer.id);
      if (error) throw error;
      alert(`${customer.business_name} har arkiverats`);
      void fetchData(true);
      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer({ ...selectedCustomer, status: 'archived' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Okänt fel';
      alert(`Kunde inte arkivera: ${message}`);
    }
  };

  const handleDelete = async (customer: CustomerProfile) => {
    if (!confirm(`Är du säker på att du vill TA BORT ${customer.business_name}?\n\nDetta går INTE att återställa!`)) return;
    try {
      const { error } = await supabase.from('customer_profiles').delete().eq('id', customer.id);
      if (error) throw error;
      alert(`${customer.business_name} har tagits bort`);
      setSelectedCustomer(null);
      void fetchData(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Okänt fel';
      alert(`Kunde inte ta bort: ${message}`);
    }
  };

  const currentStep = selectedCustomer ? getStatusStep(selectedCustomer.status) : 0;
  const invitePreview = getFirstInvoicePreview(inviteForm);
  const contractPreview = contractForm ? getFirstInvoicePreview(contractForm) : null;

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: LeTrendColors.textMuted }}>
        Laddar...
      </div>
    );
  }

  // ============================================
  // RENDER
  // ============================================
  return (
    <div style={{ padding: '32px', maxWidth: '1200px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, fontFamily: LeTrendTypography.fontFamily.heading, color: LeTrendColors.brownDark, margin: 0 }}>
          Kunder
        </h1>
        <button
          onClick={() => setShowInviteModal(true)}
          style={{ background: LeTrendColors.brownDark, color: LeTrendColors.cream, padding: '10px 20px', borderRadius: LeTrendRadius.md, border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
        >
          + Bjud in kund
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '32px', marginBottom: '24px', padding: '16px 20px', background: LeTrendColors.surface, borderRadius: LeTrendRadius.lg, border: `1px solid ${LeTrendColors.border}` }}>
        <div>
          <span style={{ fontSize: '13px', color: LeTrendColors.textMuted, marginRight: '8px' }}>MRR</span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: LeTrendColors.brownDark }}>{stats.mrr.toLocaleString()} kr</span>
        </div>
        <div style={{ width: '1px', background: LeTrendColors.border }} />
        <div>
          <span style={{ fontSize: '13px', color: LeTrendColors.textMuted, marginRight: '8px' }}>Aktiva</span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: LeTrendColors.success }}>{stats.activeCustomers}</span>
        </div>
        <div style={{ width: '1px', background: LeTrendColors.border }} />
        <div>
          <span style={{ fontSize: '13px', color: LeTrendColors.textMuted, marginRight: '8px' }}>Väntande</span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: '#d97706' }}>{stats.pendingCount}</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Sök kund..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '14px', minWidth: '200px', outline: 'none', background: '#fff' }}
        />

        <select
          value={cmFilter}
          onChange={e => setCmFilter(e.target.value)}
          style={{ padding: '10px 14px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '14px', background: '#fff', outline: 'none' }}
        >
          {cmOptions.map(cm => (
            <option key={cm.value} value={cm.value}>{cm.label}</option>
          ))}
        </select>

        <div style={{ display: 'flex', background: LeTrendColors.surface, borderRadius: LeTrendRadius.md, padding: '4px' }}>
          {[{ key: 'all', label: 'Alla' }, { key: 'active', label: 'Aktiva' }, { key: 'pending', label: 'Väntande' }].map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key as 'all' | 'active' | 'pending')}
              style={{ padding: '8px 14px', borderRadius: LeTrendRadius.sm, border: 'none', background: statusFilter === f.key ? '#fff' : 'transparent', color: statusFilter === f.key ? LeTrendColors.textPrimary : LeTrendColors.textMuted, fontWeight: 500, cursor: 'pointer', fontSize: '13px', boxShadow: statusFilter === f.key ? '0 1px 2px rgba(0,0,0,0.05)' : 'none' }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Customer table */}
      <div style={{ background: '#fff', borderRadius: LeTrendRadius.lg, border: `1px solid ${LeTrendColors.border}`, overflow: 'hidden' }}>
        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 100px', gap: '16px', padding: '12px 20px', background: LeTrendColors.surface, borderBottom: `1px solid ${LeTrendColors.border}`, fontSize: '12px', fontWeight: 600, color: LeTrendColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          <div onClick={() => handleSort('business_name')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Företag {sortField === 'business_name' && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
          </div>
          <div>CM</div>
          <div onClick={() => handleSort('monthly_price')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Pris {sortField === 'monthly_price' && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
          </div>
          <div onClick={() => handleSort('created_at')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            Tillagd {sortField === 'created_at' && <span>{sortDir === 'asc' ? '↑' : '↓'}</span>}
          </div>
          <div style={{ textAlign: 'center' }}>Status</div>
        </div>

        {paginatedCustomers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: LeTrendColors.textMuted }}>Inga kunder hittades</div>
        ) : (
          paginatedCustomers.map((customer, index) => {
            const statusStyle = getStatusColor(customer.status);
            const cm = getCMInfo(customer.account_manager);
            return (
              <div
                key={customer.id}
                onClick={() => setSelectedCustomer(customer)}
                style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 100px', gap: '16px', padding: '14px 20px', borderBottom: index < paginatedCustomers.length - 1 ? `1px solid ${LeTrendColors.border}` : 'none', alignItems: 'center', cursor: 'pointer', background: index % 2 === 0 ? '#fff' : LeTrendColors.surface, transition: 'background 0.1s ease' }}
                onMouseEnter={e => (e.currentTarget.style.background = LeTrendColors.surfaceLight)}
                onMouseLeave={e => (e.currentTarget.style.background = index % 2 === 0 ? '#fff' : LeTrendColors.surface)}
              >
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: LeTrendColors.textPrimary }}>{customer.business_name}</div>
                  <div style={{ fontSize: '13px', color: LeTrendColors.textMuted }}>{customer.contact_email}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {cm ? (
                    <>
                      {cm.avatar_url ? (
                        <img src={cm.avatar_url} alt={cm.name} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: cm.color || '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px', fontWeight: 600 }}>
                          {getInitials(cm.name)}
                        </div>
                      )}
                      <span style={{ fontSize: '14px', color: LeTrendColors.textSecondary }}>{cm.name}</span>
                    </>
                  ) : (
                    <span style={{ fontSize: '14px', color: LeTrendColors.textMuted }}>-</span>
                  )}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: LeTrendColors.textPrimary }}>
                  {customer.monthly_price ? `${customer.monthly_price.toLocaleString()} kr` : '-'}
                </div>
                <div style={{ fontSize: '13px', color: LeTrendColors.textSecondary }}>{formatDate(customer.created_at)}</div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span
                    style={{ width: '10px', height: '10px', borderRadius: '50%', background: statusStyle.bg, border: `2px solid ${statusStyle.bg}` }}
                    title={getStatusLabel(customer.status)}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '20px', padding: '12px' }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{ padding: '8px 12px', borderRadius: LeTrendRadius.sm, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1, fontSize: '13px' }}
          >
            Föregående
          </button>
          <div style={{ fontSize: '13px', color: LeTrendColors.textMuted, padding: '0 12px' }}>Sida {currentPage} av {totalPages}</div>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{ padding: '8px 12px', borderRadius: LeTrendRadius.sm, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.5 : 1, fontSize: '13px' }}
          >
            Nästa
          </button>
        </div>
      )}

      {/* ============================================
          INVITE MODAL
          ============================================ */}
      {showInviteModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, overflow: 'auto', padding: '20px' }}>
          <div style={{ background: '#fff', padding: '32px', borderRadius: '16px', width: '480px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 24px', fontSize: '20px', fontWeight: 600, fontFamily: LeTrendTypography.fontFamily.heading, color: LeTrendColors.brownDark }}>
              Bjud in ny kund
            </h3>

            {/* Company name */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', fontWeight: 500, color: LeTrendColors.textSecondary }}>Företagsnamn</label>
              <input value={inviteForm.business_name} onChange={e => setInviteForm({ ...inviteForm, business_name: e.target.value })} placeholder="Café Månsson" style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Email */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', fontWeight: 500, color: LeTrendColors.textSecondary }}>E-post</label>
              <input type="email" value={inviteForm.contact_email} onChange={e => setInviteForm({ ...inviteForm, contact_email: e.target.value })} placeholder="kontakt@foretag.se" style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* Contact person */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', fontWeight: 500, color: LeTrendColors.textSecondary }}>Kontaktperson</label>
              <input value={inviteForm.customer_contact_name} onChange={e => setInviteForm({ ...inviteForm, customer_contact_name: e.target.value })} placeholder="Namn" style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            {/* CM + Pricing status */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', fontWeight: 500, color: LeTrendColors.textSecondary }}>Content Manager</label>
                <select value={inviteForm.account_manager} onChange={e => setInviteForm({ ...inviteForm, account_manager: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', background: '#fff', outline: 'none', boxSizing: 'border-box' }}>
                  <option value="">Välj...</option>
                  {teamMembers.map(m => (
                    <option key={m.id} value={m.email || m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', fontWeight: 500, color: LeTrendColors.textSecondary }}>Prisstatus</label>
                <select value={inviteForm.pricing_status} onChange={e => setInviteForm({ ...inviteForm, pricing_status: e.target.value as 'fixed' | 'unknown' })} style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', background: '#fff', outline: 'none', boxSizing: 'border-box' }}>
                  <option value="fixed">Fast pris</option>
                  <option value="unknown">Pris ej satt ännu</option>
                </select>
              </div>
            </div>

            {/* Price + Contract start */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', fontWeight: 500, color: LeTrendColors.textSecondary }}>Månadspris (kr, ex moms)</label>
                <input type="number" value={inviteForm.monthly_price} disabled={inviteForm.pricing_status === 'unknown'} onChange={e => setInviteForm({ ...inviteForm, monthly_price: parseInt(e.target.value) || 0 })} placeholder="1000" style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', outline: 'none', boxSizing: 'border-box', opacity: inviteForm.pricing_status === 'unknown' ? 0.5 : 1 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', fontWeight: 500, color: LeTrendColors.textSecondary }}>Avtal startar</label>
                <input type="date" value={inviteForm.contract_start_date} onChange={e => setInviteForm({ ...inviteForm, contract_start_date: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Billing day + first invoice */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', fontWeight: 500, color: LeTrendColors.textSecondary }}>Faktureringsdag (1–28)</label>
                <input type="number" min={1} max={28} value={inviteForm.billing_day_of_month} onChange={e => setInviteForm({ ...inviteForm, billing_day_of_month: Math.min(28, Math.max(1, parseInt(e.target.value) || 25)) })} style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', fontWeight: 500, color: LeTrendColors.textSecondary }}>Första fakturan</label>
                <select value={inviteForm.first_invoice_behavior} onChange={e => setInviteForm({ ...inviteForm, first_invoice_behavior: e.target.value as InviteFormState['first_invoice_behavior'] })} style={{ width: '100%', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '15px', background: '#fff', outline: 'none', boxSizing: 'border-box' }}>
                  <option value="prorated">Proraterad till faktureringsdag</option>
                  <option value="full">Full månadsavgift</option>
                  <option value="free_until_anchor">Gratis fram till faktureringsdag</option>
                </select>
              </div>
            </div>

            {/* Discount block */}
            <div style={{ marginBottom: '16px', padding: '12px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: LeTrendColors.surface }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: LeTrendColors.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Rabatt</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <select value={inviteForm.discount_type} onChange={e => setInviteForm({ ...inviteForm, discount_type: e.target.value as InviteFormState['discount_type'] })} style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '13px', background: '#fff', boxSizing: 'border-box' }}>
                  <option value="none">Ingen rabatt</option>
                  <option value="percent">Procentrabatt</option>
                  <option value="amount">Beloppsrabatt</option>
                  <option value="free_months">Gratis månader</option>
                </select>
                <input type="number" min={0} value={inviteForm.discount_value} disabled={inviteForm.discount_type === 'none'} onChange={e => setInviteForm({ ...inviteForm, discount_value: Math.max(0, parseInt(e.target.value) || 0) })} placeholder={inviteForm.discount_type === 'percent' ? '%' : inviteForm.discount_type === 'amount' ? 'kr' : 'mån'} style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '13px', boxSizing: 'border-box', opacity: inviteForm.discount_type === 'none' ? 0.5 : 1 }} />
                <input type="number" min={1} value={inviteForm.discount_duration_months} disabled={inviteForm.discount_type === 'none'} onChange={e => setInviteForm({ ...inviteForm, discount_duration_months: Math.max(1, parseInt(e.target.value) || 1) })} placeholder="Antal mån" style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '13px', boxSizing: 'border-box', opacity: inviteForm.discount_type === 'none' ? 0.5 : 1 }} />
              </div>
            </div>

            {/* Invoice preview */}
            <div style={{ marginBottom: '24px', padding: '12px', borderRadius: LeTrendRadius.md, background: 'rgba(107,68,35,0.06)', border: `1px solid ${LeTrendColors.border}` }}>
              <div style={{ fontSize: '12px', color: LeTrendColors.textSecondary, marginBottom: '4px' }}>{invitePreview.text}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: LeTrendColors.brownDark }}>
                {invitePreview.firstAmount !== null
                  ? `Första dragning: ${invitePreview.firstAmount.toLocaleString()} kr (ex moms)`
                  : 'Första dragning beräknas när pris är satt'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowInviteModal(false)} disabled={inviteLoading} style={{ padding: '12px 20px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', cursor: inviteLoading ? 'not-allowed' : 'pointer', fontSize: '14px', opacity: inviteLoading ? 0.6 : 1 }}>Avbryt</button>
              <button onClick={handleInvite} disabled={!inviteForm.business_name || !inviteForm.contact_email || inviteLoading} style={{ padding: '12px 24px', borderRadius: LeTrendRadius.md, border: 'none', background: inviteForm.business_name && inviteForm.contact_email && !inviteLoading ? LeTrendColors.brownDark : LeTrendColors.textMuted, color: '#fff', cursor: inviteForm.business_name && inviteForm.contact_email && !inviteLoading ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: 500 }}>
                {inviteLoading ? 'Skickar...' : 'Skicka inbjudan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================
          CUSTOMER SLIDE-IN PANEL
          ============================================ */}
      {selectedCustomer && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '480px', maxWidth: '90vw', background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', zIndex: 200, display: 'flex', flexDirection: 'column', transform: panelOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)' }}>
          {/* Panel header */}
          <div style={{ padding: '24px', borderBottom: `1px solid ${LeTrendColors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: LeTrendTypography.fontFamily.heading, color: LeTrendColors.brownDark, marginBottom: '4px' }}>{selectedCustomer.business_name}</div>
              <div style={{ fontSize: '14px', color: LeTrendColors.textMuted }}>{selectedCustomer.contact_email}</div>
            </div>
            <button onClick={() => setSelectedCustomer(null)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: LeTrendColors.textMuted, padding: 0, lineHeight: 1 }}>×</button>
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>

            {/* Status flow */}
            {selectedCustomer.status !== 'archived' && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: LeTrendColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Status</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: LeTrendColors.surface, borderRadius: LeTrendRadius.md, padding: '16px' }}>
                  {[{ label: 'Inbjuden', step: 1 }, { label: 'Aktiv', step: 2 }, { label: 'Betalad', step: 3 }].map((item, idx) => (
                    <div key={item.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                      {idx > 0 && <div style={{ position: 'absolute' }} />}
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: currentStep >= item.step ? '#10b981' : '#e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: currentStep >= item.step ? '#fff' : '#999', fontSize: '12px', fontWeight: 600 }}>
                        {currentStep > item.step ? '✓' : item.step}
                      </div>
                      <span style={{ fontSize: '11px', color: currentStep >= item.step ? LeTrendColors.textPrimary : LeTrendColors.textMuted }}>{item.label}</span>
                      {idx < 2 && <div style={{ position: 'absolute', left: `${33 + idx * 33}%`, height: '2px', width: '25%', background: currentStep > item.step ? '#10b981' : '#e5e5e5', top: '50%', transform: 'translateY(-50%)' }} />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contact info */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: LeTrendColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Kontaktuppgifter</div>
              <div style={{ background: LeTrendColors.surface, borderRadius: LeTrendRadius.md, padding: '16px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginBottom: '6px' }}>Content Manager</div>
                  {(() => {
                    const cm = getCMInfo(selectedCustomer.account_manager);
                    return cm ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {cm.avatar_url ? (
                          <img src={cm.avatar_url} alt={cm.name} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: cm.color || '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 600 }}>
                            {getInitials(cm.name)}
                          </div>
                        )}
                        <span style={{ fontSize: '14px', color: LeTrendColors.textPrimary, fontWeight: 500 }}>{cm.name}</span>
                      </div>
                    ) : <span style={{ fontSize: '14px', color: LeTrendColors.textMuted }}>Ingen tilldelad</span>;
                  })()}
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', color: LeTrendColors.textMuted }}>Kontaktperson</div>
                  <div style={{ fontSize: '14px', color: LeTrendColors.textPrimary, marginTop: '2px' }}>{selectedCustomer.customer_contact_name || '-'}</div>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', color: LeTrendColors.textMuted }}>Telefon</div>
                  <div style={{ fontSize: '14px', color: LeTrendColors.textPrimary, marginTop: '2px' }}>{selectedCustomer.phone || '-'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: LeTrendColors.textMuted }}>Kund sedan</div>
                  <div style={{ fontSize: '14px', color: LeTrendColors.textPrimary, marginTop: '2px' }}>{formatFullDate(selectedCustomer.created_at)}</div>
                </div>
              </div>
            </div>

            {/* Invoice history */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: LeTrendColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Fakturahistorik</div>
              <div style={{ background: LeTrendColors.surface, borderRadius: LeTrendRadius.md, padding: '16px' }}>
                {invoicesLoading ? (
                  <div style={{ fontSize: '13px', color: LeTrendColors.textMuted }}>Laddar...</div>
                ) : customerInvoices.length === 0 ? (
                  <div style={{ fontSize: '13px', color: LeTrendColors.textMuted }}>Inga fakturor</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(() => {
                      const now = new Date();
                      const invs = customerInvoices as Array<{ id: string; status: string; due_date?: string; created_at: string }>;
                      const upcoming = invs.find(inv => inv.status === 'open' && inv.due_date && new Date(inv.due_date) > now);
                      const paid = invs.filter(inv => inv.status === 'paid').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                      const other = invs.filter(inv => inv.id !== upcoming?.id && inv.id !== paid[0]?.id);
                      const fmt = (d: string) => new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
                      return (
                        <>
                          {upcoming && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} />
                              <div style={{ fontSize: '13px', color: LeTrendColors.textPrimary }}>{fmt(upcoming.due_date!)}</div>
                            </div>
                          )}
                          {paid[0] && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                              <div style={{ fontSize: '13px', color: LeTrendColors.textPrimary }}>{fmt(paid[0].created_at)}</div>
                            </div>
                          )}
                          {other.length > 0 && (
                            <div
                              style={{ position: 'relative', cursor: 'pointer' }}
                              onMouseEnter={() => setShowOlderInvoices(true)}
                              onMouseLeave={() => setShowOlderInvoices(false)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: LeTrendColors.textMuted, flexShrink: 0, opacity: 0.5 }} />
                                <div style={{ fontSize: '13px', color: LeTrendColors.textMuted }}>+{other.length}</div>
                              </div>
                              {showOlderInvoices && (
                                <div style={{ position: 'absolute', left: 0, top: '100%', marginTop: '8px', background: LeTrendColors.textPrimary, borderRadius: LeTrendRadius.md, padding: '12px', minWidth: '180px', zIndex: 10 }}>
                                  {other.slice(0, 5).map((inv, idx) => (
                                    <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#fff', marginBottom: idx < Math.min(other.length, 5) - 1 ? '8px' : 0 }}>
                                      <span>{fmt(inv.created_at)}</span>
                                      <span style={{ opacity: 0.7 }}>{inv.status === 'paid' ? 'Betald' : inv.status}</span>
                                    </div>
                                  ))}
                                  {other.length > 5 && <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>+{other.length - 5} till</div>}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      );
                    })()}
                </div>
                )}

                {/* Price summary */}
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${LeTrendColors.border}` }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: LeTrendColors.textPrimary }}>
                    {selectedCustomer.pricing_status === 'unknown'
                      ? 'Pris ej satt ännu'
                      : selectedCustomer.monthly_price
                        ? `${selectedCustomer.monthly_price.toLocaleString()} kr/månad`
                        : 'Inget pris satt'}
                  </div>
                  {selectedCustomer.upcoming_monthly_price && selectedCustomer.upcoming_price_effective_date && (
                    <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginTop: '4px' }}>
                      Planerat pris: {selectedCustomer.upcoming_monthly_price.toLocaleString()} kr/månad från {formatFullDate(selectedCustomer.upcoming_price_effective_date)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Contract terms editor */}
            {contractForm && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: LeTrendColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Avtal och pris</div>
                <div style={{ background: LeTrendColors.surface, borderRadius: LeTrendRadius.md, padding: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginBottom: '4px' }}>Prisstatus</div>
                      <select value={contractForm.pricing_status} onChange={e => setContractForm({ ...contractForm, pricing_status: e.target.value as 'fixed' | 'unknown' })} style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', fontSize: '13px' }}>
                        <option value="fixed">Fast pris</option>
                        <option value="unknown">Pris ej satt ännu</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginBottom: '4px' }}>Månadspris (kr, ex moms)</div>
                      <input type="number" min={0} value={contractForm.monthly_price} disabled={contractForm.pricing_status === 'unknown'} onChange={e => setContractForm({ ...contractForm, monthly_price: Math.max(0, parseInt(e.target.value) || 0) })} style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '13px', opacity: contractForm.pricing_status === 'unknown' ? 0.6 : 1 }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginBottom: '4px' }}>Avtal startar</div>
                      <input type="date" value={contractForm.contract_start_date} onChange={e => setContractForm({ ...contractForm, contract_start_date: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '13px' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginBottom: '4px' }}>Faktureringsdag (1–28)</div>
                      <input type="number" min={1} max={28} value={contractForm.billing_day_of_month} onChange={e => setContractForm({ ...contractForm, billing_day_of_month: Math.max(1, Math.min(28, parseInt(e.target.value) || 25)) })} style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '13px' }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginBottom: '4px' }}>Första fakturan</div>
                      <select value={contractForm.first_invoice_behavior} onChange={e => setContractForm({ ...contractForm, first_invoice_behavior: e.target.value as ContractEditState['first_invoice_behavior'] })} style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', fontSize: '13px' }}>
                        <option value="prorated">Proraterad till faktureringsdag</option>
                        <option value="full">Full månadsavgift</option>
                        <option value="free_until_anchor">Gratis fram till faktureringsdag</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginBottom: '4px' }}>Rabatt</div>
                      <select value={contractForm.discount_type} onChange={e => setContractForm({ ...contractForm, discount_type: e.target.value as ContractEditState['discount_type'] })} style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff', fontSize: '13px' }}>
                        <option value="none">Ingen rabatt</option>
                        <option value="percent">Procentrabatt</option>
                        <option value="amount">Beloppsrabatt</option>
                        <option value="free_months">Gratis månader</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginBottom: '4px' }}>
                        Rabattvärde {contractForm.discount_type === 'percent' ? '(%)' : contractForm.discount_type === 'amount' ? '(kr)' : contractForm.discount_type === 'free_months' ? '(mån)' : ''}
                      </div>
                      <input type="number" min={0} value={contractForm.discount_value} disabled={contractForm.discount_type === 'none'} onChange={e => setContractForm({ ...contractForm, discount_value: Math.max(0, parseInt(e.target.value) || 0) })} style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '13px', opacity: contractForm.discount_type === 'none' ? 0.6 : 1 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginBottom: '4px' }}>Rabattperiod (mån)</div>
                      <input type="number" min={1} value={contractForm.discount_duration_months} disabled={contractForm.discount_type === 'none'} onChange={e => setContractForm({ ...contractForm, discount_duration_months: Math.max(1, parseInt(e.target.value) || 1) })} style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '13px', opacity: contractForm.discount_type === 'none' ? 0.6 : 1 }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginBottom: '4px' }}>Rabatt start</div>
                      <input type="date" value={contractForm.discount_start_date} onChange={e => setContractForm({ ...contractForm, discount_start_date: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '13px' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginBottom: '4px' }}>Rabatt slut (valfritt)</div>
                      <input type="date" value={contractForm.discount_end_date} onChange={e => setContractForm({ ...contractForm, discount_end_date: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '13px' }} />
                    </div>
                  </div>

                  {/* Upcoming price */}
                  <div style={{ borderTop: `1px dashed ${LeTrendColors.border}`, paddingTop: '10px', marginTop: '10px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: LeTrendColors.textSecondary, marginBottom: '8px' }}>Planerad prisändring</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginBottom: '4px' }}>Kommande pris (kr, ex moms)</div>
                        <input type="number" min={0} value={contractForm.upcoming_monthly_price} onChange={e => setContractForm({ ...contractForm, upcoming_monthly_price: Math.max(0, parseInt(e.target.value) || 0) })} style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '13px' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: LeTrendColors.textMuted, marginBottom: '4px' }}>Gäller från</div>
                        <input type="date" value={contractForm.upcoming_price_effective_date} onChange={e => setContractForm({ ...contractForm, upcoming_price_effective_date: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, fontSize: '13px' }} />
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: LeTrendColors.textMuted, marginTop: '6px' }}>Vid datumskifte används planerat pris automatiskt i checkout för nya debiteringar.</div>
                  </div>

                  {contractPreview && (
                    <div style={{ marginTop: '10px', padding: '10px', borderRadius: LeTrendRadius.md, border: `1px solid ${LeTrendColors.border}`, background: '#fff' }}>
                      <div style={{ fontSize: '12px', color: LeTrendColors.textSecondary, marginBottom: '4px' }}>{contractPreview.text}</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: LeTrendColors.textPrimary }}>
                        {contractPreview.firstAmount !== null
                          ? `Första dragning: ${contractPreview.firstAmount.toLocaleString()} kr (ex moms)`
                          : 'Första dragning beräknas när pris är satt'}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <button onClick={handleSaveContractTerms} disabled={contractSaving} style={{ padding: '10px 14px', borderRadius: LeTrendRadius.md, border: 'none', background: LeTrendColors.brownDark, color: '#fff', fontSize: '13px', fontWeight: 600, cursor: contractSaving ? 'not-allowed' : 'pointer', opacity: contractSaving ? 0.7 : 1 }}>
                      {contractSaving ? 'Sparar...' : 'Spara avtal'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: LeTrendColors.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Åtgärder</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Link href={`/studio/customers/${selectedCustomer.id}`} style={{ display: 'inline-block', padding: '10px 16px', background: LeTrendColors.brownDark, color: LeTrendColors.cream, borderRadius: LeTrendRadius.md, textDecoration: 'none', fontSize: '13px', fontWeight: 500 }}>
                  Redigera
                </Link>

                {(selectedCustomer.status === 'invited' || selectedCustomer.status === 'pending') && (
                  <button onClick={() => handleResendInvite(selectedCustomer)} disabled={resendLoading} style={{ padding: '10px 16px', background: '#fff', color: LeTrendColors.brownDark, border: `1px solid ${LeTrendColors.brownDark}`, borderRadius: LeTrendRadius.md, fontSize: '13px', fontWeight: 500, cursor: resendLoading ? 'not-allowed' : 'pointer', opacity: resendLoading ? 0.6 : 1 }}>
                    {resendLoading ? 'Skickar...' : 'Skicka inbjudan igen'}
                  </button>
                )}

                {selectedCustomer.status !== 'archived' && (
                  <button onClick={() => handleArchive(selectedCustomer)} style={{ padding: '10px 16px', background: '#fff', color: '#666', border: `1px solid ${LeTrendColors.border}`, borderRadius: LeTrendRadius.md, fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                    Arkivera
                  </button>
                )}

                {selectedCustomer.status === 'archived' && (
                  <button onClick={() => handleDelete(selectedCustomer)} style={{ padding: '10px 16px', background: '#fff', color: '#ef4444', border: '1px solid #ef4444', borderRadius: LeTrendRadius.md, fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                    Ta bort
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Panel footer */}
          <div style={{ padding: '24px', borderTop: `1px solid ${LeTrendColors.border}` }}>
            <Link href={`/studio/customers/${selectedCustomer.id}`} style={{ display: 'block', textAlign: 'center', background: LeTrendColors.brownDark, color: LeTrendColors.cream, padding: '12px', borderRadius: LeTrendRadius.md, textDecoration: 'none', fontSize: '14px', fontWeight: 600 }}>
              Hantera kund
            </Link>
          </div>
        </div>
      )}

      {/* Backdrop for panel */}
      {selectedCustomer && (
        <div
          onClick={() => setSelectedCustomer(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 100 }}
        />
      )}
    </div>
  );
}
