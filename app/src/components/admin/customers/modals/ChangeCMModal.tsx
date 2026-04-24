'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { ModeButton } from '@/components/admin/_primitives';
import { AdminFormDialog } from '@/components/admin/ui/feedback/AdminFormDialog';
import { captureAdminError } from '@/lib/admin/admin-telemetry';
import {
  calculateCmChangePreview,
  type CmChangePreviewInput,
} from '@/lib/admin/cm-change-preview';
import { hashToHsl } from '@/lib/admin/color';
import { changeCmCopy, teamCopy } from '@/lib/admin/copy/team';
import { formatSek } from '@/lib/admin/money';
import { todayDateInput } from '@/lib/admin/time';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { usePreviewCmChange } from '@/hooks/admin/usePreviewCmChange';
import { useTeamMembers, type TeamMemberRow } from '@/hooks/admin/useTeamMembers';
import { Search, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Mode = 'now' | 'scheduled' | 'temporary';

export default function ChangeCMModal({
  open,
  customerId,
  currentCmId,
  currentMonthlyPrice,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  customerId: string;
  currentCmId: string | null;
  currentMonthlyPrice?: number | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const [mode, setMode] = useState<Mode>('now');
  const [selectedOverride, setSelectedOverride] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const today = todayDateInput();
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [coverageEndDate, setCoverageEndDate] = useState(today);
  const [handoverNote, setHandoverNote] = useState('');
  const [compensationMode, setCompensationMode] = useState<'covering_cm' | 'primary_cm'>(
    'covering_cm',
  );

  const teamQuery = useTeamMembers();
  const activeTeam = useMemo(
    () => (teamQuery.data ?? []).filter((m) => m.is_active),
    [teamQuery.data],
  );

  const selected = selectedOverride ?? currentCmId ?? '';
  
  const currentMember = useMemo(
    () => activeTeam.find((m) => m.id === currentCmId) ?? null,
    [activeTeam, currentCmId],
  );
  
  const nextMember = useMemo(
    () => activeTeam.find((m) => m.id === selected) ?? null,
    [activeTeam, selected],
  );

  const changeMutation = useCustomerMutation(customerId, 'change_account_manager');
  const temporaryMutation = useCustomerMutation(customerId, 'set_temporary_coverage');

  const sortedTeam = useMemo(
    () =>
      [...activeTeam].sort((left, right) => {
        const leftIsCurrent = currentMember?.id === left.id ? 0 : 1;
        const rightIsCurrent = currentMember?.id === right.id ? 0 : 1;
        return leftIsCurrent - rightIsCurrent || left.name.localeCompare(right.name, 'sv');
      }),
    [activeTeam, currentMember?.id],
  );

  const filteredTeam = useMemo(() => {
    if (!deferredSearch) return sortedTeam;
    return sortedTeam.filter((m) => 
      `${m.name} ${m.email}`.toLowerCase().includes(deferredSearch)
    );
  }, [deferredSearch, sortedTeam]);

  const validation = useMemo(() => {
    if (mode === 'temporary' && !currentMember) return { ok: false, reason: 'Kunden saknar primär CM' };
    if (mode === 'temporary' && selected === currentCmId) return { ok: false, reason: 'Välj en annan CM för coverage' };
    if (!selected && mode === 'temporary') return { ok: false, reason: 'Välj en CM' };
    return { ok: true };
  }, [mode, currentMember, selected, currentCmId]);

  const previewInput = useMemo<CmChangePreviewInput | null>(() => {
    if (!validation.ok) return null;
    return {
      mode,
      effective_date: mode === 'now' ? today : effectiveDate,
      coverage_end_date: mode === 'temporary' ? coverageEndDate : null,
      compensation_mode: compensationMode,
      current_monthly_price: currentMonthlyPrice ?? 0,
      current: currentMember ? { id: currentMember.id, name: currentMember.name, commission_rate: Number(currentMember.commission_rate) } : null,
      next: nextMember ? { id: nextMember.id, name: nextMember.name, commission_rate: Number(nextMember.commission_rate) } : null,
    };
  }, [validation.ok, mode, today, effectiveDate, coverageEndDate, compensationMode, currentMonthlyPrice, currentMember, nextMember]);

  const previewQuery = usePreviewCmChange(customerId, previewInput);
  const preview = previewQuery.data;

  const handleSave = async () => {
    if (mode === 'temporary') {
      await temporaryMutation.mutateAsync({
        covering_cm_id: selected,
        starts_on: effectiveDate,
        ends_on: coverageEndDate,
        note: handoverNote || null,
        compensation_mode: compensationMode,
      });
    } else {
      await changeMutation.mutateAsync({
        cm_id: selected || null,
        effective_date: mode === 'scheduled' ? effectiveDate : today,
        handover_note: handoverNote || null,
      });
    }
    onChanged?.();
    onOpenChange(false);
  };

  const isPending = changeMutation.isPending || temporaryMutation.isPending;

  return (
    <AdminFormDialog
      open={open}
      onClose={() => onOpenChange(false)}
      title="Byt Content Manager"
      size="lg"
      footer={
        <div className="flex w-full flex-col gap-3">
          {preview && (
            <div className="flex items-center justify-between gap-3 rounded-md bg-secondary/40 px-3 py-2 text-[11px]">
              <span className="text-muted-foreground">{preview.period.label}</span>
              <span className="font-semibold text-foreground">
                {preview.current.name}: {formatSek(preview.current.payout_ore)} · {preview.next.name}: {formatSek(preview.next.payout_ore)}
              </span>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => onOpenChange(false)} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
              Avbryt
            </button>
            <button
              onClick={handleSave}
              disabled={isPending || !validation.ok || !selected}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {isPending ? 'Sparar...' : mode === 'now' ? 'Byt CM nu' : mode === 'scheduled' ? 'Schemalägg byte' : 'Sätt temporary coverage'}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-2 sm:grid-cols-3">
          {(['now', 'scheduled', 'temporary'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                mode === m ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
              )}
            >
              <div className="font-semibold text-xs">{changeCmCopy[m as keyof typeof changeCmCopy] as string}</div>
              <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{changeCmCopy[`${m}Description` as keyof typeof changeCmCopy] as string}</div>
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {mode !== 'now' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Startdatum</label>
              <input type="date" value={effectiveDate} min={today} onChange={e => setEffectiveDate(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
          )}
          {mode === 'temporary' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Slutdatum</label>
              <input type="date" value={coverageEndDate} min={effectiveDate} onChange={e => setCoverageEndDate(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Sök CM..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2 max-h-[300px] overflow-y-auto pr-1">
          {filteredTeam.map((member) => (
            <label
              key={member.id}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                selected === member.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
              )}
            >
              <input type="radio" checked={selected === member.id} onChange={() => setSelectedOverride(member.id)} className="sr-only" />
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: hashToHsl(member.id) }}>
                {member.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{member.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">{member.email}</div>
              </div>
              {member.id === currentCmId && (
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">Nuvarande</span>
              )}
            </label>
          ))}
        </div>

        {mode === 'temporary' && (
          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <div className="mb-3 text-xs font-semibold">Kompensation</div>
            <div className="flex gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setCompensationMode('covering_cm')}
                      className={cn(
                        "flex-1 rounded-md border py-2 text-xs font-medium transition-colors",
                        compensationMode === 'covering_cm' ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"
                      )}
                    >
                      Backup CM
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Kompensation tillfaller den som täcker upp.</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setCompensationMode('primary_cm')}
                      className={cn(
                        "flex-1 rounded-md border py-2 text-xs font-medium transition-colors",
                        compensationMode === 'primary_cm' ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-accent"
                      )}
                    >
                      Primär CM
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Ordinarie CM behåller sin kommission.</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Anteckning / Överlämning</label>
          <textarea
            value={handoverNote}
            onChange={(e) => setHandoverNote(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="Valfri notering om varför bytet sker..."
          />
        </div>
      </div>
    </AdminFormDialog>
  );
}
