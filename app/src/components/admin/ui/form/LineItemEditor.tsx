'use client';

import { Plus, X } from 'lucide-react';
import { formatSek, sekToOre, oreToSek } from '@/lib/admin/money';
import { cn } from '@/lib/utils';
import { PriceInput } from './PriceInput';

export type LineItem = {
  id?: string;
  description: string;
  amount: number; // i öre
  quantity: number;
};

type Props = {
  items: LineItem[];
  onChange: (next: LineItem[]) => void;
  editable?: boolean;
  fixedHeader?: { description: string; amount: number };
  showTotal?: boolean;
  maxItems?: number;
  templates?: Array<{ label: string; description: string; amount: number }>;
  emptyHint?: string;
  addLabel?: string;
};

export function LineItemEditor({
  items,
  onChange,
  editable = true,
  fixedHeader,
  showTotal = true,
  maxItems,
  templates,
  emptyHint = 'Inga rader än — lägg till en rad eller välj från snabbmallar nedan.',
  addLabel = 'Lägg till rad',
}: Props) {
  const update = (idx: number, patch: Partial<LineItem>) =>
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  
  const add = (init?: Partial<LineItem>) => {
    if (maxItems !== undefined && items.length >= maxItems) return;
    onChange([...items, { description: '', amount: 0, quantity: 1, ...init }]);
  };

  const totalOre =
    (fixedHeader?.amount ?? 0) +
    items.reduce((s, it) => s + (it.amount || 0) * (it.quantity || 1), 0);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_80px_120px_36px] gap-2 border-b border-border bg-secondary/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div>Beskrivning</div>
        <div>Antal</div>
        <div className="text-right">Belopp</div>
        <div />
      </div>

      {/* Fixed header row */}
      {fixedHeader ? (
        <Row
          description={fixedHeader.description}
          quantity={1}
          amountOre={fixedHeader.amount}
          locked
        />
      ) : null}

      {/* Editable rows */}
      <div className="divide-y divide-border">
        {items.length === 0 && !fixedHeader ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyHint}</div>
        ) : (
          items.map((it, idx) => (
            <Row
              key={it.id ?? idx}
              description={it.description}
              quantity={it.quantity}
              amountOre={it.amount}
              onDescriptionChange={(v) => update(idx, { description: v })}
              onQuantityChange={(v) => update(idx, { quantity: v })}
              onAmountChange={(ore) => update(idx, { amount: ore })}
              onRemove={() => remove(idx)}
              editable={editable}
            />
          ))
        )}
      </div>

      {/* Footer: add + templates */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary/20 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => add()}
            disabled={!editable || (maxItems !== undefined && items.length >= maxItems)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> {addLabel}
          </button>
          {templates?.map((tpl) => (
            <button
              key={tpl.label}
              type="button"
              onClick={() => add({ description: tpl.description, amount: tpl.amount })}
              disabled={!editable}
              className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              + {tpl.label}
            </button>
          ))}
        </div>
        {showTotal ? (
          <div className="text-sm font-semibold text-foreground">
            Totalt: {formatSek(totalOre)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({
  description,
  quantity,
  amountOre,
  locked = false,
  editable = true,
  onDescriptionChange,
  onQuantityChange,
  onAmountChange,
  onRemove,
}: {
  description: string;
  quantity: number;
  amountOre: number;
  locked?: boolean;
  editable?: boolean;
  onDescriptionChange?: (v: string) => void;
  onQuantityChange?: (v: number) => void;
  onAmountChange?: (ore: number) => void;
  onRemove?: () => void;
}) {
  return (
    <div className={cn("grid grid-cols-[1fr_80px_120px_36px] gap-2 items-center px-3 py-2", locked && "bg-secondary/10")}>
      <div>
        {locked || !editable ? (
          <div className="text-sm text-foreground">{description}</div>
        ) : (
          <input
            value={description}
            onChange={(e) => onDescriptionChange?.(e.target.value)}
            placeholder="Beskrivning"
            className="w-full bg-transparent text-sm focus:outline-none"
          />
        )}
      </div>
      <div>
        {locked || !editable ? (
          <div className="text-sm text-foreground text-center">{quantity}</div>
        ) : (
          <input
            type="number"
            value={quantity}
            onChange={(e) => onQuantityChange?.(Number(e.target.value))}
            className="w-full bg-transparent text-sm text-center focus:outline-none"
          />
        )}
      </div>
      <div className="text-right">
        {locked || !editable ? (
          <div className="text-sm text-foreground">{formatSek(amountOre)}</div>
        ) : (
          <PriceInput
            valueOre={amountOre}
            onChangeOre={(ore) => onAmountChange?.(ore)}
            className="w-full"
          />
        )}
      </div>
      <div className="flex justify-end">
        {!locked && editable && (
          <button
            onClick={onRemove}
            className="text-muted-foreground hover:text-status-danger-fg"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
