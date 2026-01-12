import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Missing STRIPE_SECRET_KEY - Stripe will not work');
}

// Only initialize Stripe if key is provided (prevents build errors)
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { typescript: true })
  : (null as unknown as Stripe);

// Product configuration - adjust these as needed
export const PRODUCTS = {
  conceptPack: {
    name: 'Konceptpaket',
    description: 'Tillgång till alla sketchkoncept',
    price: 49900, // 499 SEK in öre
    currency: 'sek',
  },
} as const;
