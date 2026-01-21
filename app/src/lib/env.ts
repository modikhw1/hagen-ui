/**
 * Environment variable validation utilities
 * Fails early with clear errors for required variables
 */

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getOptionalEnv(name: string, fallback: string = ''): string {
  return process.env[name] || fallback;
}

// Stripe configuration
export function getStripeConfig() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.warn('Missing STRIPE_SECRET_KEY - Stripe features disabled');
    return null;
  }
  return { secretKey };
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CRITICAL: Missing STRIPE_WEBHOOK_SECRET - webhook verification will fail');
  }
  return secret || '';
}

// Supabase configuration
export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return {
    url: url || '',
    serviceKey: serviceKey || '',
    anonKey: anonKey || '',
    isConfigured: !!(url && (serviceKey || anonKey)),
    hasServiceKey: !!serviceKey,
  };
}
