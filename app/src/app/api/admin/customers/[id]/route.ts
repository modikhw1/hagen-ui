import { NextRequest } from 'next/server';
import { dispatchCustomerAction } from '@/lib/admin/customer-actions/dispatcher';
import { handleArchiveCustomer } from '@/lib/admin/customer-actions/archive';
import { createAdminActionContext } from '@/lib/admin/customer-actions/context';
import { buildRouteErrorResponse } from '@/lib/admin/customer-actions/shared';
import { updateCustomerProfile } from '@/lib/admin/customer-actions/update-profile';
import { loadCustomerDetail } from '@/lib/admin/customer-detail/load';
import { validateApiRequest } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, ['admin', 'customer', 'content_manager']);
    const { id } = await params;
    if (!id) return jsonError('Kund-ID kravs', 400);
    return jsonOk(await loadCustomerDetail({ supabaseAdmin: createSupabaseAdmin(), id, user }));
  } catch (error) {
    return buildRouteErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!id) return jsonError('Kund-ID kravs', 400);
    const body = await request.json();
    const ctx = await createAdminActionContext(request, id);
    const result =
      typeof body?.action === 'string'
        ? await dispatchCustomerAction(ctx, body)
        : await updateCustomerProfile(ctx, body);
    return result instanceof Response ? result : jsonOk(result);
  } catch (error) {
    return buildRouteErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!id) return jsonError('Kund-ID kravs', 400);
    const result = await handleArchiveCustomer(
      await createAdminActionContext(request, id),
    );
    return result instanceof Response ? result : jsonOk(result);
  } catch (error) {
    return buildRouteErrorResponse(error);
  }
}
