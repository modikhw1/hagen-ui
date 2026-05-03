import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { revalidateTag } from 'next/cache';
import { adminCustomerTag } from '@/lib/admin/cache-tags';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const GET = withAuth(
  async (_request, _user, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (!id) return jsonError('Kund-ID krävs', 400);

    try {
      const supabaseAdmin = createSupabaseAdmin();
      const result = await (supabaseAdmin.from as any)('admin_customer_notes')
        .select('id, body, pinned, author_name, author_user_id, created_at, updated_at')
        .eq('customer_profile_id', id)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);

      if (result.error) {
        // tabell saknas — returnera tom lista istället för fel
        const msg = String(result.error?.message ?? '').toLowerCase();
        if (msg.includes('relation') && msg.includes('does not exist')) {
          return jsonOk({ notes: [], schemaWarnings: ['admin_customer_notes saknas'] });
        }
        return jsonError(result.error.message || 'Kunde inte hämta anteckningar', 500);
      }

      return jsonOk({ notes: result.data ?? [] });
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : 'Kunde inte hämta anteckningar',
        500,
      );
    }
  },
  ['admin'],
);

export const POST = withAuth(
  async (request, user, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (!id) return jsonError('Kund-ID krävs', 400);

    let payload: { body?: unknown; pinned?: unknown };
    try {
      payload = await request.json();
    } catch {
      return jsonError('Ogiltig JSON', 400);
    }

    const body = typeof payload.body === 'string' ? payload.body.trim() : '';
    if (!body) return jsonError('Anteckning får inte vara tom', 400);
    if (body.length > 4000) return jsonError('Anteckning är för lång (max 4000 tecken)', 400);

    const pinned = payload.pinned === true;
    const authorName =
      (user as any)?.email ||
      (user as any)?.full_name ||
      (user as any)?.name ||
      null;

    try {
      const supabaseAdmin = createSupabaseAdmin();
      const result = await (supabaseAdmin.from as any)('admin_customer_notes')
        .insert({
          customer_profile_id: id,
          author_user_id: (user as any)?.id ?? null,
          author_name: authorName,
          body,
          pinned,
        })
        .select('id, body, pinned, author_name, author_user_id, created_at, updated_at')
        .single();

      if (result.error) {
        return jsonError(result.error.message || 'Kunde inte spara anteckningen', 500);
      }

      revalidateTag(adminCustomerTag(id), 'max');
      return jsonOk({ note: result.data });
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : 'Kunde inte spara anteckningen',
        500,
      );
    }
  },
  ['admin'],
);
