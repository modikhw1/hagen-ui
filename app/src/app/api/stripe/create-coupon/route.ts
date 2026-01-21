import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';

// POST - Create a new coupon
export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const {
      code,           // The customer-facing promo code (e.g., "GRATIS100")
      percentOff,     // 100 = 100% off
      amountOff,      // Amount in öre (e.g., 239900 = 2399 kr)
      currency,       // Required if amountOff is used
      duration,       // "once", "repeating", or "forever"
      durationInMonths, // Required if duration is "repeating"
      maxRedemptions, // Optional: limit number of uses
      name,           // Internal name for the coupon
    } = await request.json();

    if (!code) {
      return NextResponse.json({ error: 'Promo code required' }, { status: 400 });
    }

    if (!percentOff && !amountOff) {
      return NextResponse.json({ error: 'Either percentOff or amountOff required' }, { status: 400 });
    }

    // Create the coupon first
    // Build params object properly for Stripe API
    const couponData: {
      duration: 'once' | 'repeating' | 'forever';
      name?: string;
      percent_off?: number;
      amount_off?: number;
      currency?: string;
      duration_in_months?: number;
      max_redemptions?: number;
    } = {
      duration: (duration || 'once') as 'once' | 'repeating' | 'forever',
      name: name || `Rabatt ${code}`,
    };

    if (percentOff) {
      couponData.percent_off = percentOff;
    } else if (amountOff) {
      couponData.amount_off = amountOff;
      couponData.currency = currency || 'sek';
    }

    if (duration === 'repeating' && durationInMonths) {
      couponData.duration_in_months = durationInMonths;
    }

    if (maxRedemptions) {
      couponData.max_redemptions = maxRedemptions;
    }

    // Use the code as the coupon ID for simplicity
    const couponWithId = {
      ...couponData,
      id: code.toUpperCase(),
    };

    const coupon = await stripe.coupons.create(couponWithId);

    return NextResponse.json({
      success: true,
      coupon: {
        id: coupon.id,
        name: coupon.name,
        percentOff: coupon.percent_off,
        amountOff: coupon.amount_off,
        currency: coupon.currency,
        duration: coupon.duration,
      },
      usage: `Use coupon code: ${coupon.id}`,
    });

  } catch (error) {
    console.error('Create coupon error:', error);
    return NextResponse.json(
      { error: 'Could not create coupon', details: String(error) },
      { status: 500 }
    );
  }
}
