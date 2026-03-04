import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * GET /api/studio/email/history
 * Get email history for a customer
 */
export const GET = withAuth(async (request: NextRequest, user) => {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customer_id');
    const limit = parseInt(searchParams.get('limit') || '20');

    let query = supabase
      .from('email_history')
      .select(`
        *,
        customer_profiles:customer_profile_id (
          business_name
        )
      `)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (customerId) {
      query = query.eq('customer_profile_id', customerId);
    }

    const { data: history, error } = await query;

    if (error) throw error;

    return NextResponse.json({ history: history || [] });

  } catch (error: any) {
    console.error('[history] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['admin', 'content_manager']);
