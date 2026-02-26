import { test, expect } from '../fixtures';

test.describe('Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.click('text=Skapa ett här');
  });

  test('shows registration form correctly', async ({ page }) => {
    await expect(page.locator('text=Skapa konto')).toBeVisible();
    await expect(page.locator('text=Företagsnamn')).toBeVisible();
    await expect(page.locator('text=E-post')).toBeVisible();
    await expect(page.locator('text=Lösenord')).toBeVisible();
  });

  test('validates empty business name', async ({ page }) => {
    await page.fill('input[placeholder*="din@email.se"]', 'test@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('text=Skapa konto');
    
    await expect(page.locator('text=Ange ditt företagsnamn')).toBeVisible();
  });

  test('validates password length', async ({ page }) => {
    await page.fill('input[placeholder*="Företagsnamn"]', 'Test Company');
    await page.fill('input[placeholder*="din@email.se"]', 'test@test.com');
    await page.fill('input[type="password"]', '123');
    await page.click('text=Skapa konto');
    
    await expect(page.locator('text=Lösenordet måste vara minst 6 tecken')).toBeVisible();
  });

  test('validates email format', async ({ page }) => {
    await page.fill('input[placeholder*="Företagsnamn"]', 'Test Company');
    await page.fill('input[placeholder*="din@email.se"]', 'notanemail');
    await page.fill('input[type="password"]', 'password123');
    await page.click('text=Skapa konto');
    
    await expect(page.locator('text=Ange en giltig e-postadress')).toBeVisible();
  });

  test('shows password strength indicator', async ({ page }) => {
    await page.fill('input[placeholder*="Företagsnamn"]', 'Test Company');
    await page.fill('input[placeholder*="din@email.se"]', 'test@test.com');
    await page.fill('input[type="password"]',');
    
    // 'weak Should show weak password
    await expect(page.locator kort')).toBe('text=FörVisible();
    
    // Test with stronger password
    await page.fill('input[type="password"]', 'strongpassword');
    await expect(page.locator('text=Starkt')).toBeVisible();
  });

  test('shows success message when email confirmation required', async ({ page }) => {
    // This test depends on Supabase configuration
    // If email confirmation is required, user should see success message
    
    const email = `newuser_${Date.now()}@test.com`;
    
    await page.fill('input[placeholder*="Företagsnamn"]', 'Test Company');
    await page.fill('input[placeholder*="din@email.se"]', email);
    await page.fill('input[type="password"]', 'password123');
    await page.click('text=Skapa konto');
    
    // Should either redirect to app (if no confirmation) or show confirmation message
    await expect(page.locator('text=Konto skapat!') || page.locator('text=Välkommen!')).toBeVisible({ timeout: 10000 });
  });
});
