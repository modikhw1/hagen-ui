'use client';

import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

export interface InvoicePreviewProps {
  number: string | null;
  status: string;
  createdAt: string;
  dueDate: string | null;
  currency: string;
  amountDue: number;
  amountPaid: number;
  customerName: string;
  environment: 'test' | 'live';
  lines: Array<{
    id: string;
    description: string;
    amount: number;
    quantity: number;
  }>;
  memo?: string | null;
}

function fmt(amountOre: number, currency: string): string {
  return (amountOre / 100).toLocaleString('sv-SE', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'd MMM yyyy', { locale: sv });
  } catch {
    return '—';
  }
}

const STATUS_LABEL: Record<string, string> = {
  paid: 'Betald',
  open: 'Obetald',
  void: 'Annullerad',
  uncollectible: 'Svårindrivbar',
  draft: 'Utkast',
};

/**
 * Renderar en visuell representation av fakturan, likt ett klassiskt
 * fakturaprogram. Endast presentation – ingen logik.
 */
export function InvoicePreview({
  number,
  status,
  createdAt,
  dueDate,
  currency,
  amountDue,
  amountPaid,
  customerName,
  environment,
  lines,
  memo,
}: InvoicePreviewProps) {
  const subtotal = lines.reduce((acc, l) => acc + l.amount, 0);
  const total = Math.max(amountDue, amountPaid);
  const remaining = Math.max(total - amountPaid, 0);
  const statusLabel = STATUS_LABEL[status] ?? status;

  return (
    <div className="rounded-lg border border-border bg-background shadow-sm">
      {/* Bandhuvud */}
      <div className="flex items-start justify-between border-b border-border px-6 py-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Faktura
          </p>
          <h2 className="text-2xl font-semibold text-foreground">
            {number ?? '—'}
          </h2>
          {environment === 'test' && (
            <span className="mt-1 inline-block rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-700">
              Test
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Status
          </p>
          <p
            className={
              status === 'paid'
                ? 'text-lg font-semibold text-emerald-600'
                : status === 'void' || status === 'uncollectible'
                  ? 'text-lg font-semibold text-destructive'
                  : 'text-lg font-semibold text-amber-600'
            }
          >
            {statusLabel}
          </p>
        </div>
      </div>

      {/* Avsändare / mottagare */}
      <div className="grid grid-cols-2 gap-6 border-b border-border px-6 py-4 text-sm">
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
            Från
          </p>
          <p className="font-medium text-foreground">Hagen</p>
          <p className="text-muted-foreground">hagen.se</p>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
            Till
          </p>
          <p className="font-medium text-foreground">{customerName}</p>
        </div>
      </div>

      {/* Datum-rad */}
      <div className="grid grid-cols-3 gap-6 border-b border-border px-6 py-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Fakturadatum
          </p>
          <p className="font-medium text-foreground">{fmtDate(createdAt)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Förfallodatum
          </p>
          <p className="font-medium text-foreground">{fmtDate(dueDate)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Valuta
          </p>
          <p className="font-medium uppercase text-foreground">{currency}</p>
        </div>
      </div>

      {/* Rader */}
      <div className="px-6 py-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 text-left font-medium">Beskrivning</th>
              <th className="w-20 py-2 text-right font-medium">Antal</th>
              <th className="w-28 py-2 text-right font-medium">À-pris</th>
              <th className="w-32 py-2 text-right font-medium">Summa</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Inga rader på fakturan.
                </td>
              </tr>
            ) : (
              lines.map((line) => {
                const unit = line.quantity > 0 ? line.amount / line.quantity : line.amount;
                return (
                  <tr key={line.id} className="border-b border-border/60">
                    <td className="py-2 pr-2 text-foreground">{line.description}</td>
                    <td className="py-2 text-right tabular-nums text-foreground">
                      {line.quantity}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {fmt(unit, currency)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium text-foreground">
                      {fmt(line.amount, currency)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Summor */}
        <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span className="tabular-nums">{fmt(subtotal, currency)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 text-base font-semibold text-foreground">
            <span>Totalt</span>
            <span className="tabular-nums">{fmt(total, currency)}</span>
          </div>
          <div className="flex justify-between text-emerald-600">
            <span>Betalt</span>
            <span className="tabular-nums">{fmt(amountPaid, currency)}</span>
          </div>
          {remaining > 0 && (
            <div className="flex justify-between font-medium text-amber-600">
              <span>Kvar att betala</span>
              <span className="tabular-nums">{fmt(remaining, currency)}</span>
            </div>
          )}
        </div>
      </div>

      {memo && (
        <div className="border-t border-border bg-muted/30 px-6 py-3">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
            Kommentar
          </p>
          <p className="whitespace-pre-line text-sm text-foreground">{memo}</p>
        </div>
      )}
    </div>
  );
}