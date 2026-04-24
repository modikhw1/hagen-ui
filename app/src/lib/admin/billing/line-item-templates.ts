import { sekToOre } from '@/lib/admin/money';

export type LineItemTemplate = {
  label: string;
  description: string;
  amount: number; // i öre
};

export const MANUAL_INVOICE_TEMPLATES: LineItemTemplate[] = [
  { label: 'Inspelning', description: 'Extra inspelningssession', amount: sekToOre(500) },
  { label: 'Foto',       description: 'Foto-session / produktbilder', amount: sekToOre(1200) },
  { label: 'Resa',       description: 'Reseersättning', amount: sekToOre(350) },
];

export const CREDIT_NOTE_TEMPLATES: LineItemTemplate[] = [
  { label: 'Prisjustering', description: 'Justering av abonnemangspris', amount: 0 },
  { label: 'Kompensation', description: 'Kompensation för utebliven tjänst', amount: 0 },
];
