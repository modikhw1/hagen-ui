import { sekToOre } from '@/lib/admin/money';

export type LineItemTemplate = {
  label: string;
  description: string;
  amount_ore: number;
};

export const COMMON_INVOICE_TEMPLATES: LineItemTemplate[] = [
  { label: 'Inspelning', description: 'Extra inspelningssession', amount_ore: sekToOre(500) },
  { label: 'Resa', description: 'Reseersättning / Milersättning', amount_ore: sekToOre(350) },
  { label: 'Extra Session', description: 'Extra strategisession', amount_ore: sekToOre(1200) },
  { label: 'Foto', description: 'Foto-session / produktbilder', amount_ore: sekToOre(1500) },
  { label: 'Expressleverans', description: 'Avgift för expressleverans', amount_ore: sekToOre(800) },
];

export const CREDIT_NOTE_TEMPLATES: LineItemTemplate[] = [
  { label: 'Prisjustering', description: 'Justering av abonnemangspris', amount_ore: 0 },
  { label: 'Kompensation', description: 'Kompensation för utebliven tjänst', amount_ore: 0 },
];
