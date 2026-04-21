export const customerStatusConfig = (status: string) => {
  switch (status) {
    case 'active':
    case 'agreed':
      return { label: 'Aktiv', className: 'bg-success/10 text-success' };
    case 'invited':
      return { label: 'Inbjuden', className: 'bg-info/10 text-info' };
    case 'pending':
      return { label: 'Väntande', className: 'bg-warning/10 text-warning' };
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
      return { label: 'Förfallen', className: 'bg-destructive/10 text-destructive' };
    case 'paused':
      return { label: 'Pausad', className: 'bg-warning/10 text-warning' };
    case 'canceled':
      return { label: 'Avslutad', className: 'bg-muted text-muted-foreground' };
    case 'incomplete':
      return { label: 'Ofullständig', className: 'bg-warning/10 text-warning' };
    default:
      return { label: status, className: 'bg-muted text-muted-foreground' };
  }
};

export const intervalLabel = (i: string) =>
  i === 'month' ? '/mån' : i === 'quarter' ? '/kvartal' : i === 'year' ? '/år' : '';

export const intervalLong = (i: string) =>
  i === 'month' ? 'Månadsvis' : i === 'quarter' ? 'Kvartalsvis' : i === 'year' ? 'Årsvis' : i;
