export type DemoStatus =
  | 'draft'
  | 'sent'
  | 'opened'
  | 'responded'
  | 'won'
  | 'lost'
  | 'expired';

export type DemoCard = {
  id: string;
  companyName: string;
  tiktokHandle: string | null;
  proposedPace: number | null;
  proposedPriceSek: number | null;
  status: DemoStatus;
  statusChangedAt: Date;
  ownerName: string | null;
};

export function demoStatusLabel(status: DemoStatus) {
  switch (status) {
    case 'draft':
      return 'Utkast';
    case 'sent':
      return 'Skickad';
    case 'opened':
      return 'Oppnad';
    case 'responded':
      return 'Svar inkom';
    case 'won':
      return 'Vunnen';
    case 'lost':
      return 'Forlorad';
    case 'expired':
      return 'Utgangen';
  }
}

export function nextDemoStatus(status: DemoStatus): DemoStatus | null {
  switch (status) {
    case 'draft':
      return 'sent';
    case 'sent':
      return 'opened';
    case 'opened':
      return 'responded';
    default:
      return null;
  }
}

export function groupDemos(cards: DemoCard[]) {
  return {
    draft: cards.filter((card) => card.status === 'draft'),
    sent: cards.filter((card) => card.status === 'sent'),
    opened: cards.filter((card) => card.status === 'opened'),
    responded: cards.filter((card) => card.status === 'responded'),
    closed: cards.filter((card) => ['won', 'lost', 'expired'].includes(card.status)),
  };
}
