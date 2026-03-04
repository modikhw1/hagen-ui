'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { loadConcepts, type TranslatedConcept } from '@/lib/conceptLoader';
import { RichTextEditor, GamePlanDisplay } from '@/components/studio/RichTextEditor';
import { LeTrendColors, LeTrendGradients, LeTrendTypography, LeTrendRadius, cardStyle } from '@/styles/letrend-design-system';

type NoteType = 'text' | 'heading' | 'link';

interface Note {
  type: NoteType;
  content?: string;
  label?: string;
  url?: string;
  linkType?: string;
}

interface CustomerConcept {
  concept_id: string;
  added_at: string;
  match_percentage: number;
  notes?: string;
  status: 'active' | 'paused' | 'completed';
  custom_headline?: string;
  custom_why_it_works?: string;
  custom_instructions?: string;
  custom_target_audience?: string;
}

interface CustomerProfile {
  id: string;
  business_name: string;
  contact_email: string;
  customer_contact_name?: string;
  account_manager?: string;
  monthly_price: number;
  status: string;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  game_plan?: { notes: Note[] };
  concepts: CustomerConcept[];
  created_at: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  intro: string;
  outro: string;
}

const EMAIL_TEMPLATES: EmailTemplate[] = [
  { id: 'new_concept', name: 'Nytt koncept', subject: 'Nytt koncept - LeTrend', intro: 'Hej{{contact_name}}!\n\nVi har lagt till ett nytt koncept som vi tror passar perfekt för er verksamhet.', outro: '\n\nTveka inte att höra av dig om du har frågor!\n\nMed vänliga hälsningar,\nLeTrend' },
  { id: 'new_concepts', name: 'Nya koncept', subject: 'Nya koncept - LeTrend', intro: 'Hej{{contact_name}}!\n\nVi har lagt till {{count}} nya koncept för er!', outro: '\n\nTveka inte att höra av dig om du har frågor!\n\nMed vänliga hälsningar,\nLeTrend' },
  { id: 'gameplan_updated', name: 'Game Plan uppdaterad', subject: 'Uppdaterad gameplan för {{business_name}} - LeTrend', intro: 'Hej{{contact_name}}!\n\nDin Game Plan har uppdaterats. Kolla in de senaste uppdateringarna!', outro: '\n\nTveka inte att höra av dig om du har frågor!\n\nMed vänliga hälsningar,\nLeTrend' },
  { id: 'weekly_summary', name: 'Veckosammanfattning', subject: 'Veckoupdatering - LeTrend', intro: 'Hej{{contact_name}}!\n\nHär är en sammanfattning av veckan som gick:', outro: '\n\nTack för ett bra samarbete!\n\nMed vänliga hälsningar,\nLeTrend' }
];

export default function StudioCustomerEditPage() {
  const params = useParams();
  const customerId = params?.id as string;
  
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [allConcepts, setAllConcepts] = useState<TranslatedConcept[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddConcept, setShowAddConcept] = useState(false);
  const [editingGamePlan, setEditingGamePlan] = useState(false);
  const [editingConcept, setEditingConcept] = useState<number | null>(null);
  
  // Email
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailType, setEmailType] = useState('new_concept');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailIntro, setEmailIntro] = useState('');
  const [emailOutro, setEmailOutro] = useState('');
  const [selectedConceptIds, setSelectedConceptIds] = useState<string[]>([]);
  
  // Note editor
  // Note editor state - for the new rich text editor
  const [gamePlanNotes, setGamePlanNotes] = useState<Note[]>([]);

  // Sync gamePlanNotes when customer loads
  useEffect(() => {
    if (customer?.game_plan?.notes) {
      setGamePlanNotes(customer.game_plan.notes);
    }
  }, [customer?.game_plan?.notes]);

  // When editing, use gamePlanNotes, otherwise use customer.game_plan.notes
  const displayNotes = editingGamePlan ? gamePlanNotes : (customer?.game_plan?.notes || []);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [newNoteLabel, setNewNoteLabel] = useState('');
  const [newNoteUrl, setNewNoteUrl] = useState('');
  
  const [formData, setFormData] = useState({ business_name: '', contact_email: '', customer_contact_name: '', account_manager: '', monthly_price: 0, logo_url: '' });
  const [newConcept, setNewConcept] = useState({ concept_id: '', match_percentage: 85, notes: '' });
  const [conceptEditForm, setConceptEditForm] = useState({ custom_headline: '', custom_why_it_works: '', custom_instructions: '', custom_target_audience: '' });

  useEffect(() => {
    const concepts = loadConcepts();
    setAllConcepts(concepts);
    if (customerId) fetchCustomer();
  }, [customerId]);

  useEffect(() => {
    const template = EMAIL_TEMPLATES.find(t => t.id === emailType);
    if (template && customer) {
      const count = selectedConceptIds.length || 0;
      const countText = count === 1 ? 'ett' : 
                      count === 2 ? 'två' : 
                      count === 3 ? 'tre' : 
                      count === 4 ? 'fyra' : 
                      count === 5 ? 'fem' : String(count);
      const businessName = customer.business_name || 'er verksamhet';
      const contactName = customer.customer_contact_name ? ` ${customer.customer_contact_name}` : '';
      const week = getWeekNumber();
      
      // For new_concepts, use Swedish text
      let finalSubject = template.subject;
      if (emailType === 'new_concepts' && count > 0) {
        finalSubject = `${countText.charAt(0).toUpperCase() + countText.slice(1)} nya koncept - LeTrend`;
      }
      
      setEmailSubject(finalSubject
        .replace('{{business_name}}', businessName)
        .replace('{{count}}', String(count))
        .replace('{{week}}', String(week))
        .replace('{{contact_name}}', contactName));
        
      setEmailIntro(template.intro
        .replace('{{business_name}}', businessName)
        .replace('{{count}}', String(count))
        .replace('{{week}}', String(week))
        .replace('{{contact_name}}', contactName));
        
      setEmailOutro(template.outro);
    }
  }, [emailType, customer?.business_name, customer?.customer_contact_name, selectedConceptIds.length]);

  function getWeekNumber(): number {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now.getTime() - start.getTime();
    const oneWeek = 604800000;
    return Math.ceil(diff / oneWeek);
  }

  const fetchCustomer = async () => {
    try {
      const { data } = await supabase.from('customer_profiles').select('*').eq('id', customerId).single();
      if (data) {
        setCustomer(data);
        setGamePlanNotes(data.game_plan?.notes || []);
        setFormData({
          business_name: data.business_name || '',
          contact_email: data.contact_email || '',
          customer_contact_name: data.customer_contact_name || '',
          account_manager: data.account_manager || '',
          monthly_price: data.monthly_price || 0,
          logo_url: data.logo_url || ''
        });
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    if (!customer) return;
    setSaving(true);
    try {
      await supabase.from('customer_profiles').update(formData).eq('id', customer.id);
      await fetchCustomer();
      alert('Sparat!');
    } catch (err) { alert('Fel'); }
    finally { setSaving(false); }
  };

  const addNote = () => {
    if (!customer) return;
    const newNote: Note = newNoteType === 'heading' ? { type: 'heading', content: newNoteContent } : newNoteType === 'link' ? { type: 'link', label: newNoteLabel, url: newNoteUrl, linkType: 'tiktok' } : { type: 'text', content: newNoteContent };
    setCustomer({ ...customer, game_plan: { notes: [...(customer.game_plan?.notes || []), newNote] } });
    setNewNoteContent(''); setNewNoteLabel(''); setNewNoteUrl('');
  };

  const removeNote = (index: number) => {
    if (!customer) return;
    const notes = [...(customer.game_plan?.notes || [])];
    notes.splice(index, 1);
    setCustomer({ ...customer, game_plan: { notes } });
  };

  const handleSaveGamePlan = async () => {
    if (!customer) return;
    setSaving(true);
    try {
      await supabase.from('customer_profiles').update({ game_plan: customer.game_plan }).eq('id', customer.id);
      await fetchCustomer();
      setEditingGamePlan(false);
      alert('Game Plan sparat!');
    } catch (err) { alert('Fel'); }
    finally { setSaving(false); }
  };

  const handleAddConcept = async () => {
    if (!customer || !newConcept.concept_id) return;
    const conceptToAdd: CustomerConcept = { concept_id: newConcept.concept_id, added_at: new Date().toISOString(), match_percentage: newConcept.match_percentage, notes: newConcept.notes, status: 'active' };
    const updatedConcepts = [...(customer.concepts || []), conceptToAdd];
    try {
      await supabase.from('customer_profiles').update({ concepts: updatedConcepts }).eq('id', customer.id);
      setCustomer({ ...customer, concepts: updatedConcepts });
      setShowAddConcept(false);
      setNewConcept({ concept_id: '', match_percentage: 85, notes: '' });
    } catch (err) { alert('Fel'); }
  };

  const handleRemoveConcept = async (index: number) => {
    if (!customer || !confirm('Ta bort?')) return;
    const updatedConcepts = [...(customer.concepts || [])];
    updatedConcepts.splice(index, 1);
    await supabase.from('customer_profiles').update({ concepts: updatedConcepts }).eq('id', customer.id);
    setCustomer({ ...customer, concepts: updatedConcepts });
  };

  const handleSaveConceptEdit = async (index: number) => {
    if (!customer) return;
    const updatedConcepts = [...(customer.concepts || [])];
    updatedConcepts[index] = { ...updatedConcepts[index], ...conceptEditForm };
    await supabase.from('customer_profiles').update({ concepts: updatedConcepts }).eq('id', customer.id);
    setCustomer({ ...customer, concepts: updatedConcepts });
    setEditingConcept(null);
    alert('Concept uppdaterat!');
  };

  const startEditConcept = (index: number) => {
    const concept = customer?.concepts?.[index];
    if (concept) {
      setConceptEditForm({ custom_headline: concept.custom_headline || '', custom_why_it_works: concept.custom_why_it_works || '', custom_instructions: concept.custom_instructions || '', custom_target_audience: concept.custom_target_audience || '' });
      setEditingConcept(index);
    }
  };

  const getConceptDetails = (conceptId: string) => allConcepts.find(c => c.id === conceptId);
  
  // Format date with time
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('sv-SE', { 
      day: 'numeric', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };
  
  // Check if concept was added within last 24 hours
  const isNewConcept = (dateStr: string) => {
    const added = new Date(dateStr).getTime();
    const now = Date.now();
    const hours24 = 24 * 60 * 60 * 1000;
    return (now - added) < hours24;
  };
  const formatDate = (d: string) => new Date(d).toLocaleDateString('sv-SE');

  const toggleConceptSelection = (conceptId: string) => {
    setSelectedConceptIds(prev => prev.includes(conceptId) ? prev.filter(id => id !== conceptId) : [...prev, conceptId]);
  };

  const handleSendEmail = async () => {
    if (!customer?.contact_email) return;
    setSendingEmail(true);
    try {
      const selectedConcepts = selectedConceptIds.map(id => {
        const cc = customer.concepts?.find(c => c.concept_id === id);
        const details = getConceptDetails(id);
        return { id, headline: cc?.custom_headline || details?.headline || '', headline_sv: cc?.custom_headline || details?.headline_sv, matchPercentage: cc?.match_percentage || details?.matchPercentage || 85, whyItWorks: cc?.custom_why_it_works || details?.whyItWorks || details?.whyItWorks_sv };
      });

      const res = await fetch('/api/studio/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customer.id, email_type: emailType, to_email: customer.contact_email, subject: emailSubject, intro: emailIntro, outro: emailOutro, concepts: selectedConcepts, customContent: true }),
      });
      
      const data = await res.json();
      if (data.success) { alert('📧 Email skickat!'); setSelectedConceptIds([]); }
      else { alert(data.error || 'Fel'); }
    } catch (err) { alert('Fel'); }
    finally { setSendingEmail(false); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Laddar...</div>;
  if (!customer) return <div style={{ padding: 40, textAlign: 'center' }}>Kund ej funnen</div>;

  const addedConceptIds = (customer.concepts || []).map(c => c.concept_id);
  
  // Sort concepts by added_at (newest first)
  const sortedConcepts = [...(customer.concepts || [])].sort((a, b) => 
    new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
  );
  
  const availableConcepts = allConcepts.filter(c => !addedConceptIds.includes(c.id));
  const notes = customer.game_plan?.notes || [];

  // Helper to get status color and label
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'active':
      case 'agreed':
        return { color: LeTrendColors.success, label: 'Aktiv', bg: 'rgba(90, 143, 90, 0.1)' };
      case 'pending':
        return { color: LeTrendColors.warning, label: 'Väntande', bg: 'rgba(217, 119, 6, 0.1)' };
      case 'invited':
        return { color: '#2563EB', label: 'Inbjuden', bg: 'rgba(37, 99, 235, 0.1)' };
      case 'paused':
        return { color: '#9ca3af', label: 'Pausad', bg: 'rgba(156, 163, 175, 0.1)' };
      default:
        return { color: LeTrendColors.textMuted, label: status, bg: 'rgba(157, 142, 125, 0.1)' };
    }
  };

  const statusInfo = getStatusInfo(customer.status);

  return (
    <div>
      {/* Back button */}
      <div style={{ marginBottom: 16 }}>
        <a href="/studio/customers" style={{
          color: LeTrendColors.textSecondary,
          fontSize: 14,
          textDecoration: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4
        }}>
          ← Tillbaka till kunder
        </a>
      </div>

      {/* Customer Brand Header */}
      <div style={{
        background: LeTrendGradients.brownPrimary,
        borderRadius: LeTrendRadius.xl,
        padding: '32px',
        marginBottom: 24,
        boxShadow: '0 4px 16px rgba(74, 47, 24, 0.25)',
        display: 'flex',
        gap: 24,
        alignItems: 'center'
      }}>
        {/* Customer Avatar */}
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: customer.logo_url ? `url(${customer.logo_url}) center/cover` : LeTrendColors.cream,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
          fontWeight: 700,
          color: LeTrendColors.brownDark,
          fontFamily: LeTrendTypography.fontFamily.heading,
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
        }}>
          {!customer.logo_url && customer.business_name[0].toUpperCase()}
        </div>

        {/* Customer Info */}
        <div style={{ flex: 1, color: LeTrendColors.cream }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h1 style={{
              fontSize: 28,
              fontWeight: 700,
              margin: 0,
              fontFamily: LeTrendTypography.fontFamily.heading
            }}>
              {customer.business_name}
            </h1>
            <div style={{
              padding: '4px 12px',
              borderRadius: LeTrendRadius.md,
              fontSize: 12,
              fontWeight: 600,
              background: statusInfo.bg,
              color: statusInfo.color,
              border: `1px solid ${statusInfo.color}`
            }}>
              {statusInfo.label}
            </div>
          </div>

          <div style={{
            fontSize: 14,
            opacity: 0.9,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 16,
            marginTop: 8
          }}>
            {customer.contact_email && (
              <span>📧 {customer.contact_email}</span>
            )}
            {customer.customer_contact_name && (
              <span>👤 {customer.customer_contact_name}</span>
            )}
            {customer.account_manager && (
              <span>🎯 AM: {customer.account_manager}</span>
            )}
            {customer.monthly_price > 0 && (
              <span>💰 {customer.monthly_price.toLocaleString()} kr/mån</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Left */}
        <div>
          <div style={{
            background: LeTrendColors.cream,
            borderRadius: LeTrendRadius.lg,
            padding: 20,
            marginBottom: 16,
            boxShadow: '0 1px 3px rgba(74, 47, 24, 0.1)',
            border: `1px solid ${LeTrendColors.border}`
          }}>
            <h3 style={{
              fontSize: 16,
              fontWeight: 600,
              marginBottom: 16,
              color: LeTrendColors.brownDark,
              fontFamily: LeTrendTypography.fontFamily.heading
            }}>Kunduppgifter</h3>
            <input style={{
              width: '100%',
              padding: 10,
              marginBottom: 12,
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              background: '#fff',
              color: LeTrendColors.textPrimary
            }} placeholder="Företagsnamn" value={formData.business_name} onChange={e => setFormData({ ...formData, business_name: e.target.value })} />
            <input style={{
              width: '100%',
              padding: 10,
              marginBottom: 12,
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              background: '#fff',
              color: LeTrendColors.textPrimary
            }} placeholder="Email" value={formData.contact_email} onChange={e => setFormData({ ...formData, contact_email: e.target.value })} />
            <input style={{
              width: '100%',
              padding: 10,
              marginBottom: 12,
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              background: '#fff',
              color: LeTrendColors.textPrimary
            }} placeholder="Kontaktperson" value={formData.customer_contact_name} onChange={e => setFormData({ ...formData, customer_contact_name: e.target.value })} />
            <input style={{
              width: '100%',
              padding: 10,
              marginBottom: 12,
              border: `1px solid ${LeTrendColors.border}`,
              borderRadius: LeTrendRadius.md,
              background: '#fff',
              color: LeTrendColors.textPrimary
            }} placeholder="Logo URL (valfritt)" value={formData.logo_url} onChange={e => setFormData({ ...formData, logo_url: e.target.value })} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <input style={{
                padding: 10,
                border: `1px solid ${LeTrendColors.border}`,
                borderRadius: LeTrendRadius.md,
                background: '#fff',
                color: LeTrendColors.textPrimary
              }} placeholder="Account Manager" value={formData.account_manager} onChange={e => setFormData({ ...formData, account_manager: e.target.value })} />
              <input type="number" style={{
                padding: 10,
                border: `1px solid ${LeTrendColors.border}`,
                borderRadius: LeTrendRadius.md,
                background: '#fff',
                color: LeTrendColors.textPrimary
              }} placeholder="Pris" value={formData.monthly_price} onChange={e => setFormData({ ...formData, monthly_price: parseInt(e.target.value) || 0 })} />
            </div>
            <button onClick={handleSave} disabled={saving} style={{
              background: saving ? LeTrendColors.textMuted : LeTrendColors.brownLight,
              color: LeTrendColors.cream,
              padding: '10px 20px',
              borderRadius: LeTrendRadius.md,
              border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 600
            }}>{saving ? 'Sparar...' : 'Spara'}</button>
          </div>

          {/* Game Plan - Rich Text Editor */}
          <div style={{
            background: LeTrendColors.cream,
            borderRadius: LeTrendRadius.lg,
            padding: 20,
            boxShadow: '0 1px 3px rgba(74, 47, 24, 0.1)',
            border: `1px solid ${LeTrendColors.border}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{
                fontSize: 16,
                fontWeight: 600,
                color: LeTrendColors.brownDark,
                fontFamily: LeTrendTypography.fontFamily.heading
              }}>📋 Game Plan</h3>
              <button onClick={() => setEditingGamePlan(!editingGamePlan)} style={{
                background: editingGamePlan ? '#ef4444' : LeTrendColors.warning,
                color: '#fff',
                padding: '6px 12px',
                borderRadius: LeTrendRadius.md,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600
              }}>{editingGamePlan ? 'Klart' : 'Redigera'}</button>
            </div>
            
            {editingGamePlan ? (
              <RichTextEditor 
                notes={gamePlanNotes} 
                onChange={(newNotes) => {
                  setGamePlanNotes(newNotes);
                  setCustomer({ ...customer, game_plan: { notes: newNotes } });
                }}
                isFullscreen={true}
              />
            ) : (
              <GamePlanDisplay 
                notes={customer?.game_plan?.notes || []} 
                hasChanges={gamePlanNotes.length > 0 && JSON.stringify(gamePlanNotes) !== JSON.stringify(customer?.game_plan?.notes || [])}
              />
            )}
            
            {editingGamePlan && (
              <button onClick={handleSaveGamePlan} disabled={saving} style={{ background: '#10b981', color: '#fff', padding: '12px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', marginTop: 16, width: '100%', fontWeight: 600 }}>
                {saving ? 'Sparar...' : 'Spara Game Plan'}
              </button>
            )}
          </div>
        </div>

        {/* Right */}
        <div>
          {/* Concepts Section - Enhanced for Customer Customization */}
          <div style={{
            background: LeTrendColors.cream,
            borderRadius: LeTrendRadius.lg,
            padding: 20,
            boxShadow: '0 1px 3px rgba(74, 47, 24, 0.1)',
            border: `1px solid ${LeTrendColors.border}`,
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{
                  fontSize: 16,
                  fontWeight: 600,
                  margin: 0,
                  color: LeTrendColors.brownDark,
                  fontFamily: LeTrendTypography.fontFamily.heading
                }}>🎬 Koncept för {customer.business_name}</h3>
                <p style={{
                  fontSize: 12,
                  color: LeTrendColors.textSecondary,
                  margin: '4px 0 0'
                }}>Anpassa koncepten för denna kund</p>
              </div>
              <button onClick={() => setShowAddConcept(true)} style={{
                background: LeTrendColors.success,
                color: '#fff',
                padding: '8px 14px',
                borderRadius: LeTrendRadius.md,
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600
              }}>+ Lägg till koncept</button>
            </div>

            {/* Info Banner */}
            <div style={{
              background: LeTrendColors.surface,
              borderRadius: LeTrendRadius.md,
              padding: '12px 16px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              border: `1px solid ${LeTrendColors.borderMedium}`
            }}>
              <span style={{ fontSize: 20 }}>💡</span>
              <div style={{
                fontSize: 13,
                color: LeTrendColors.brownDark
              }}>
                <strong>Så här fungerar det:</strong> Lägg till koncept → Anpassa rubrik, manus och instruktioner → Kunden ser den anpassade versionen
              </div>
            </div>

            {showAddConcept && (
              <div style={{
                background: LeTrendColors.surface,
                borderRadius: LeTrendRadius.md,
                padding: 16,
                marginBottom: 16,
                border: `1px solid ${LeTrendColors.border}`
              }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 12,
                  color: LeTrendColors.brownDark
                }}>Lägg till nytt koncept</div>
                <select style={{
                  width: '100%',
                  padding: 10,
                  marginBottom: 12,
                  border: `1px solid ${LeTrendColors.border}`,
                  borderRadius: LeTrendRadius.md,
                  fontSize: 14,
                  background: '#fff',
                  color: LeTrendColors.textPrimary
                }} value={newConcept.concept_id} onChange={e => setNewConcept({ ...newConcept, concept_id: e.target.value })}>
                  <option value="">Välj koncept från biblioteket...</option>
                  {availableConcepts.map(c => <option key={c.id} value={c.id}>{c.headline_sv || c.headline}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleAddConcept} disabled={!newConcept.concept_id} style={{
                    background: newConcept.concept_id ? LeTrendColors.brownLight : LeTrendColors.textMuted,
                    color: '#fff',
                    padding: '10px 16px',
                    borderRadius: LeTrendRadius.md,
                    border: 'none',
                    cursor: newConcept.concept_id ? 'pointer' : 'not-allowed',
                    fontSize: 13,
                    fontWeight: 600
                  }}>
                    Lägg till
                  </button>
                  <button onClick={() => setShowAddConcept(false)} style={{
                    background: '#fff',
                    color: LeTrendColors.textSecondary,
                    padding: '10px 16px',
                    borderRadius: LeTrendRadius.md,
                    border: `1px solid ${LeTrendColors.border}`,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600
                  }}>
                    Avbryt
                  </button>
                </div>
              </div>
            )}

            {(!sortedConcepts || sortedConcepts.length === 0) ? (
              <div style={{
                textAlign: 'center',
                padding: 32,
                color: LeTrendColors.textMuted,
                background: LeTrendColors.surface,
                borderRadius: LeTrendRadius.md,
                border: `1px solid ${LeTrendColors.border}`
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
                <div style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: LeTrendColors.textSecondary
                }}>Inga koncept ännu</div>
                <div style={{
                  fontSize: 13,
                  marginTop: 4,
                  color: LeTrendColors.textMuted
                }}>Lägg till koncept från biblioteket ovan</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {sortedConcepts.map((cc, index) => {
                  const details = getConceptDetails(cc.concept_id);
                  const isEditing = editingConcept === index;
                  const hasCustomizations = cc.custom_headline || cc.custom_why_it_works || cc.custom_instructions || cc.custom_target_audience;
                  
                  return (
                    <div key={index} style={{
                      background: isEditing ? '#fff' : LeTrendColors.surface,
                      borderRadius: LeTrendRadius.lg,
                      padding: 16,
                      border: hasCustomizations ? `2px solid ${LeTrendColors.success}` : `1px solid ${LeTrendColors.border}`,
                      boxShadow: isEditing ? '0 4px 12px rgba(74, 47, 24, 0.15)' : 'none'
                    }}>
                      {isEditing ? (
                        <div>
                          {/* Edit Mode */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: LeTrendColors.brownDark
                            }}>Anpassa koncept</div>
                            <button onClick={() => setEditingConcept(null)} style={{
                              background: 'none',
                              border: 'none',
                              fontSize: 20,
                              cursor: 'pointer',
                              color: LeTrendColors.textSecondary
                            }}>×</button>
                          </div>

                          {/* Original values shown as reference */}
                          <div style={{
                            background: LeTrendColors.surface,
                            borderRadius: LeTrendRadius.md,
                            padding: 12,
                            marginBottom: 16,
                            border: `1px solid ${LeTrendColors.border}`
                          }}>
                            <div style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: LeTrendColors.textSecondary,
                              textTransform: 'uppercase',
                              marginBottom: 8
                            }}>Original</div>
                            <div style={{
                              fontSize: 13,
                              marginBottom: 4,
                              color: LeTrendColors.textPrimary
                            }}><strong>Rubrik:</strong> {details?.headline_sv || details?.headline}</div>
                            {details?.whyItWorks && <div style={{
                              fontSize: 12,
                              color: LeTrendColors.textSecondary
                            }}><strong>Varför det funkar:</strong> {details.whyItWorks}</div>}
                          </div>

                          {/* Customization Fields */}
                          <div style={{ marginBottom: 12 }}>
                            <label style={{
                              display: 'block',
                              fontSize: 12,
                              fontWeight: 600,
                              color: LeTrendColors.brownDark,
                              marginBottom: 6
                            }}>📝 Anpassad rubrik för {customer.business_name}</label>
                            <input
                              style={{
                                width: '100%',
                                padding: 10,
                                border: `1px solid ${LeTrendColors.border}`,
                                borderRadius: LeTrendRadius.md,
                                fontSize: 14,
                                background: '#fff',
                                color: LeTrendColors.textPrimary
                              }}
                              placeholder="Ny rubrik som kunden ser"
                              value={conceptEditForm.custom_headline}
                              onChange={e => setConceptEditForm({ ...conceptEditForm, custom_headline: e.target.value })}
                            />
                          </div>

                          <div style={{ marginBottom: 12 }}>
                            <label style={{
                              display: 'block',
                              fontSize: 12,
                              fontWeight: 600,
                              color: LeTrendColors.brownDark,
                              marginBottom: 6
                            }}>🎯 Anpassad "Varför det funkar"</label>
                            <textarea
                              style={{
                                width: '100%',
                                padding: 10,
                                border: `1px solid ${LeTrendColors.border}`,
                                borderRadius: LeTrendRadius.md,
                                fontSize: 14,
                                minHeight: 60,
                                resize: 'vertical',
                                background: '#fff',
                                color: LeTrendColors.textPrimary
                              }}
                              placeholder="Förklara varför detta koncept passar just för denna kund"
                              value={conceptEditForm.custom_why_it_works}
                              onChange={e => setConceptEditForm({ ...conceptEditForm, custom_why_it_works: e.target.value })}
                            />
                          </div>

                          <div style={{ marginBottom: 12 }}>
                            <label style={{
                              display: 'block',
                              fontSize: 12,
                              fontWeight: 600,
                              color: LeTrendColors.brownDark,
                              marginBottom: 6
                            }}>📋 Instruktioner för filmning</label>
                            <textarea
                              style={{
                                width: '100%',
                                padding: 10,
                                border: `1px solid ${LeTrendColors.border}`,
                                borderRadius: LeTrendRadius.md,
                                fontSize: 14,
                                minHeight: 80,
                                resize: 'vertical',
                                background: '#fff',
                                color: LeTrendColors.textPrimary
                              }}
                              placeholder="Specifika instruktioner för detta koncept - t.ex. manus, tips, vad kunden ska tänka på"
                              value={conceptEditForm.custom_instructions}
                              onChange={e => setConceptEditForm({ ...conceptEditForm, custom_instructions: e.target.value })}
                            />
                          </div>

                          <div style={{ marginBottom: 16 }}>
                            <label style={{
                              display: 'block',
                              fontSize: 12,
                              fontWeight: 600,
                              color: LeTrendColors.brownDark,
                              marginBottom: 6
                            }}>👥 Målgrupp</label>
                            <input
                              style={{
                                width: '100%',
                                padding: 10,
                                border: `1px solid ${LeTrendColors.border}`,
                                borderRadius: LeTrendRadius.md,
                                fontSize: 14,
                                background: '#fff',
                                color: LeTrendColors.textPrimary
                              }}
                              placeholder="Vem riktar sig contentet mot?"
                              value={conceptEditForm.custom_target_audience}
                              onChange={e => setConceptEditForm({ ...conceptEditForm, custom_target_audience: e.target.value })}
                            />
                          </div>

                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => handleSaveConceptEdit(index)} style={{
                              background: LeTrendColors.success,
                              color: '#fff',
                              padding: '10px 20px',
                              borderRadius: LeTrendRadius.md,
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 13,
                              fontWeight: 600,
                              flex: 1
                            }}>
                              ✓ Spara ändringar
                            </button>
                            <button onClick={() => setEditingConcept(null)} style={{
                              background: '#fff',
                              color: LeTrendColors.textSecondary,
                              padding: '10px 20px',
                              borderRadius: LeTrendRadius.md,
                              border: `1px solid ${LeTrendColors.border}`,
                              cursor: 'pointer',
                              fontSize: 13,
                              fontWeight: 600
                            }}>
                              Avbryt
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {/* View Mode */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <div style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: LeTrendRadius.md,
                                  background: LeTrendColors.brownLight,
                                  color: '#fff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 12,
                                  fontWeight: 600
                                }}>
                                  {index + 1}
                                </div>
                                {hasCustomizations && (
                                  <span style={{
                                    background: LeTrendColors.success,
                                    color: '#fff',
                                    fontSize: 10,
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    fontWeight: 600
                                  }}>
                                    ANPASSAD
                                  </span>
                                )}
                              </div>
                              <div style={{
                                fontWeight: 600,
                                fontSize: 15,
                                color: LeTrendColors.brownDark,
                                marginBottom: 4
                              }}>
                                {cc.custom_headline || details?.headline_sv || details?.headline || cc.concept_id}
                              </div>

                              {/* Customizations shown inline */}
                              {cc.custom_why_it_works && (
                                <div style={{
                                  background: 'rgba(90, 143, 90, 0.08)',
                                  borderRadius: LeTrendRadius.md,
                                  padding: 10,
                                  marginBottom: 8,
                                  border: `1px solid rgba(90, 143, 90, 0.2)`
                                }}>
                                  <div style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: LeTrendColors.success,
                                    marginBottom: 4
                                  }}>🎯 Anpassad beskrivning</div>
                                  <div style={{
                                    fontSize: 13,
                                    color: LeTrendColors.textPrimary
                                  }}>{cc.custom_why_it_works}</div>
                                </div>
                              )}

                              {cc.custom_instructions && (
                                <div style={{
                                  background: 'rgba(217, 119, 6, 0.08)',
                                  borderRadius: LeTrendRadius.md,
                                  padding: 10,
                                  marginBottom: 8,
                                  border: `1px solid rgba(217, 119, 6, 0.2)`
                                }}>
                                  <div style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: LeTrendColors.warning,
                                    marginBottom: 4
                                  }}>📋 Instruktioner</div>
                                  <div style={{
                                    fontSize: 13,
                                    color: LeTrendColors.textPrimary
                                  }}>{cc.custom_instructions}</div>
                                </div>
                              )}

                              {cc.custom_target_audience && (
                                <div style={{
                                  fontSize: 12,
                                  color: LeTrendColors.textSecondary,
                                  marginTop: 4
                                }}>
                                  <span style={{ fontWeight: 500 }}>👥 Målgrupp:</span> {cc.custom_target_audience}
                                </div>
                              )}

                              {/* Original shown if customized */}
                              {hasCustomizations && details?.headline && cc.custom_headline !== details.headline && (
                                <div style={{
                                  fontSize: 11,
                                  color: LeTrendColors.textMuted,
                                  marginTop: 8,
                                  fontStyle: 'italic'
                                }}>
                                  Original: {details.headline}
                                </div>
                              )}

                              <div style={{
                                fontSize: 11,
                                color: LeTrendColors.textMuted,
                                marginTop: 8
                              }}>
                                Tillagd: {formatDate(cc.added_at)} • Match: {cc.match_percentage}%
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => startEditConcept(index)} style={{
                                background: '#fff',
                                border: `1px solid ${LeTrendColors.border}`,
                                padding: '8px 10px',
                                borderRadius: LeTrendRadius.md,
                                cursor: 'pointer',
                                fontSize: 12,
                                color: LeTrendColors.brownLight,
                                fontWeight: 600
                              }}>
                                ✏️ Anpassa
                              </button>
                              <button onClick={() => handleRemoveConcept(index)} style={{
                                background: '#fff',
                                border: '1px solid rgba(197, 48, 48, 0.3)',
                                padding: '8px 10px',
                                borderRadius: LeTrendRadius.md,
                                cursor: 'pointer',
                                fontSize: 12,
                                color: LeTrendColors.error
                              }}>
                                ×
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Email - Enhanced */}
          <div style={{
            background: LeTrendColors.cream,
            borderRadius: LeTrendRadius.lg,
            padding: 20,
            boxShadow: '0 1px 3px rgba(74, 47, 24, 0.1)',
            border: `1px solid ${LeTrendColors.border}`
          }}>
            <h3 style={{
              fontSize: 16,
              fontWeight: 600,
              marginBottom: 16,
              color: LeTrendColors.brownDark,
              fontFamily: LeTrendTypography.fontFamily.heading
            }}>📧 Skicka email</h3>

            <div style={{ marginBottom: 12 }}>
              <label style={{
                display: 'block',
                fontSize: 13,
                color: LeTrendColors.textSecondary,
                marginBottom: 6,
                fontWeight: 600
              }}>Mall</label>
              <select value={emailType} onChange={e => setEmailType(e.target.value)} style={{
                width: '100%',
                padding: 10,
                border: `1px solid ${LeTrendColors.border}`,
                borderRadius: LeTrendRadius.md,
                background: '#fff',
                color: LeTrendColors.textPrimary
              }}>
                {EMAIL_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{
                display: 'block',
                fontSize: 13,
                color: LeTrendColors.textSecondary,
                marginBottom: 6,
                fontWeight: 600
              }}>Rubrik</label>
              <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} style={{
                width: '100%',
                padding: 10,
                border: `1px solid ${LeTrendColors.border}`,
                borderRadius: LeTrendRadius.md,
                background: '#fff',
                color: LeTrendColors.textPrimary
              }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{
                display: 'block',
                fontSize: 13,
                color: LeTrendColors.textSecondary,
                marginBottom: 6,
                fontWeight: 600
              }}>Ingress</label>
              <textarea value={emailIntro} onChange={e => setEmailIntro(e.target.value)} rows={3} style={{
                width: '100%',
                padding: 10,
                border: `1px solid ${LeTrendColors.border}`,
                borderRadius: LeTrendRadius.md,
                resize: 'vertical',
                background: '#fff',
                color: LeTrendColors.textPrimary
              }} />
            </div>
            
            {sortedConcepts && sortedConcepts.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{
                  display: 'block',
                  fontSize: 13,
                  color: LeTrendColors.textSecondary,
                  marginBottom: 6,
                  fontWeight: 600
                }}>Bilaga concepts</label>
                <div style={{
                  maxHeight: 120,
                  overflowY: 'auto',
                  background: LeTrendColors.surface,
                  borderRadius: LeTrendRadius.md,
                  padding: 8,
                  border: `1px solid ${LeTrendColors.border}`
                }}>
                  {sortedConcepts.map((cc, i) => {
                    const details = getConceptDetails(cc.concept_id);
                    return (
                      <label key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: 4,
                        cursor: 'pointer'
                      }}>
                        <input type="checkbox" checked={selectedConceptIds.includes(cc.concept_id)} onChange={() => toggleConceptSelection(cc.concept_id)} />
                        <span style={{
                          fontSize: 13,
                          color: LeTrendColors.textPrimary
                        }}>{cc.custom_headline || details?.headline_sv || details?.headline || cc.concept_id}</span>
                        <span style={{
                          fontSize: 11,
                          color: LeTrendColors.success,
                          marginLeft: 'auto'
                        }}>{cc.match_percentage}%</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block',
                fontSize: 13,
                color: LeTrendColors.textSecondary,
                marginBottom: 6,
                fontWeight: 600
              }}>Avslutning</label>
              <textarea value={emailOutro} onChange={e => setEmailOutro(e.target.value)} rows={2} style={{
                width: '100%',
                padding: 10,
                border: `1px solid ${LeTrendColors.border}`,
                borderRadius: LeTrendRadius.md,
                resize: 'vertical',
                background: '#fff',
                color: LeTrendColors.textPrimary
              }} />
            </div>

            <div style={{
              background: LeTrendColors.surface,
              borderRadius: LeTrendRadius.md,
              padding: 12,
              marginBottom: 16,
              fontSize: 12,
              color: LeTrendColors.textSecondary,
              border: `1px solid ${LeTrendColors.border}`
            }}>
              <div style={{
                fontWeight: 600,
                marginBottom: 4,
                color: LeTrendColors.brownDark
              }}>Preview:</div>
              <div><strong>Rubrik:</strong> {emailSubject}</div>
              <div style={{
                whiteSpace: 'pre-wrap',
                marginTop: 4
              }}>{emailIntro}</div>
              {selectedConceptIds.length > 0 && <div style={{
                color: LeTrendColors.brownLight,
                marginTop: 4
              }}>+ {selectedConceptIds.length} concept</div>}
            </div>

            <button onClick={handleSendEmail} disabled={sendingEmail || !customer?.contact_email} style={{
              background: sendingEmail ? LeTrendColors.textMuted : LeTrendColors.brownLight,
              color: '#fff',
              padding: '12px',
              borderRadius: LeTrendRadius.md,
              border: 'none',
              cursor: sendingEmail ? 'not-allowed' : 'pointer',
              width: '100%',
              fontWeight: 600
            }}>{sendingEmail ? 'Skickar...' : '📧 Skicka email'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
