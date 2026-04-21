'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Users } from 'lucide-react';
import AdminAvatar from '@/components/admin/AdminAvatar';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TeamMemberView } from '@/hooks/admin/useTeam';

type CMOption = {
  id: string;
  name: string;
  is_active: boolean;
};

type Props = {
  open: boolean;
  cm: TeamMemberView;
  allCMs: CMOption[];
  onClose: () => void;
  onSaved: () => void;
};

export default function CMEditDialog({
  open,
  cm,
  allCMs,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState(cm.name);
  const [email, setEmail] = useState(cm.email);
  const [phone, setPhone] = useState(cm.phone || '');
  const [city, setCity] = useState(cm.city || '');
  const [bio, setBio] = useState(cm.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(cm.avatar_url || '');
  const [commissionRate, setCommissionRate] = useState(
    String(Math.round(cm.commission_rate * 100)),
  );
  const [reassignTo, setReassignTo] = useState('');
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const parsedCommissionRate = Number(commissionRate);

  useEffect(() => {
    setName(cm.name);
    setEmail(cm.email);
    setPhone(cm.phone || '');
    setCity(cm.city || '');
    setBio(cm.bio || '');
    setAvatarUrl(cm.avatar_url || '');
    setCommissionRate(String(Math.round(cm.commission_rate * 100)));
    setReassignTo('');
    setConfirmArchiveOpen(false);
    setError(null);
  }, [cm]);

  const otherCMs = allCMs.filter((item) => item.id !== cm.id && item.is_active);

  const reassignCustomers = async () => {
    if (!reassignTo || cm.customers.length === 0) return;

    await Promise.all(
      cm.customers.map(async (customer) => {
        const target = allCMs.find((candidate) => candidate.id === reassignTo);
        const result = await fetch(`/api/admin/customers/${customer.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            account_manager: target ? target.name : null,
          }),
        });

        if (!result.ok) {
          const payload = (await result.json()) as { error?: string };
          throw new Error(payload.error || 'Misslyckades att omfordela kunder');
        }
      }),
    );
  };

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/team/${cm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          email,
          phone,
          city,
          bio,
          avatar_url: avatarUrl,
          commission_rate:
            (Number.isFinite(parsedCommissionRate) ? parsedCommissionRate : 20) / 100,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || 'Misslyckades');
      }

      await reassignCustomers();
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Misslyckades');
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    setSubmitting(true);
    setError(null);

    try {
      await reassignCustomers();

      const response = await fetch(`/api/admin/team/${cm.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || 'Misslyckades');
      }

      onSaved();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Misslyckades');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Redigera CM</DialogTitle>
            <DialogDescription>Uppdatera profil, kommission och kundansvar.</DialogDescription>
          </DialogHeader>

          <div className="mb-4 flex items-center gap-4">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.focus()}
              className="group relative rounded-full"
              aria-label="Byt profilbild"
            >
              <AdminAvatar name={name || cm.name} avatarUrl={avatarUrl || null} size="lg" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-foreground/25 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="rounded-full bg-card/90 px-2 py-1 text-[10px] font-semibold text-foreground">
                  Byt
                </span>
              </div>
            </button>
            <div className="flex-1">
              <div className="text-sm font-semibold text-foreground">{name || cm.name}</div>
              <div className="text-xs text-muted-foreground">
                {cm.role === 'content_manager' ? 'Content Manager' : cm.role}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Klicka pa bilden for att byta profilbild.
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <Field label="Namn">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="E-post">
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Telefon">
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                />
              </Field>
            </div>

            <Field label="Ort">
              <input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Bio">
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>

            <Field label="Profilbild (URL)">
              <input
                ref={avatarInputRef}
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                placeholder="https://..."
              />
            </Field>

            <Field label="Kommission (%)">
              <input
                value={commissionRate}
                onChange={(event) => setCommissionRate(event.target.value)}
                inputMode="decimal"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>

            {cm.customers.length > 0 ? (
              <div className="border-t border-border pt-3">
                <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Omfordela alla kunder
                </div>
                <div className="flex gap-2">
                  <select
                    value={reassignTo}
                    onChange={(event) => setReassignTo(event.target.value)}
                    className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm"
                  >
                    <option value="">Valj CM...</option>
                    {otherCMs.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!reassignTo}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Flytta {cm.customers.length} kunder
                  </button>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Spara
            </button>
            <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm">
              Avbryt
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setConfirmArchiveOpen(true)}
              disabled={submitting || (cm.customers.length > 0 && !reassignTo)}
              className="rounded-md border border-destructive/30 px-4 py-2 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50"
            >
              Arkivera CM
            </button>
          </div>
        </DialogContent>

        <ConfirmActionDialog
          open={confirmArchiveOpen}
          onOpenChange={setConfirmArchiveOpen}
          title="Arkivera CM?"
          description={
            cm.customers.length > 0
              ? `CM:n markeras som inaktiv och ${cm.customers.length} kunder flyttas innan arkivering.`
              : 'CM:n markeras som inaktiv och tas bort fran aktiv planering.'
          }
          confirmLabel="Arkivera CM"
          onConfirm={() => void handleArchive()}
          pending={submitting}
        />
      </>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
