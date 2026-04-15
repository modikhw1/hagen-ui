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
import {
  getStripeConfigEnvNames,
  getStripeEnvironment,
  isStripeTestEnvironment,
} from '@/lib/stripe/environment';

const ENV = getStripeEnvironment();
const isTestMode = isStripeTestEnvironment();
const configEnvNames = getStripeConfigEnvNames(ENV);

console.log(`[Stripe Config] Running in ${ENV} mode (test=${isTestMode})`);

const SECRET_KEY = process.env[configEnvNames.secretKey];
const PUBLISHABLE_KEY = process.env[configEnvNames.publishableKey];
const WEBHOOK_SECRET = process.env[configEnvNames.webhookSecret];

// Validate configuration
if (!SECRET_KEY) {
  console.error(`[Stripe Config] Missing ${configEnvNames.secretKey} for ${ENV} mode`);
}

if (!PUBLISHABLE_KEY) {
  console.warn(`[Stripe Config] Missing ${configEnvNames.publishableKey} for ${ENV} mode`);
}

if (!WEBHOOK_SECRET) {
  console.warn(`[Stripe Config] Missing ${configEnvNames.webhookSecret} for ${ENV} mode - webhook signature verification disabled`);
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
