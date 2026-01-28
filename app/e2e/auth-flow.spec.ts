import { test, expect } from '@playwright/test';

test.describe('Auth-flöde', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage before each test
    await page.goto('/login');
    await page.evaluate(() => {
      sessionStorage.clear();
      localStorage.clear();
    });
  });

  test('ska visa login-sidan', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText('Välkommen tillbaka')).toBeVisible();
    await expect(page.getByPlaceholder('din@email.se')).toBeVisible();
    await expect(page.getByRole('button', { name: /logga in/i })).toBeVisible();
  });

  test('ska kunna växla till registrering', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: /skapa ett här/i }).click();

    await expect(page.getByRole('heading', { name: 'Skapa konto' })).toBeVisible();
    await expect(page.getByPlaceholder('T.ex. Mellow Café')).toBeVisible();
  });

  test('ska visa "Se demo" knapp på login-sidan', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText('Vill du se hur det fungerar först?')).toBeVisible();
    await expect(page.getByRole('button', { name: /se demo/i })).toBeVisible();
  });

  test('ska kunna gå till demo från login-sidan', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: /se demo/i }).click();

    // Should show email-gate
    await expect(page.getByText('Se hur LeTrend fungerar')).toBeVisible();
  });

  test('ska visa fel vid felaktiga credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByPlaceholder('din@email.se').fill('nonexistent@test.com');
    await page.locator('input[type="password"]').fill('wrongpassword');
    await page.getByRole('button', { name: /logga in/i }).click();

    // Should show error message
    await expect(page.getByText(/fel e-post eller lösenord/i)).toBeVisible({ timeout: 10000 });
  });

  test('ska visa lösenordsstyrka vid registrering', async ({ page }) => {
    await page.goto('/login');

    // Switch to register mode
    await page.getByRole('button', { name: /skapa ett här/i }).click();

    // Fill in business name
    await page.getByPlaceholder('T.ex. Mellow Café').fill('Test Business');

    // Fill in email
    await page.getByPlaceholder('din@email.se').fill('test@example.com');

    // Type weak password
    await page.locator('input[type="password"]').fill('123');
    await expect(page.getByText('För kort')).toBeVisible();

    // Type ok password
    await page.locator('input[type="password"]').fill('123456');
    await expect(page.getByText('OK', { exact: true })).toBeVisible();

    // Type strong password
    await page.locator('input[type="password"]').fill('1234567890');
    await expect(page.getByText('Starkt', { exact: true })).toBeVisible();
  });
});
