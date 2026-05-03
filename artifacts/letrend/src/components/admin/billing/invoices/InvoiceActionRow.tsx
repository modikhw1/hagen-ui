'use client';

import { useState } from 'react';
import { Button, Menu } from '@mantine/core';
import {
  CheckCircle2,
  ChevronDown,
  CreditCard,
  ExternalLink,
  FileDown,
  Mail,
  RefreshCw,
  Slash,
} from 'lucide-react';
import { toast } from 'sonner';

export interface InvoiceActionRowProps {
  invoiceId: string;
  status: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  canManage: boolean;
  onChanged: () => void;
}

export function InvoiceActionRow({
  invoiceId,
  status,
  hostedInvoiceUrl,
  invoicePdf,
  canManage,
  onChanged,
}: InvoiceActionRowProps) {
  const [busy, setBusy] = useState<string | null>(null);

  async function postAction(
    action: 'mark_paid' | 'resend' | 'resync' | 'pay_now',
    successLabel: string,
    extra: Record<string, unknown> = {},
  ) {
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      toast.success(successLabel);
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Kunde inte ${successLabel.toLowerCase()}`,
      );
    } finally {
      setBusy(null);
    }
  }

  async function patchInvoice(
    action: 'void' | 'mark_uncollectible',
    successLabel: string,
  ) {
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
      toast.success(successLabel);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Åtgärden misslyckades');
    } finally {
      setBusy(null);
    }
  }

  const isOpen = status === 'open';
  const canChargeNow = status === 'open' || status === 'past_due';
  const isFinal = status === 'void' || status === 'paid' || status === 'uncollectible';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
      {hostedInvoiceUrl ? (
        <Button
          component="a"
          href={hostedInvoiceUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="default"
          size="xs"
          leftSection={<ExternalLink className="h-3 w-3" />}
        >
          Öppna i Stripe
        </Button>
      ) : null}
      {invoicePdf ? (
        <Button
          component="a"
          href={invoicePdf}
          target="_blank"
          rel="noopener noreferrer"
          variant="default"
          size="xs"
          leftSection={<FileDown className="h-3 w-3" />}
        >
          PDF
        </Button>
      ) : null}

      <Button
        variant="default"
        size="xs"
        leftSection={
          <RefreshCw className={`h-3 w-3 ${busy === 'resync' ? 'animate-spin' : ''}`} />
        }
        onClick={() => void postAction('resync', 'Hämtade senaste data från Stripe')}
        loading={busy === 'resync'}
        disabled={busy !== null}
      >
        Resync
      </Button>

      {canManage && isOpen ? (
        <>
          {canChargeNow ? (
            <Button
              color="blue"
              size="xs"
              leftSection={<CreditCard className="h-3 w-3" />}
              onClick={() => void postAction('pay_now', 'Stripe forsokte ta betalt nu')}
              loading={busy === 'pay_now'}
              disabled={busy !== null}
            >
              Forsok ta betalt nu
            </Button>
          ) : null}
          <Button
            color="green"
            size="xs"
            leftSection={<CheckCircle2 className="h-3 w-3" />}
            onClick={() => void postAction('mark_paid', 'Faktura markerad som betald')}
            loading={busy === 'mark_paid'}
            disabled={busy !== null}
          >
            Markera betald
          </Button>
          <Button
            variant="light"
            size="xs"
            leftSection={<Mail className="h-3 w-3" />}
            onClick={() => void postAction('resend', 'Faktura skickad igen')}
            loading={busy === 'resend'}
            disabled={busy !== null}
          >
            Skicka igen
          </Button>
        </>
      ) : null}

      {canManage && !isFinal ? (
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              rightSection={<ChevronDown className="h-3 w-3" />}
            >
              Mer
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {isOpen ? (
              <Menu.Item
                color="yellow"
                leftSection={<Slash className="h-3 w-3" />}
                onClick={() =>
                  void patchInvoice('mark_uncollectible', 'Markerad som svårindrivbar')
                }
              >
                Markera som svårindrivbar
              </Menu.Item>
            ) : null}
            <Menu.Item
              color="red"
              leftSection={<Slash className="h-3 w-3" />}
              onClick={() => void patchInvoice('void', 'Faktura annullerad')}
            >
              Annullera faktura
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      ) : null}
    </div>
  );
}
