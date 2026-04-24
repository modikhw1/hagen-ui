export const SERVER_COPY = {
  customerIdRequired: 'Kund-ID krävs',
  forbidden: 'Du saknar behörighet',
  customerNotFound: 'Kunden hittades inte',
  fetchCustomerFailed: 'Kunde inte hämta kunddetaljer',
  fetchCustomersFailed: 'Kunde inte hämta kunder',
  fetchBufferFailed: 'Kunde inte hämta bufferdata',
  fetchSnoozesFailed: 'Kunde inte hämta hanteras-markeringar',
  fetchTeamFailed: 'Kunde inte hämta teammedlemmar',
  fetchInvoicesFailed: 'Kunde inte hämta fakturor',
  fetchSubscriptionsFailed: 'Kunde inte hämta abonnemang',
  fetchCustomerHeaderFailed: 'Kunde inte hämta kundheadern',
  invalidPayload: 'Ogiltig payload',
  invalidQuery: 'Ogiltiga query-parametrar',
  superAdminOnly: 'Endast super-admin kan utföra den här billing-åtgärden',
  pricingUnknownActiveSub:
    'Aktiv Stripe-prenumeration kan inte ha "pris ej satt". Avsluta eller pausa abonnemang först.',
  stripeNotConfigured: 'Stripe är inte konfigurerat på servern',
  invalidTikTok: 'Ogiltig TikTok-profil. Använd en profil-URL eller @handle.',
  concurrentActionInProgress: 'En annan ändring pågår, försök igen om en stund.',
  serverError: 'Internt serverfel',
} as const;

export type ServerCopyKey = keyof typeof SERVER_COPY;
