import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { TablesInsert, TablesUpdate } from '@/types/database';
import { asJsonObject } from '@/lib/database/json';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

type ProfileRole = 'admin' | 'content_manager' | 'customer' | 'user';

async function activateLinkedCustomerProfile(params: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>;
  customerProfileId: string | null;
}) {
  const { supabaseAdmin, customerProfileId } = params;
  if (!customerProfileId) return;

  const { data: customerProfile } = await supabaseAdmin
    .from('customer_profiles')
    .select('id, status, agreed_at')
    .eq('id', customerProfileId)
    .maybeSingle();

  if (!customerProfile) return;
  if (customerProfile.status === 'active' || customerProfile.status === 'agreed') return;

  await supabaseAdmin
    .from('customer_profiles')
    .update({
      status: 'active',
      agreed_at: customerProfile.agreed_at || new Date().toISOString(),
    } satisfies TablesUpdate<'customer_profiles'>)
    .eq('id', customerProfileId);
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonError('Supabase-miljön är inte korrekt konfigurerad', 500);
    }

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      },
    );

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      return jsonError('Du maste logga in', 401);
    }

    const { userId, userEmail, businessName, customerProfileId } = await request.json();

    if (!userId) {
      return jsonError('userId krävs', 400);
    }

    if (userId !== authUser.id) {
      return jsonError('Du kan bara skapa eller koppla din egen profil', 403);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const normalizedAuthEmail = (userEmail || authUser.email || '').trim().toLowerCase();
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

    const normalizedCustomerProfileId =
      typeof customerProfileId === 'string' && customerProfileId.trim()
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
        console.warn('[PROFILE_SETUP] customerProfileId saknas i databasen, testar fallback', {
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

    const sessionStripeCustomerId =
      typeof authUser.user_metadata?.stripe_customer_id === 'string'
        ? authUser.user_metadata.stripe_customer_id.trim()
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

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, role, is_admin, matching_data')
      .eq('id', userId)
      .single();

    const normalizedTeamRole: ProfileRole =
      role === 'admin' || role === 'content_manager'
        ? role
        : 'content_manager';
    const desiredRole: ProfileRole = isTeamMember ? normalizedTeamRole : 'customer';
    const desiredIsAdmin = Boolean(isTeamMember && normalizedTeamRole === 'admin');
    const existingMatchingData = asJsonObject(existingProfile?.matching_data);
    const existingCustomerProfileId =
      typeof existingMatchingData.customer_profile_id === 'string'
        ? existingMatchingData.customer_profile_id
        : null;

    const needsRoleUpdate = Boolean(
      existingProfile &&
      (
        existingProfile.role !== desiredRole ||
        Boolean(existingProfile.is_admin) !== desiredIsAdmin ||
        (resolvedCustomerProfileId && existingCustomerProfileId !== resolvedCustomerProfileId)
      ),
    );

    if (needsRoleUpdate) {
      const updatePayload: TablesUpdate<'profiles'> = {
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
        console.error('[PROFILE_SETUP] Kunde inte uppdatera profilroll:', updateError);
        return jsonError(updateError.message, 500);
      }

      if (isTeamMember) {
        const normalizedLinkEmail =
          typeof userEmail === 'string' ? userEmail.trim().toLowerCase() : '';
        const { error: linkError } = await supabaseAdmin
          .from('team_members')
          .update({ profile_id: userId })
          .ilike('email', normalizedLinkEmail);

        if (linkError) {
          console.error('[PROFILE_SETUP] Kunde inte koppla teammedlem till profil:', linkError);
        }
      }

      if (!isTeamMember) {
        await activateLinkedCustomerProfile({
          supabaseAdmin,
          customerProfileId: resolvedCustomerProfileId,
        });
      }

      return jsonOk({ success: true, updated: true });
    }

    if (!existingProfile) {
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

      const profileInsert: TablesInsert<'profiles'> = {
          id: userId,
          email: normalizedAuthEmail || `${userId}@invalid.local`,
          business_name: finalBusinessName || 'Mitt foretag',
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
          role: desiredRole,
        };

      const { error: createError } = await supabaseAdmin
        .from('profiles')
        .insert(profileInsert);

      if (createError) {
        console.error('[PROFILE_SETUP] Kunde inte skapa profil:', createError);
        return jsonError(createError.message, 500);
      }

      if (isTeamMember) {
        const normalizedLinkEmail =
          typeof userEmail === 'string' ? userEmail.trim().toLowerCase() : '';
        const { error: linkError } = await supabaseAdmin
          .from('team_members')
          .update({ profile_id: userId })
          .ilike('email', normalizedLinkEmail);

        if (linkError) {
          console.error('[PROFILE_SETUP] Kunde inte koppla teammedlem till profil:', linkError);
        }
      }

      if (!isTeamMember) {
        await activateLinkedCustomerProfile({
          supabaseAdmin,
          customerProfileId: resolvedCustomerProfileId,
        });
      }

      return jsonOk({ success: true, created: true });
    }

    if (!isTeamMember) {
      await activateLinkedCustomerProfile({
        supabaseAdmin,
        customerProfileId: resolvedCustomerProfileId,
      });
    }

    return jsonOk({ success: true, alreadyCorrect: true });
  } catch (error) {
    console.error('[PROFILE_SETUP] Ovantat fel:', error);
    return jsonError('Internt serverfel', 500);
  }
}
