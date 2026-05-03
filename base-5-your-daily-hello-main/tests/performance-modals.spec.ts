import { test, expect } from './fixtures';

/**
 * Performance measurement for Admin Modals
 * 
 * To run these tests:
 * 1. Ensure your local server is running on http://localhost:3000
 * 2. Run: npx playwright test tests/performance-modals.spec.ts
 */
test.describe('Admin Modal Performance', () => {
  const adminEmail = process.env.TEST_USER_EMAIL || 'test@letrend.se';
  const adminPassword = process.env.TEST_USER_PASSWORD || 'Test1234!';

  test.beforeEach(async ({ page }) => {
    // Increase timeout for slow dev servers
    test.setTimeout(60000);
    
    // Login as admin
    await page.goto('/login');
    
    // Check if already logged in
    if (page.url().includes('/app') || page.url().includes('/admin')) {
      return;
    }

    await page.fill('input[placeholder*="din@email.se"]', adminEmail);
    await page.fill('input[type="password"]', adminPassword);
    await page.click('button:has-text("Logga in")');
    
    // Wait for navigation to dashboard or admin
    await page.waitForURL(url => url.pathname.includes('/app') || url.pathname.includes('/admin'), { timeout: 30000 });
  });

  async function measureModalOpening(page: any, clickSelector: string, modalTitle: string) {
    // Ensure selector is visible before clicking
    await page.waitForSelector(clickSelector, { timeout: 10000 });
    
    const start = performance.now();
    await page.click(clickSelector);
    
    // Wait for the modal title to be visible
    // We use a more specific selector to avoid matching background text
    await expect(page.locator('role=dialog').locator(`text="${modalTitle}"`)).toBeVisible({ timeout: 10000 });
    
    const end = performance.now();
    const duration = Math.round(end - start);
    console.log(`[PERF] Modal "${modalTitle}" took ${duration}ms to appear.`);
    return duration;
  }

  test('measure team page modals', async ({ page }) => {
    await page.goto('/admin/team');
    await page.waitForSelector('text=Content managers');

    // 1. measure Edit CM Modal
    try {
      await measureModalOpening(page, 'button:has-text("Redigera") >> nth=0', 'Redigera CM');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
    } catch (e) {
      console.log('Skipping Edit CM modal measure: No "Redigera" button found.');
    }

    // 2. measure Set Absence Modal
    try {
      await measureModalOpening(page, 'button:has-text("Sätt frånvaro") >> nth=0', 'Sätt frånvaro');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
    } catch (e) {
      console.log('Skipping Set Absence modal measure: No "Sätt frånvaro" button found.');
    }
    
    // 3. measure Add CM Modal
    await measureModalOpening(page, 'button:has-text("Lägg till")', 'Lägg till CM');
    await page.keyboard.press('Escape');
  });

  test('measure customer page modals', async ({ page }) => {
    await page.goto('/admin/customers');
    await page.waitForSelector('text=Kunder');

    // 1. measure Invite Customer Modal
    await measureModalOpening(page, 'button:has-text("Bjud in kund")', 'Bjud in ny kund');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // 2. measure Customer Detail navigation (perceived performance)
    const navStart = performance.now();
    await page.click('tbody tr >> nth=0'); // Click first customer row
    await page.waitForURL(url => url.pathname.includes('/admin/customers/'), { timeout: 15000 });
    await page.waitForSelector('text=Översikt', { timeout: 15000 });
    console.log(`[PERF] Customer Detail navigation took ${Math.round(performance.now() - navStart)}ms`);

    // 3. Go to Team tab to find Change CM modal
    await page.click('a:has-text("Team")');
    await page.waitForSelector('text=Ansvarig CM');

    // 4. measure Change CM Modal
    await measureModalOpening(page, 'button:has-text("Byt CM"), button:has-text("Ändra")', 'Ändra Content Manager');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    
    // 5. Go to Billing tab to find Manual Invoice modal
    await page.click('a:has-text("Ekonomi")');
    await page.waitForSelector('text=Fakturor');
    
    // 6. measure Manual Invoice Modal
    await measureModalOpening(page, 'button:has-text("Skapa manuell faktura")', 'Skapa manuell faktura');
    await page.keyboard.press('Escape');
    
    // 7. Go to Contract tab to find Discount modal
    await page.click('a:has-text("Avtal")');
    await page.waitForSelector('text=Avtalsinformation');
    
    // 8. measure Discount Modal
    await measureModalOpening(page, 'button:has-text("Lägg till rabatt")', 'Lägg till rabatt');
  });
});
