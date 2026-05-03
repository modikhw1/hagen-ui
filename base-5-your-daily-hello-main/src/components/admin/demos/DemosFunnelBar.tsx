'use client';

import { ArrowRight } from 'lucide-react';
import type { DemoCardDto } from '@/lib/admin/schemas/demos';

type Props = {
  cards: DemoCardDto[];
};

/**
 * Liten visualisering: Skickade → I dialog → Offert → Win, med konverterings-%.
 * Räknar på lifetime av alla demos (inte tidsfönster), eftersom flödet är manuellt.
 */
export function DemosFunnelBar({ cards }: Props) {
  const sent = cards.filter((c) => c.status !== 'draft').length;
  const inDialog = cards.filter((c) =>
    ['opened', 'responded', 'quoted', 'won', 'lost'].includes(c.status),
  ).length;
  const quoted = cards.filter((c) => ['quoted', 'won'].includes(c.status)).length;
  const won = cards.filter((c) => c.status === 'won').length;
  const lost = cards.filter((c) => c.status === 'lost').length;

  const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

  const steps = [
    { label: 'Skickade', value: sent, ratio: null as number | null },
    { label: 'I dialog', value: inDialog, ratio: pct(inDialog, sent) },
    { label: 'Offert', value: quoted, ratio: pct(quoted, inDialog) },
    { label: 'Win', value: won, ratio: pct(won, quoted), tone: 'success' as const },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Konverterings­tratt
        </h3>
        <span className="text-xs text-muted-foreground">
          {lost} förlorade · {cards.length} totalt
        </span>
      </div>
      <div className="flex items-stretch gap-2">
        {steps.map((step, idx) => (
          <div key={step.label} className="flex flex-1 items-center gap-2">
            <div className="flex-1 rounded-md border border-border bg-background px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {step.label}
              </div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span
                  className={`text-lg font-bold ${
                    step.tone === 'success' ? 'text-success' : 'text-foreground'
                  }`}
                >
                  {step.value}
                </span>
                {step.ratio != null ? (
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {step.ratio}%
                  </span>
                ) : null}
              </div>
            </div>
            {idx < steps.length - 1 ? (
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}