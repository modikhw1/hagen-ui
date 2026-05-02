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

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env for admin billing audit');
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
    failures.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('AuthSessionMissingError')) return;
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

test.describe('admin customer billing audit', () => {
  test('desktop billing states expose only actions that can actually run', async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== 'chromium',
      'Desktop-only admin customer billing audit',
    );
    test.setTimeout(180_000);

    const failures = collectFailures(page);
    await loginWithMagicLink(page);

    await test.step('live customer exposes billing actions and invoice adjustments', async () => {
      await page.goto(
        '/admin/customers/0480dae5-7010-478c-87c6-b0bfaad29f85/billing',
      );
      await expect(page.getByText('Fakturahistorik')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Hantera prissättning' }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Skapa engångsfaktura' }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Lägg till rad' }),
      ).toBeVisible();

      await page.getByRole('button', { name: 'Hantera prissättning' }).click();
      await expect(page.getByRole('dialog')).toContainText(
        'Månadspris (kr)',
      );
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Skapa engångsfaktura' }).click();
      await expect(page.getByRole('dialog')).toContainText(
        'Faktureras separat',
      );
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Lägg till rad' }).click();
      await expect(page.getByPlaceholder('Beskrivning').last()).toBeVisible();

      const invoiceHistory = page
        .getByText('Fakturahistorik')
        .locator('xpath=ancestor::*[contains(@class, "mantine-Card-root")][1]');
      const invoiceRow = invoiceHistory
        .locator('tbody tr')
        .first()
        .locator('td')
        .first();
      await invoiceRow.click({ position: { x: 8, y: 8 } });
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Justera / Kreditera' }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
    });

    await test.step('environment mismatch customer is read-only with warning surface', async () => {
      await page.goto(
        '/admin/customers/2b0050ab-d00f-497c-83bc-8340b60b6bbb/billing',
      );
      await expect(
        page.getByText(
          /(Kunden har fakturadata i Stripe test|Kundens Stripe-koppling finns i Stripe test)/i,
        ),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Hantera prissättning' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Skapa engångsfaktura' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Lägg till rad' }),
      ).toHaveCount(0);
      await expect(page.getByText('Inga fakturor än.')).toBeVisible();
    });

    await test.step('customer without Stripe customer hides non-functional billing actions', async () => {
      await page.goto(
        '/admin/customers/2283515e-699d-4261-9a2c-11aa57be710e/billing',
      );
      await expect(page.getByText(/saknar Stripe-koppling/i)).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Hantera prissättning' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Skapa engångsfaktura' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Lägg till rad' }),
      ).toHaveCount(0);
    });

    await test.step('draft invoice customer does not expose credit actions', async () => {
      await page.goto(
        '/admin/customers/6cf77b3d-63a3-4994-be10-3ccabb66c7e6/billing',
      );
      const invoiceHistory = page
        .getByText('Fakturahistorik')
        .locator('xpath=ancestor::*[contains(@class, "mantine-Card-root")][1]');
      const invoiceRow = invoiceHistory
        .locator('tbody tr')
        .first()
        .locator('td')
        .first();
      await invoiceRow.click({ position: { x: 8, y: 8 } });
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Justera / Kreditera' }),
      ).toHaveCount(0);
      await page.keyboard.press('Escape');
    });

    await expect(failures).toEqual([]);
  });
});
