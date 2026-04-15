const PUBLIC_ENV = process.env.NEXT_PUBLIC_ENV === 'live' ? 'live' : 'test';

export type StripeEnvironment = 'test' | 'live';

export function getStripeEnvironment(): StripeEnvironment {
  return PUBLIC_ENV;
}

export function isStripeTestEnvironment(): boolean {
  return PUBLIC_ENV === 'test';
}

export function getStripeConfigEnvNames(environment: StripeEnvironment) {
  return {
    secretKey: environment === 'test' ? 'STRIPE_SECRET_KEY_TEST' : 'STRIPE_SECRET_KEY_LIVE',
    publishableKey:
      environment === 'test'
        ? 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST'
        : 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE',
    webhookSecret:
      environment === 'test'
        ? 'STRIPE_WEBHOOK_SECRET_TEST'
        : 'STRIPE_WEBHOOK_SECRET_LIVE',
  };
}
