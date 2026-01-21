import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';

// POST - Apply a coupon/promo code to an invoice or subscription
export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { invoiceId, subscriptionId, couponCode } = await request.json();

    if (!couponCode) {
      return NextResponse.json({ error: 'Coupon code required' }, { status: 400 });
    }

    // Try to find the coupon or promotion code
    let couponId: string | null = null;

    // First, check if it's a promotion code (customer-facing code)
    try {
      const promoCodes = await stripe.promotionCodes.list({
        code: couponCode,
        active: true,
        limit: 1,
      });

      if (promoCodes.data.length > 0) {
        couponId = promoCodes.data[0].coupon.id;
      }
    } catch {
      // Not a promo code, try direct coupon
    }

    // If not found as promo code, try direct coupon ID
    if (!couponId) {
      try {
        const coupon = await stripe.coupons.retrieve(couponCode);
        if (coupon && coupon.valid) {
          couponId = coupon.id;
        }
      } catch {
        return NextResponse.json({ error: 'Invalid coupon code' }, { status: 400 });
      }
    }

    if (!couponId) {
      return NextResponse.json({ error: 'Coupon not found or expired' }, { status: 400 });
    }

    // Apply to subscription if provided
    if (subscriptionId) {
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        coupon: couponId,
      });

      return NextResponse.json({
        success: true,
        applied: 'subscription',
        subscriptionId: subscription.id,
        discount: subscription.discount,
      });
    }

    // Apply to invoice if provided
    if (invoiceId) {
      // For draft invoices, we can add a discount
      const invoice = await stripe.invoices.retrieve(invoiceId);

      if (invoice.status === 'draft') {
        // Add discount to draft invoice
        const updatedInvoice = await stripe.invoices.update(invoiceId, {
          discounts: [{ coupon: couponId }],
        });

        return NextResponse.json({
          success: true,
          applied: 'invoice',
          invoiceId: updatedInvoice.id,
          newTotal: updatedInvoice.total,
        });
      } else if (invoice.status === 'open') {
        // For open invoices, we need to void and recreate, or apply to subscription
        // For now, let's apply to the subscription instead
        if (invoice.subscription) {
          const subId = typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription.id;

          const subscription = await stripe.subscriptions.update(subId, {
            coupon: couponId,
          });

          // The next invoice will have the discount
          return NextResponse.json({
            success: true,
            applied: 'subscription',
            note: 'Discount applied to subscription. Current invoice unchanged, but future invoices will have discount.',
            subscriptionId: subscription.id,
          });
        }
      }

      return NextResponse.json({
        error: 'Cannot apply coupon to this invoice status'
      }, { status: 400 });
    }

    return NextResponse.json({ error: 'Invoice ID or Subscription ID required' }, { status: 400 });

  } catch (error) {
    console.error('Apply coupon error:', error);
    return NextResponse.json(
      { error: 'Could not apply coupon', details: String(error) },
      { status: 500 }
    );
  }
}

// GET - List available coupons (for admin)
export async function GET() {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const coupons = await stripe.coupons.list({ limit: 20 });
    const promoCodes = await stripe.promotionCodes.list({ limit: 20, active: true });

    return NextResponse.json({
      coupons: coupons.data.map(c => ({
        id: c.id,
        name: c.name,
        percentOff: c.percent_off,
        amountOff: c.amount_off,
        currency: c.currency,
        valid: c.valid,
        timesRedeemed: c.times_redeemed,
        maxRedemptions: c.max_redemptions,
      })),
      promoCodes: promoCodes.data.map(p => ({
        id: p.id,
        code: p.code,
        couponId: p.coupon.id,
        active: p.active,
        timesRedeemed: p.times_redeemed,
        maxRedemptions: p.max_redemptions,
      })),
    });

  } catch (error) {
    console.error('List coupons error:', error);
    return NextResponse.json({ error: 'Could not list coupons' }, { status: 500 });
  }
}
