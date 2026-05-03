// Single source of truth for the "expected concepts per week" fallback chain.
//
// Order of precedence (matches the chain that the admin customers list and
// overview derivations already use):
//   1. brief.posting_weekdays.length  — soft tempo set in the studio
//   2. customer_profiles.expected_concepts_per_week — admin override
//   3. customer_profiles.concepts_per_week — legacy contract value
//   4. 2 — sensible default so the planned/expected ratio is never x/0
//
// Keep this in sync with artifacts/api-server/src/lib/admin-derive/expected-per-week.ts.

export type ExpectedPerWeekInput = {
  brief?: { posting_weekdays?: unknown } | null;
  expected_concepts_per_week?: number | null;
  concepts_per_week?: number | null;
};

export function resolveExpectedConceptsPerWeek(input: ExpectedPerWeekInput | null | undefined): number {
  const days = input?.brief?.posting_weekdays;
  if (Array.isArray(days) && days.length > 0) return days.length;
  const expected = input?.expected_concepts_per_week;
  if (typeof expected === 'number' && expected > 0) return expected;
  const cpw = input?.concepts_per_week;
  if (typeof cpw === 'number' && cpw > 0) return cpw;
  return 2;
}
