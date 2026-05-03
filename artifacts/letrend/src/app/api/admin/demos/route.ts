import { NextRequest } from 'next/server';
import { z } from 'zod';
import { recordAdminAction } from '@/lib/admin/audit';
import { buildDemosBoard, mapDemoRowToDto } from '@/lib/admin/demos';
import {
  createDemoInputSchema,
  demosBoardDtoSchema,
} from '@/lib/admin/schemas/demos';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { resolveTeamMemberIdForProfile } from '@/lib/interactions';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import type { TablesInsert } from '@/types/database';

const querySchema = z
  .object({
    days: z.coerce.number().int().min(1).max(365).optional(),
  })
  .strict();

export const GET = withAuth(async (request: NextRequest, user) => {
  requireScope(user, 'demos.read');

  const parsed = querySchema.safeParse({
    days: new URL(request.url).searchParams.get('days') ?? undefined,
  });

  if (!parsed.success) {
    return jsonError('Ogiltiga query-parametrar', 400);
  }

  try {
    const payload = await buildDemosBoard(createSupabaseAdmin(), parsed.data.days ?? 30);
    const response = jsonOk(demosBoardDtoSchema.parse(payload));
    response.headers.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
    return response;
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Kunde inte h\u00e4mta demos', 500);
  }
}, ['admin', 'content_manager']);

export const POST = withAuth(async (request: NextRequest, user) => {
  requireScope(user, 'demos.write');

  const body = await request.json().catch(() => null);
  const parsed = createDemoInputSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || 'Ogiltig payload', 400);
  }

  const supabase = createSupabaseAdmin();
  const ownerAdminId = await resolveTeamMemberIdForProfile(user.id, supabase);
  const payload = parsed.data;

  const { data, error } = await supabase
    .from('demos')
    .insert({
      company_name: payload.company_name,
      contact_name: payload.contact_name,
      contact_email: payload.contact_email,
      tiktok_handle: payload.tiktok_handle,
      proposed_concepts_per_week: payload.proposed_concepts_per_week ?? null,
      proposed_price_ore: payload.proposed_price_ore ?? null,
      status: payload.status,
      lost_reason: payload.lost_reason ?? null,
      owner_admin_id: ownerAdminId,
    } as TablesInsert<'demos'>)
    .select()
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  const ownerNameById = new Map<string, string>();
  if (ownerAdminId) {
    const { data: owner } = await supabase
      .from('team_members')
      .select('id, name')
      .eq('id', ownerAdminId)
      .maybeSingle();

    if (owner?.id) {
      ownerNameById.set(owner.id, owner.name || 'Ok\u00e4nd \u00e4gare');
    }
  }

  await recordAdminAction(supabase, {
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'demo.create',
    entityType: 'demo',
    entityId: data.id,
    metadata: {
      afterState: data as Record<string, unknown>,
    },
  });

  const response = jsonOk({ demo: mapDemoRowToDto(data, ownerNameById) }, 201);
  response.headers.set('Cache-Control', 'private, no-cache');
  return response;
}, ['admin', 'content_manager']);
