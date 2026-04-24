/**
 * Operatörsspråk för LeTrend Admin.
 *
 * Regler:
 * 1. Inga interna ord ("buffer", "pending bucket", "tunna kunder").
 * 2. Skrivet för en admin som inte byggt produkten.
 * 3. Svenska är primärt; engelska finns för framtida i18n.
 */

export const OPERATOR_COPY = {
  // CM-pulse statusar — ersätter 'needs_action' / 'watch' / 'away' / 'ok'
  cmStatus: {
    needs_action: { label: 'Åtgärd krävs',     tone: 'danger'  as const },
    watch:        { label: 'Observation krävs', tone: 'warning' as const },
    away:         { label: 'Frånvarande',       tone: 'neutral' as const },
    ok:           { label: 'I fas',             tone: 'success' as const },
  },

  // Innehållskö (tidigare "buffer") — kundens planerade content-flöde
  contentQueue: {
    ok:       { label: 'I fas',                 tone: 'success' as const },
    thin:     { label: 'Behöver fler koncept',  tone: 'warning' as const },
    under:    { label: 'Under planerat tempo',  tone: 'danger'  as const },
    paused:   { label: 'Pausad',                tone: 'neutral' as const },
    blocked:  { label: 'Väntar på kunden',      tone: 'warning' as const },
  },

  // Onboarding-states — bevaras men formuleras operativt
  onboarding: {
    invited:  { label: 'Inbjuden',         tone: 'info'    as const },
    cm_ready: { label: 'CM redo att starta', tone: 'warning' as const },
    settled:  { label: 'Pågår',            tone: 'success' as const },
    live:     { label: 'Live',             tone: 'success' as const },
  },

  // Attention-rubriker per typ
  attention: {
    invoice_unpaid:        'Obetald faktura',
    onboarding_stuck:      'Onboarding fastnat',
    customer_blocked:      'Väntar på kunden',
    cm_change_due_today:   'CM-byte idag',
    pause_resume_due_today:'Paus/återupptag idag',
    cm_low_activity:       'Tyst CM-relation',
    cm_notification:       'CM-meddelande',
    demo_responded:        'Demo besvarad',
  },

  // Pending invoice items — det som idag heter "PendingInvoiceItems"
  pendingItems: {
    sectionTitle:    'Väntande poster på nästa faktura',
    sectionSubtitle: (count: number, dateLabel: string) =>
      count === 0
        ? `Lägg till poster som ska följa med abonnemangsfakturan ${dateLabel}.`
        : `${count} ${count === 1 ? 'post' : 'poster'} följer med fakturan ${dateLabel}.`,
    addCta:          'Lägg till post',
    emptyTitle:      'Inga väntande poster',
    emptyHint:       'Allt extra utöver abonnemanget rullar in vid nästa periodskifte.',
  },

  // Krediteringsflödet
  credit: {
    primaryCta:        'Kreditera hela fakturan',
    primarySubtitle:   'En kreditnota dras på hela beloppet. Du kan välja att skapa en ersättningsfaktura.',
    advancedToggle:    'Avancerat: kreditera enskilda poster',
    issueReplacement:  'Skicka en ersättningsfaktura efter krediteringen',
    refundIfPaid:      'Återbetala kunden',
    memoLabel:         'Intern anteckning (visas inte för kunden)',
  },

  // Test/Live
  env: {
    testBadge:  'Test-läge',
    liveBadge:  'Live',
    settingsLabel: 'Datakälla',
    settingsHint:  'Test visar Stripes test-data. Live visar riktiga betalningar. Påverkar bara denna sessions visning.',
  },
} as const;

export type OperatorTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
