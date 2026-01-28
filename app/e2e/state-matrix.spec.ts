import { test, expect } from '@playwright/test';
import { loginAs, getAccessToken, TEST_CREDENTIALS } from './helpers/auth';

/**
 * STATE MATRIX TESTS
 *
 * Testar alla kombinationer av auth/payment/profile states
 * Kräver testanvändare i databasen - kör `npx tsx scripts/seed-test-users.ts` först
 */

test.describe('Profile State Matrix', () => {

  test.describe('Routing baserat på subscription_status', () => {

    test('ny användare utan subscription → pricing', async ({ page }) => {
      // Simulera via API eller login
      await page.goto('/login');

      // TODO: Implementera faktisk login när testanvändare finns
      // await loginAs(page, TEST_USERS.newUser);
      // await expect(page).toHaveURL(/pricing/);
    });

    test('active subscription → dashboard', async ({ page }) => {
      // TODO: Implementera
    });

    test('pending_payment → agreement page', async ({ page }) => {
      // TODO: Implementera
    });

    test('past_due → agreement page med varning', async ({ page }) => {
      // TODO: Implementera
    });

    test('cancelled → pricing (kan prenumerera igen)', async ({ page }) => {
      // TODO: Implementera
    });
  });
});

test.describe('API State Tests', () => {

  test.describe('Auth Endpoints', () => {

    test('GET /api/admin/stripe utan token → 401', async ({ request }) => {
      const response = await request.get('/api/admin/stripe?action=list-customers');
      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.error).toBe('No access token');
    });

    test('GET /api/admin/stripe med ogiltig token → 401', async ({ request }) => {
      const response = await request.get('/api/admin/stripe?action=list-customers', {
        headers: {
          'Cookie': 'sb-access-token=invalid-token-here'
        }
      });
      expect(response.status()).toBe(401);

      const body = await response.json();
      expect(body.error).toBe('Invalid session');
    });

    test('GET /api/admin/stripe med non-admin → 403', async ({ page, request }) => {
      // Login as non-admin user to get a valid token
      await loginAs(page, TEST_CREDENTIALS.ACTIVE_SUBSCRIBER.email, TEST_CREDENTIALS.ACTIVE_SUBSCRIBER.password);

      // Get the access token from the cookie
      const cookies = await page.context().cookies();
      const authCookie = cookies.find(c => c.name === 'sb-access-token');

      if (!authCookie) {
        test.skip();
        return;
      }

      const response = await request.get('/api/admin/stripe?action=list-customers', {
        headers: {
          'Cookie': `sb-access-token=${authCookie.value}`
        }
      });

      expect(response.status()).toBe(403);
      const body = await response.json();
      expect(body.error).toBe('Not an admin');
    });

    test('GET /api/admin/stripe med admin (is_admin=true) → 200', async ({ page, request }) => {
      // Login as admin user with is_admin=true
      await loginAs(page, TEST_CREDENTIALS.ADMIN_FLAG.email, TEST_CREDENTIALS.ADMIN_FLAG.password);

      const cookies = await page.context().cookies();
      const authCookie = cookies.find(c => c.name === 'sb-access-token');

      if (!authCookie) {
        test.skip();
        return;
      }

      const response = await request.get('/api/admin/stripe?action=list-customers', {
        headers: {
          'Cookie': `sb-access-token=${authCookie.value}`
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test('GET /api/admin/stripe med admin (@letrend.se) → 200', async ({ page, request }) => {
      // Login as admin user with @letrend.se email
      await loginAs(page, TEST_CREDENTIALS.ADMIN_EMAIL.email, TEST_CREDENTIALS.ADMIN_EMAIL.password);

      const cookies = await page.context().cookies();
      const authCookie = cookies.find(c => c.name === 'sb-access-token');

      if (!authCookie) {
        test.skip();
        return;
      }

      const response = await request.get('/api/admin/stripe?action=list-customers', {
        headers: {
          'Cookie': `sb-access-token=${authCookie.value}`
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });
  });

  test.describe('Stripe Sync Endpoint', () => {

    test('POST /api/stripe/sync-customer utan customer → synced: false', async ({ request }) => {
      const response = await request.post('/api/stripe/sync-customer', {
        data: {
          email: 'nonexistent@example.com',
          userId: '00000000-0000-0000-0000-000000000000'
        }
      });

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.synced).toBe(false);
    });

    test('POST /api/stripe/sync-customer utan body → 400', async ({ request }) => {
      const response = await request.post('/api/stripe/sync-customer', {
        data: {}
      });

      expect(response.status()).toBe(400);
    });
  });

  test.describe('Pending Agreement Endpoint', () => {

    test('GET /api/stripe/pending-agreement utan customer → null', async ({ request }) => {
      const response = await request.get('/api/stripe/pending-agreement?email=nonexistent@example.com');

      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.agreement).toBeNull();
    });

    test('GET /api/stripe/pending-agreement utan email → 400', async ({ request }) => {
      const response = await request.get('/api/stripe/pending-agreement');

      expect(response.status()).toBe(400);
    });
  });
});

test.describe('Demo Mode', () => {

  test('demo=true utan email → email gate', async ({ page }) => {
    await page.goto('/?demo=true');
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();

    await expect(page.getByText('Se hur LeTrend fungerar')).toBeVisible();
  });

  test('demo med sparad email → direkt till demo', async ({ page }) => {
    // Sätt email i sessionStorage
    await page.goto('/');
    await page.evaluate(() => {
      sessionStorage.setItem('demo_email', 'test@example.com');
    });

    await page.goto('/?demo=true');

    // Ska hoppa över email gate
    await expect(page.getByText('LeTrend')).toBeVisible({ timeout: 10000 });
  });

  test('auth=true → mock auth state', async ({ page }) => {
    await page.goto('/?auth=true');

    // Ska visa pricing eller dashboard beroende på mock state
    await expect(page.getByText('Starter').first()).toBeVisible({ timeout: 10000 });
  });
});
