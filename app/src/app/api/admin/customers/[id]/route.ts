import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    const body = await request.json();
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different actions
    if (body.action === 'send_invite') {
      // Create user in Supabase Auth
      const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: body.contact_email,
        email_confirm: true,
        user_metadata: {
          business_name: body.business_name,
          invited_at: new Date().toISOString(),
          customer_profile_id: id,
        },
      });

      if (createError) {
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      // Update profile status
      const { data, error } = await supabaseAdmin
        .from('customer_profiles')
        .update({
          status: 'invited',
          invited_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Generate invite link
      const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback?flow=invite&user_id=${userData.user?.id}`;

      return NextResponse.json({ 
        profile: data, 
        inviteLink,
        message: 'Invitation sent successfully' 
      });
    }

    if (body.action === 'activate') {
      const { data, error } = await supabaseAdmin
        .from('customer_profiles')
        .update({
          status: 'active',
          agreed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ profile: data });
    }

    // General update
    const { data, error } = await supabaseAdmin
      .from('customer_profiles')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Profile ID is required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabaseAdmin
      .from('customer_profiles')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Profile deleted successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
