import { withAuth, requireScope } from '@/lib/auth/api-auth';
import { loadCustomerInvoicesSnapshot } from '@/lib/admin/server/customer-billing';
import { jsonError } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const GET = withAuth(async (_request, user, { params }: RouteParams) => {
  requireScope(user, 'customers.read');

  const { id } = await params;
  if (!id) {
    return jsonError('Kund-ID kravs', 400);
  }

  const supabaseAdmin = createSupabaseAdmin();
  const invoices = await loadCustomerInvoicesSnapshot({
    supabaseAdmin,
    customerId: id,
  });

  return new Response(
    JSON.stringify({ invoices }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=10',
      },
    },
  );
}, ['admin']);
