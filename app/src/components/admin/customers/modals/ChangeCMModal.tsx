'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TeamMemberRow } from '@/hooks/admin/useCustomers';

export default function ChangeCMModal({
  open,
  customerId,
  currentCM,
  team,
  onClose,
  onChanged,
}: {
  open: boolean;
  customerId: string;
  currentCM: string | null;
  team: TeamMemberRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const initial =
      team.find((member) => member.email === currentCM || member.name === currentCM)
        ?.id || '';
    setSelected(initial);
    setError(null);
  }, [currentCM, open, team]);

  const save = async () => {
    setLoading(true);
    setError(null);

    const member = team.find((candidate) => candidate.id === selected);

    try {
      const res = await fetch(`/api/admin/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          account_manager: member ? member.email || member.name : null,
        }),
      });
      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload.error || 'Kunde inte uppdatera CM');
      }

      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunde inte uppdatera CM');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ändra Content Manager</DialogTitle>
          <DialogDescription>Välj en aktiv CM för kunden.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
            <input
              type="radio"
              checked={selected === ''}
              onChange={() => setSelected('')}
            />
            Ingen CM tilldelad
          </label>

          {team.map((member) => (
            <label
              key={member.id}
              className="flex items-center gap-3 rounded-md border border-border p-3 text-sm"
            >
              <input
                type="radio"
                checked={selected === member.id}
                onChange={() => setSelected(member.id)}
              />
              <div className="flex items-center gap-3">
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-primary-foreground"
                  style={{ backgroundColor: member.color || '#6B4423' }}
                >
                  {member.name.charAt(0)}
                </div>
                <div>
                  <div className="font-semibold text-foreground">
                    {member.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {member.email || 'Saknar e-post'}
                  </div>
                </div>
              </div>
            </label>
          ))}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-md border border-border px-4 py-2 text-sm"
          >
            Avbryt
          </button>
          <button
            onClick={() => void save()}
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? 'Sparar...' : 'Spara'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
