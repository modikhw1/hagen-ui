import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function buildCustomerListPayload(data: unknown[]) {
  return {
    customers: data,
    profiles: data,
  };
}

function buildCustomerPayload(profile: unknown) {
  return {
    customer: profile,
    profile,
  };
}

export const GET = withAuth(
  async () => {
    try {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

      const { data, error } = await supabaseAdmin
        .from('customer_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(buildCustomerListPayload(data ?? []));
    } catch {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  ['admin'] // Only admins can list customers
);

export const POST = withAuth(
  async (request: NextRequest) => {
    try {
      const body = await request.json();

      const {
        business_name,
        contact_email,
        customer_contact_name,
        account_manager,
        monthly_price = 0,
        price_start_date,
        price_end_date,
        subscription_interval = 'month',
        invoice_text,
        scope_items = [],
        contacts = [],
        profile_data = {},
        game_plan = {},
        concepts = [],
        brief,
        tiktok_profile_url,
      } = body;

      // Derive handle from profile URL if provided
      function deriveTikTokHandle(input: string): string | null {
        const trimmed = input.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('http')) {
          try {
            const url = new URL(trimmed);
            const match = url.pathname.match(/^\/@?([^/?&#]+)/);
            return match ? match[1] : null;
          } catch { return null; }
        }
        return trimmed.replace(/^@/, '').trim() || null;
      }
      const tiktokProfileUrl = typeof tiktok_profile_url === 'string' && tiktok_profile_url.trim() ? tiktok_profile_url.trim() : null;
      const tiktokHandle = tiktokProfileUrl ? deriveTikTokHandle(tiktokProfileUrl) : null;

      if (!business_name) {
        return NextResponse.json({ error: 'Business name is required' }, { status: 400 });
      }

      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

      const { data, error } = await supabaseAdmin
        .from('customer_profiles')
        .insert({
          business_name,
          contact_email,
          customer_contact_name,
          account_manager,
          monthly_price,
          price_start_date,
          price_end_date,
          subscription_interval,
          invoice_text,
          scope_items,
          contacts,
          profile_data,
          game_plan,
          concepts,
          ...(brief && typeof brief === 'object' ? { brief } : {}),
          ...(tiktokProfileUrl ? { tiktok_profile_url: tiktokProfileUrl, tiktok_handle: tiktokHandle } : {}),
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(
        buildCustomerPayload(data),
        { status: 201 }
      );
    } catch {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  ['admin'] // Only admins can create customers
);
