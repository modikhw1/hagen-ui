'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { callCustomerAction } from '@/lib/admin/api-client';
import type { TeamMemberRow } from '@/hooks/admin/useCustomers';
import { formatSek } from '@/lib/admin/money';

type Mode = 'now' | 'scheduled' | 'temporary';

export default function ChangeCMModal({
  open,
  customerId,
  currentCM,
  currentMonthlyPrice,
  team,
  onClose,
  onChanged,
}: {
  open: boolean;
  customerId: string;
  currentCM: string | null;
  currentMonthlyPrice: number | null;
  team: TeamMemberRow[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState<Mode>('now');
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [coverageEndDate, setCoverageEndDate] = useState(today);
  const [handoverNote, setHandoverNote] = useState('');
  const [compensationMode, setCompensationMode] = useState<'covering_cm' | 'primary_cm'>('covering_cm');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentMember = useMemo(
    () =>
      team.find((member) => member.email === currentCM || member.name === currentCM) ?? null,
    [currentCM, team],
  );
  const nextMember = useMemo(
    () => team.find((member) => member.id === selected) ?? null,
    [selected, team],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const initial =
      team.find((member) => member.email === currentCM || member.name === currentCM)?.id || '';
    setSelected(initial);
    setMode('now');
    setEffectiveDate(today);
    setCoverageEndDate(today);
    setHandoverNote('');
    setCompensationMode('covering_cm');
    setError(null);
  }, [currentCM, open, team, today]);

  const preview = useMemo(() => {
    const parsedPriceOre = Math.round((Number(currentMonthlyPrice) || 0) * 100);
    if (!parsedPriceOre || !nextMember) {
      return null;
    }

    const effective = new Date(`${effectiveDate}T00:00:00`);
    const anchor =
      effective.getDate() >= 25
        ? new Date(effective.getFullYear(), effective.getMonth() + 1, 25)
        : new Date(effective.getFullYear(), effective.getMonth(), 25);
    const periodStart = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 25);
    const periodEnd = new Date(anchor.getFullYear(), anchor.getMonth(), 24);
    const totalDays = Math.round((anchor.getTime() - periodStart.getTime()) / 86_400_000);

    const currentSliceDays =
      effective <= periodStart
        ? 0
        : Math.max(
            0,
            Math.round((effective.getTime() - periodStart.getTime()) / 86_400_000),
          );
    const nextSliceDays =
      mode === 'temporary'
        ? Math.max(
            0,
            Math.min(
              totalDays - currentSliceDays,
              Math.round(
                (new Date(`${coverageEndDate}T00:00:00`).getTime() - effective.getTime()) /
                  86_400_000,
              ) + 1,
            ),
          )
        : Math.max(0, totalDays - currentSliceDays);
    const currentCommissionRate = Number(currentMember?.commission_rate ?? 0.2);
    const nextCommissionRate = Number(nextMember.commission_rate ?? 0.2);
    const coverPayoutOre = Math.round(
      (parsedPriceOre * nextSliceDays / totalDays) * nextCommissionRate,
    );

    return {
      label: `${periodStart.toISOString().slice(0, 10)} - ${periodEnd.toISOString().slice(0, 10)}`,
      currentSliceDays,
      nextSliceDays,
      currentPayoutOre: Math.round(
        (parsedPriceOre * currentSliceDays / totalDays) * currentCommissionRate,
      ),
      nextPayoutOre:
        compensationMode === 'primary_cm' && mode === 'temporary'
          ? 0
          : coverPayoutOre,
      retainedPayoutOre:
        compensationMode === 'primary_cm' && mode === 'temporary'
          ? coverPayoutOre
          : 0,
    };
  }, [
    compensationMode,
    coverageEndDate,
    currentMember?.commission_rate,
    currentMonthlyPrice,
    effectiveDate,
    mode,
    nextMember,
  ]);

  const save = async () => {
    setLoading(true);
    setError(null);

    try {
      const result =
        mode === 'temporary'
          ? await callCustomerAction(customerId, {
              action: 'set_temporary_coverage',
              covering_cm_id: selected,
              starts_on: effectiveDate,
              ends_on: coverageEndDate,
              note: handoverNote || null,
              compensation_mode: compensationMode,
            })
          : await callCustomerAction(customerId, {
              action: 'change_account_manager',
              cm_id: selected || null,
              effective_date: mode === 'scheduled' ? effectiveDate : today,
              handover_note: handoverNote || null,
            });

      if (!result.ok) {
        throw new Error(result.error || 'Kunde inte uppdatera CM');
      }

      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Kunde inte uppdatera CM');
    } finally {
      setLoading(false);
    }
  };

  const disableSave =
    loading ||
    (mode === 'temporary' && (!currentMember || !selected || coverageEndDate < effectiveDate));

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Andra Content Manager</DialogTitle>
          <DialogDescription>
            Permanent handover eller tillfallig coverage. Payroll delar perioden 25 till 25 pro rata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            <ModeButton
              active={mode === 'now'}
              onClick={() => setMode('now')}
              title="Byt nu"
              description="Ny CM tar over fran idag."
            />
            <ModeButton
              active={mode === 'scheduled'}
              onClick={() => setMode('scheduled')}
              title="Schemalagg"
              description="Bytet aktiveras pa valt datum."
            />
            <ModeButton
              active={mode === 'temporary'}
              onClick={() => setMode('temporary')}
              title="Temp coverage"
              description="Tackning med start- och slutdatum."
            />
          </div>

          {mode !== 'now' ? (
            <div className={`grid gap-3 ${mode === 'temporary' ? 'sm:grid-cols-2' : 'sm:grid-cols-1'}`}>
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Startdatum
                </div>
                <input
                  type="date"
                  value={effectiveDate}
                  min={today}
                  onChange={(event) => setEffectiveDate(event.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              {mode === 'temporary' ? (
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    Slutdatum
                  </div>
                  <input
                    type="date"
                    value={coverageEndDate}
                    min={effectiveDate}
                    onChange={(event) => setCoverageEndDate(event.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3">
            {mode !== 'temporary' ? (
              <label className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
                <input
                  type="radio"
                  checked={selected === ''}
                  onChange={() => setSelected('')}
                />
                Ingen CM tilldelad
              </label>
            ) : null}

            {team.map((member) => (
              <label
                key={member.id}
                className={`flex items-center gap-3 rounded-md border p-3 text-sm ${
                  selected === member.id ? 'border-primary bg-primary/5' : 'border-border'
                }`}
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
                    <div className="font-semibold text-foreground">{member.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {member.email || 'Saknar e-post'}
                      {typeof member.commission_rate === 'number'
                        ? ` · ${Math.round(member.commission_rate * 100)}% kommission`
                        : ''}
                    </div>
                  </div>
                </div>
              </label>
            ))}
          </div>

          {mode === 'temporary' ? (
            <div className="rounded-md border border-border bg-secondary/30 p-3">
              <div className="mb-2 text-sm font-semibold text-foreground">Provision under tackning</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <ModeButton
                  active={compensationMode === 'covering_cm'}
                  onClick={() => setCompensationMode('covering_cm')}
                  title="Tackande CM far provision"
                  description="Ansvar och ersattning ligger pa cover under perioden."
                />
                <ModeButton
                  active={compensationMode === 'primary_cm'}
                  onClick={() => setCompensationMode('primary_cm')}
                  title="Ordinarie CM behaller provision"
                  description="Cover tar ansvar, men payout ligger kvar pa ordinarie CM."
                />
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              Intern notering
            </div>
            <textarea
              value={handoverNote}
              onChange={(event) => setHandoverNote(event.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder={
                mode === 'temporary'
                  ? 'Notering till coverage, franvaro och payroll.'
                  : 'Valfri intern notering till audit och payroll.'
              }
            />
          </div>

          {preview ? (
            <div className="rounded-md border border-border bg-secondary/30 p-3">
              <div className="text-sm font-semibold text-foreground">
                Pro rata-preview for perioden {preview.label}
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <PreviewCard
                  title={currentMember?.name || 'Nuvarande CM'}
                  subtitle={`${preview.currentSliceDays} dagar`}
                  value={formatSek(preview.currentPayoutOre + preview.retainedPayoutOre)}
                />
                <PreviewCard
                  title={nextMember?.name || 'Ny CM'}
                  subtitle={`${preview.nextSliceDays} dagar`}
                  value={formatSek(preview.nextPayoutOre)}
                />
              </div>
              {mode === 'temporary' && compensationMode === 'primary_cm' ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  Ordinarie CM behaller provision for cover-dagarna, men tackande CM tar operativt ansvar.
                </div>
              ) : null}
            </div>
          ) : null}

          {mode === 'temporary' && !currentMember ? (
            <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
              Kunden saknar ordinarie CM. Tillfallig coverage kan bara laggas pa en befintlig ansvarig CM.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
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
            disabled={disableSave}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading
              ? 'Sparar...'
              : mode === 'scheduled'
                ? 'Schemalagg byte'
                : mode === 'temporary'
                  ? 'Skapa coverage'
                  : 'Byt CM'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-3 text-left ${
        active ? 'border-primary bg-primary/5' : 'border-border bg-background'
      }`}
    >
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </button>
  );
}

function PreviewCard({
  title,
  subtitle,
  value,
}: {
  title: string;
  subtitle: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
      <div className="mt-2 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
