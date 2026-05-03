'use client';

import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { AdminModalShell } from '@/components/admin/ui/AdminModalShell';
import { adminModalAlertStyle } from '@/components/admin/ui/adminModalTokens';

type Size = 'sm' | 'md' | 'lg' | 'xl';

export interface AdminFormDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  size?: Size;
  children: ReactNode;
  footer?: ReactNode;
  error?: string | null;
  warning?: string | null;
  loading?: boolean;
}

export function AdminFormDialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  children,
  footer,
  error,
  warning,
  loading,
}: AdminFormDialogProps) {
  return (
    <AdminModalShell
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size={size}
      disableClose={loading}
      footer={footer}
    >
      <div>
        {children}
        {error && (
          <div role="alert" style={{ ...adminModalAlertStyle('danger'), marginTop: 12 }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span><strong style={{ marginRight: 6 }}>Fel.</strong>{error}</span>
          </div>
        )}
        {warning && (
          <div role="alert" style={{ ...adminModalAlertStyle('warning'), marginTop: 12 }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span><strong style={{ marginRight: 6 }}>Varning.</strong>{warning}</span>
          </div>
        )}
      </div>
    </AdminModalShell>
  );
}
