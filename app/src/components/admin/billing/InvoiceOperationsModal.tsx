'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import ConfirmActionDialog from '@/components/admin/ConfirmActionDialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatSek } from '@/lib/admin/money';
import { shortDateSv } from '@/lib/admin/time';

type InvoiceDetail = {
  id: string;
  stripe_invoice_id: string | null;
  amount_due: number | null;
  amount_paid: number | null;
  status: string;
  created_at: string;
  due_date?: string | null;
  hosted_invoice_url?: string | null;
  line_items: Array<{
    stripe_line_item_id: string;
    description: string;
    amount: number;
    currency: string;
    quantity: number;
    period_start: string | null;
    period_end: string | null;
  }>;
};

type AdjustmentPayload = {
  creditNotes: Array<{
    stripe_credit_note_id: string;
    total: number;
    refund_amount: number;
    memo: string | null;
    created_at: string;
  }>;
  refunds: Array<{
    stripe_refund_id: string;
    amount: number;
    reason: string | null;
    created_at: string;
  }>;
};

type ReissueItem = {
  description: string;
  amount: number;
};

export default function InvoiceOperationsModal({
  invoiceId,
  open,
  onClose,
  onUpdated,
}: {
  invoiceId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentPayload>({
    creditNotes: [],
    refunds: [],
  });
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [creditAmountOre, setCreditAmountOre] = useState('');
  const [refundAmountOre, setRefundAmountOre] = useState('');
  const [memo, setMemo] = useState('');
  const [createReplacementInvoice, setCreateReplacementInvoice] = useState(false);
  const [replacementItems, setReplacementItems] = useState<ReissueItem[]>([]);
  const [daysUntilDue, setDaysUntilDue] = useState('14');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<'credit_note' | 'credit_note_and_reissue' | 'pay' | 'void' | null>(null);
  const [confirmVoidOpen, setConfirmVoidOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !invoiceId) {
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/admin/invoices/${invoiceId}`, { credentials: 'include' })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          invoice?: InvoiceDetail;
          adjustments?: AdjustmentPayload;
        };
        if (!response.ok || !payload.invoice) {
          throw new Error(payload.error || 'Kunde inte ladda fakturan');
        }

        setInvoice(payload.invoice);
        setAdjustments(
          payload.adjustments ?? {
            creditNotes: [],
            refunds: [],
          },
        );

        const firstPositiveLine = (payload.invoice.line_items ?? []).find((line) => line.amount > 0);
        setSelectedLineId(firstPositiveLine?.stripe_line_item_id ?? null);
        setCreditAmountOre(firstPositiveLine ? String(firstPositiveLine.amount) : '');
        setRefundAmountOre(firstPositiveLine ? String(firstPositiveLine.amount) : '');
        setMemo('');
        setCreateReplacementInvoice(false);
        setReplacementItems(
          (payload.invoice.line_items ?? []).map((line) => ({
            description: line.description,
            amount: Math.max(0, (line.amount || 0) / 100),
          })),
        );
        setDaysUntilDue('14');
        setConfirmVoidOpen(false);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Kunde inte ladda fakturan');
        setInvoice(null);
      })
      .finally(() => setLoading(false));
  }, [invoiceId, open]);

  const selectedLine = useMemo(
    () => invoice?.line_items.find((line) => line.stripe_line_item_id === selectedLineId) ?? null,
    [invoice?.line_items, selectedLineId],
  );

  const runAction = async (action: 'credit_note' | 'credit_note_and_reissue' | 'pay' | 'void') => {
    if (!invoiceId) return;
    setPending(action);
    setError(null);

    try {
      const body =
        action === 'credit_note' || action === 'credit_note_and_reissue'
          ? {
              action,
              stripe_line_item_id: selectedLineId,
              amount_ore: Number(creditAmountOre),
              refund_amount_ore: invoice?.status === 'paid' ? Number(refundAmountOre) : 0,
              memo: memo || null,
              reissue_items:
                action === 'credit_note_and_reissue'
                  ? replacementItems
                      .filter((item) => item.description.trim() && item.amount > 0)
                      .map((item) => ({
                        description: item.description.trim(),
                        amount: item.amount,
                      }))
                  : undefined,
              days_until_due:
                action === 'credit_note_and_reissue' ? Number(daysUntilDue) || 14 : undefined,
            }
          : { action };

      const response = await fetch(`/api/admin/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte uppdatera fakturan');
      }

      setConfirmVoidOpen(false);
      onUpdated();
      onClose();
    } catch (actionError: unknown) {
      setError(
        actionError instanceof Error ? actionError.message : 'Kunde inte uppdatera fakturan',
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Fakturadetaljer</DialogTitle>
          <DialogDescription>
            Markera faktura som betald, annullera den eller kreditera en enskild rad.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-sm text-muted-foreground">Laddar faktura...</div>
        ) : !invoice ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error || 'Fakturan kunde inte laddas.'}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Belopp" value={typeof invoice.amount_due === 'number' ? formatSek(invoice.amount_due) : '-'} />
              <Metric label="Status" value={invoice.status} />
              <Metric label="Skapad" value={shortDateSv(invoice.created_at)} />
              <Metric label="Forfallo" value={shortDateSv(invoice.due_date || null)} />
            </div>

            {invoice.hosted_invoice_url ? (
              <a
                href={invoice.hosted_invoice_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
              >
                Oppna Stripe-faktura
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}

            <div className="grid gap-5 lg:grid-cols-[1.25fr_0.95fr]">
              <div className="space-y-3">
                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                    Fakturarader
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border bg-card">
                    {invoice.line_items.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        Inga fakturarader hittades.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader className="bg-secondary/40">
                          <TableRow>
                            <TableHead>Beskrivning</TableHead>
                            <TableHead>Period</TableHead>
                            <TableHead className="text-right">Belopp</TableHead>
                            <TableHead className="w-24 text-right">Val</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoice.line_items.map((lineItem) => {
                            const isSelected = selectedLineId === lineItem.stripe_line_item_id;
                            return (
                              <TableRow
                                key={lineItem.stripe_line_item_id}
                                data-state={isSelected ? 'selected' : undefined}
                              >
                                <TableCell>
                                  <div className="font-medium text-foreground">{lineItem.description}</div>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {lineItem.period_start || lineItem.period_end
                                    ? `${lineItem.period_start?.slice(0, 10) || '-'} till ${lineItem.period_end?.slice(0, 10) || '-'}`
                                    : '-'}
                                </TableCell>
                                <TableCell className="text-right font-semibold text-foreground">
                                  {formatSek(lineItem.amount)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <input
                                    type="radio"
                                    name="invoice-line"
                                    checked={isSelected}
                                    onChange={() => {
                                      setSelectedLineId(lineItem.stripe_line_item_id);
                                      setCreditAmountOre(String(lineItem.amount));
                                      setRefundAmountOre(String(lineItem.amount));
                                    }}
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                    Tidigare korrigeringar
                  </div>
                  <div className="space-y-2">
                    {adjustments.creditNotes.map((creditNote) => (
                      <div
                        key={creditNote.stripe_credit_note_id}
                        className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm"
                      >
                        <div className="font-medium text-foreground">
                          Kreditnota {formatSek(creditNote.total)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {shortDateSv(creditNote.created_at)}
                          {creditNote.refund_amount > 0 ? ` · refund ${formatSek(creditNote.refund_amount)}` : ''}
                          {creditNote.memo ? ` · ${creditNote.memo}` : ''}
                        </div>
                      </div>
                    ))}
                    {adjustments.refunds.map((refund) => (
                      <div
                        key={refund.stripe_refund_id}
                        className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm"
                      >
                        <div className="font-medium text-foreground">
                          Refund {formatSek(refund.amount)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {shortDateSv(refund.created_at)}
                          {refund.reason ? ` · ${refund.reason}` : ''}
                        </div>
                      </div>
                    ))}
                    {adjustments.creditNotes.length === 0 && adjustments.refunds.length === 0 ? (
                      <div className="rounded-md border border-border bg-secondary/20 px-3 py-3 text-sm text-muted-foreground">
                        Inga credit notes eller refunds speglade pa den har fakturan an.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-secondary/20 p-4">
                <div className="mb-3 text-sm font-semibold text-foreground">Kreditera vald rad</div>
                {selectedLine ? (
                  <div className="space-y-3">
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                      {selectedLine.description}
                    </div>
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                        Kreditbelopp (ore)
                      </div>
                      <input
                        value={creditAmountOre}
                        onChange={(event) => setCreditAmountOre(event.target.value)}
                        inputMode="numeric"
                        className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                      />
                    </div>
                    {invoice.status === 'paid' ? (
                      <div>
                        <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                          Refundbelopp (ore)
                        </div>
                        <input
                          value={refundAmountOre}
                          onChange={(event) => setRefundAmountOre(event.target.value)}
                          inputMode="numeric"
                          className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                        />
                      </div>
                    ) : null}
                    <div>
                      <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                        Intern memo
                      </div>
                      <textarea
                        value={memo}
                        onChange={(event) => setMemo(event.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={createReplacementInvoice}
                        onChange={(event) => setCreateReplacementInvoice(event.target.checked)}
                      />
                      Kreditera och skapa ny korrekt faktura direkt
                    </label>
                    {createReplacementInvoice ? (
                      <div className="space-y-3 rounded-md border border-border bg-background p-3">
                        <div className="text-xs text-muted-foreground">
                          Ersattningsfakturan skickas direkt efter kreditnotan.
                        </div>
                        {replacementItems.map((item, index) => (
                          <div
                            key={`${index}-${item.description}`}
                            className="grid grid-cols-[1fr_140px_auto] gap-2"
                          >
                            <input
                              value={item.description}
                              onChange={(event) =>
                                setReplacementItems((current) =>
                                  current.map((row, rowIndex) =>
                                    rowIndex === index
                                      ? { ...row, description: event.target.value }
                                      : row,
                                  ),
                                )
                              }
                              placeholder="Beskrivning"
                              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                            />
                            <input
                              type="number"
                              min={0}
                              value={item.amount}
                              onChange={(event) =>
                                setReplacementItems((current) =>
                                  current.map((row, rowIndex) =>
                                    rowIndex === index
                                      ? {
                                          ...row,
                                          amount: Math.max(0, Number(event.target.value) || 0),
                                        }
                                      : row,
                                  ),
                                )
                              }
                              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setReplacementItems((current) =>
                                  current.length === 1
                                    ? current
                                    : current.filter((_, rowIndex) => rowIndex !== index),
                                )
                              }
                              className="rounded-md border border-border px-3 py-2 text-xs"
                            >
                              Ta bort
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setReplacementItems((current) => [
                                ...current,
                                { description: '', amount: 0 },
                              ])
                            }
                            className="rounded-md border border-border px-3 py-2 text-xs"
                          >
                            Lagg till rad
                          </button>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                              Forfaller om
                            </span>
                            <input
                              value={daysUntilDue}
                              onChange={(event) => setDaysUntilDue(event.target.value)}
                              inputMode="numeric"
                              className="w-20 rounded-md border border-border bg-card px-3 py-2 text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        void runAction(
                          createReplacementInvoice
                            ? 'credit_note_and_reissue'
                            : 'credit_note',
                        )
                      }
                      disabled={
                        pending !== null ||
                        !selectedLineId ||
                        !Number.isFinite(Number(creditAmountOre)) ||
                        Number(creditAmountOre) <= 0 ||
                        (createReplacementInvoice &&
                          replacementItems.filter((item) => item.description.trim() && item.amount > 0)
                            .length === 0)
                      }
                      className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {pending === 'credit_note' || pending === 'credit_note_and_reissue'
                        ? 'Krediterar...'
                        : createReplacementInvoice
                          ? 'Kreditera och skapa ersattningsfaktura'
                          : 'Skapa kreditnota'}
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Valj en fakturarad for att kreditera den.
                  </div>
                )}
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              {invoice.status === 'open' ? (
                <>
                  <button
                    type="button"
                    onClick={() => void runAction('pay')}
                    disabled={pending !== null}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {pending === 'pay' ? 'Markerar...' : 'Markera som betald'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmVoidOpen(true)}
                    disabled={pending !== null}
                    className="rounded-md border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive disabled:opacity-50"
                  >
                    {pending === 'void' ? 'Annullerar...' : 'Annullera'}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border px-4 py-2 text-sm"
              >
                Stang
              </button>
            </div>
          </div>
        )}
      </DialogContent>

      <ConfirmActionDialog
        open={confirmVoidOpen}
        onOpenChange={setConfirmVoidOpen}
        title="Annullera faktura?"
        description="Fakturan voidas i Stripe och kommer inte langre att kunna betalas. Anvand detta bara om fakturan verkligen ska dras tillbaka."
        confirmLabel="Annullera faktura"
        onConfirm={() => void runAction('void')}
        pending={pending === 'void'}
      />
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
