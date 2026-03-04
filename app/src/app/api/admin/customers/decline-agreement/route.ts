import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// POST - Mark customer as declined / pending payment
export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    const body = await request.json();
    const { stripeCustomerId, subscriptionId } = body;

    if (!stripeCustomerId && !subscriptionId) {
      return NextResponse.json({ error: 'stripeCustomerId or subscriptionId required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Find the customer profile by stripe_customer_id
    let query = supabaseAdmin
      .from('customer_profiles')
      .select('id, status')
      .eq('stripe_customer_id', stripeCustomerId);

    const { data: profiles, error: findError } = await query;

    if (findError) {
      console.error('Error finding profile:', findError);
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }

    if (!profiles || profiles.length === 0) {
      // Try by subscription ID
      const { data: profilesBySub, error: findSubError } = await supabaseAdmin
        .from('customer_profiles')
        .select('id, status')
        .eq('stripe_subscription_id', subscriptionId);

      if (findSubError || !profilesBySub || profilesBySub.length === 0) {
        return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 });
      }

      // Update to pending_payment status
      const { error: updateError } = await supabaseAdmin
        .from('customer_profiles')
        .update({ status: 'pending_payment', declined_at: new Date().toISOString() })
        .eq('id', profilesBySub[0].id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ message: 'Status updated to pending_payment', profileId: profilesBySub[0].id });
    }

    // Update to pending_payment status
    const { error: updateError } = await supabaseAdmin
      .from('customer_profiles')
      .update({ status: 'pending_payment', declined_at: new Date().toISOString() })
      .eq('id', profiles[0].id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Status updated to pending_payment', profileId: profiles[0].id });

  } catch (error) {
    console.error('Decline agreement error:', error);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}, ['admin']);
