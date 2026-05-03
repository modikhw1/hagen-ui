import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { buildGamePlanDocumentResponse, resolveGamePlanDocument } from '@/lib/game-plan';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(async (_request, user) => {
  const supabase = createSupabaseAdmin();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('matching_data')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const customerProfileId = (profile.matching_data as Record<string, unknown>)
    ?.customer_profile_id as string | undefined;

  if (!customerProfileId) {
    return NextResponse.json({
      business_name: null,
      brief: null,
      game_plan_html: '',
      has_game_plan: false,
    });
  }

  const { data: customerProfile, error: customerProfileError } = await supabase
    .from('customer_profiles')
    .select('business_name, brief, game_plan, account_manager')
    .eq('id', customerProfileId)
    .single();

  if (customerProfileError || !customerProfile) {
    return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 });
  }

  const { data: gamePlanRecord } = await supabase
    .from('customer_game_plans')
    .select('html, plain_text, editor_version, updated_at')
    .eq('customer_id', customerProfileId)
    .maybeSingle();

  const gamePlan = resolveGamePlanDocument(gamePlanRecord, customerProfile.game_plan);
  const gamePlanResponse = buildGamePlanDocumentResponse(gamePlan);

  return NextResponse.json({
    business_name: customerProfile.business_name ?? null,
    brief: customerProfile.brief ?? null,
    cm_name: (customerProfile as unknown as { account_manager?: string | null }).account_manager?.trim() || null,
    game_plan_html: gamePlanResponse.game_plan.html,
    ...gamePlanResponse,
  });
}, ['customer', 'admin', 'content_manager']);
