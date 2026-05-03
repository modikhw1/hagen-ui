import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const AUDIT_EMAIL =
  process.env.AUDIT_USER_EMAIL ||
  process.env.TEST_USER_EMAIL ||
  'dev@letrend.se';
const AUDIT_PASSWORD =
  process.env.AUDIT_USER_PASSWORD || process.env.TEST_USER_PASSWORD || null;

const CUSTOMER_ID = '2283515e-699d-4261-9a2c-11aa57be710e';
const CUSTOMER_NAME = 'Testföretag 44';
const ORIGINAL_CM = {
  id: 'e3d8338c-91e6-4db4-8887-781df3f2368d',
  profileId: '7e759ad8-8280-46e6-b201-6675308b20e9',
  name: 'Ny Contentmanager',
};
const TARGET_CM = {
  id: 'fa3737c2-ccc3-4e5f-b00e-42128651bde6',
  profileId: 'bd7d0eca-42d1-4497-bea8-c218e7e745a4',
  name: 'Bobbi',
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase service role env');
  }

  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function login(page) {
  if (AUDIT_PASSWORD) {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[placeholder*="din@email.se"]', AUDIT_EMAIL);
    await page.fill('input[type="password"]', AUDIT_PASSWORD);
    await page.getByRole('button', { name: 'Logga in' }).click();
    await page.waitForURL(/\/admin/, { timeout: 30_000 });
    return;
  }

  const supabase = adminClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: AUDIT_EMAIL,
    options: {
      redirectTo: `${BASE_URL}/auth/callback`,
    },
  });

  if (error || !data.properties?.action_link) {
    throw new Error(
      `Could not generate login link: ${error?.message ?? 'missing link'}`,
    );
  }

  await page.goto(data.properties.action_link);
  await page.getByRole('heading', { name: /Klart/i }).waitFor({ timeout: 30_000 });
  await page.goto(`${BASE_URL}/admin`);
  await page.waitForURL(/\/admin/, { timeout: 30_000 });
}

async function readCustomerState(supabase) {
  const { data: customer, error: customerError } = await supabase
    .from('customer_profiles')
    .select('id, business_name, account_manager, account_manager_profile_id')
    .eq('id', CUSTOMER_ID)
    .single();

  if (customerError || !customer) {
    throw new Error(
      `Could not load customer profile: ${customerError?.message ?? 'missing profile'}`,
    );
  }

  const { data: assignments, error: assignmentError } = await supabase
    .from('cm_assignments')
    .select('id, cm_id, valid_from, valid_to, scheduled_change')
    .eq('customer_id', CUSTOMER_ID)
    .order('valid_from', { ascending: false })
    .limit(3);

  if (assignmentError) {
    throw new Error(
      `Could not load assignments: ${assignmentError.message}`,
    );
  }

  const activeAssignment =
    assignments?.find((assignment) => assignment.valid_to === null) ?? null;

  return {
    customer,
    activeAssignment,
    recentAssignments: assignments ?? [],
  };
}

async function expectState(supabase, expectedCm, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    const state = await readCustomerState(supabase);
    if (
      state.activeAssignment?.cm_id === expectedCm.id &&
      state.customer.account_manager_profile_id === expectedCm.profileId
    ) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const lastState = await readCustomerState(supabase);
  throw new Error(
    `${label} did not settle to expected state. Active CM=${lastState.activeAssignment?.cm_id ?? 'null'}, profile=${lastState.customer.account_manager_profile_id ?? 'null'}, account_manager=${lastState.customer.account_manager ?? 'null'}`,
  );
}

async function clickCmCandidate(dialog, name) {
  const card = dialog
    .locator('.mantine-SimpleGrid-root .mantine-Paper-root')
    .filter({ hasText: name })
    .first();
  await card.click();
}

async function openModal(page) {
  const cmCard = page
    .getByText('Content manager')
    .locator('xpath=ancestor::*[contains(@class, "mantine-Card-root")][1]');
  await cmCard.waitFor({ state: 'visible', timeout: 15_000 });
  await cmCard.getByRole('button', { name: /^Byt$/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  return dialog;
}

async function applyChange(page, targetName) {
  const dialog = await openModal(page);
  const submitButton = dialog.getByRole('button', { name: 'Byt idag' });
  console.log('[live-cm] submit disabled before selection:', await submitButton.isDisabled());
  await clickCmCandidate(dialog, targetName);
  console.log('[live-cm] submit disabled after selection:', await submitButton.isDisabled());
  await dialog.getByRole('button', { name: 'Byt idag' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 15_000 }).catch(async (error) => {
    const bodyText = await dialog.textContent().catch(() => '<unreadable>');
    console.error('[live-cm] dialog did not close. body=', bodyText);
    throw error;
  });
}

async function verifyOverviewCard(page, cmName) {
  await page.goto(`${BASE_URL}/admin/customers/${CUSTOMER_ID}`);
  await page.waitForURL(new RegExp(`/admin/customers/${CUSTOMER_ID}`), {
    timeout: 20_000,
  });
  const cmCard = page
    .getByText('Content manager')
    .locator('xpath=ancestor::*[contains(@class, "mantine-Card-root")][1]');
  await cmCard.waitFor({ state: 'visible', timeout: 15_000 });
  await cmCard.getByText(cmName, { exact: true }).waitFor({
    state: 'visible',
    timeout: 15_000,
  });
}

async function main() {
  const supabase = adminClient();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('response', async (response) => {
    if (!response.url().includes('/actions/change_account_manager')) return;
    const text = await response.text().catch(() => '<unreadable>');
    console.log('[live-cm] action response', response.status(), text);
  });

  try {
    const initialState = await readCustomerState(supabase);
    console.log('[live-cm] initial', JSON.stringify(initialState, null, 2));

    const startingCmId = initialState.activeAssignment?.cm_id ?? null;
    if (startingCmId !== ORIGINAL_CM.id && startingCmId !== TARGET_CM.id) {
      throw new Error(
        `Unexpected initial CM. Wanted ${ORIGINAL_CM.id} or ${TARGET_CM.id}, got ${startingCmId ?? 'null'}`,
      );
    }

    await login(page);

    if (startingCmId === ORIGINAL_CM.id) {
      await verifyOverviewCard(page, ORIGINAL_CM.name);

      console.log(`[live-cm] changing ${CUSTOMER_NAME} to ${TARGET_CM.name}`);
      await applyChange(page, TARGET_CM.name);
      const changedState = await expectState(supabase, TARGET_CM, 'change-to-target');
      console.log('[live-cm] after change', JSON.stringify(changedState, null, 2));
      await verifyOverviewCard(page, TARGET_CM.name);
    } else {
      await verifyOverviewCard(page, TARGET_CM.name);
      console.log(`[live-cm] customer already assigned to ${TARGET_CM.name}, proceeding to revert`);
    }

    console.log(`[live-cm] reverting ${CUSTOMER_NAME} to ${ORIGINAL_CM.name}`);
    await applyChange(page, ORIGINAL_CM.name);
    const revertedState = await expectState(supabase, ORIGINAL_CM, 'revert-to-original');
    console.log('[live-cm] after revert', JSON.stringify(revertedState, null, 2));
    await verifyOverviewCard(page, ORIGINAL_CM.name);

    console.log('[live-cm] success');
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error('[live-cm] failed', error);
  process.exitCode = 1;
});
