import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAppUrl } from '@/lib/url/public';

// Admin client for creating users
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface InviteRequestBody {
  email: string;
  businessName: string;
  /** Pre-set price in SEK (for simple invites without Stripe) */
  price?: number;
  /** Optional coupon code */
  couponCode?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { email, businessName, price, couponCode }: InviteRequestBody = await request.json();

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

    // Validate price if provided
    if (price !== undefined && (typeof price !== 'number' || price < 0)) {
      return NextResponse.json(
        { error: 'Price must be a positive number' },
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

    // Create user with invite
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true, // Auto-confirm email for invited users
      user_metadata: {
        business_name: businessName,
        invited_at: new Date().toISOString(),
        price: price || null,
        coupon_code: couponCode || null,
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

    const userId = userData.user.id;

    // Create profile with business name and invite details
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        email,
        business_name: businessName,
        social_links: {},
        tone: [],
        matching_data: {},
        has_paid: false, // Will be true after agreement is accepted
        has_concepts: false,
        is_admin: false,
      });

    if (profileError) {
      console.error('Error creating profile:', profileError);
      // Continue even if profile creation fails
    }

    // Generate invite link with user_id
    const inviteParams = new URLSearchParams({
      flow: 'invite',
      user_id: userId,
    });
    
    if (price) {
      inviteParams.set('price', price.toString());
    }
    
    if (couponCode) {
      inviteParams.set('coupon', couponCode);
    }
    
    const appUrl = getAppUrl();
    const inviteLink = `${appUrl}/auth/callback?${inviteParams.toString()}`;

    // Return response
    return NextResponse.json({
      success: true,
      userId,
      inviteLink,
      price,
      couponCode,
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
