import 'server-only';

import type Stripe from 'stripe';

export type StripeIdempotencyOptions = { idempotencyKey?: string } | undefined;

export async function createScheduleFromSubscription(args: {
  stripe: Stripe;
  subscriptionId: string;
  idempotencyKey?: string | null;
}): Promise<Stripe.SubscriptionSchedule> {
  const options: StripeIdempotencyOptions = args.idempotencyKey
    ? { idempotencyKey: args.idempotencyKey }
    : undefined;

  return args.stripe.subscriptionSchedules.create(
    {
      from_subscription: args.subscriptionId,
    },
    options,
  );
}

export type ConfigureSchedulePayload = Omit<
  Stripe.SubscriptionScheduleUpdateParams,
  'from_subscription'
>;

export async function configureSubscriptionSchedule(args: {
  stripe: Stripe;
  scheduleId: string;
  payload: ConfigureSchedulePayload;
  idempotencyKey?: string | null;
}): Promise<Stripe.SubscriptionSchedule> {
  const options: StripeIdempotencyOptions = args.idempotencyKey
    ? { idempotencyKey: args.idempotencyKey }
    : undefined;

  return args.stripe.subscriptionSchedules.update(
    args.scheduleId,
    args.payload,
    options,
  );
}
