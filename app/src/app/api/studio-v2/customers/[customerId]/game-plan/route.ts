import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { logGamePlanUpdated } from '@/lib/activity/logger';
import {
  buildGamePlanDocumentResponse,
  buildGamePlanWritePayload,
  buildLegacyGamePlanMirror,
  resolveGamePlanDocument,
} from '@/lib/game-plan';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(async (_request, _user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const supabase = createSupabaseAdmin();

  const { data: customerProfile, error: customerError } = await supabase
    .from('customer_profiles')
    .select('game_plan')
    .eq('id', customerId)
    .single();

  if (customerError || !customerProfile) {
    return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 });
  }

  const { data: gamePlanRecord } = await supabase
    .from('customer_game_plans')
    .select('customer_id, html, plain_text, editor_version, updated_by, created_at, updated_at')
    .eq('customer_id', customerId)
    .maybeSingle();

  const gamePlan = resolveGamePlanDocument(gamePlanRecord, customerProfile.game_plan);

  return NextResponse.json(buildGamePlanDocumentResponse(gamePlan));
}, ['admin', 'content_manager']);

export const PUT = withAuth(async (request, user, { params }: { params: Promise<{ customerId: string }> }) => {
  const { customerId } = await params;
  const body = await request.json().catch(() => ({}));
  const supabase = createSupabaseAdmin();

  const writePayload = buildGamePlanWritePayload(body?.html, user.id);

  const { data: customerProfile, error: customerError } = await supabase
    .from('customer_profiles')
    .select('id')
    .eq('id', customerId)
    .single();

  if (customerError || !customerProfile) {
    return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 });
  }

  const { data: gamePlanRecord, error: gamePlanError } = await supabase
    .from('customer_game_plans')
    .upsert({
      customer_id: customerId,
      html: writePayload.html,
      plain_text: writePayload.plain_text,
      editor_version: writePayload.editor_version,
      updated_by: writePayload.updated_by,
      updated_at: writePayload.updated_at,
    }, { onConflict: 'customer_id' })
    .select('customer_id, html, plain_text, editor_version, updated_by, created_at, updated_at')
    .single();

  if (gamePlanError) {
    return NextResponse.json({ error: gamePlanError.message }, { status: 500 });
  }

  const { error: legacyMirrorError } = await supabase
    .from('customer_profiles')
    .update({
      game_plan: buildLegacyGamePlanMirror(writePayload.html, writePayload.updated_at),
    })
    .eq('id', customerId);

  if (legacyMirrorError) {
    return NextResponse.json({ error: legacyMirrorError.message }, { status: 500 });
  }

  await logGamePlanUpdated(user.id, user.email, customerId);

  const resolvedGamePlan = resolveGamePlanDocument(gamePlanRecord, null);

  return NextResponse.json(buildGamePlanDocumentResponse(resolvedGamePlan));
}, ['admin', 'content_manager']);
