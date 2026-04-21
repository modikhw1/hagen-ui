import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { resolveTeamMemberIdForProfile } from '@/lib/interactions';
import type { TablesInsert } from '@/types/database';
import { z } from 'zod';

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
}).strict();

const createDemoSchema = z.object({
  company_name: z.string().trim().min(1).max(200),
  contact_name: z.string().trim().max(200).optional().nullable(),
  contact_email: z.string().trim().email().max(255).optional().nullable(),
  tiktok_handle: z.string().trim().max(120).optional().nullable(),
  tiktok_profile_pic_url: z.string().trim().url().max(2000).optional().nullable(),
  proposed_concepts_per_week: z.number().int().min(1).max(5).optional().nullable(),
  proposed_price_ore: z.number().int().min(0).optional().nullable(),
  preliminary_feedplan: z.record(z.string(), z.unknown()).optional().nullable(),
  status: z.enum(['draft', 'sent', 'opened', 'responded', 'won', 'lost', 'expired']).optional(),
  lost_reason: z.string().trim().max(1000).optional().nullable(),
}).strict();

export const GET = withAuth(async (request: NextRequest) => {
  const parsed = querySchema.safeParse({
    days: new URL(request.url).searchParams.get('days') ?? undefined,
  });

  if (!parsed.success) {
    return jsonError('Ogiltiga query-parametrar', 400);
  }

  const days = parsed.data.days ?? 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const supabase = createSupabaseAdmin();
  const [{ data: demos, error: demosError }, { count: sentCount, error: sentError }, { count: convertedCount, error: convertedError }] = await Promise.all([
    supabase
      .from('demos')
      .select('*')
      .order('status_changed_at', { ascending: false }),
    supabase
      .from('demos')
      .select('id', { count: 'exact', head: true })
      .in('status', ['sent', 'opened', 'responded', 'won', 'lost'])
      .gte('status_changed_at', since),
    supabase
      .from('demos')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'won')
      .gte('resolved_at', since),
  ]);

  if (demosError || sentError || convertedError) {
    return jsonError(
      demosError?.message ||
        sentError?.message ||
        convertedError?.message ||
        'Kunde inte hamta demos',
      500,
    );
  }

  return jsonOk({
    sent: sentCount ?? 0,
    converted: convertedCount ?? 0,
    demos: demos ?? [],
  });
}, ['admin']);

export const POST = withAuth(async (request: NextRequest, user) => {
  const body = await request.json().catch(() => null);
  const parsed = createDemoSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || 'Ogiltig payload', 400);
  }

  const supabase = createSupabaseAdmin();
  const ownerAdminId = await resolveTeamMemberIdForProfile(user.id, supabase);
  const payload = parsed.data;

  const { data, error } = await supabase
    .from('demos')
    .insert({
      ...payload,
      owner_admin_id: ownerAdminId,
      preliminary_feedplan: payload.preliminary_feedplan ?? null,
    } as TablesInsert<'demos'>)
    .select()
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  return jsonOk({ demo: data }, 201);
}, ['admin']);
