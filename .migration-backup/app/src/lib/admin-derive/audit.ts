type AuditEntryLike = {
  action: string;
  metadata: Record<string, unknown> | null;
};

export function formatAuditMetadata(entry: AuditEntryLike): string {
  const metadata = entry.metadata ?? {};

  if (entry.action === 'demo.convert' && typeof metadata.customer_id === 'string') {
    return `Konverterade demo till kund ${metadata.customer_id}`;
  }

  if (entry.action === 'demo.create') {
    return 'Skapade ny demo';
  }

  if (
    entry.action === 'demo.status_change' &&
    typeof metadata.from === 'string' &&
    typeof metadata.to === 'string'
  ) {
    return `Status ${metadata.from} -> ${metadata.to}`;
  }

  if (entry.action === 'settings.update') {
    return 'Uppdaterade globala settings';
  }

  if (
    entry.metadata?.summary &&
    typeof entry.metadata.summary === 'string'
  ) {
    return entry.metadata.summary;
  }

  if (
    entry.metadata?.action &&
    typeof entry.metadata.action === 'string'
  ) {
    return entry.metadata.action;
  }

  return 'Ingen extra metadata';
}
