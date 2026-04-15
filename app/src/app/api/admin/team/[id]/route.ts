import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AuthError, validateApiRequest } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, ['admin']);

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Team member ID required' }, { status: 400 });
    }

    if (!user.is_admin && user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin required' }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, phone, bio, region, expertise, start_date, notes, avatar_url } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Namn krävs' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const updatePayload: Record<string, unknown> = {
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      bio: bio?.trim() || null,
      region: region?.trim() || null,
      expertise: Array.isArray(expertise) && expertise.length > 0 ? expertise : null,
      start_date: start_date || null,
      notes: notes?.trim() || null,
    };
    if (avatar_url !== undefined) updatePayload.avatar_url = avatar_url || null;

    const { data, error } = await supabaseAdmin
      .from('team_members')
      .update(updatePayload)
      .eq('id', id)
      .select('id, name, email, phone, role, color, is_active, created_at, profile_id, avatar_url, bio, region, expertise, start_date, notes')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ member: data });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
