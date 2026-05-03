import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = [
  'src/lib/admin/copy/server-errors.ts',
  'src/lib/admin/customer-detail/load.ts',
  'src/lib/admin/server/overview-derive.ts',
  'src/lib/admin/customer-actions/context.ts',
  'src/lib/admin/customer-actions/dispatcher.ts',
  'src/lib/admin/customer-actions/rate-limit.ts',
  'src/lib/admin/customer-actions/route-helpers.ts',
  'src/lib/admin/customer-actions/shared.ts',
  'src/lib/admin/customer-actions/send-invite.ts',
  'src/lib/admin/customer-actions/send-invite/index.ts',
  'src/lib/admin/customer-actions/send-invite/prepare.ts',
  'src/lib/admin/customer-actions/send-invite/create-stripe.ts',
  'src/lib/admin/customer-actions/send-invite/invite-user.ts',
  'src/lib/admin/customer-actions/send-invite/persist.ts',
  'src/lib/admin/customer-actions/send-invite/finalize.ts',
  'src/lib/admin/customer-actions/change-account-manager.ts',
  'src/lib/admin/customer-actions/change-subscription-price.ts',
  'src/lib/admin/customer-actions/update-profile.ts',
  'src/lib/admin/customer-actions/update-profile/index.ts',
  'src/lib/admin/customer-actions/update-profile/normalize.ts',
  'src/lib/admin/customer-actions/update-profile/validate-pricing.ts',
  'src/lib/admin/customer-actions/update-profile/sync-stripe.ts',
  'src/lib/admin/server/read-rate-limit.ts',
  'src/lib/admin/customers/list.server.ts',
  'src/app/api/admin/customers/[id]/route.ts',
  'src/app/api/admin/customers/[id]/invite/route.ts',
  'src/app/api/admin/team/route.ts',
  'src/app/api/admin/invoices/route.ts',
  'src/app/api/admin/subscriptions/route.ts',
];

const bannedPatterns = [
  /\bhamta\b/i,
  /\bkravs\b/i,
  /\bbehorighet\b/i,
  /\butfora\b/i,
  /\bforst\b/i,
  /\bkanns\b/i,
  /\batgard\b/i,
  /\bhamtning\b/i,
  /\basynk\b/i,
  /\u00C3./,
];

describe('core admin APIs copy encoding guard', () => {
  it.each(files)('does not contain banned fallback strings: %s', (filePath) => {
    const content = readFileSync(resolve(process.cwd(), filePath), 'utf8');

    for (const pattern of bannedPatterns) {
      expect(content).not.toMatch(pattern);
    }
  });
});
