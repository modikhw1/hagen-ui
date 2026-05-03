import { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { ADMIN_CUSTOMERS_LIST_TAG } from '@/lib/admin/cache-tags';
import { requireScope, withAuth } from '@/lib/auth/api-auth';
import { createAdminCustomer } from '@/lib/admin/customers/create.server';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

/** @deprecated Prefer app/admin/_actions/billing.inviteCustomer for new callers. */
export const POST = withAuth(async (request: NextRequest, user) => {
  requireScope(user, 'customers.write');

  try {
    const body = await request.json();
    if (body?.send_invite || body?.send_invite_now) {
      requireScope(user, 'customers.invite');
    }

    const result = await createAdminCustomer({
      supabaseAdmin: createSupabaseAdmin(),
      user,
      body,
    });

    if (!result.ok) {
      return jsonError(result.error, result.status, {
        field: result.field,
      });
    }

    revalidateTag(ADMIN_CUSTOMERS_LIST_TAG, 'max');
    return jsonOk(result.payload, result.status);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Internt serverfel',
      500,
    );
  }
}, ['admin']);
