'use client';

import { oreToSek, sekToOre } from '@/lib/admin/money';
import { cn } from '@/lib/utils';

export function PriceInput({
  valueOre,
  onChangeOre,
  className,
  disabled,
  placeholder,
}: {
  valueOre: number;
  onChangeOre: (ore: number) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className={cn("relative flex items-center", className)}>
      <input
        type="number"
        value={oreToSek(valueOre)}
        onChange={(e) => onChangeOre(sekToOre(Number(e.target.value)))}
        className="w-full rounded-md border border-border bg-background px-3 py-2 pr-9 text-sm focus:ring-1 focus:ring-primary focus:outline-none disabled:opacity-50"
        placeholder={placeholder}
        disabled={disabled}
      />
      <span className="absolute right-3 text-xs text-muted-foreground uppercase pointer-events-none">
        kr
      </span>
    </div>
  );
}
