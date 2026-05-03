import { describe, expect, it } from 'vitest';
import { absenceSchema, cmEditSchema } from '@/lib/admin/schemas/team';

describe('cmEditSchema', () => {
  it('accepts a valid payload', () => {
    const parsed = cmEditSchema.parse({
      name: 'Anna Admin',
      email: 'anna@example.com',
      phone: '',
      city: 'Stockholm',
      bio: 'Driver kundrelationer.',
      avatar_url: '',
      commission_rate_pct: 20,
    });

    expect(parsed.commission_rate_pct).toBe(20);
  });

  it('rejects commission rates above 50%', () => {
    const result = cmEditSchema.safeParse({
      name: 'Anna Admin',
      email: 'anna@example.com',
      phone: '',
      city: '',
      bio: '',
      avatar_url: '',
      commission_rate_pct: 60,
    });

    expect(result.success).toBe(false);
  });
});

describe('absenceSchema', () => {
  it('accepts covering CM with backup', () => {
    const parsed = absenceSchema.parse({
      absence_type: 'vacation',
      starts_on: '2026-04-22',
      ends_on: '2026-04-25',
      backup_cm_id: '11111111-1111-4111-8111-111111111111',
      compensation_mode: 'covering_cm',
      note: '',
    });

    expect(parsed.note).toBeNull();
  });

  it('rejects covering CM without backup', () => {
    const result = absenceSchema.safeParse({
      absence_type: 'vacation',
      starts_on: '2026-04-22',
      ends_on: '2026-04-25',
      backup_cm_id: null,
      compensation_mode: 'covering_cm',
      note: null,
    });

    expect(result.success).toBe(false);
  });

  it('rejects end dates before start dates', () => {
    const result = absenceSchema.safeParse({
      absence_type: 'vacation',
      starts_on: '2026-04-25',
      ends_on: '2026-04-22',
      backup_cm_id: '11111111-1111-4111-8111-111111111111',
      compensation_mode: 'covering_cm',
      note: null,
    });

    expect(result.success).toBe(false);
  });
});
