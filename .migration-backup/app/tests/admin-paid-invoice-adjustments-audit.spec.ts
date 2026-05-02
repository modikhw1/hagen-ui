import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });

const auditEmail =
  process.env.AUDIT_USER_EMAIL ||
  process.env.TEST_USER_EMAIL ||
  'dev@letrend.se';
const auditPassword =
  process.env.AUDIT_USER_PASSWORD || process.env.TEST_USER_PASSWORD;
const appUrl = process.env.BASE_URL || 'http://localhost:3000';
const customerId = '281989e9-c7f4-450c-bbd1-08e7e0ae38f6';
const paidInvoiceId =
  process.env.PAID_INVOICE_ID || 'in_1TRJKkBiis9BBJ4LSy6Gyvro';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env for paid invoice adjustment audit');
  }

  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function loginWithMagicLink(page: Page) {
  if (auditPassword) {
    await page.goto('/login');
    await page.fill('input[placeholder*="din@email.se"]', auditEmail);
    await page.fill('input[type="password"]', auditPassword);
    await page.getByRole('button', { name: 'Logga in' }).click();
    await expect(page).toHaveURL(/\/admin/, { timeout: 30_000 });
    return;
  }

  const supabase = adminClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: auditEmail,
    options: {
      redirectTo: `${appUrl}/auth/callback`,
    },
  });

  if (error || !data.properties?.action_link) {
    throw new Error(
      `Could not generate audit login link for ${auditEmail}: ${error?.message ?? 'missing link'}`,
    );
  }

  await page.goto(data.properties.action_link);
  await expect(page.getByRole('heading', { name: /Klart/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin/, { timeout: 30_000 });
}

function collectFailures(page: Page) {
  const failures: string[] = [];

  page.on('pageerror', (error) => {
    const message = error.message;
    if (message.includes("Lock broken by another request with the 'steal' option.")) {
      return;
    }
    failures.push(`pageerror: ${message}`);
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (
      text.includes('AuthSessionMissingError') ||
      text.includes('Profile query timeout')
    ) {
      return;
    }
    failures.push(`console.error: ${text}`);
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/api/admin/') || response.status() < 400) return;
    let body = '';
    try {
      body = (await response.text()).slice(0, 400);
    } catch {
      body = '<unreadable>';
    }
    failures.push(`api ${response.status()}: ${url} ${body}`);
  });

  return failures;
}

test.describe('admin paid invoice adjustments audit', () => {
  test('paid invoices without Stripe charge hide refund and allow credit handling', async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== 'chromium',
      'Desktop-only admin paid invoice adjustment audit',
    );
    test.setTimeout(180_000);

    const failures = collectFailures(page);
    await loginWithMagicLink(page);

    await page.goto(
      `/admin/customers/${customerId}/billing?invoice=${paidInvoiceId}`,
    );
    await page.waitForLoadState('networkidle');

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 30_000 });
    await expect(modal).toContainText(/paid/i);

    await page.getByRole('button', { name: 'Justera / Kreditera' }).click();
    await expect(
      page.getByText('Lagg som kundsaldo for framtida fakturor'),
    ).toBeVisible();
    await expect(
      page.getByText('Markerad som reglerad utanfor Stripe'),
    ).toBeVisible();
    await expect(
      page.getByText('Aterbetala till kundens betalmetod'),
    ).toHaveCount(0);

    await page.getByText('Markerad som reglerad utanfor Stripe').click();
    await page.getByRole('textbox', { name: 'Kreditbelopp (kr)' }).fill('1');
    const creditResponsePromise = page.waitForResponse((response) =>
      response.url().includes(`/api/admin/invoices/${paidInvoiceId}`) &&
      response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Skapa kreditnota' }).click();
    const creditResponse = await creditResponsePromise;
    const creditResponseBody = await creditResponse.text();

    expect(
      creditResponse.ok(),
      `Paid credit note failed: ${creditResponse.status()} ${creditResponseBody}`,
    ).toBeTruthy();

    await expect(
      page.getByRole('button', { name: /Tidigare justeringar/i }),
    ).toBeVisible();
    await expect(failures).toEqual([]);
  });
});
