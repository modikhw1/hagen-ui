import { describe, expect, it } from 'vitest';
import {
  EMPTY_MONEY_VALUE,
  formatOre,
  formatPriceSEK,
  formatPriceSek,
  formatSek,
  oreToSek,
  sekToOre,
} from '@/lib/admin/money';

describe('money helpers', () => {
  it('converts between sek and ore', () => {
    expect(sekToOre(99)).toBe(9900);
    expect(oreToSek(9900)).toBe(99);
  });

  it('keeps negative values during conversion', () => {
    expect(sekToOre(-12.5)).toBe(-1250);
    expect(oreToSek(-1250)).toBe(-12.5);
  });

  it('returns NaN when converting invalid numbers', () => {
    expect(Number.isNaN(sekToOre(Number.NaN))).toBe(true);
    expect(Number.isNaN(oreToSek(Number.NaN))).toBe(true);
  });

  it('formats ore and sek values centrally', () => {
    expect(formatOre(9950)).toBe('99,5 kr');
    expect(formatSek(99.5, { unit: 'sek' })).toBe('99,5 kr');
    expect(formatSek(-1200)).toBe('−12 kr');
  });

  it('uses fallback for invalid values', () => {
    expect(formatSek(Number.NaN)).toBe(EMPTY_MONEY_VALUE);
    expect(formatPriceSEK(0, { fallback: 'Ej satt' })).toBe('Ej satt');
    expect(formatPriceSek({ value: undefined, fallback: 'Saknas' })).toBe('Saknas');
  });
});
