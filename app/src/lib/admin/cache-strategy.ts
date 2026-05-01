// app/src/lib/admin/cache-strategy.ts

/**
 * Single source of truth för cache-invalidering i admin-appen.
 *
 * En SCOPE är en logisk datadomän (t.ex. "customer_detail").
 * En ACTION är en mutation som händer (t.ex. "pause_customer").
 * En action mappas till en uppsättning scopes som måste invalideras.
 *
 * Varje scope har:
 *   - serverTags: revalidateTag-namn för Server Components / unstable_cache
 *   - clientKeys: queryKey-prefix för React Query
 *
 * Detta gör att vi kan ändra invaliderings-strategi på en plats utan att jaga
 * call-sites runt om i appen.
 */

import type { QueryKey } from '@tanstack/react-query';

// ──────────────────────────────────────────────────────────────────────────────
// Scope definition
// ──────────────────────────────────────────────────────────────────────────────

export type AdminScope =
  | 'customers_list'
  | 'customer_detail'
  | 'customer_billing'
  | 'customer_pulse'
  | 'team'
  | 'billing_global'
  | 'pending_items';

interface ScopeDefinition {
  serverTags: readonly string[];
  /** Funktion som returnerar React Query keys.
   *  Tar `scopeArgs` (typiskt customerId) om scope är kund-specifik. */
  clientKeys: (args?: { customerId?: string }) => readonly QueryKey[];
  description: string;
}

const SCOPE_DEFINITIONS: Record<AdminScope, ScopeDefinition> = {
  customers_list: {
    serverTags: ['admin:customers:list'],
    clientKeys: () => [['admin', 'customers', 'list']],
    description: 'Kundlistan på /admin/customers',
  },
  customer_detail: {
    serverTags: ['admin:customer:detail'],
    clientKeys: ({ customerId } = {}) =>
      customerId ? [['admin', 'customer', customerId]] : [['admin', 'customer']],
    description: 'En enskild kunds detaljvy (alla tabbar)',
  },
  customer_billing: {
    serverTags: ['admin:customer:billing'],
    clientKeys: ({ customerId } = {}) =>
      customerId
        ? [['admin', 'customer', customerId, 'billing']]
        : [['admin', 'customer', undefined, 'billing']],
    description: 'Fakturering & väntande poster för en kund',
  },
  customer_pulse: {
    serverTags: ['admin:customer:pulse'],
    clientKeys: ({ customerId } = {}) =>
      customerId
        ? [['admin', 'customer', customerId, 'pulse']]
        : [['admin', 'customer', undefined, 'pulse']],
    description: 'CM-aktivitet och pulse-data',
  },
  team: {
    serverTags: ['admin:team:overview'],
    clientKeys: () => [['admin', 'team']],
    description: 'Team-översikten på /admin/team',
  },
  billing_global: {
    serverTags: ['admin:billing:global', 'admin:invoices:list'],
    clientKeys: () => [
      ['admin', 'billing'],
      ['admin', 'invoices'],
    ],
    description: 'App-nivå billing (payroll, fakturalistor)',
  },
  pending_items: {
    serverTags: ['admin:customer:pending_items'],
    clientKeys: ({ customerId } = {}) =>
      customerId
        ? [['admin', 'customer', customerId, 'pending_items']]
        : [['admin', 'pending_items']],
    description: 'Väntande fakturaposter för en kund',
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Action → scopes mapping
// ──────────────────────────────────────────────────────────────────────────────

export type CustomerAction =
  | 'pause'
  | 'resume'
  | 'archive'
  | 'unarchive'
  | 'change_account_manager'
  | 'update_pricing'
  | 'create_pending_item'
  | 'remove_pending_item'
  | 'credit_invoice'
  | 'create_manual_invoice'
  | 'update_contact';

interface ActionPlan {
  scopes: readonly AdminScope[];
  /** Förklaring varför just dessa scopes — för dry-run och dokumentation */
  reasoning: string;
}

const ACTION_PLANS: Record<CustomerAction, ActionPlan> = {
  pause: {
    scopes: ['customers_list', 'customer_detail'],
    reasoning: 'Status syns både i listan och på detaljvyn.',
  },
  resume: {
    scopes: ['customers_list', 'customer_detail'],
    reasoning: 'Status syns både i listan och på detaljvyn.',
  },
  archive: {
    scopes: ['customers_list', 'customer_detail', 'team'],
    reasoning:
      'Kunden försvinner från aktiva listor; CM:ens kundräkning på team-vyn ändras.',
  },
  unarchive: {
    scopes: ['customers_list', 'customer_detail', 'team'],
    reasoning: 'Spegling av archive.',
  },
  change_account_manager: {
    scopes: ['customers_list', 'customer_detail', 'team'],
    reasoning:
      'Båda CM:s kundräkningar ändras + kunden byter assigned_manager-fält.',
  },
  update_pricing: {
    scopes: ['customer_detail', 'customer_billing', 'team'],
    reasoning: 'MRR påverkas på team-vyn; pris syns i detaljvyn och billing-tabben.',
  },
  create_pending_item: {
    scopes: ['pending_items', 'customer_billing'],
    reasoning: 'Bara billing-tabben och pending-listan påverkas.',
  },
  remove_pending_item: {
    scopes: ['pending_items', 'customer_billing'],
    reasoning: 'Spegling av create_pending_item.',
  },
  credit_invoice: {
    scopes: ['customer_billing', 'billing_global'],
    reasoning:
      'Fakturalista (lokal+global) uppdateras; ny kreditnota syns där fakturor visas.',
  },
  create_manual_invoice: {
    scopes: ['customer_billing', 'billing_global'],
    reasoning: 'Ny faktura syns både i kundens billing-tabb och i app-billing-vyn.',
  },
  update_contact: {
    scopes: ['customer_detail'],
    reasoning: 'Kontaktuppgifter syns endast i detaljvyn.',
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

export function getScopesForAction(action: CustomerAction): readonly AdminScope[] {
  return ACTION_PLANS[action].scopes;
}

export function getServerTagsForScopes(
  scopes: readonly AdminScope[],
): string[] {
  const set = new Set<string>();
  for (const scope of scopes) {
    for (const tag of SCOPE_DEFINITIONS[scope].serverTags) {
      set.add(tag);
    }
  }
  return Array.from(set);
}

export function getClientKeysForScopes(
  scopes: readonly AdminScope[],
  args?: { customerId?: string },
): QueryKey[] {
  const keys: QueryKey[] = [];
  for (const scope of scopes) {
    keys.push(...SCOPE_DEFINITIONS[scope].clientKeys(args));
  }
  return keys;
}

/** För debugging: returnerar en human-readable plan utan att invalidera. */
export function dryRunInvalidations(
  action: CustomerAction,
  args?: { customerId?: string },
): {
  action: CustomerAction;
  reasoning: string;
  scopes: readonly AdminScope[];
  serverTags: string[];
  clientKeys: QueryKey[];
} {
  const scopes = getScopesForAction(action);
  return {
    action,
    reasoning: ACTION_PLANS[action].reasoning,
    scopes,
    serverTags: getServerTagsForScopes(scopes),
    clientKeys: getClientKeysForScopes(scopes, args),
  };
}
