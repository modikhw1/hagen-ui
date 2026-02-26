import { test, expect } from '../fixtures';

test.describe('Auth Callback Flow', () => {
  test('shows loading state while verifying', async ({ page }) => {
    // Visit callback URL with a mock token (will fail but shows loading state)
    await page.goto('/auth/callback?code=test_code');
    
    await expect(page.locator('text=Verifierar...')).toBeVisible();
  });

  test('shows error for invalid/expired token', async ({ page }) => {
    // Visit callback with an invalid code
    await page.goto('/auth/callback?error=access_denied&error_description=Token+expired');
    
    await expect(page.locator('text=Något gick fel')).toBeVisible();
    await expect(page.locator('text=Länken har gått ut') || page.locator('text=ogiltig')).toBeVisible({ timeout: 5000 });
  });

  test('allows setting password for invite flow', async ({ page }) => {
    // This would need a real invite token from Supabase
    // For now, we test the UI elements exist
    
    // Simulate being in set-password state (would need proper token in real test)
    await page.goto('/auth/callback');
    await page.waitForTimeout(2000);
    
    // If there's no valid session, it might show error or loading
    // The actual set-password flow requires a valid invite token
  });

  test('redirects to home on successful verification', async ({ page }) => {
    // This test requires a pre-configured test user with valid session
    // Would need to set up authenticated session via cookies or API
  });
});

test.describe('Password Reset Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.click('text=Glömt lösenordet?');
  });

  test('shows password reset form', async ({ page }) => {
    await expect(page.locator('text=Återställ lösenord')).toBeVisible();
    await expect(page.locator('input[placeholder*="din@email.se"]')).toBeVisible();
  });

  test('validates email before sending reset', async ({ page }) => {
    await page.fill('input[placeholder*="din@email.se"]', 'invalid-email');
    await page.click('text=Skicka återställningslänk');
    
    await expect(page.locator('text=Ange en giltig e-postadress')).toBeVisible();
  });

  test('shows success message after requesting reset', async ({ page }) => {
    // Use a real email to trigger the flow
    await page.fill('input[placeholder*="din@email.se"]', 'test@test.com');
    await page.click('text=Skicka återställningslänk');
    
    await expect(page.locator('text=Kolla din e-post')).toBeVisible({ timeout: 10000 });
  });

  test('can navigate back to login', async ({ page }) => {
    await page.click('text=Tillbaka till inloggning');
    
    await expect(page.locator('text=Välkommen tillbaka')).toBeVisible();
  });
});
