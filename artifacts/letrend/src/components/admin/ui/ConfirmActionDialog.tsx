'use client';

import { AdminModalShell } from '@/components/admin/ui/AdminModalShell';
import {
  adminModalPrimaryButtonStyle,
  adminModalSecondaryButtonStyle,
} from '@/components/admin/ui/adminModalTokens';
import { LeTrendColors } from '@/styles/letrend-design-system';

export default function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Avbryt',
  onConfirm,
  pending = false,
  tone = 'danger',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <AdminModalShell
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      size="sm"
      disableClose={pending}
      footer={
        <>
          <button
            type="button"
            style={{ ...adminModalSecondaryButtonStyle, opacity: pending ? 0.5 : 1 }}
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            style={adminModalPrimaryButtonStyle(!pending, tone === 'danger' ? 'danger' : 'default')}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? 'Bearbetar…' : confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: LeTrendColors.brownDark }}>{description}</div>
    </AdminModalShell>
  );
}
