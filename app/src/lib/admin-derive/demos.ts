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

type BoardColumns<TCard> = {
  draft: TCard[];
  sent: TCard[];
  opened: TCard[];
  responded: TCard[];
  closed: TCard[];
};

type DemosBoardLike<TCard extends { id: string; status: DemoStatus; statusChangedAt: string; nextStatus: DemoStatus | null }> = {
  columns: BoardColumns<TCard>;
};

function nextStatusFor(status: DemoStatus): DemoStatus | null {
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

export function demoStatusLabel(status: DemoStatus) {
  switch (status) {
    case 'draft':
      return 'Utkast';
    case 'sent':
      return 'Skickad';
    case 'opened':
      return '\u00d6ppnad';
    case 'responded':
      return 'Svar inkom';
    case 'won':
      return 'Vunnen';
    case 'lost':
      return 'F\u00f6rlorad';
    case 'expired':
      return 'Utg\u00e5en';
  }
}

export function moveDemoBetweenColumns<
  TBoard extends DemosBoardLike<TCard>,
  TCard extends { id: string; status: DemoStatus; statusChangedAt: string; nextStatus: DemoStatus | null },
>(board: TBoard, demoId: string, nextStatus: DemoStatus): TBoard {
  let movedCard: TCard | null = null;
  const columns: BoardColumns<TCard> = {
    draft: board.columns.draft.filter((card) => {
      if (card.id !== demoId) return true;
      movedCard = card;
      return false;
    }),
    sent: board.columns.sent.filter((card) => {
      if (card.id !== demoId) return true;
      movedCard = card;
      return false;
    }),
    opened: board.columns.opened.filter((card) => {
      if (card.id !== demoId) return true;
      movedCard = card;
      return false;
    }),
    responded: board.columns.responded.filter((card) => {
      if (card.id !== demoId) return true;
      movedCard = card;
      return false;
    }),
    closed: board.columns.closed.filter((card) => {
      if (card.id !== demoId) return true;
      movedCard = card;
      return false;
    }),
  };

  if (!movedCard) {
    return board;
  }

  const patchedCard = {
    ...(movedCard as TCard),
    status: nextStatus,
    nextStatus: nextStatusFor(nextStatus),
    statusChangedAt: new Date().toISOString(),
  } as TCard;

  if (nextStatus === 'draft') {
    columns.draft.unshift(patchedCard);
  } else if (nextStatus === 'sent') {
    columns.sent.unshift(patchedCard);
  } else if (nextStatus === 'opened') {
    columns.opened.unshift(patchedCard);
  } else if (nextStatus === 'responded') {
    columns.responded.unshift(patchedCard);
  } else {
    columns.closed.unshift(patchedCard);
  }

  return {
    ...board,
    columns,
  };
}
