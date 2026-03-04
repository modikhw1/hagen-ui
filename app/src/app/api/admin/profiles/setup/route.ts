import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    const { userId, userEmail, businessName, customerProfileId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Update customer_profiles status to active
    if (customerProfileId) {
      const { error: cpError } = await supabaseAdmin
        .from('customer_profiles')
        .update({
          status: 'active',
          agreed_at: new Date().toISOString(),
        })
        .eq('id', customerProfileId);

      if (cpError) {
        console.error('Failed to update customer_profiles:', cpError);
      } else {
        console.log('Customer profile activated:', customerProfileId);
      }
    }

    // Check if profiles row exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    // Create profiles row if it doesn't exist
    if (!existingProfile) {
      // Try to get more data from customer_profiles
      let finalBusinessName = businessName;
      let businessDescription = null;

      if (customerProfileId) {
        const { data: cpData } = await supabaseAdmin
          .from('customer_profiles')
          .select('business_name, game_plan')
          .eq('id', customerProfileId)
          .single();

        if (cpData) {
          finalBusinessName = cpData.business_name || finalBusinessName;
          businessDescription = (cpData.game_plan as any)?.description || null;
        }
      }

      const { error: createError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: userId,
          email: userEmail,
          business_name: finalBusinessName || 'Mitt företag',
          business_description: businessDescription,
          social_links: {},
          tone: [],
          energy: null,
          industry: null,
          matching_data: {
            customer_profile_id: customerProfileId || null,
          },
          has_paid: false,
          has_concepts: false,
          is_admin: false,
        });

      if (createError) {
        console.error('Failed to create profile:', createError);
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      console.log('Profile created for user:', userId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Profile setup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}, ['admin', 'content_manager', 'customer', 'user']); // Allow all authenticated users to set up their profile
