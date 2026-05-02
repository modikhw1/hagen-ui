#!/usr/bin/env node

/**
 * Backfill Script: Fetch existing Stripe subscriptions and populate subscriptions table
 *
 * This script fetches all subscriptions from Stripe and inserts them into Supabase.
 * Run this after applying migration 009_subscriptions_table.sql
 */

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Load environment
const stripeKey = process.env.NEXT_PUBLIC_ENV === 'production'
  ? process.env.STRIPE_SECRET_KEY_LIVE
  : process.env.STRIPE_SECRET_KEY_TEST;

if (!stripeKey) {
  console.error('❌ Stripe secret key not found. Set STRIPE_SECRET_KEY_TEST or STRIPE_SECRET_KEY_LIVE');
  process.exit(1);
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Supabase credentials not found');
  process.exit(1);
}

const stripe = new Stripe(stripeKey);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfillSubscriptions() {
  console.log('🔍 Fetching subscriptions from Stripe...\n');

  const allSubscriptions = [];
  let hasMore = true;
  let startingAfter = undefined;

  // Fetch all subscriptions with pagination
  while (hasMore) {
    const response = await stripe.subscriptions.list({
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.customer', 'data.items.data.price'],
    });

    allSubscriptions.push(...response.data);
    hasMore = response.has_more;
    startingAfter = response.data[response.data.length - 1]?.id;
  }

  console.log(`Found ${allSubscriptions.length} subscriptions in Stripe\n`);

  if (allSubscriptions.length === 0) {
    console.log('✓ No subscriptions to backfill');
    return;
  }

  // Process each subscription
  let inserted = 0;
  let errors = 0;

  for (const sub of allSubscriptions) {
    try {
      // Find customer_profile_id
      const { data: customerProfile } = await supabase
        .from('customer_profiles')
        .select('id')
        .eq('stripe_customer_id', sub.customer)
        .single();

      // Extract price info
      const firstItem = sub.items?.data[0];
      const amount = firstItem?.price?.unit_amount || 0;
      const interval = firstItem?.price?.recurring?.interval || 'month';
      const intervalCount = firstItem?.price?.recurring?.interval_count || 1;

      // Insert subscription
      const { error } = await supabase.from('subscriptions').upsert({
        stripe_subscription_id: sub.id,
        stripe_customer_id: sub.customer,
        customer_profile_id: customerProfile?.id || null,
        status: sub.status,
        cancel_at_period_end: sub.cancel_at_period_end || false,
        currency: sub.currency || 'sek',
        amount,
        interval,
        interval_count: intervalCount,
        current_period_start: sub.current_period_start
          ? new Date(sub.current_period_start * 1000).toISOString()
          : null,
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        trial_start: sub.trial_start
          ? new Date(sub.trial_start * 1000).toISOString()
          : null,
        trial_end: sub.trial_end
          ? new Date(sub.trial_end * 1000).toISOString()
          : null,
        canceled_at: sub.canceled_at
          ? new Date(sub.canceled_at * 1000).toISOString()
          : null,
        cancel_at: sub.cancel_at
          ? new Date(sub.cancel_at * 1000).toISOString()
          : null,
        ended_at: sub.ended_at
          ? new Date(sub.ended_at * 1000).toISOString()
          : null,
        created: sub.created
          ? new Date(sub.created * 1000).toISOString()
          : new Date().toISOString(),
      }, {
        onConflict: 'stripe_subscription_id'
      });

      if (error) {
        console.error(`❌ Error inserting subscription ${sub.id}:`, error.message);
        errors++;
      } else {
        console.log(`✓ Inserted subscription ${sub.id} - Status: ${sub.status}`);
        inserted++;
      }
    } catch (err) {
      console.error(`❌ Unexpected error for subscription ${sub.id}:`, err.message);
      errors++;
    }
  }

  console.log(`\n✅ Backfill complete!`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Errors: ${errors}`);
}

// Run backfill
backfillSubscriptions()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  });
