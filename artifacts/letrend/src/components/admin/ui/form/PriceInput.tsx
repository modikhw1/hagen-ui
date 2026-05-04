'use client';

import { oreToSek, sekToOre } from '@/lib/admin/money';
import { cn } from '@/lib/utils';
import { ADMIN_MODAL_INPUT_CLS } from '@/components/admin/ui/adminModalTokens';

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
        className={cn(ADMIN_MODAL_INPUT_CLS, 'pr-9 disabled:opacity-50')}
        placeholder={placeholder}
        disabled={disabled}
      />
      <span className="absolute right-3 text-xs text-muted-foreground uppercase pointer-events-none">
        kr
      </span>
    </div>
  );
}
