import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET - Check if user has a profile
export const GET = withAuth(async (request: NextRequest, user) => {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if profile exists in profiles table
    // If profile exists, user has already completed onboarding
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, has_onboarded')
      .eq('id', userId)
      .single();

    if (!profileError && profile) {
      // Profile exists - user has already onboarded
      return NextResponse.json({ 
        hasProfile: true,
        hasOnboarded: profile?.has_onboarded || true,
      });
    }

    return NextResponse.json({ 
      hasProfile: false,
      hasOnboarded: false,
    });

  } catch (error) {
    console.error('Check profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}, ['admin', 'content_manager', 'customer']); // Allow any authenticated user to check their profile
