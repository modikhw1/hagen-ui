import CheckoutPageClient from './CheckoutPageClient';
import { stripePublishableKey } from '@/lib/stripe/dynamic-config';

export default function CheckoutPage() {
  return <CheckoutPageClient publishableKey={stripePublishableKey} />;
}
