import type { Page } from '@playwright/test';

/**
 * Login helper for E2E tests
 */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');

  // Clear any existing session
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.reload();

  // Fill in credentials
  await page.getByPlaceholder('din@email.se').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /logga in/i }).click();

  // Wait for redirect (successful login)
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

  // Wait for auth cookie to be set
  await page.waitForTimeout(500);
}

/**
 * Get access token from logged in page
 */
export async function getAccessToken(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    // Check localStorage for Supabase session
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '');
          return data?.access_token || null;
        } catch {
          return null;
        }
      }
    }
    return null;
  });
}

/**
 * Logout helper
 */
export async function logout(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie.split(';').forEach((c) => {
      document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });
  });
}

// Test user credentials
export const TEST_CREDENTIALS = {
  NEW_USER: { email: 'e2e-new-user@testmail.com', password: 'TestPass123!' },
  ACTIVE_SUBSCRIBER: { email: 'e2e-active@testmail.com', password: 'TestPass123!' },
  PENDING_PAYMENT: { email: 'e2e-pending@testmail.com', password: 'TestPass123!' },
  PAST_DUE: { email: 'e2e-pastdue@testmail.com', password: 'TestPass123!' },
  CANCELLED: { email: 'e2e-cancelled@testmail.com', password: 'TestPass123!' },
  ADMIN_FLAG: { email: 'e2e-admin@testmail.com', password: 'TestPass123!' },
  ADMIN_EMAIL: { email: 'e2e-test@letrend.se', password: 'TestPass123!' },
  TRIALING: { email: 'e2e-trial@testmail.com', password: 'TestPass123!' },
};
