import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/api-auth';
import { resolveTeamMemberIdForProfile } from '@/lib/interactions';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import type { TablesInsert } from '@/types/database';

const createNotificationSchema = z.object({
  message: z.string().trim().min(5, 'Skriv minst 5 tecken.').max(1000, 'Meddelandet ar for langt.'),
  priority: z.enum(['normal', 'urgent']).default('normal'),
});

interface RouteParams {
  params: Promise<{ customerId: string }>;
}

export const POST = withAuth(
  async (request: NextRequest, user, { params }: RouteParams) => {
    const { customerId } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = createNotificationSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || 'Ogiltig payload.', 400);
    }

    const supabase = createSupabaseAdmin();
    const teamMemberId = await resolveTeamMemberIdForProfile(user.id, supabase);

    if (!teamMemberId) {
      return jsonError('Kunde inte koppla din anvandare till en aktiv teammedlem.', 409);
    }

    const insert: TablesInsert<'cm_notifications'> = {
      customer_id: customerId,
      from_cm_id: teamMemberId,
      message: parsed.data.message,
      priority: parsed.data.priority,
    };

    const { data, error } = await supabase
      .from('cm_notifications')
      .insert(insert)
      .select()
      .single();

    if (error) {
      return jsonError(error.message || 'Kunde inte skapa CM-notisen.', 500);
    }

    return jsonOk({ notification: data }, 201);
  },
  ['admin', 'content_manager'],
);
