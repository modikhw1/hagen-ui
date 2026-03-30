/**
 * PHASE 3.2: Dynamic Stripe Configuration
 *
 * Provides environment-aware Stripe initialization that switches between
 * test and live modes based on NEXT_PUBLIC_ENV environment variable.
 *
 * Usage:
 * - Development: Set NEXT_PUBLIC_ENV=test (default)
 * - Production: Set NEXT_PUBLIC_ENV=live
 *
 * This enables seamless switching without code changes.
 */

import Stripe from 'stripe';

// Determine environment (defaults to 'test' for safety)
const ENV = process.env.NEXT_PUBLIC_ENV || 'test';
const isTestMode = ENV === 'test';

console.log(`[Stripe Config] Running in ${ENV} mode (test=${isTestMode})`);

// Select appropriate keys based on environment
const SECRET_KEY = isTestMode
  ? process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY
  : process.env.STRIPE_SECRET_KEY_LIVE;

const PUBLISHABLE_KEY = isTestMode
  ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  : process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE;

const WEBHOOK_SECRET = isTestMode
  ? process.env.STRIPE_WEBHOOK_SECRET_TEST || process.env.STRIPE_WEBHOOK_SECRET
  : process.env.STRIPE_WEBHOOK_SECRET_LIVE;

// Validate configuration
if (!SECRET_KEY) {
  console.error(`[Stripe Config] Missing STRIPE_SECRET_KEY for ${ENV} mode`);
  console.error('Set STRIPE_SECRET_KEY_TEST or STRIPE_SECRET_KEY_LIVE in .env.local');
}

if (!PUBLISHABLE_KEY) {
  console.warn(`[Stripe Config] Missing STRIPE_PUBLISHABLE_KEY for ${ENV} mode`);
}

if (!WEBHOOK_SECRET) {
  console.warn(`[Stripe Config] Missing STRIPE_WEBHOOK_SECRET for ${ENV} mode - webhook signature verification disabled`);
}

// Initialize Stripe client (or null if key missing)
export const stripe = SECRET_KEY
  ? new Stripe(SECRET_KEY, {
      apiVersion: '2025-12-15.clover',
      typescript: true,
      appInfo: {
        name: 'LeTrend',
        version: '1.0.0',
      },
    })
  : (null as unknown as Stripe);

// Export configuration values
export const stripePublishableKey = PUBLISHABLE_KEY;
export const stripeWebhookSecret = WEBHOOK_SECRET;
export const isStripeTestMode = isTestMode;
export const stripeEnvironment = ENV;

// Helper functions
export const isTestEnvironment = () => isTestMode;
export const isLiveEnvironment = () => !isTestMode;

// Re-export subscription plans and products from original config
export { SUBSCRIPTION_PLANS, PRODUCTS } from './config';
export type { SubscriptionPlanId } from './config';

// Log configuration status (without exposing keys)
if (typeof window === 'undefined') {
  // Server-side only logging
  console.log(`[Stripe Config] Environment: ${ENV}`);
  console.log(`[Stripe Config] Secret Key: ${SECRET_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log(`[Stripe Config] Publishable Key: ${PUBLISHABLE_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log(`[Stripe Config] Webhook Secret: ${WEBHOOK_SECRET ? '✓ Set' : '✗ Missing'}`);
}
