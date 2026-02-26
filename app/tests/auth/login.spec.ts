import { test, expect } from '../fixtures';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows login form by default', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Välkommen tillbaka' })).toBeVisible();
    await expect(page.locator('input[placeholder*="din@email.se"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Logga in' })).toBeVisible();
  });

  test('shows register form when clicking create account', async ({ page }) => {
    await page.click('text=Skapa ett här');
    await expect(page.getByRole('heading', { name: 'Skapa konto' })).toBeVisible();
    await expect(page.locator('text=Företagsnamn')).toBeVisible();
  });

  test('shows forgot password form', async ({ page }) => {
    await page.click('text=Glömt lösenordet?');
    await expect(page.getByRole('heading', { name: 'Återställ lösenord' })).toBeVisible();
    await expect(page.locator('text=Tillbaka till inloggning')).toBeVisible();
  });

  test('validates email format', async ({ page }) => {
    await page.fill('input[placeholder*="din@email.se"]', 'notanemail');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Logga in' }).click();
    
    await expect(page.locator('text=Ange en giltig e-postadress')).toBeVisible({ timeout: 5000 });
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.fill('input[placeholder*="din@email.se"]', 'nonexistent@test.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.getByRole('button', { name: 'Logga in' }).click();
    
    // Wait for error message
    await expect(page.locator('text=Fel e-post eller lösenord')).toBeVisible({ timeout: 10000 });
  });

  test('logs in successfully with valid credentials', async ({ page }) => {
    // Login succeeds - redirects to home (which may auto-redirect to app)
    const email = process.env.TEST_USER_EMAIL || 'test@letrend.se';
    const password = process.env.TEST_USER_PASSWORD || 'Test1234!';
    
    await page.fill('input[placeholder*="din@email.se"]', email);
    await page.fill('input[type="password"]', password);
    await page.getByRole('button', { name: 'Logga in' }).click();
    
    // Should redirect away from login - either /app or /
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
  });
});

test.describe('Demo Login', () => {
  test('can login with demo credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[placeholder*="din@email.se"]', 'demo');
    await page.fill('input[type="password"]', 'demo');
    await page.getByRole('button', { name: 'Logga in' }).click();
    
    // Demo should redirect - desktop goes to /?demo=true, mobile to /m
    await expect(page).toHaveURL(/\/app\/?|\/\?demo=true|\/m(\?.*)?$/, { timeout: 10000 });
  });
});
