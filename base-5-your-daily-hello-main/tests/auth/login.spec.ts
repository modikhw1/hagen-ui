import { test, expect } from '../fixtures';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('redirects mobile users from /login to /m/login', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'Mobile Chrome', 'Mobile-only redirect check');

    await page.goto('/login');

    await expect(page).toHaveURL(/\/m\/login(?:\?|$)/);
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
    
    await expect(page.locator('text=Fel e-post eller lösenord')).toBeVisible({ timeout: 10000 });
  });

  test('logs in successfully with valid credentials', async ({ page }) => {
    const email = process.env.TEST_USER_EMAIL || 'test@letrend.se';
    const password = process.env.TEST_USER_PASSWORD || 'Test1234!';
    
    await page.fill('input[placeholder*="din@email.se"]', email);
    await page.fill('input[type="password"]', password);
    await page.getByRole('button', { name: 'Logga in' }).click();
    
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
  });

  test('demo login works', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[placeholder*="din@email.se"]', 'demo');
    await page.fill('input[type="password"]', 'demo');
    await page.getByRole('button', { name: 'Logga in' }).click();
    
    await expect(page).toHaveURL(/\/m\/legacy-demo(?:\?|$)/, { timeout: 10000 });
  });

  test('preserves full protected customer path when redirecting to login', async ({ page }) => {
    await page.goto('/concept/test-assignment?from=notes');

    await expect(page).toHaveURL(/\/login\?redirect=%2Fconcept%2Ftest-assignment%3Ffrom%3Dnotes(?:&|$)/, {
      timeout: 10000,
    });
  });

  test('preserves full protected studio path when redirecting to login', async ({ page }) => {
    await page.goto('/studio/customers?section=feed');

    await expect(page).toHaveURL(/\/login\?redirect=%2Fstudio%2Fcustomers%3Fsection%3Dfeed(?:&|$)/, {
      timeout: 10000,
    });
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
    await page.fill('input[placeholder*="din@email.se"]', 'test@test.com');
    await page.click('text=Skicka återställningslänk');
    
    await expect(page.locator('text=Kolla din e-post')).toBeVisible({ timeout: 10000 });
  });

  test('can navigate back to login', async ({ page }) => {
    await page.click('text=Tillbaka till inloggning');
    
    await expect(page.locator('text=Välkommen tillbaka')).toBeVisible();
  });
});

test.describe('Auth Callback Flow', () => {
  test('shows loading state while verifying', async ({ page }) => {
    await page.goto('/auth/callback?code=test_code');
    
    await expect(page.locator('text=Verifierar...')).toBeVisible({ timeout: 10000 });
  });

  test('shows error for invalid/expired token', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied&error_description=Token+expired');
    
    await expect(page.locator('text=Något gick fel')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Registration Flow', () => {
  test('shows registration form when clicking create account', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/login');
    await page.click('text=Skapa ett här');
    
    await expect(page.getByRole('heading', { name: 'Skapa konto' })).toBeVisible();
  });
});
