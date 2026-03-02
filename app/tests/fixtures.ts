import { test as base, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Get Supabase credentials from environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Test user credentials - use environment variables or defaults
const TEST_USER = {
  email: process.env.TEST_USER_EMAIL || 'test@letrend.se',
  password: process.env.TEST_USER_PASSWORD || 'Test1234!',
  businessName: 'Test Company',
};

// Generate unique test user email
export function generateTestUser(prefix = 'test'): {
  email: string;
  password: string;
  businessName: string;
} {
  const timestamp = Date.now();
  return {
    email: `${prefix}_${timestamp}@letrend.test`,
    password: 'Test1234!',
    businessName: 'Test Business',
  };
}

// Cleanup test user from Supabase
export async function cleanupTestUser(email: string) {
  // Note: This requires admin access to delete users
  // In production, you might need a separate API endpoint for test cleanup
  console.log(`[Cleanup] Would delete user: ${email}`);
}

// Extended test fixture with auth helpers
export const test = base.extend<{
  createTestUser: { email: string; password: string; businessName: string };
  loginAs: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}>({
  createTestUser: async ({ page }, use) => {
    const user = generateTestUser();

    // Create user via the registration UI
    await page.goto('/login');
    await page.click('text=Skapa ett här');
    await page.fill('input[placeholder*="Företagsnamn"]', user.businessName);
    await page.fill('input[placeholder*="din@email.se"]', user.email);
    await page.fill('input[type="password"]', user.password);
    await page.click('text=Skapa konto');

    await use(user);
    
    // Cleanup after test
    // await cleanupTestUser(user.email);
  },
  
  loginAs: async ({ page }, use) => {
    async function login(email: string, password: string) {
      await page.goto('/login');
      await page.fill('input[placeholder*="din@email.se"]', email);
      await page.fill('input[type="password"]', password);
      await page.click('text=Logga in');
      await page.waitForURL('**/app');
    }
    
    await use(login);
  },
  
  logout: async ({ page }, use) => {
    async function logout() {
      await page.click('[data-testid="user-menu"]');
      await page.click('text=Logga ut');
      await page.waitForURL('**/login');
    }
    
    await use(logout);
  },
});

export { expect } from '@playwright/test';
