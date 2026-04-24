import { describe, expect, it } from 'vitest';
import { hashToHsl } from '@/lib/admin/color';

describe('hashToHsl', () => {
  it('is deterministic for the same input', () => {
    expect(hashToHsl('cm_123')).toBe(hashToHsl('cm_123'));
  });

  it('returns different values for different inputs', () => {
    expect(hashToHsl('cm_123')).not.toBe(hashToHsl('cm_456'));
  });

  it('returns an hsl color string', () => {
    expect(hashToHsl('cm_123')).toMatch(/^hsl\(\d+ \d+% \d+%\)$/);
  });
});
