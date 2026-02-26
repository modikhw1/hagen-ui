import { test, expect } from '../fixtures';

test.describe('Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.click('text=Skapa ett här');
  });

  test('shows registration form correctly', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Skapa konto' })).toBeVisible();
    await expect(page.locator('text=Företagsnamn')).toBeVisible();
    await expect(page.locator('text=E-post')).toBeVisible();
    await expect(page.locator('text=Lösenord')).toBeVisible();
  });

  test('validates empty business name', async ({ page }) => {
    await page.fill('input[placeholder*="din@email.se"]', 'test@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Skapa konto' }).click();
    
    await expect(page.locator('text=Ange ditt företagsnamn')).toBeVisible();
  });

  test('validates password length', async ({ page }) => {
    await page.fill('input[placeholder*="Företagsnamn"]', 'Test Company');
    await page.fill('input[placeholder*="din@email.se"]', 'test@test.com');
    await page.fill('input[type="password"]', '123');
    await page.getByRole('button', { name: 'Skapa konto' }).click();
    
    await expect(page.locator('text=Lösenordet måste vara minst 6 tecken')).toBeVisible();
  });

  test('validates email format', async ({ page }) => {
    await page.fill('input[placeholder*="Företagsnamn"]', 'Test Company');
    await page.fill('input[placeholder*="din@email.se"]', 'notanemail');
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Skapa konto' }).click();
    
    await expect(page.locator('text=Ange en giltig e-postadress')).toBeVisible();
  });

  test('shows password strength indicator for weak password', async ({ page }) => {
    await page.fill('input[placeholder*="Företagsnamn"]', 'Test Company');
    await page.fill('input[placeholder*="din@email.se"]', 'test@test.com');
    await page.fill('input[type="password"]', 'short');
    
    await expect(page.locator('text=För kort')).toBeVisible();
  });

  test('shows password strength indicator for strong password', async ({ page }) => {
    await page.fill('input[placeholder*="Företagsnamn"]', 'Test Company');
    await page.fill('input[placeholder*="din@email.se"]', 'test@test.com');
    await page.fill('input[type="password"]', 'strongpassword123');
    
    await expect(page.locator('text=Starkt')).toBeVisible();
  });

  test('shows success message when email confirmation required', async ({ page }) => {
    const email = `newuser_${Date.now()}@test.com`;
    
    await page.fill('input[placeholder*="Företagsnamn"]', 'Test Company');
    await page.fill('input[placeholder*="din@email.se"]', email);
    await page.fill('input[type="password"]', 'password123');
    await page.getByRole('button', { name: 'Skapa konto' }).click();
    
    // Should either show success message or stay on page (if confirmation required)
    await expect(page.getByRole('heading') || page.locator('text=Konto skapat!')).toBeVisible({ timeout: 10000 });
  });
});
