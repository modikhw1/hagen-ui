export type BillingPeriod = {
  key: string;
  anchor_date: string;
  start_date: string;
  end_date: string;
  end_exclusive: string;
  label: string;
  is_closed: boolean;
};

const DAY_MS = 86_400_000;
const SWEDISH_MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export function listRecentBillingPeriods(count = 6, today = new Date()): BillingPeriod[] {
  const periods: BillingPeriod[] = [];
  let anchor = parseDateOnly(getLatestClosedBillingAnchor(today));

  for (let index = 0; index < count; index += 1) {
    periods.push(buildBillingPeriod(anchor, today));
    anchor = addMonths(anchor, -1);
  }

  return periods;
}

export function resolveBillingPeriod(periodKey?: string | null, today = new Date()): BillingPeriod {
  if (periodKey) {
    return buildBillingPeriod(parseDateOnly(periodKey), today);
  }

  return buildBillingPeriod(parseDateOnly(getLatestClosedBillingAnchor(today)), today);
}

export function getLatestClosedBillingAnchor(today = new Date()) {
  const currentAnchor = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    25,
  ));

  return formatDateOnly(today.getTime() >= currentAnchor.getTime() ? currentAnchor : addMonths(currentAnchor, -1));
}

export function buildBillingPeriod(anchorDate: Date, today = new Date()): BillingPeriod {
  const anchor = ensureUtcMidnight(anchorDate);
  const start = addMonths(anchor, -1);
  const end = addDays(anchor, -1);

  return {
    key: formatDateOnly(anchor),
    anchor_date: formatDateOnly(anchor),
    start_date: formatDateOnly(start),
    end_date: formatDateOnly(end),
    end_exclusive: formatDateOnly(anchor),
    label: `${formatHumanDate(start)} - ${formatHumanDate(end)}`,
    is_closed: anchor.getTime() <= today.getTime(),
  };
}

export function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

export function formatDateOnly(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number) {
  return new Date(ensureUtcMidnight(date).getTime() + days * DAY_MS);
}

export function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    date.getUTCDate(),
  ));
}

export function overlapDays(
  leftStart: string,
  leftEndExclusive: string,
  rightStart: string,
  rightEndExclusive: string,
) {
  const start = Math.max(parseDateOnly(leftStart).getTime(), parseDateOnly(rightStart).getTime());
  const end = Math.min(parseDateOnly(leftEndExclusive).getTime(), parseDateOnly(rightEndExclusive).getTime());
  if (end <= start) return 0;
  return Math.round((end - start) / DAY_MS);
}

export function toExclusiveDate(value: string | null | undefined) {
  if (!value) return null;
  return formatDateOnly(addDays(parseDateOnly(value), 1));
}

function ensureUtcMidnight(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatHumanDate(date: Date) {
  return `${date.getUTCDate()} ${SWEDISH_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
