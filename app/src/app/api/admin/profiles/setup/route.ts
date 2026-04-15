import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
type ProfileRole = 'admin' | 'content_manager' | 'customer' | 'user';

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated (but don't require existing profile)
    const cookieStore = await cookies();
    const supabase = createServerClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {}, // Read-only for API routes
        },
      }
    );

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized - Please log in' }, { status: 401 });
    }

    const { userId, userEmail, businessName, customerProfileId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Security check: User can only create their own profile
    if (userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized - Cannot create profile for another user' }, { status: 403 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Determine role server-side by checking team_members table — never trust client
    const normalizedAuthEmail = (userEmail || session.user.email || '').trim().toLowerCase();
    let isTeamMember = false;
    let role: string | null = null;

    if (normalizedAuthEmail) {
      const { data: teamRow } = await supabaseAdmin
        .from('team_members')
        .select('role')
        .ilike('email', normalizedAuthEmail)
        .maybeSingle();

      if (teamRow) {
        isTeamMember = true;
        role = teamRow.role || 'content_manager';
      }
    }
    const normalizedCustomerProfileId = typeof customerProfileId === 'string' && customerProfileId.trim()
      ? customerProfileId.trim()
      : null;
    let resolvedCustomerProfileId = normalizedCustomerProfileId;

    if (resolvedCustomerProfileId) {
      const { data: existingCustomerProfile } = await supabaseAdmin
        .from('customer_profiles')
        .select('id')
        .eq('id', resolvedCustomerProfileId)
        .maybeSingle();

      if (!existingCustomerProfile) {
        console.warn('[PROFILE_SETUP] Provided customerProfileId not found, attempting fallback lookup', {
          userId,
          userEmail,
          customerProfileId: resolvedCustomerProfileId,
        });
        resolvedCustomerProfileId = null;
      }
    }

    if (!resolvedCustomerProfileId && !isTeamMember && userEmail) {
      const normalizedEmail = userEmail.trim().toLowerCase();
      if (normalizedEmail) {
        const { data: byEmailProfile } = await supabaseAdmin
          .from('customer_profiles')
          .select('id')
          .ilike('contact_email', normalizedEmail)
          .maybeSingle();

        if (byEmailProfile?.id) {
          resolvedCustomerProfileId = byEmailProfile.id;
        }
      }
    }

    const sessionStripeCustomerId = typeof session.user.user_metadata?.stripe_customer_id === 'string'
      ? session.user.user_metadata.stripe_customer_id.trim()
      : '';

    if (!resolvedCustomerProfileId && !isTeamMember && sessionStripeCustomerId) {
      const { data: byStripeCustomerProfile } = await supabaseAdmin
        .from('customer_profiles')
        .select('id')
        .eq('stripe_customer_id', sessionStripeCustomerId)
        .maybeSingle();

      if (byStripeCustomerProfile?.id) {
        resolvedCustomerProfileId = byStripeCustomerProfile.id;
      }
    }

    // Link the user to the customer profile (but do NOT activate — activation
    // happens in verify-checkout-session after confirmed payment).
    if (resolvedCustomerProfileId) {
      console.log('Customer profile linked:', resolvedCustomerProfileId);
    }

    // Check if profiles row exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, role, is_admin, matching_data')
      .eq('id', userId)
      .single();

    const normalizedTeamRole: ProfileRole = role === 'admin' || role === 'content_manager'
      ? role
      : 'content_manager';
    const desiredRole: ProfileRole = isTeamMember ? normalizedTeamRole : 'customer';
    const desiredIsAdmin = Boolean(isTeamMember && normalizedTeamRole === 'admin');
    const existingMatchingData = (existingProfile?.matching_data as Record<string, unknown> | null) || {};
    const existingCustomerProfileId = typeof existingMatchingData.customer_profile_id === 'string'
      ? existingMatchingData.customer_profile_id
      : null;

    const needsRoleUpdate = Boolean(
      existingProfile && (
        existingProfile.role !== desiredRole ||
        Boolean(existingProfile.is_admin) !== desiredIsAdmin ||
        (resolvedCustomerProfileId && existingCustomerProfileId !== resolvedCustomerProfileId)
      )
    );

    if (needsRoleUpdate) {
      // Profile exists but has wrong role - UPDATE it
      console.log('[PROFILE_SETUP] Updating existing profile role for:', { userId, userEmail, oldRole: existingProfile?.role, newRole: desiredRole });

      const updatePayload: Record<string, unknown> = {
        role: desiredRole,
        is_admin: desiredIsAdmin,
      };

      if (resolvedCustomerProfileId) {
        updatePayload.matching_data = {
          ...existingMatchingData,
          customer_profile_id: resolvedCustomerProfileId,
        };
      }

      if (!isTeamMember && businessName) {
        updatePayload.business_name = businessName;
      }

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(updatePayload)
        .eq('id', userId);

      if (updateError) {
        console.error('[PROFILE_SETUP] Failed to update profile role:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      console.log('[PROFILE_SETUP] Profile role updated successfully:', {
        userId,
        role: desiredRole,
        is_admin: desiredIsAdmin
      });

      // Link team_member if needed
      if (isTeamMember) {
        const normalizedLinkEmail = typeof userEmail === 'string' ? userEmail.trim().toLowerCase() : '';
        const { error: linkError } = await supabaseAdmin
          .from('team_members')
          .update({ profile_id: userId })
          .ilike('email', normalizedLinkEmail);

        if (linkError) {
          console.error('[PROFILE_SETUP] Failed to link team_member to profile:', linkError);
        } else {
          console.log('[PROFILE_SETUP] Team member linked to profile:', userEmail);
        }
      }

      return NextResponse.json({ success: true, updated: true });
    }

    // Create profiles row if it doesn't exist
    if (!existingProfile) {
      console.log('[PROFILE_SETUP] Creating profile for:', { userId, userEmail, isTeamMember, role });

      // Try to get more data from customer_profiles
      let finalBusinessName = businessName;
      let businessDescription = null;

      if (resolvedCustomerProfileId) {
        const { data: cpData } = await supabaseAdmin
          .from('customer_profiles')
          .select('business_name, game_plan')
          .eq('id', resolvedCustomerProfileId)
          .single();

        if (cpData) {
          finalBusinessName = cpData.business_name || finalBusinessName;
          const gamePlan = cpData.game_plan as { description?: string } | null;
          businessDescription = gamePlan?.description || null;
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
            customer_profile_id: resolvedCustomerProfileId || null,
          },
          has_paid: false,
          has_concepts: false,
          is_admin: isTeamMember && role === 'admin',
          role: isTeamMember ? (role || 'content_manager') : 'customer',
        });

      if (createError) {
        console.error('[PROFILE_SETUP] Failed to create profile:', createError);
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      console.log('[PROFILE_SETUP] Profile created successfully:', {
        userId,
        role: isTeamMember ? (role || 'content_manager') : 'customer',
        is_admin: isTeamMember && role === 'admin'
      });

      // If this is a team member, link team_members.profile_id
      if (isTeamMember) {
        const normalizedLinkEmail = typeof userEmail === 'string' ? userEmail.trim().toLowerCase() : '';
        const { error: linkError } = await supabaseAdmin
          .from('team_members')
          .update({ profile_id: userId })
          .ilike('email', normalizedLinkEmail);

        if (linkError) {
          console.error('Failed to link team_member to profile:', linkError);
        } else {
          console.log('Team member linked to profile:', userEmail);
        }
      }

      return NextResponse.json({ success: true, created: true });
    }

    // Profile exists with correct role - nothing to do
    return NextResponse.json({ success: true, alreadyCorrect: true });
  } catch (error) {
    console.error('Profile setup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
