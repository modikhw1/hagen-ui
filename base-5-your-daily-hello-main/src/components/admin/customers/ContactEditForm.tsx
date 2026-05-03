'use client';

import { useState } from 'react';
import type { CustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { apiClient } from '@/lib/admin/api-client';

export default function ContactEditForm({
  customer,
  onSaved,
}: {
  customer: CustomerDetail;
  onSaved: () => void;
}) {
  const [businessName, setBusinessName] = useState(customer.business_name);
  const [contactEmail, setContactEmail] = useState(customer.contact_email);
  const [contactName, setContactName] = useState(
    customer.customer_contact_name || '',
  );
  const [phone, setPhone] = useState(customer.phone || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setLoading(true);
    setError(null);

    try {
      await apiClient.patch(`/api/admin/customers/${customer.id}`, {
        business_name: businessName.trim(),
        contact_email: contactEmail.trim(),
        customer_contact_name: contactName.trim() || null,
        phone: phone.trim() || null,
      });

      onSaved();
    } catch (e: unknown) {
      setError(
        e instanceof Error ? e.message : 'Kunde inte spara kontaktuppgifter',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <input
        value={businessName}
        onChange={(event) => setBusinessName(event.target.value)}
        placeholder="Företagsnamn"
        className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
      />
      <input
        type="email"
        value={contactEmail}
        onChange={(event) => setContactEmail(event.target.value)}
        placeholder="E-post"
        className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
      />
      <input
        value={contactName}
        onChange={(event) => setContactName(event.target.value)}
        placeholder="Kontaktperson"
        className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
      />
      <input
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        placeholder="Telefon"
        className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
      />

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => void save()}
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? 'Sparar...' : 'Spara'}
        </button>
      </div>
    </div>
  );
}
