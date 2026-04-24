export type Ore = number & { readonly __brand: 'ore' };
export type Sek = number & { readonly __brand: 'sek' };

export type MoneyUnit = 'ore' | 'sek';

type FormatMoneyOptions = {
  fallback?: string;
  unit?: MoneyUnit;
};

export const EMPTY_MONEY_VALUE = '—';

const sekFormatter = new Intl.NumberFormat('sv-SE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function asOre(value: number): Ore {
  return (Number.isFinite(value) ? Math.round(value) : Number.NaN) as Ore;
}

export function asSek(value: number): Sek {
  return (Number.isFinite(value) ? value : Number.NaN) as Sek;
}

export function sekToOre(sek: number): Ore {
  return asOre(Number.isFinite(sek) ? sek * 100 : Number.NaN);
}

export function oreToSek(ore: number): Sek {
  return asSek(Number.isFinite(ore) ? ore / 100 : Number.NaN);
}

function formatCurrencyValue(sek: number) {
  return `${sekFormatter.format(sek)} kr`;
}

function toSekValue(value: number, unit: MoneyUnit) {
  return unit === 'ore' ? oreToSek(value) : asSek(value);
}

export function formatSek(
  value: number | null | undefined,
  options: FormatMoneyOptions = {},
) {
  if (!isFiniteNumber(value)) {
    return options.fallback ?? EMPTY_MONEY_VALUE;
  }

  return formatCurrencyValue(toSekValue(value, options.unit ?? 'ore'));
}

export function formatOre(
  value: number | null | undefined,
  options: Omit<FormatMoneyOptions, 'unit'> = {},
) {
  return formatSek(value, { ...options, unit: 'ore' });
}

export function formatPriceSek({
  value,
  unit = 'sek',
  fallback = EMPTY_MONEY_VALUE,
}: {
  value: number | null | undefined;
  unit?: MoneyUnit;
  fallback?: string;
}) {
  if (!isFiniteNumber(value) || value <= 0) {
    return fallback;
  }

  return formatSek(value, { unit, fallback });
}

export function formatPriceSEK(
  value: number | null | undefined,
  options?: {
    unit?: MoneyUnit;
    fallback?: string;
  },
) {
  return formatPriceSek({
    value,
    unit: options?.unit ?? 'sek',
    fallback: options?.fallback ?? EMPTY_MONEY_VALUE,
  });
}
