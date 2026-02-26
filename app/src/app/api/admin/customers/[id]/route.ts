import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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

      // Send email via Resend
      let emailSent = false;
      if (resend && body.contact_email) {
        try {
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL || 'LeTrend <hej@letrend.se>',
            to: body.contact_email,
            subject: 'Välkommen till LeTrend - Bjud in',
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h1 style="color: #6B4423;">Välkommen till LeTrend!</h1>
                <p>Hej!</p>
                <p>Du har blivit inbjuden att ansluta till LeTrend. Företaget <strong>${body.business_name}</strong> har skapat ett konto åt dig.</p>
                <p>Klicka på länken nedan för att sätta ditt lösenord och komma igång:</p>
                <p style="margin: 24px 0;">
                  <a href="${inviteLink}" style="background: #6B4423; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
                    Acceptera inbjudan
                  </a>
                </p>
                <p style="color: #666; font-size: 14px;">
                  Länken är giltig i 7 dagar.<br>
                  Om knappen inte fungerar, kopiera denna länk:<br>
                  ${inviteLink}
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
                <p style="color: #999; font-size: 12px;">
                  LeTrend - Social media marketing
                </p>
              </div>
            `,
          });
          emailSent = true;
        } catch (emailError) {
          console.error('Failed to send email:', emailError);
        }
      }

      return NextResponse.json({ 
        profile: data, 
        inviteLink,
        emailSent,
        message: emailSent ? 'Invitation sent via email!' : 'Invitation created (email failed)' 
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
