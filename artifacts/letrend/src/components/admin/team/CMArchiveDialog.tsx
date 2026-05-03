'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { AdminModalShell } from '@/components/admin/ui/AdminModalShell';
import {
  adminModalAlertStyle,
  adminModalInputStyle,
  adminModalLabelStyle,
  adminModalPrimaryButtonStyle,
  adminModalSecondaryButtonStyle,
  adminModalSectionStyle,
} from '@/components/admin/ui/adminModalTokens';
import { LeTrendColors } from '@/styles/letrend-design-system';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';

export interface CMArchiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cmId: string;
  cmName: string;
  activeCustomerCount: number;
}

export function CMArchiveDialog({
  open,
  onOpenChange,
  cmId,
  cmName,
  activeCustomerCount,
}: CMArchiveDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const refresh = useAdminRefresh();

  const canArchive =
    activeCustomerCount === 0 && confirmText.trim() === cmName.trim();

  const handleArchive = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/team/${cmId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Kunde inte arkivera (${res.status})`);
        return;
      }
      toast.success(`${cmName} arkiverad.`);
      await refresh(['team', 'customers']);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nätverksfel');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminModalShell
      open={open}
      onClose={() => onOpenChange(false)}
      title={`Arkivera ${cmName}?`}
      size="sm"
      disableClose={submitting}
      footer={
        <>
          <button
            type="button"
            style={{ ...adminModalSecondaryButtonStyle, opacity: submitting ? 0.5 : 1 }}
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Avbryt
          </button>
          <button
            type="button"
            style={adminModalPrimaryButtonStyle(canArchive && !submitting, 'danger')}
            onClick={handleArchive}
            disabled={!canArchive || submitting}
          >
            {submitting ? 'Arkiverar…' : 'Arkivera permanent'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12.5, color: LeTrendColors.brownDark, lineHeight: 1.5 }}>
          Arkivering deaktiverar inloggning och tar bort CM:en från tilldelningar. Historisk data behålls.
        </div>

        {activeCustomerCount > 0 ? (
          <div style={adminModalAlertStyle('danger')}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {cmName} har {activeCustomerCount} aktiva kunder. Flytta dem till en annan CM via &quot;Hantera kundportfölj&quot; innan arkivering.
            </span>
          </div>
        ) : (
          <div style={adminModalSectionStyle}>
            <div style={adminModalLabelStyle}>
              Skriv {cmName} för att bekräfta
            </div>
            <input
              id="confirm-name"
              value={confirmText}
              onChange={(e) => setConfirmText(e.currentTarget.value)}
              placeholder={cmName}
              autoComplete="off"
              style={adminModalInputStyle}
            />
          </div>
        )}
      </div>
    </AdminModalShell>
  );
}
