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
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      
      // Use Supabase's inviteUserByEmail - this actually sends the email!
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        body.contact_email,
        {
          data: {
            business_name: body.business_name,
            customer_profile_id: id,
          },
          redirectTo: `${appUrl}/auth/callback`,
        }
      );

      if (inviteError) {
        console.error('Invite error:', inviteError);
        return NextResponse.json({ error: inviteError.message }, { status: 500 });
      }

      console.log('Invited user:', inviteData);

      // Update profile status
      const { data: profile, error: updateError } = await supabaseAdmin
        .from('customer_profiles')
        .update({
          status: 'invited',
          invited_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ 
        profile, 
        message: 'Invitation email sent!'
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
