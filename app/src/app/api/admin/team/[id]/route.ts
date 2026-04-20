import { NextRequest } from 'next/server';
import { AuthError, validateApiRequest } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, ['admin']);
    const { id } = await params;

    if (!id) {
      return jsonError('Teammedlems-ID kravs', 400);
    }

    if (!user.is_admin && user.role !== 'admin') {
      return jsonError('Adminbehorighet kravs', 403);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('team_members')
      .select('id, name, email, phone, role, color, is_active, created_at, profile_id, avatar_url, bio, region, expertise, start_date, notes, invited_at')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return jsonError(error.message, 500);
    }

    if (!data) {
      return jsonError('Teammedlem hittades inte', 404);
    }

    return jsonOk({ member: data });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.statusCode);
    }

    return jsonError(
      error instanceof Error ? error.message : 'Internt serverfel',
      500,
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, ['admin']);
    const { id } = await params;

    if (!id) {
      return jsonError('Teammedlems-ID kravs', 400);
    }

    if (!user.is_admin && user.role !== 'admin') {
      return jsonError('Adminbehorighet kravs', 403);
    }

    const body = await request.json();
    const { name, email, phone, bio, city, region, expertise, start_date, notes, avatar_url } = body;

    if (!name?.trim()) {
      return jsonError('Namn kravs', 400);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const updatePayload: Record<string, unknown> = {
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      bio: bio?.trim() || null,
      region: city?.trim() || region?.trim() || null,
      expertise: Array.isArray(expertise) && expertise.length > 0 ? expertise : null,
      start_date: start_date || null,
      notes: notes?.trim() || null,
    };

    if (avatar_url !== undefined) {
      updatePayload.avatar_url = avatar_url || null;
    }

    const { data, error } = await supabaseAdmin
      .from('team_members')
      .update(updatePayload as never)
      .eq('id', id)
      .select('id, name, email, phone, role, color, is_active, created_at, profile_id, avatar_url, bio, region, expertise, start_date, notes, invited_at')
      .single();

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonOk({ member: data });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.statusCode);
    }

    return jsonError(
      error instanceof Error ? error.message : 'Internt serverfel',
      500,
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, ['admin']);
    const { id } = await params;

    if (!id) {
      return jsonError('Teammedlems-ID kravs', 400);
    }

    if (!user.is_admin && user.role !== 'admin') {
      return jsonError('Adminbehorighet kravs', 403);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from('team_members')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      return jsonError(error.message, 500);
    }

    return jsonOk({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(error.message, error.statusCode);
    }

    return jsonError(
      error instanceof Error ? error.message : 'Internt serverfel',
      500,
    );
  }
}
