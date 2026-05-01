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

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env for invoice adjustment audit');
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

test.describe('admin invoice adjustments audit', () => {
  test('manual invoices and open-invoice credits update the real billing state', async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== 'chromium',
      'Desktop-only admin invoice adjustment audit',
    );
    test.setTimeout(180_000);

    const failures = collectFailures(page);
    await loginWithMagicLink(page);

    const stamp = Date.now().toString().slice(-6);
    const lineOne = `Audit extra ${stamp}-A`;
    const lineTwo = `Audit extra ${stamp}-B`;

    await page.goto(`/admin/customers/${customerId}/billing`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Fakturahistorik')).toBeVisible({
      timeout: 30_000,
    });

    const invoiceHistory = page
      .getByText('Fakturahistorik')
      .locator('xpath=ancestor::*[contains(@class, "mantine-Card-root")][1]');
    const invoiceRows = invoiceHistory.locator('tbody tr');
    await page
      .getByRole('button', { name: /Skapa eng.*faktura/i })
      .click();
    const modal = page.getByRole('dialog');
    await expect(modal).toContainText('Faktureras separat och skickas direkt via Stripe');

    await modal.getByLabel('Beskrivning').fill(lineOne);
    await modal.getByLabel('Belopp (kr)').fill('41');
    await modal.getByRole('button', { name: /L.gg till rad/i }).click();
    await modal.getByPlaceholder('Installationsavgift').nth(1).fill(lineTwo);
    await modal.locator('input').nth(3).fill('19');
    await modal.locator('input').nth(4).fill('21');
    const createResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/invoices/create'),
    );
    await modal.getByRole('button', { name: /Skapa och skicka/i }).click();
    const createResponse = await createResponsePromise;
    const createResponseBody = await createResponse.text();

    expect(
      createResponse.ok(),
      `Manual invoice create failed: ${createResponse.status()} ${createResponseBody}`,
    ).toBeTruthy();

    await expect(modal).not.toBeVisible({ timeout: 30_000 });
    await expect(invoiceRows.first()).toContainText(/60/, { timeout: 30_000 });
    const newestRow = invoiceRows.first();
    await expect(newestRow).toContainText(/60/);
    await newestRow.click({ position: { x: 12, y: 12 } });

    const invoiceModal = page.getByRole('dialog');
    await expect(invoiceModal).toBeVisible();
    await expect(invoiceModal).toContainText(lineOne);
    await expect(invoiceModal).toContainText(lineTwo);

    await page.getByRole('button', { name: 'Justera / Kreditera' }).click();
    await page.getByText('En specifik fakturarad').click();
    await page.getByRole('textbox', { name: 'Fakturarad' }).click();
    await page.getByRole('option', { name: new RegExp(lineOne) }).click();
    await page.getByRole('textbox', { name: 'Kreditbelopp (kr)' }).fill('11');
    const creditResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/admin/invoices/') &&
      response.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Skapa kreditnota' }).click();
    const creditResponse = await creditResponsePromise;
    const creditResponseBody = await creditResponse.text();

    expect(
      creditResponse.ok(),
      `Credit note failed: ${creditResponse.status()} ${creditResponseBody}`,
    ).toBeTruthy();

    await expect(page.getByRole('button', { name: /Tidigare justeringar/i })).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(newestRow).toContainText(/49/, { timeout: 30_000 });
    await expect(failures).toEqual([]);
  });
});
