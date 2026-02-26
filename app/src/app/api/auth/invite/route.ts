import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin client for creating users
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { email, businessName } = await request.json();

    // Validate input
    if (!email || !businessName) {
      return NextResponse.json(
        { error: 'Email and business name are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Create user with invite (no password - user will set it via link)
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true, // Auto-confirm email for invited users
      user_metadata: {
        business_name: businessName,
        invited_at: new Date().toISOString(),
      },
    });

    if (createError) {
      console.error('Error creating user:', createError);
      
      // Check if user already exists
      if (createError.message.includes('already been registered')) {
        return NextResponse.json(
          { error: 'A user with this email already exists' },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: createError.message },
        { status: 500 }
      );
    }

    if (!userData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      );
    }

    // Create profile with business name
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userData.user.id,
        email,
        business_name: businessName,
        social_links: {},
        tone: [],
        matching_data: {},
        has_paid: false,
        has_concepts: false,
        is_admin: false,
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
      // Continue even if profile creation fails - user can still log in
    }

    // Generate invite link
    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback?flow=invite&invited_email=${encodeURIComponent(email)}&user_id=${userData.user.id}`;

    // TODO: Send invite email (would integrate with email service)
    // For now, return the invite link
    console.log('Invite link:', inviteLink);

    return NextResponse.json({
      success: true,
      userId: userData.user.id,
      inviteLink,
      message: 'Invitation sent successfully',
    });
  } catch (error) {
    console.error('Invite error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
