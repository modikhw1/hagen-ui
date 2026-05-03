import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

/**
 * GET /api/studio-v2/dashboard
 *
 * Returns real-time stats for the CM/studio dashboard:
 * - Total concepts in library
 * - Total customers
 * - Pending invites (customers with status 'pending' or 'invited')
 * - CM's own assigned customers (where account_manager_profile_id = user.id)
 * - 5 most recent customers assigned to this CM
 */
export const GET = withAuth(async (_request, user) => {
  const supabase = createSupabaseAdmin();

  // Run all count queries in parallel
  const [
    conceptsResult,
    customersResult,
    pendingResult,
    myCustomersResult,
    recentCustomersResult,
    recentConceptsResult,
  ] = await Promise.all([
    // Total concepts
    supabase
      .from('concepts')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),

    // Total customers
    supabase
      .from('customer_profiles')
      .select('*', { count: 'exact', head: true }),

    // Pending / invited customers
    supabase
      .from('customer_profiles')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'invited']),

    // My assigned customers count
    supabase
      .from('customer_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('account_manager_profile_id', user.id),

    // My 5 most recent customers
    supabase
      .from('customer_profiles')
      .select('id, business_name, contact_email, status, created_at, monthly_price')
      .eq('account_manager_profile_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5),

    // 5 most recently created concepts
    supabase
      .from('concepts')
      .select('id, created_at, overrides, source')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const stats = {
    totalConcepts: conceptsResult.count ?? 0,
    totalCustomers: customersResult.count ?? 0,
    pendingInvites: pendingResult.count ?? 0,
    myCustomersCount: myCustomersResult.count ?? 0,
    recentUploads: (recentConceptsResult.data ?? []).filter(
      (c) => c.source === 'cm_created'
    ).length,
  };

  const myCustomers = (recentCustomersResult.data ?? []).map((c) => ({
    id: c.id as string,
    business_name: c.business_name as string,
    contact_email: c.contact_email as string,
    status: c.status as string,
    created_at: c.created_at as string,
    monthly_price: c.monthly_price as number,
  }));

  return NextResponse.json({ stats, myCustomers });
}, ['admin', 'content_manager']);
