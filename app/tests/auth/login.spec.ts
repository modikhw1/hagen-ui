import { test, expect } from './fixtures';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows login form by default', async ({ page }) => {
    await expect(page.locator('text=Välkommen tillbaka')).toBeVisible();
    await expect(page.locator('input[placeholder*="din@email.se"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('text=Logga in')).toBeVisible();
  });

  test('shows register form when clicking create account', async ({ page }) => {
    await page.click('text=Skapa ett här');
    await expect(page.locator('text=Skapa konto')).toBeVisible();
    await expect(page.locator('text=Företagsnamn')).toBeVisible();
  });

  test('shows forgot password form', async ({ page }) => {
    await page.click('text=Glömt lösenordet?');
    await expect(page.locator('text=Återställ lösenord')).toBeVisible();
    await expect(page.locator('text=Tillbaka till inloggning')).toBeVisible();
  });

  test('validates email format', async ({ page }) => {
    await page.fill('input[placeholder*="din@email.se"]', 'notanemail');
    await page.fill('input[type="password"]', 'password123');
    await page.click('text=Logga in');
    
    await expect(page.locator('text=Ange en giltig e-postadress')).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.fill('input[placeholder*="din@email.se"]', 'nonexistent@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('text=Logga in');
    
    // Wait for error message
    await expect(page.locator('text=Fel e-post eller lösenord')).toBeVisible({ timeout: 10000 });
  });

  test('logs in successfully with valid credentials', async ({ page }) => {
    // This test requires an existing user - use environment variables
    const email = process.env.TEST_USER_EMAIL || 'demo@letrend.se';
    const password = process.env.TEST_USER_PASSWORD || 'demo1234';
    
    await page.fill('input[placeholder*="din@email.se"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('text=Logga in');
    
    // Should redirect to app
    await expect(page).toHaveURL(/\/app/, { timeout: 15000 });
  });
});

test.describe('Demo Login', () => {
  test('can login with demo credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[placeholder*="din@email.se"]', 'demo');
    await page.fill('input[type="password"]', 'demo');
    await page.click('text=Logga in');
    
    await expect(page).toHaveURL(/\/app/, { timeout: 10000 });
  });
});
