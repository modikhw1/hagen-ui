'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { resolveAppRole } from '@/lib/auth/navigation';

export default function StudioInvoicesPage() {
  const { user, profile, authLoading, profileLoading } = useAuth();
  const role = useMemo(() => resolveAppRole(profile), [profile]);
  const loading = authLoading || profileLoading;
  const isAdmin = Boolean(profile?.is_admin || role === 'admin');

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
        Laddar...
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div
        style={{
          maxWidth: '640px',
          margin: '48px auto',
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)',
        }}
      >
        <div style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937', marginBottom: '12px' }}>
          Fakturor hanteras inte i Studio
        </div>
        <p style={{ fontSize: '15px', lineHeight: 1.6, color: '#4b5563', margin: 0 }}>
          Betalningsdata är begränsad till adminytan. Content managers kan inte läsa eller synka
          fakturor härifrån.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: '720px',
        margin: '48px auto',
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '16px',
        padding: '32px',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.06)',
      }}
    >
      <div style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937', marginBottom: '12px' }}>
        Fakturor ligger i admin
      </div>
      <p style={{ fontSize: '15px', lineHeight: 1.6, color: '#4b5563', marginBottom: '20px' }}>
        För att hålla betalningsdata separerad från Studio har fakturalistan flyttats till adminytan.
      </p>
      <Link
        href="/admin/invoices"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          borderRadius: '999px',
          background: '#111827',
          color: '#fff',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Öppna adminfakturor
      </Link>
    </div>
  );
}
