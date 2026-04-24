'use client';

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg' | 'xl';
const sizeClass: Record<Size, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-3xl',
};

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
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  size?: Size;
  children: ReactNode;
  footer: ReactNode;       // OBLIGATORISK — alla form-dialogs har en footer
  error?: string | null;
  warning?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          'flex max-h-[var(--modal-max-h)] flex-col gap-0 p-0',
          sizeClass[size],
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
          {error ? (
            <div className="mt-4 rounded-md border border-status-danger-fg/30 bg-status-danger-bg px-3 py-2 text-sm text-status-danger-fg">
              {error}
            </div>
          ) : null}
          {warning ? (
            <div className="mt-4 rounded-md border border-status-warning-fg/30 bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg">
              {warning}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {footer}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
