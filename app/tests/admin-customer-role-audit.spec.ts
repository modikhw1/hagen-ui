import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });

type CustomerCandidate = {
  id: string;
  business_name: string | null;
  status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  invited_at: string | null;
};

const auditEmail =
  process.env.AUDIT_USER_EMAIL ||
  process.env.TEST_USER_EMAIL ||
  'dev@letrend.se';
const auditPassword =
  process.env.AUDIT_USER_PASSWORD || process.env.TEST_USER_PASSWORD;
const appUrl = process.env.BASE_URL || 'http://localhost:3000';
const forcedAuditCustomerIds = (process.env.AUDIT_CUSTOMER_IDS ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env for admin customer audit');
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

async function representativeCustomers(): Promise<CustomerCandidate[]> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from('customer_profiles')
    .select(
      'id,business_name,status,stripe_customer_id,stripe_subscription_id,invited_at,created_at',
    )
    .order('created_at', { ascending: false })
    .limit(80);

  if (error) {
    throw new Error(`Could not load audit customers: ${error.message}`);
  }

  const rows = (data ?? []) as CustomerCandidate[];
  const byKey = new Map<string, CustomerCandidate>();

  if (forcedAuditCustomerIds.length > 0) {
    const forcedResult = await supabase
      .from('customer_profiles')
      .select(
        'id,business_name,status,stripe_customer_id,stripe_subscription_id,invited_at,created_at',
      )
      .in('id', forcedAuditCustomerIds);

    if (forcedResult.error) {
      throw new Error(
        `Could not load forced audit customers: ${forcedResult.error.message}`,
      );
    }

    for (const customer of (forcedResult.data ?? []) as CustomerCandidate[]) {
      byKey.set(`forced:${customer.id}`, customer);
    }
  }

  for (const customer of rows) {
    const key = [
      customer.status ?? 'unknown',
      customer.stripe_customer_id ? 'stripe' : 'no-stripe',
      customer.invited_at ? 'invited' : 'not-invited',
    ].join(':');
    if (!byKey.has(key)) byKey.set(key, customer);
  }

  return Array.from(byKey.values()).slice(0, 8);
}

function attachFailureCollectors(page: Page) {
  const failures: string[] = [];

  page.on('pageerror', (error) => {
    failures.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text();
      if (
        text.includes('AuthSessionMissingError') ||
        text.includes('Profile query timeout') ||
        text.includes('Error fetching customer concepts')
      ) {
        return;
      }
      failures.push(`console.error: ${text}`);
    }
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

async function openIfVisible(page: Page, label: RegExp | string) {
  const target = page.getByRole('button', { name: label }).first();
  if (
    (await target.count()) === 0 ||
    !(await target.isVisible().catch(() => false))
  ) {
    return false;
  }
  await target.click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape').catch(() => {});
  return true;
}

test.describe('admin customer role audit', () => {
  test('super-admin/admin customer billing surfaces do not expose broken actions across states', async ({
    page,
  }) => {
    test.skip(
      test.info().project.name !== 'chromium',
      'Desktop-only admin customer audit',
    );
    test.setTimeout(180_000);

    await loginWithMagicLink(page);
    const failures = attachFailureCollectors(page);

    const customers = await representativeCustomers();
    expect(
      customers.length,
      'audit needs at least one customer',
    ).toBeGreaterThan(0);

    for (const customer of customers) {
      await test.step(
        `${customer.status ?? 'unknown'} ${customer.business_name ?? customer.id}`,
        async () => {
          await page.goto(`/admin/customers/${customer.id}/billing`);
          await expect(page).toHaveURL(
            new RegExp(`/admin/customers/${customer.id}/billing`),
            { timeout: 20_000 },
          );
          await expect(page.getByText('Fakturahistorik')).toBeVisible({
            timeout: 20_000,
          });

          await expect(page.getByText('Autentisering misslyckades')).toHaveCount(
            0,
          );
          await expect(page.getByText('Cannot read properties')).toHaveCount(0);

          await openIfVisible(page, /Hantera prissättning/i);
          await openIfVisible(page, /Skapa engångsfaktura/i);

          const addRow = page
            .getByRole('button', { name: /Lägg till rad/i })
            .first();
          if (
            (await addRow.count()) > 0 &&
            (await addRow.isVisible().catch(() => false))
          ) {
            await addRow.click();
            await expect(page.getByPlaceholder('Beskrivning').last()).toBeVisible();
          }

          const invoiceHistory = page
            .getByText('Fakturahistorik')
            .locator(
              'xpath=ancestor::*[contains(@class, "mantine-Card-root")][1]',
            );
          const invoiceRow = invoiceHistory.locator('tbody tr').first();
          if (
            (await invoiceRow.count()) > 0 &&
            (await invoiceRow.isVisible().catch(() => false))
          ) {
            const firstCell = invoiceRow.locator('td').first();
            await firstCell.evaluate((element) =>
              element.scrollIntoView({ block: 'center', inline: 'nearest' }),
            );
            await firstCell.click({ position: { x: 8, y: 8 }, timeout: 10_000 });
            await expect(page.getByRole('dialog')).toBeVisible({
              timeout: 10_000,
            });
            await expect(page.getByText('Unauthorized')).toHaveCount(0);
            await openIfVisible(page, /Skapa kreditnota|Kreditera och utfärda/i);
            await page.keyboard.press('Escape').catch(() => {});
          }
        },
      );
    }

    expect(failures).toEqual([]);
  });
});
