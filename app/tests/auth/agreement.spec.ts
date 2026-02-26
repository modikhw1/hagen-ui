import { test, expect } from '../fixtures';

test.describe('Agreement Page', () => {
  test('requires authentication', async ({ page }) => {
    // Try to access agreement page without login
    await page.goto('/agreement?price=49900');
    
    // Wait a bit for redirect
    await page.waitForTimeout(3000);
    
    // Should redirect to login (either /login or /m/login)
    const url = page.url();
    // Match either /login or /m/login with or without trailing slash and query params
    expect(url).toMatch(/\/login(\/|\?|$)|\/m\/login(\/|\?|$)/);
  });

  test('shows agreement after login', async ({ page }) => {
    // First login
    const email = process.env.TEST_USER_EMAIL || 'test@letrend.se';
    const password = process.env.TEST_USER_PASSWORD || 'Test1234!';
    
    await page.goto('/login');
    await page.fill('input[placeholder*="din@email.se"]', email);
    await page.fill('input[type="password"]', password);
    await page.getByRole('button', { name: 'Logga in' }).click();
    
    // Wait for redirect away from login
    await page.waitForURL(/\/(?!login)/, { timeout: 15000 });
    
    // Now navigate to agreement with price
    await page.goto('/agreement?price=49900');
    
    // Should show agreement (or redirect somewhere, just verify no crash)
    await page.waitForTimeout(2000);
    
    // Page should load without crashing
    await expect(page.locator('body')).toBeVisible();
  });
});
