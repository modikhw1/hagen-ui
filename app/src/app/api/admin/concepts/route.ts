import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/admin/concepts
 * List all concepts
 */
export const GET = withAuth(async (request: NextRequest, _user) => {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source'); // Filter by source (hagen, cm_created)
    const isActive = searchParams.get('is_active'); // Filter by active status
    const createdBy = searchParams.get('created_by'); // Filter by creator CM
    const limit = parseInt(searchParams.get('limit') || '100');

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    let query = supabaseAdmin
      .from('concepts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (source) {
      query = query.eq('source', source);
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    if (createdBy) {
      query = query.eq('created_by', createdBy);
    }

    const { data: concepts, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ concepts: concepts || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[concepts] GET error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, ['admin', 'content_manager']);

/**
 * POST /api/admin/concepts
 * Create a new concept (CM-created)
 */
export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    const body = await request.json();
    const { id, backend_data, overrides } = body;

    if (!id || !backend_data) {
      return NextResponse.json(
        { error: 'id and backend_data are required' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: concept, error } = await supabaseAdmin
      .from('concepts')
      .insert({
        id,
        source: 'cm_created',
        created_by: user.id,
        backend_data,
        overrides: overrides || {},
        is_active: false,
        version: 1,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const { data: existingConcept, error: existingError } = await supabaseAdmin
          .from('concepts')
          .select('*')
          .eq('id', id)
          .single();

        if (existingError) {
          return NextResponse.json({ error: existingError.message }, { status: 500 });
        }

        return NextResponse.json({ concept: existingConcept, reused: true });
      }

      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ concept });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[concepts] POST error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}, ['admin', 'content_manager']);
