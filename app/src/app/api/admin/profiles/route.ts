import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(async () => {
  try {
    const supabaseAdmin = createSupabaseAdmin();

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profilesError) {
      return jsonError(profilesError.message, 500);
    }

    const profilesWithCustomer = await Promise.all(
      (profiles || []).map(async (profile) => {
        let customerProfile = null;
        const customerProfileId =
          profile.matching_data &&
          typeof profile.matching_data === 'object' &&
          !Array.isArray(profile.matching_data) &&
          typeof profile.matching_data.customer_profile_id === 'string'
            ? profile.matching_data.customer_profile_id
            : null;

        if (customerProfileId) {
          const { data } = await supabaseAdmin
            .from('customer_profiles')
            .select('*')
            .eq('id', customerProfileId)
            .single();
          customerProfile = data;
        }

        return {
          ...profile,
          customer_profile: customerProfile,
        };
      }),
    );

    return jsonOk({ profiles: profilesWithCustomer });
  } catch (error) {
    console.error('[ADMIN_PROFILES] Kunde inte hamta profiler:', error);
    return jsonError('Internt serverfel', 500);
  }
}, ['admin']);

export const PATCH = withAuth(async (request: NextRequest) => {
  try {
    const body = await request.json();
    const {
      id,
      tone,
      energy,
      industry,
      business_name,
      business_description,
      matching_data,
    } = body;

    if (!id) {
      return jsonError('Profil-ID kravs', 400);
    }

    const supabaseAdmin = createSupabaseAdmin();
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
      return jsonError(error.message, 500);
    }

    return jsonOk({ profile: data });
  } catch (error) {
    console.error('[ADMIN_PROFILES] Kunde inte uppdatera profil:', error);
    return jsonError('Internt serverfel', 500);
  }
}, ['admin']);
