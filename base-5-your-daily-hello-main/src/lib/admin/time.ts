import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';

export type DateInput = Date | string | null | undefined;

export const EMPTY_DATE_VALUE = '—';

function toDate(value: DateInput) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function relativeSv(value: DateInput) {
  const date = toDate(value);
  return date ? formatDistanceToNow(date, { addSuffix: true, locale: sv }) : EMPTY_DATE_VALUE;
}

export function timeAgoSv(value: DateInput) {
  return relativeSv(value);
}

export function shortDateSv(value: DateInput) {
  const date = toDate(value);
  return date ? format(date, 'd MMM', { locale: sv }) : EMPTY_DATE_VALUE;
}

export function dateInputSv(value: DateInput) {
  const date = toDate(value);
  return date ? format(date, 'yyyy-MM-dd') : '';
}

export function todayDateInput() {
  return dateInputSv(new Date());
}

export function longDateSv(value: DateInput) {
  const date = toDate(value);
  return date ? format(date, 'd MMMM yyyy', { locale: sv }) : EMPTY_DATE_VALUE;
}

export function dateTimeSv(value: DateInput) {
  const date = toDate(value);
  return date ? format(date, 'd MMM yyyy HH:mm', { locale: sv }) : EMPTY_DATE_VALUE;
}

export function monthYearSv(value: DateInput) {
  const date = toDate(value);
  if (!date) return EMPTY_DATE_VALUE;
  const res = format(date, 'MMM yyyy', { locale: sv });
  return res.charAt(0).toUpperCase() + res.slice(1);
}
