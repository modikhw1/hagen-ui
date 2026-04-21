'use client';

import { useMemo, useState } from 'react';
import AdminAvatar from '@/components/admin/AdminAvatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const TEAM_COLORS = [
  '#4f46e5',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
];

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function AddCMDialog({ open, onClose, onSaved }: Props) {
  const [role, setRole] = useState<'content_manager' | 'admin'>('content_manager');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [color, setColor] = useState(TEAM_COLORS[0]);
  const [commissionRate, setCommissionRate] = useState('20');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const parsedCommissionRate = Number(commissionRate);

  const canSubmit = useMemo(
    () => name.trim().length > 0 && email.trim().length > 0,
    [email, name],
  );

  const reset = () => {
    setRole('content_manager');
    setName('');
    setEmail('');
    setPhone('');
    setCity('');
    setBio('');
    setAvatarUrl('');
    setColor(TEAM_COLORS[0]);
    setCommissionRate('20');
    setError(null);
    setWarning(null);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setWarning(null);

    try {
      const response = await fetch('/api/admin/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          email,
          phone,
          city,
          bio,
          avatar_url: avatarUrl,
          color,
          role,
          commission_rate:
            role === 'content_manager'
              ? (Number.isFinite(parsedCommissionRate) ? parsedCommissionRate : 20) / 100
              : 0,
          sendInvite: true,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        warning?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Misslyckades');
      }

      const nextWarning = payload.warning ?? null;
      reset();
      setWarning(nextWarning);
      onSaved();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Misslyckades',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          reset();
          onClose();
        }
      }}
    >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
          <DialogTitle>{role === 'admin' ? 'Lagg till admin' : 'Lagg till CM'}</DialogTitle>
            <DialogDescription>
              {role === 'admin'
                ? 'Skapa en ny adminanvandare och skicka inbjudan.'
                : 'Skapa en ny content manager och skicka inbjudan.'}
            </DialogDescription>
          </DialogHeader>

        <div className="grid gap-3">
          <div className="flex items-center gap-4 rounded-lg border border-border bg-secondary/30 p-3">
            <AdminAvatar name={name || 'Ny CM'} avatarUrl={avatarUrl || null} size="lg" />
            <div>
              <div className="text-sm font-semibold text-foreground">
                {name || (role === 'admin' ? 'Ny admin' : 'Ny CM')}
              </div>
              <div className="text-xs text-muted-foreground">
                Lagg till profilbild via URL-faltet nedan.
              </div>
            </div>
          </div>

          <Field label="Namn">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Roll">
            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as 'content_manager' | 'admin')
              }
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="content_manager">Content Manager</option>
              <option value="admin">Admin</option>
            </select>
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
              value={avatarUrl}
              onChange={(event) => setAvatarUrl(event.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </Field>

          {role === 'content_manager' ? (
            <Field label="Kommission (%)">
              <input
                value={commissionRate}
                onChange={(event) => setCommissionRate(event.target.value)}
                inputMode="decimal"
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </Field>
          ) : (
            <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
              Admin-invites skapas utan payrollfokus. Kommission anvands bara for CMs.
            </div>
          )}

          <Field label="Farg">
            <div className="flex flex-wrap gap-2">
              {TEAM_COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setColor(item)}
                  className={`h-8 w-8 rounded-full border-2 ${
                    color === item ? 'border-foreground' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: item }}
                />
              ))}
            </div>
          </Field>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          {warning ? (
            <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
              {warning}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm"
          >
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting
              ? 'Skapar...'
              : role === 'admin'
                ? 'Lagg till admin och bjud in'
                : 'Lagg till CM och bjud in'}
          </button>
        </div>
      </DialogContent>
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
