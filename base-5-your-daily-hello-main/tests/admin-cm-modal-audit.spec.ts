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
    throw new Error('Missing Supabase env for CM modal audit');
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

async function customerWithCm() {
  const supabase = adminClient();
  const { data: assignments, error } = await supabase
    .from('cm_assignments')
    .select('customer_id, valid_from')
    .not('cm_id', 'is', null)
    .is('valid_to', null)
    .order('valid_from', { ascending: false })
    .limit(20);

  if (error || !assignments?.length) {
    throw new Error(`Could not load active CM assignments: ${error?.message ?? 'none found'}`);
  }

  const customerIds = assignments.map((row) => row.customer_id);
  const { data: customers, error: customerError } = await supabase
    .from('customer_profiles')
    .select('id, business_name, status')
    .in('id', customerIds);

  if (customerError || !customers?.length) {
    throw new Error(
      `Could not load customer profiles for CM audit: ${customerError?.message ?? 'none found'}`,
    );
  }

  const activeCustomer =
    customers.find((customer) => customer.status === 'active') ?? customers[0];

  return {
    id: activeCustomer.id,
    businessName: activeCustomer.business_name ?? activeCustomer.id,
  };
}

test.describe('admin CM modal audit', () => {
  test('overview CM modal loads candidates and payout preview on desktop', async ({
    page,
  }) => {
    test.skip(test.info().project.name !== 'chromium', 'Desktop-only CM audit');
    test.setTimeout(120_000);

    const customer = await customerWithCm();
    const failures: string[] = [];

    page.on('pageerror', (error) => {
      failures.push(`pageerror: ${error.message}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text();
        if (text.includes('AuthSessionMissingError')) {
          return;
        }
        failures.push(`console.error: ${text}`);
      }
    });

    await loginWithMagicLink(page);
    await page.goto(`/admin/customers/${customer.id}`);
    await expect(page).toHaveURL(new RegExp(`/admin/customers/${customer.id}`), {
      timeout: 20_000,
    });
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
      timeout: 20_000,
    });

    const cmCard = page
      .getByText('Content manager')
      .locator('xpath=ancestor::*[contains(@class, "mantine-Card-root")][1]');
    await expect(cmCard).toBeVisible({ timeout: 10_000 });
    await cmCard.getByRole('button', { name: /^Byt$/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('Byt Content Manager')).toBeVisible();
    await expect(dialog.getByText('Nuvarande ansvarig')).toBeVisible();

    const candidateCards = dialog.locator('text=/kunder$/');
    await expect(candidateCards.first()).toBeVisible({ timeout: 10_000 });

    await dialog.getByText(/kunder$/).first().click();
    await expect(dialog.getByText('Aktiv period')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText('Konsekvens')).toBeVisible();

    await dialog.getByText('Schemalagt byte', { exact: true }).click();
    await expect(dialog.getByLabel('Bytet galler fran')).toBeVisible();

    await dialog.getByText('Temporar tackning', { exact: true }).click();
    await expect(dialog.getByLabel('Tackning startar')).toBeVisible();
    await expect(dialog.getByLabel('Tackning slutar')).toBeVisible();
    await expect(dialog.getByText('Ersattare far payout')).toBeVisible();
    await expect(dialog.getByText('Ordinarie CM behaller payout')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    expect(failures).toEqual([]);
  });
});
