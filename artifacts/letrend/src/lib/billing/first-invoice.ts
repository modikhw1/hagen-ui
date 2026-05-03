export type FirstInvoiceBehavior = 'prorated' | 'full' | 'free_until_anchor';

export interface FirstInvoiceCalculationInput {
  pricingStatus: 'fixed' | 'unknown';
  recurringPriceSek: number;
  startDate: string;
  billingDay: number;
  waiveDaysUntilBilling: boolean;
}

export interface FirstInvoiceCalculationResult {
  amountSek: number | null;
  behavior: FirstInvoiceBehavior;
  nextBillingDate: string | null;
  explanation: string;
}

function toMidnight(dateString: string) {
  return new Date(`${dateString}T00:00:00`);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function clampBillingDay(day: number) {
  return Math.max(1, Math.min(28, Number(day) || 25));
}

function getNextBillingDate(startDate: Date, billingDay: number) {
  const clampedBillingDay = clampBillingDay(billingDay);
  const sameMonth = new Date(startDate.getFullYear(), startDate.getMonth(), clampedBillingDay);

  if (sameMonth.getTime() >= startDate.getTime()) {
    return sameMonth;
  }

  return new Date(startDate.getFullYear(), startDate.getMonth() + 1, clampedBillingDay);
}

function daysBetween(startDate: Date, endDate: Date) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / msPerDay));
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function inferFirstInvoiceBehavior(params: {
  startDate: string;
  billingDay: number;
  waiveDaysUntilBilling: boolean;
}): FirstInvoiceBehavior {
  if (params.waiveDaysUntilBilling) {
    return 'free_until_anchor';
  }

  const start = toMidnight(params.startDate);
  if (start.getDate() === clampBillingDay(params.billingDay)) {
    return 'full';
  }

  return 'prorated';
}

export function calculateFirstInvoice(input: FirstInvoiceCalculationInput): FirstInvoiceCalculationResult {
  if (input.pricingStatus === 'unknown' || input.recurringPriceSek <= 0 || !input.startDate) {
    return {
      amountSek: null,
      behavior: 'prorated',
      nextBillingDate: null,
      explanation: 'Första fakturan kan beräknas när pris och startdatum är satta.',
    };
  }

  const startDate = toMidnight(input.startDate);
  const billingDay = clampBillingDay(input.billingDay);
  const behavior = inferFirstInvoiceBehavior({
    startDate: input.startDate,
    billingDay,
    waiveDaysUntilBilling: input.waiveDaysUntilBilling,
  });

  if (behavior === 'full') {
    return {
      amountSek: Math.round(input.recurringPriceSek),
      behavior,
      nextBillingDate: formatDate(startDate),
      explanation: 'Startdatumet ligger på ordinarie faktureringsdag. Första fakturan blir full ordinarie debitering.',
    };
  }

  const nextBillingDate = getNextBillingDate(startDate, billingDay);
  const daysUntilBilling = daysBetween(startDate, nextBillingDate);

  if (behavior === 'free_until_anchor') {
    return {
      amountSek: 0,
      behavior,
      nextBillingDate: formatDate(nextBillingDate),
      explanation: `Ingen kostnad tas ut fram till nästa faktureringsdag ${formatDate(nextBillingDate)}.`,
    };
  }

  const dailyRate = input.recurringPriceSek / daysInMonth(startDate);
  const proratedAmount = Math.round(dailyRate * daysUntilBilling);

  return {
    amountSek: proratedAmount,
    behavior,
    nextBillingDate: formatDate(nextBillingDate),
    explanation: `${daysUntilBilling} dagar fram till ${formatDate(nextBillingDate)} × ${Math.round(dailyRate)} kr/dag = ${proratedAmount} kr.`,
  };
}
