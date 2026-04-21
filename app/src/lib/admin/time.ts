import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';

export const timeAgoSv = (iso: string | null) =>
  iso ? formatDistanceToNow(parseISO(iso), { addSuffix: true, locale: sv }) : '—';

export const shortDateSv = (iso: string | null) =>
  iso ? format(parseISO(iso), 'd MMM', { locale: sv }) : '—';
