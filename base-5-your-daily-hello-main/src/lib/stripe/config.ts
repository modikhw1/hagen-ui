export const STRIPE_API_VERSION = '2025-12-15.clover' as const;
export const DEFAULT_CURRENCY = 'sek';
export const DEFAULT_TAX_CODE = 'txcd_10000000';
export const DEFAULT_DAYS_UNTIL_DUE = 14;
export const DEFAULT_BILLING_DAY = 25;

export const SUBSCRIPTION_PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Perfekt för att komma igång med konceptmarknadsföring',
    price: 99900,
    currency: DEFAULT_CURRENCY,
    features: [
      'Upp till 5 koncept per månad',
      'Grundläggande matchning',
      'Email-support',
    ],
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    description: 'För varumärken som vill skala upp sin närvaro',
    price: 249900,
    currency: DEFAULT_CURRENCY,
    features: [
      'Upp till 15 koncept per månad',
      'Avancerad AI-matchning',
      'Prioriterad support',
      'Dedikerad kontaktperson',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Skräddarsydd lösning för stora varumärken',
    price: 499900,
    currency: DEFAULT_CURRENCY,
    features: [
      'Obegränsade koncept',
      'Custom AI-profil',
      'Dedikerat team',
      'SLA-garanti',
      'API-åtkomst',
    ],
  },
} as const;

export type SubscriptionPlanId = keyof typeof SUBSCRIPTION_PLANS;

export const PRODUCTS = {
  conceptPack: {
    name: 'Konceptpaket',
    description: 'Tillgång till alla sketchkoncept',
    price: 49900,
    currency: DEFAULT_CURRENCY,
  },
} as const;
