'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface Contact {
  name: string;
  email: string;
  phone: string;
}

interface GamePlan {
  title: string;
  description: string;
  goals: string[];
  targetAudience: string;
  contentThemes: string[];
  postingFrequency: string;
}

interface CustomerProfile {
  id: string;
  business_name: string;
  contact_email: string;
  monthly_price: number;
  price_start_date: string;
  price_end_date: string;
  contacts: Contact[];
  profile_data: Record<string, unknown>;
  game_plan: GamePlan;
  concepts: unknown[];
  status: 'pending' | 'active' | 'archived' | 'invited' | 'agreed';
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  invited_at?: string;
  agreed_at?: string;
  created_at: string;
  updated_at: string;
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<CustomerProfile | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    business_name: '',
    contact_email: '',
    monthly_price: 0,
    price_start_date: '',
    price_end_date: '',
    contacts: [{ name: 'Mahmoud', email: '', phone: '' }] as Contact[],
    game_plan: {
      title: '',
      description: '',
      goals: [] as string[],
      targetAudience: '',
      contentThemes: [] as string[],
      postingFrequency: ''
    } as GamePlan,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = '/login';
      return;
    }

    if (user) {
      fetchProfiles();
    }
  }, [user, authLoading]);

  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/admin/customers');
      const data = await res.json();
      setProfiles(data.profiles || []);
    } catch (err) {
      console.error('Error fetching profiles:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create profile');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setProfiles([data.profile, ...profiles]);
      setShowForm(false);
      resetForm();
    } catch (err) {
      console.error('Error creating profile:', err);
      alert('Failed to create profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvite = async (profile: CustomerProfile) => {
    if (!confirm(`Send invite to ${profile.contact_email}?`)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_invite',
          contact_email: profile.contact_email,
          business_name: profile.business_name,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to send invite');
        return;
      }

      alert(`Inbjudan skickad till ${profile.contact_email}! Kunden kommer få ett email via Resend.`);
      await fetchProfiles();
    } catch (err) {
      console.error('Error sending invite:', err);
      alert('Failed to send invite');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (profile: CustomerProfile) => {
    if (!confirm(`Aktivera ${profile.business_name}?`)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/customers/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate' }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to activate');
        return;
      }

      alert('Profil aktiverad!');
      await fetchProfiles();
    } catch (err) {
      console.error('Error activating profile:', err);
      alert('Failed to activate profile');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (profile: CustomerProfile) => {
    if (!confirm(`Delete ${profile.business_name}?`)) return;

    try {
      const res = await fetch(`/api/admin/customers/${profile.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        alert('Failed to delete profile');
        return;
      }

      setProfiles(profiles.filter(p => p.id !== profile.id));
    } catch (err) {
      console.error('Error deleting profile:', err);
      alert('Failed to delete profile');
    }
  };

  const resetForm = () => {
    setFormData({
      business_name: '',
      contact_email: '',
      monthly_price: 0,
      price_start_date: '',
      price_end_date: '',
      contacts: [{ name: 'Mahmoud', email: '', phone: '' }],
      game_plan: {
        title: '',
        description: '',
        goals: [],
        targetAudience: '',
        contentThemes: [],
        postingFrequency: ''
      },
    });
    setEditingProfile(null);
  };

  const addContact = () => {
    setFormData({
      ...formData,
      contacts: [...formData.contacts, { name: '', email: '', phone: '' }]
    });
  };

  const updateContact = (index: number, field: keyof Contact, value: string) => {
    const newContacts = [...formData.contacts];
    newContacts[index] = { ...newContacts[index], [field]: value };
    setFormData({ ...formData, contacts: newContacts });
  };

  const removeContact = (index: number) => {
    setFormData({
      ...formData,
      contacts: formData.contacts.filter((_, i) => i !== index)
    });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5]">
        <div className="w-8 h-8 border-2 border-[#6B4423] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[#1A1612]">Admin - Kundprofiler</h1>
            <p className="text-[#5D4D3D] mt-1">Hantera kundprofiler och inbjudningar</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-6 py-3 bg-[#6B4423] text-white rounded-lg font-semibold"
          >
            {showForm ? 'Stäng' : 'Ny kund'}
          </button>
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="bg-white rounded-2xl p-6 mb-8 shadow-lg">
            <h2 className="text-xl font-semibold text-[#1A1612] mb-4">Skapa ny kundprofil</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1A1612] mb-1">Företagsnamn *</label>
                  <input
                    type="text"
                    value={formData.business_name}
                    onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                    className="w-full p-3 border border-[#E5E0DA] rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1A1612] mb-1">Kontakt-email</label>
                  <input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    className="w-full p-3 border border-[#E5E0DA] rounded-lg"
                  />
                </div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#1A1612] mb-1">Månadspris (kr)</label>
                  <input
                    type="number"
                    value={formData.monthly_price}
                    onChange={(e) => setFormData({ ...formData, monthly_price: parseInt(e.target.value) || 0 })}
                    className="w-full p-3 border border-[#E5E0DA] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#1A1612] mb-1">Betalingsperiod</label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={formData.price_start_date}
                      onChange={(e) => setFormData({ ...formData, price_start_date: e.target.value })}
                      className="flex-1 p-3 border border-[#E5E0DA] rounded-lg"
                    />
                    <span className="self-center text-[#5D4D3D]">-</span>
                    <input
                      type="date"
                      value={formData.price_end_date}
                      onChange={(e) => setFormData({ ...formData, price_end_date: e.target.value })}
                      className="flex-1 p-3 border border-[#E5E0DA] rounded-lg"
                      placeholder="Tills vidare"
                    />
                  </div>
                  <p className="text-xs text-[#5D4D3D] mt-1">Lämna tomt för "tills vidare"</p>
                </div>
              </div>

              {/* Contacts */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-[#1A1612]">Kontaktpersoner</label>
                  <button
                    type="button"
                    onClick={addContact}
                    className="text-sm text-[#6B4423] font-medium"
                  >
                    + Lägg till kontakt
                  </button>
                </div>
                {formData.contacts.map((contact, index) => (
                  <div key={index} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Namn"
                      value={contact.name}
                      onChange={(e) => updateContact(index, 'name', e.target.value)}
                      className="flex-1 p-2 border border-[#E5E0DA] rounded-lg"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={contact.email}
                      onChange={(e) => updateContact(index, 'email', e.target.value)}
                      className="flex-1 p-2 border border-[#E5E0DA] rounded-lg"
                    />
                    <input
                      type="tel"
                      placeholder="Telefon"
                      value={contact.phone}
                      onChange={(e) => updateContact(index, 'phone', e.target.value)}
                      className="flex-1 p-2 border border-[#E5E0DA] rounded-lg"
                    />
                    {formData.contacts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContact(index)}
                        className="text-red-500 px-2"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Game Plan */}
              <div>
                <label className="block text-sm font-medium text-[#1A1612] mb-2">Game Plan</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Titel"
                    value={formData.game_plan.title}
                    onChange={(e) => setFormData({
                      ...formData,
                      game_plan: { ...formData.game_plan, title: e.target.value }
                    })}
                    className="w-full p-3 border border-[#E5E0DA] rounded-lg"
                  />
                  <input
                    type="text"
                    placeholder="Posting Frequency (t.ex. 3 gånger/vecka)"
                    value={formData.game_plan.postingFrequency}
                    onChange={(e) => setFormData({
                      ...formData,
                      game_plan: { ...formData.game_plan, postingFrequency: e.target.value }
                    })}
                    className="w-full p-3 border border-[#E5E0DA] rounded-lg"
                  />
                  <input
                    type="text"
                    placeholder="Målgrupp"
                    value={formData.game_plan.targetAudience}
                    onChange={(e) => setFormData({
                      ...formData,
                      game_plan: { ...formData.game_plan, targetAudience: e.target.value }
                    })}
                    className="w-full p-3 border border-[#E5E0DA] rounded-lg"
                  />
                  <textarea
                    placeholder="Beskrivning"
                    value={formData.game_plan.description}
                    onChange={(e) => setFormData({
                      ...formData,
                      game_plan: { ...formData.game_plan, description: e.target.value }
                    })}
                    className="w-full p-3 border border-[#E5E0DA] rounded-lg"
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 bg-[#6B4423] text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {loading ? 'Sparar...' : 'Skapa profil'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); resetForm(); }}
                  className="px-6 py-3 border border-[#E5E0DA] text-[#5D4D3D] rounded-lg font-semibold"
                >
                  Avbryt
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Profiles List */}
        <div className="space-y-4">
          {profiles.length === 0 ? (
            <div className="text-center py-12 text-[#5D4D3D]">
              Inga kundprofiler ännu. Skapa en ny!
            </div>
          ) : (
            profiles.map((profile) => (
              <div key={profile.id} className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-[#1A1612]">{profile.business_name}</h3>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        profile.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        profile.status === 'invited' ? 'bg-blue-100 text-blue-800' :
                        profile.status === 'agreed' ? 'bg-green-100 text-green-800' :
                        profile.status === 'active' ? 'bg-green-200 text-green-900' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {profile.status}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-[#5D4D3D]">
                      <div>
                        <span className="font-medium">Email:</span> {profile.contact_email || '-'}
                      </div>
                      <div>
                        <span className="font-medium">Pris:</span> {profile.monthly_price} kr/mån
                      </div>
                      <div>
                        <span className="font-medium">Start:</span> {profile.price_start_date || '-'}
                      </div>
                      <div>
                        <span className="font-medium">Kontakter:</span> {profile.contacts?.length || 0}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4">
                    {profile.status === 'pending' && profile.contact_email && (
                      <button
                        onClick={() => handleSendInvite(profile)}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-medium"
                      >
                        Skicka invite
                      </button>
                    )}
                    {profile.status === 'invited' && (
                      <button
                        onClick={() => handleActivate(profile)}
                        className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg font-medium"
                      >
                        Aktivera
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(profile)}
                      className="px-4 py-2 text-red-600 text-sm rounded-lg font-medium hover:bg-red-50"
                    >
                      Ta bort
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
