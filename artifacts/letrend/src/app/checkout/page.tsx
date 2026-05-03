import CheckoutPageClient from './CheckoutPageClient';
import { stripePublishableKey } from '@/lib/stripe-client';

export default function CheckoutPage() {
  return <CheckoutPageClient publishableKey={stripePublishableKey} />;
}
