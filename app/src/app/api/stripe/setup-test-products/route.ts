import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';
import { SUBSCRIPTION_PLANS } from '@/lib/stripe/config';
import { verifyAdminAccess } from '@/lib/auth/admin';

// POST - Create test products and prices in Stripe (admin only)
export async function POST() {
  try {
    // Require admin access
    const auth = await verifyAdminAccess();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.error === 'No access token' ? 401 : 403 });
    }

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const createdProducts: Array<{ plan: string; productId: string; priceId: string }> = [];

    for (const [planId, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
      // Check if product already exists
      const existingProducts = await stripe.products.search({
        query: `metadata['plan_id']:'${planId}'`,
      });

      let product;
      if (existingProducts.data.length > 0) {
        product = existingProducts.data[0];
        console.log(`Product for ${planId} already exists: ${product.id}`);
      } else {
        // Create product
        product = await stripe.products.create({
          name: plan.name,
          description: plan.description,
          metadata: {
            plan_id: planId,
          },
        });
        console.log(`Created product for ${planId}: ${product.id}`);
      }

      // Check if price exists
      const existingPrices = await stripe.prices.list({
        product: product.id,
        active: true,
      });

      let price;
      if (existingPrices.data.length > 0) {
        price = existingPrices.data[0];
        console.log(`Price for ${planId} already exists: ${price.id}`);
      } else {
        // Create price
        price = await stripe.prices.create({
          product: product.id,
          unit_amount: plan.price,
          currency: plan.currency,
          recurring: {
            interval: 'month',
          },
          metadata: {
            plan_id: planId,
          },
        });
        console.log(`Created price for ${planId}: ${price.id}`);
      }

      createdProducts.push({
        plan: planId,
        productId: product.id,
        priceId: price.id,
      });
    }

    return NextResponse.json({
      success: true,
      products: createdProducts,
      message: 'Update PRICE_IDS in your code with these price IDs',
    });
  } catch (error) {
    console.error('Setup test products error:', error);
    return NextResponse.json({ error: 'Failed to setup products' }, { status: 500 });
  }
}
