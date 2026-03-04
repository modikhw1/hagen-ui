import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const GET = withAuth(
  async (request: NextRequest, user) => {
    try {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

      const { data, error } = await supabaseAdmin
        .from('customer_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ profiles: data });
    } catch (error) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  ['admin'] // Only admins can list customers
);

export const POST = withAuth(
  async (request: NextRequest, user) => {
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
        concepts = []
      } = body;

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
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ profile: data });
    } catch (error) {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  ['admin'] // Only admins can create customers
);
