import {
  addDays,
  formatDateOnly,
  overlapDays,
  parseDateOnly,
} from '@/lib/admin/billing-periods';

export type CmChangePreviewMode = 'now' | 'scheduled' | 'temporary';
export type CmCoverageCompensationMode = 'covering_cm' | 'primary_cm';

export type CmPreviewMember = {
  id: string | null;
  name: string;
  commission_rate: number;
};

export type CmChangePreviewInput = {
  mode: CmChangePreviewMode;
  effective_date: string;
  coverage_end_date?: string | null;
  compensation_mode?: CmCoverageCompensationMode;
  current_monthly_price: number | null;
  current: CmPreviewMember | null;
  next: CmPreviewMember | null;
};

export type CmChangePreviewResult = {
  period: {
    start: string;
    end: string;
    total_days: number;
    label: string;
  };
  current: {
    cm_id: string | null;
    name: string;
    days: number;
    payout_ore: number;
  };
  next: {
    cm_id: string | null;
    name: string;
    days: number;
    payout_ore: number;
  };
  retained_payout_ore: number;
  warnings: string[];
};

function resolvePeriod(effectiveDate: string) {
  const effective = parseDateOnly(effectiveDate);
  const anchor =
    effective.getUTCDate() >= 25
      ? new Date(Date.UTC(effective.getUTCFullYear(), effective.getUTCMonth() + 1, 25))
      : new Date(Date.UTC(effective.getUTCFullYear(), effective.getUTCMonth(), 25));
  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1, 25));
  const end = addDays(anchor, -1);

  return {
    start: formatDateOnly(start),
    end: formatDateOnly(end),
    endExclusive: formatDateOnly(anchor),
    totalDays: overlapDays(formatDateOnly(start), formatDateOnly(anchor), formatDateOnly(start), formatDateOnly(anchor)),
    label: `${formatDateOnly(start)} - ${formatDateOnly(end)}`,
  };
}

function payoutOre(monthlyPriceOre: number, days: number, totalDays: number, commissionRate: number) {
  if (days <= 0 || totalDays <= 0 || monthlyPriceOre <= 0) {
    return 0;
  }

  return Math.round(((monthlyPriceOre * days) / totalDays) * commissionRate);
}

export function calculateCmChangePreview(
  input: CmChangePreviewInput,
): CmChangePreviewResult | null {
  const monthlyPriceSek = Number(input.current_monthly_price) || 0;
  if (monthlyPriceSek <= 0) {
    return null;
  }

  const monthlyPriceOre = Math.round(monthlyPriceSek * 100);
  const period = resolvePeriod(input.effective_date);
  const warnings: string[] = [];

  const currentDays = overlapDays(
    period.start,
    period.endExclusive,
    period.start,
    input.effective_date,
  );
  const nextEndExclusive =
    input.mode === 'temporary' && input.coverage_end_date
      ? formatDateOnly(addDays(parseDateOnly(input.coverage_end_date), 1))
      : period.endExclusive;
  const nextDays = overlapDays(
    period.start,
    period.endExclusive,
    input.effective_date,
    nextEndExclusive,
  );

  if (!input.current?.id) {
    warnings.push('Kunden saknar ordinarie CM');
  }
  if (!input.next?.id && input.mode !== 'temporary') {
    warnings.push('Kunden blir utan tilldelad CM efter bytet');
  }

  const currentRate = input.current?.commission_rate ?? 0;
  const nextRate = input.next?.commission_rate ?? 0;
  const coverPayoutOre = payoutOre(monthlyPriceOre, nextDays, period.totalDays, nextRate);
  const retainedPayoutOre =
    input.mode === 'temporary' && input.compensation_mode === 'primary_cm'
      ? coverPayoutOre
      : 0;

  return {
    period: {
      start: period.start,
      end: period.end,
      total_days: period.totalDays,
      label: period.label,
    },
    current: {
      cm_id: input.current?.id ?? null,
      name: input.current?.name ?? 'Nuvarande CM',
      days: currentDays,
      payout_ore:
        payoutOre(monthlyPriceOre, currentDays, period.totalDays, currentRate) +
        retainedPayoutOre,
    },
    next: {
      cm_id: input.next?.id ?? null,
      name: input.next?.name ?? 'Ny CM',
      days: nextDays,
      payout_ore:
        input.mode === 'temporary' && input.compensation_mode === 'primary_cm'
          ? 0
          : coverPayoutOre,
    },
    retained_payout_ore: retainedPayoutOre,
    warnings,
  };
}
