import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Missing STRIPE_SECRET_KEY - Stripe will not work');
}

// Only initialize Stripe if key is provided (prevents build errors)
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { typescript: true })
  : (null as unknown as Stripe);

// Subscription plans - monthly recurring
export const SUBSCRIPTION_PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Perfekt för att komma igång med konceptmarknadsföring',
    price: 99900, // 999 SEK/månad i öre
    currency: 'sek',
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
    price: 249900, // 2499 SEK/månad i öre
    currency: 'sek',
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
    price: 499900, // 4999 SEK/månad i öre
    currency: 'sek',
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

// Legacy - keep for backwards compatibility during transition
export const PRODUCTS = {
  conceptPack: {
    name: 'Konceptpaket',
    description: 'Tillgång till alla sketchkoncept',
    price: 49900, // 499 SEK in öre
    currency: 'sek',
  },
} as const;
