import { test, expect } from '@playwright/test';

test.describe('Demo-flöde', () => {
  test.beforeEach(async ({ page }) => {
    // Clear sessionStorage before each test
    await page.goto('/');
    await page.evaluate(() => {
      sessionStorage.clear();
    });
  });

  test('ska visa email-gate vid ?demo=true', async ({ page }) => {
    await page.goto('/?demo=true');

    // Should show email gate
    await expect(page.getByText('Se hur LeTrend fungerar')).toBeVisible();
    await expect(page.getByPlaceholder('din@email.se')).toBeVisible();
    await expect(page.getByRole('button', { name: /visa demo/i })).toBeVisible();
  });

  test('ska visa demo-vy efter att ha angett email', async ({ page }) => {
    await page.goto('/?demo=true');

    // Wait for page to stabilize
    await page.waitForLoadState('networkidle');

    // Fill in email - wait for input to be stable
    const emailInput = page.getByPlaceholder('din@email.se');
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.fill('test@example.com');

    await page.getByRole('button', { name: /visa demo/i }).click();

    // Should now see demo view with concepts
    await expect(page.getByText('LeTrend')).toBeVisible({ timeout: 15000 });
  });

  test('ska kunna navigera till login från email-gate', async ({ page }) => {
    await page.goto('/?demo=true');

    // Wait for page to stabilize
    await page.waitForLoadState('networkidle');

    // Click "Logga in" link
    const loginButton = page.getByRole('button', { name: /logga in/i });
    await loginButton.waitFor({ state: 'visible' });
    await loginButton.click();

    // Should be on login page
    await expect(page).toHaveURL('/login');
  });

  test('ska komma ihåg email och visa demo direkt vid återbesök', async ({ page }) => {
    // First visit - enter email
    await page.goto('/?demo=true');
    await page.waitForLoadState('networkidle');

    const emailInput = page.getByPlaceholder('din@email.se');
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.fill('test@example.com');
    await page.getByRole('button', { name: /visa demo/i }).click();

    // Wait for demo to load
    await expect(page.getByText('LeTrend')).toBeVisible({ timeout: 15000 });

    // Revisit with demo param
    await page.goto('/?demo=true');

    // Should skip email-gate and show demo directly
    await expect(page.getByText('LeTrend')).toBeVisible({ timeout: 15000 });
  });
});
