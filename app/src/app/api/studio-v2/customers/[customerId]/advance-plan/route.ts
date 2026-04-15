import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import { motorSignalCleared } from '@/lib/studio/motor-signal';

export const POST = withAuth(
  async (
    _request: NextRequest,
    _user: unknown,
    { params }: { params: Promise<{ customerId: string }> }
  ) => {
    const { customerId } = await params;
    const supabase = createSupabaseAdmin();

    const { error: shiftError } = await supabase.rpc('shift_feed_order', {
      p_customer_id: customerId,
      p_advance_count: 1,
    });

    if (shiftError) {
      return NextResponse.json({ error: shiftError.message }, { status: 500 });
    }

    await supabase
      .from('customer_profiles')
      .update(motorSignalCleared())
      .eq('id', customerId);

    return NextResponse.json({ advanced: 1 });
  },
  ['admin', 'content_manager']
);
