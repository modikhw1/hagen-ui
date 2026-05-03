import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingRelationError } from '@/lib/admin/schema-guards';

export type AuditLogInput = {
  actorUserId: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

export type AuditLogEntry = {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label?: string | null;
  entity_link?: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AuditLogQuery = {
  ilike: (column: string, value: string) => AuditLogQuery;
  in: (column: string, values: string[]) => AuditLogQuery;
  eq: (column: string, value: string) => AuditLogQuery;
  gte: (column: string, value: string) => AuditLogQuery;
  lte: (column: string, value: string) => AuditLogQuery;
  or: (value: string) => AuditLogQuery;
  order: (column: string, options: { ascending: boolean }) => AuditLogQuery;
  limit: (value: number) => Promise<{
    data: AuditLogEntry[] | null;
    error: { message?: string } | null;
  }>;
};

type EntityLookup = {
  label: string;
  link: string | null;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const AUDIT_RETENTION_DAYS = 90;

function toStartOfDayIso(dateOnly: string) {
  return `${dateOnly}T00:00:00.000Z`;
}

function toEndOfDayIso(dateOnly: string) {
  return `${dateOnly}T23:59:59.999Z`;
}

function normalizeFromFilter(value?: string) {
  if (!value) return undefined;
  if (DATE_ONLY_RE.test(value)) {
    return toStartOfDayIso(value);
  }
  return value;
}

function normalizeToFilter(value?: string) {
  if (!value) return undefined;
  if (DATE_ONLY_RE.test(value)) {
    return toEndOfDayIso(value);
  }
  return value;
}

function retentionFloorIso() {
  return new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function clampFromToRetention(value?: string) {
  const floor = retentionFloorIso();
  if (!value) {
    return floor;
  }

  return value < floor ? floor : value;
}

function fallbackEntityLabel(entry: Pick<AuditLogEntry, 'entity_type' | 'entity_id'>) {
  if (!entry.entity_id) {
    return entry.entity_type;
  }

  const suffix = entry.entity_id.slice(0, 8);
  switch (entry.entity_type) {
    case 'customer':
      return `Kund ${suffix}`;
    case 'invoice':
      return `Faktura ${suffix}`;
    case 'subscription':
      return `Prenumeration ${suffix}`;
    case 'team_member':
    case 'cm':
      return `Teammedlem ${suffix}`;
    default:
      return `${entry.entity_type} ${suffix}`;
  }
}

async function resolveEntityLookups(
  supabaseAdmin: SupabaseClient,
  entries: AuditLogEntry[],
) {
  const customerIds = new Set<string>();
  const invoiceIds = new Set<string>();
  const subscriptionIds = new Set<string>();
  const teamMemberIds = new Set<string>();

  for (const entry of entries) {
    if (!entry.entity_id) continue;
    switch (entry.entity_type) {
      case 'customer':
        customerIds.add(entry.entity_id);
        break;
      case 'invoice':
        invoiceIds.add(entry.entity_id);
        break;
      case 'subscription':
        subscriptionIds.add(entry.entity_id);
        break;
      case 'team_member':
      case 'cm':
        teamMemberIds.add(entry.entity_id);
        break;
      default:
        break;
    }
  }

  const lookups = new Map<string, EntityLookup>();

  // Run all lookups in parallel
  const [customersResult, invoicesResult, subscriptionsResult, teamMembersResult] = await Promise.all([
    customerIds.size > 0
      ? supabaseAdmin
          .from('customer_profiles')
          .select('id, business_name')
          .in('id', Array.from(customerIds))
      : Promise.resolve({ data: [] }),
    invoiceIds.size > 0
      ? supabaseAdmin
          .from('invoices')
          .select('id, invoice_number')
          .in('id', Array.from(invoiceIds))
      : Promise.resolve({ data: [] }),
    subscriptionIds.size > 0
      ? supabaseAdmin
          .from('subscriptions')
          .select('id')
          .in('id', Array.from(subscriptionIds))
      : Promise.resolve({ data: [] }),
    teamMemberIds.size > 0
      ? supabaseAdmin
          .from('team_members')
          .select('id, name')
          .in('id', Array.from(teamMemberIds))
      : Promise.resolve({ data: [] }),
  ]);

  for (const row of (customersResult.data ?? [])) {
    lookups.set(`customer:${row.id}`, {
      label: row.business_name || `Kund ${row.id.slice(0, 8)}`,
      link: `/admin/customers/${row.id}`,
    });
  }

  for (const row of (invoicesResult.data ?? [])) {
    lookups.set(`invoice:${row.id}`, {
      label: row.invoice_number ? `Faktura ${row.invoice_number}` : `Faktura ${row.id.slice(0, 8)}`,
      link: '/admin/billing/invoices',
    });
  }

  for (const row of (subscriptionsResult.data ?? [])) {
    lookups.set(`subscription:${row.id}`, {
      label: `Prenumeration ${row.id.slice(0, 8)}`,
      link: '/admin/billing/subscriptions',
    });
  }

  for (const row of (teamMembersResult.data ?? [])) {
    const value = {
      label: row.name || `Teammedlem ${row.id.slice(0, 8)}`,
      link: `/admin/team?focus=${row.id}`,
    };
    lookups.set(`team_member:${row.id}`, value);
    lookups.set(`cm:${row.id}`, value);
  }

  return lookups;
}

export async function recordAuditLog(
  supabaseAdmin: SupabaseClient,
  input: AuditLogInput,
) {
  const { error } = await (((supabaseAdmin.from('audit_log' as never) as never) as {
    insert: (value: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>;
  }).insert({
    actor_user_id: input.actorUserId,
    actor_email: input.actorEmail ?? null,
    actor_role: input.actorRole ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before_state: input.beforeState ?? null,
    after_state: input.afterState ?? null,
    metadata: input.metadata ?? null,
  }));

  if (error) {
    if (isMissingRelationError(error.message)) return false;
    console.error('[audit-log] failed to insert row', error.message);
    return false;
  }

  return true;
}

export async function listAuditLog(
  supabaseAdmin: SupabaseClient,
  filter:
    | number
    | {
        actor?: string;
        action?: string;
        entity?: string;
        from?: string;
        to?: string;
        onlyErrors?: boolean;
        billingOnly?: boolean;
        limit?: number;
        cursor?: string | null;
      } = 100,
): Promise<{ entries: AuditLogEntry[]; schemaWarnings: string[] }> {
  const normalized =
    typeof filter === 'number'
      ? { limit: filter, cursor: null as string | null }
      : {
          limit: filter.limit ?? 100,
          actor: filter.actor,
          action: filter.action,
          entity: filter.entity,
          from: clampFromToRetention(normalizeFromFilter(filter.from)),
          to: normalizeToFilter(filter.to),
          onlyErrors: Boolean(filter.onlyErrors),
          billingOnly: Boolean(filter.billingOnly),
          cursor: filter.cursor ?? null,
        };

  let query = (((supabaseAdmin.from('audit_log' as never) as never) as {
    select: (columns: string) => AuditLogQuery;
  }).select(
    'id, actor_user_id, actor_email, actor_role, action, entity_type, entity_id, before_state, after_state, metadata, created_at',
  )) as unknown as AuditLogQuery;

  if (normalized.actor) {
    query = query.ilike('actor_email', `%${normalized.actor}%`);
  }
  if (normalized.action) {
    query = query.eq('action', normalized.action);
  }
  if (normalized.entity) {
    query = query.eq('entity_type', normalized.entity);
  }
  if (normalized.billingOnly && !normalized.entity) {
    query = query.in('entity_type', ['invoice', 'subscription', 'payment_intent', 'charge']);
  }
  if (normalized.onlyErrors) {
    query = query.ilike('action', '%error%');
  }
  if (normalized.from) {
    query = query.gte('created_at', normalized.from);
  }
  if (normalized.to) {
    query = query.lte('created_at', normalized.to);
  }
  if (normalized.cursor) {
    const [createdAt, id] = normalized.cursor.split('|');
    if (createdAt && id) {
      query = query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
    }
  }

  const result = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(normalized.limit);

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return {
        entries: [],
        schemaWarnings: ['Audit-logg-tabellen saknas i databasen. Kör migrationen för §2.'],
      };
    }

    throw new Error(result.error.message || 'Kunde inte hämta audit-logg');
  }

  const entries = result.data ?? [];
  const lookups = await resolveEntityLookups(supabaseAdmin, entries);
  const enriched = entries.map((entry) => {
    const key = entry.entity_id ? `${entry.entity_type}:${entry.entity_id}` : null;
    const lookup = key ? lookups.get(key) : null;

    return {
      ...entry,
      entity_label: lookup?.label ?? fallbackEntityLabel(entry),
      entity_link: lookup?.link ?? null,
    } satisfies AuditLogEntry;
  });

  return {
    entries: enriched,
    schemaWarnings: [],
  };
}

export async function getAuditLogEntryById(
  supabaseAdmin: SupabaseClient,
  id: string,
): Promise<AuditLogEntry | null> {
  const result = await (((supabaseAdmin.from('audit_log' as never) as never) as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: AuditLogEntry | null;
          error: { message?: string } | null;
        }>;
      };
    };
  }).select(
    'id, actor_user_id, actor_email, actor_role, action, entity_type, entity_id, before_state, after_state, metadata, created_at',
  )).eq('id', id).maybeSingle();

  if (result.error) {
    if (isMissingRelationError(result.error.message)) {
      return null;
    }

    throw new Error(result.error.message || 'Kunde inte hämta audit-post');
  }

  if (!result.data) {
    return null;
  }

  const lookups = await resolveEntityLookups(supabaseAdmin, [result.data]);
  const key = result.data.entity_id
    ? `${result.data.entity_type}:${result.data.entity_id}`
    : null;
  const lookup = key ? lookups.get(key) : null;

  return {
    ...result.data,
    entity_label: lookup?.label ?? fallbackEntityLabel(result.data),
    entity_link: lookup?.link ?? null,
  } satisfies AuditLogEntry;
}
