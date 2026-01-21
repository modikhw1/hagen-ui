import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/config';

// POST - Update a Stripe product
export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
    }

    const { productId, name, description } = await request.json();

    if (!productId) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    const updateData: { name?: string; description?: string } = {};
    if (name) updateData.name = name;
    if (description) updateData.description = description;

    const product = await stripe.products.update(productId, updateData);

    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
      },
    });
  } catch (error) {
    console.error('Update product error:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}
