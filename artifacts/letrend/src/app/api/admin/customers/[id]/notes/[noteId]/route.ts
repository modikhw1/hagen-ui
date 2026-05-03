import { revalidateTag } from 'next/cache';

import { adminCustomerTag } from '@/lib/admin/cache-tags';
import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const PATCH = withAuth(
  async (
    request,
    _user,
    { params }: { params: Promise<{ id: string; noteId: string }> },
  ) => {
    const { id, noteId } = await params;
    if (!id || !noteId) return jsonError('Saknar id', 400);

    let payload: { body?: unknown; pinned?: unknown };
    try {
      payload = await request.json();
    } catch {
      return jsonError('Ogiltig JSON', 400);
    }

    const update: Record<string, unknown> = {};
    if (typeof payload.body === 'string') {
      const body = payload.body.trim();
      if (!body) return jsonError('Anteckning får inte vara tom', 400);
      if (body.length > 4000) return jsonError('Anteckning är för lång', 400);
      update.body = body;
    }
    if (typeof payload.pinned === 'boolean') update.pinned = payload.pinned;
    if (Object.keys(update).length === 0) return jsonError('Inget att uppdatera', 400);

    try {
      const supabaseAdmin = createSupabaseAdmin();
      const result = await (supabaseAdmin.from as any)('admin_customer_notes')
        .update(update)
        .eq('id', noteId)
        .eq('customer_profile_id', id)
        .select('id, body, pinned, author_name, author_user_id, created_at, updated_at')
        .single();

      if (result.error) {
        return jsonError(result.error.message || 'Kunde inte uppdatera', 500);
      }

      revalidateTag(adminCustomerTag(id), 'max');
      return jsonOk({ note: result.data });
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : 'Kunde inte uppdatera',
        500,
      );
    }
  },
  ['admin'],
);

export const DELETE = withAuth(
  async (
    _request,
    _user,
    { params }: { params: Promise<{ id: string; noteId: string }> },
  ) => {
    const { id, noteId } = await params;
    if (!id || !noteId) return jsonError('Saknar id', 400);

    try {
      const supabaseAdmin = createSupabaseAdmin();
      const result = await (supabaseAdmin.from as any)('admin_customer_notes')
        .delete()
        .eq('id', noteId)
        .eq('customer_profile_id', id);

      if (result.error) {
        return jsonError(result.error.message || 'Kunde inte ta bort', 500);
      }

      revalidateTag(adminCustomerTag(id), 'max');
      return jsonOk({ ok: true });
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : 'Kunde inte ta bort',
        500,
      );
    }
  },
  ['admin'],
);
