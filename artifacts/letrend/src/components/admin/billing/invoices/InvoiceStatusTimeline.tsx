'use client';

import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Slash,
  XCircle,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';

interface TimelineEvent {
  id: string;
  at: string;
  kind: string;
  title: string;
  description?: string | null;
  actor?: string | null;
  source: 'stripe_webhook' | 'admin' | 'system' | 'milestone';
  status: 'success' | 'warning' | 'error' | 'info';
}

interface InvoiceStatusTimelineProps {
  invoiceId: string;
}

const ICON_BY_KIND: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  created: FileText,
  finalized: FileText,
  sent: Send,
  paid: CheckCircle2,
  payment_failed: XCircle,
  voided: Slash,
  uncollectible: AlertTriangle,
  credit_note: CircleDollarSign,
  reissued: RefreshCw,
  memo_updated: FileText,
  line_added: FileText,
  webhook: RefreshCw,
  admin_action: Mail,
  note: FileText,
};

const STATUS_DOT: Record<TimelineEvent['status'], string> = {
  success: 'bg-emerald-500 text-emerald-50',
  warning: 'bg-amber-500 text-amber-50',
  error: 'bg-destructive text-destructive-foreground',
  info: 'bg-muted text-muted-foreground border border-border',
};

const SOURCE_LABEL: Record<TimelineEvent['source'], string> = {
  stripe_webhook: 'Stripe',
  admin: 'Admin',
  system: 'System',
  milestone: 'Milstolpe',
};

export function InvoiceStatusTimeline({ invoiceId }: InvoiceStatusTimelineProps) {
  const { data, isLoading, error } = useQuery<{ events: TimelineEvent[] }>({
    queryKey: ['admin', 'invoice', invoiceId, 'timeline'],
    queryFn: async () => {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/timeline`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 5_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Laddar händelser...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        <AlertCircle className="h-3 w-3" />
        Kunde inte ladda tidslinjen.
      </div>
    );
  }

  const events = data?.events ?? [];
  if (events.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        Inga registrerade händelser än för denna faktura.
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {events.map((event) => {
        const Icon = ICON_BY_KIND[event.kind] ?? FileText;
        const dotClass = STATUS_DOT[event.status];

        let when = '';
        try {
          when = `${formatDistanceToNow(new Date(event.at), {
            locale: sv,
            addSuffix: true,
          })} · ${format(new Date(event.at), 'd MMM yyyy HH:mm', { locale: sv })}`;
        } catch {
          when = event.at;
        }

        return (
          <li key={event.id} className="relative">
            <span
              className={`absolute -left-[1.45rem] flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${dotClass}`}
            >
              <Icon className="h-3 w-3" />
            </span>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                {event.title}
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {SOURCE_LABEL[event.source]}
                </span>
              </div>
              {event.description ? (
                <p className="text-xs text-muted-foreground">{event.description}</p>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                {when}
                {event.actor ? <span> · {event.actor}</span> : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
