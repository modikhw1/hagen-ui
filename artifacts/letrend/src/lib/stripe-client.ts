export type StripeEnv = 'test' | 'live';

export function getStripeEnvironment(): StripeEnv {
  const env = (import.meta.env.VITE_STRIPE_ENV || 'test').toLowerCase();
  return env === 'live' ? 'live' : 'test';
}

export const stripePublishableKey: string | null =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? null;
