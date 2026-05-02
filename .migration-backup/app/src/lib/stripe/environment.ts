export type StripeEnv = 'test' | 'live';
export type StripeEnvironment = StripeEnv;

export function getStripeEnvironment(): StripeEnv {
  const env = (process.env.STRIPE_ENV || 'test').toLowerCase();
  return env === 'live' ? 'live' : 'test';
}

export function isStripeTestEnvironment(): boolean {
  return getStripeEnvironment() === 'test';
}

export function getStripeConfigEnvNames(env: StripeEnv) {
  const upper = env.toUpperCase();
  return {
    secretKey: `STRIPE_${upper}_SECRET_KEY` as const,
    publishableKey: `STRIPE_${upper}_PUBLISHABLE_KEY` as const,
    webhookSecret: `STRIPE_${upper}_WEBHOOK_SECRET` as const,
  };
}
