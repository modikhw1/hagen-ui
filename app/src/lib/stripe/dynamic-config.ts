import Stripe from 'stripe';
import { STRIPE_API_VERSION } from './config';
import {
  getStripeConfigEnvNames,
  getStripeEnvironment,
  isStripeTestEnvironment,
} from './environment';

export const stripeEnvironment = getStripeEnvironment();
export const isStripeTestMode = isStripeTestEnvironment();

const { secretKey, publishableKey, webhookSecret } =
  getStripeConfigEnvNames(stripeEnvironment);

const SECRET = process.env[secretKey];

export const stripe = SECRET
  ? new Stripe(SECRET, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
    })
  : null;

export const stripePublishableKey = process.env[publishableKey] ?? null;
export const stripeWebhookSecret = process.env[webhookSecret] ?? null;

export { SUBSCRIPTION_PLANS, PRODUCTS } from './config';
export type { SubscriptionPlanId } from './config';
