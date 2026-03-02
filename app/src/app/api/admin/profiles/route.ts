import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET - Fetch all profiles with their linked customer_profiles
export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Fetch profiles
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 });
    }

    // For each profile, try to find linked customer_profile
    const profilesWithCustomer = await Promise.all(
      (profiles || []).map(async (profile) => {
        // Try to find customer profile via matching_data
        let customerProfile = null;
        
        if (profile.matching_data?.customer_profile_id) {
          const { data } = await supabaseAdmin
            .from('customer_profiles')
            .select('*')
            .eq('id', profile.matching_data.customer_profile_id)
            .single();
          customerProfile = data;
        }

        return {
          ...profile,
          customer_profile: customerProfile,
        };
      })
    );

    return NextResponse.json({ profiles: profilesWithCustomer });
  } catch (error) {
    console.error('Error fetching profiles:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update a profile
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, tone, energy, industry, business_name, business_description, matching_data } = body;

    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (tone !== undefined) updateData.tone = tone;
    if (energy !== undefined) updateData.energy = energy;
    if (industry !== undefined) updateData.industry = industry;
    if (business_name !== undefined) updateData.business_name = business_name;
    if (business_description !== undefined) updateData.business_description = business_description;
    if (matching_data !== undefined) updateData.matching_data = matching_data;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
