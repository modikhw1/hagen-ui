export const customerStatusConfig = (status: string) => {
  switch (status) {
    case 'active':
    case 'agreed':
      return { label: 'Aktiv', className: 'bg-success/10 text-success' };
    case 'invited':
      return { label: 'Inbjuden', className: 'bg-info/10 text-info' };
    case 'pending_payment':
    case 'pending_invoice':
      return { label: 'Vantar betalning', className: 'bg-warning/10 text-warning' };
    case 'pending':
      return { label: 'Vantande', className: 'bg-warning/10 text-warning' };
    case 'paused':
      return { label: 'Pausad', className: 'bg-warning/10 text-warning' };
    case 'past_due':
      return { label: 'Forfallen', className: 'bg-destructive/10 text-destructive' };
    case 'canceled':
    case 'cancelled':
      return { label: 'Avslutad', className: 'bg-muted text-muted-foreground' };
    case 'archived':
      return { label: 'Arkiverad', className: 'bg-muted text-muted-foreground' };
    default:
      return { label: status, className: 'bg-muted text-muted-foreground' };
  }
};

export const invoiceStatusConfig = (status: string) => {
  switch (status) {
    case 'paid':
      return { label: 'Betald', className: 'bg-success/10 text-success' };
    case 'partially_refunded':
      return { label: 'Delvis krediterad', className: 'bg-info/10 text-info' };
    case 'refunded':
      return { label: 'Aterbetald', className: 'bg-muted text-muted-foreground' };
    case 'open':
      return { label: 'Obetald', className: 'bg-warning/10 text-warning' };
    case 'void':
      return { label: 'Annullerad', className: 'bg-muted text-muted-foreground' };
    case 'draft':
      return { label: 'Utkast', className: 'bg-info/10 text-info' };
    case 'uncollectible':
      return { label: 'Oindrivbar', className: 'bg-destructive/10 text-destructive' };
    default:
      return { label: status, className: 'bg-muted text-muted-foreground' };
  }
};

export const subscriptionStatusConfig = (status: string) => {
  switch (status) {
    case 'active':
      return { label: 'Aktiv', className: 'bg-success/10 text-success' };
    case 'trialing':
      return { label: 'Provperiod', className: 'bg-info/10 text-info' };
    case 'past_due':
      return { label: 'Forfallen', className: 'bg-destructive/10 text-destructive' };
    case 'paused':
      return { label: 'Pausad', className: 'bg-warning/10 text-warning' };
    case 'canceled':
    case 'cancelled':
      return { label: 'Avslutad', className: 'bg-muted text-muted-foreground' };
    case 'incomplete':
      return { label: 'Ofullstandig', className: 'bg-warning/10 text-warning' };
    default:
      return { label: status, className: 'bg-muted text-muted-foreground' };
  }
};

export const intervalLabel = (i: string) =>
  i === 'month' ? '/man' : i === 'quarter' ? '/kvartal' : i === 'year' ? '/ar' : '';

export const intervalLong = (i: string) =>
  i === 'month' ? 'Manadsvis' : i === 'quarter' ? 'Kvartalsvis' : i === 'year' ? 'Arsvis' : i;
