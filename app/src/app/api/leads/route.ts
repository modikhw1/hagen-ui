import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, source = 'demo' } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email krävs' }, { status: 400 });
    }

    // Upsert to handle duplicates gracefully
    const { error } = await supabase
      .from('leads')
      .upsert(
        { email, source },
        { onConflict: 'email' }
      );

    if (error) {
      console.error('Lead insert error:', error);
      return NextResponse.json({ error: 'Kunde inte spara' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Leads API error:', error);
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 });
  }
}
