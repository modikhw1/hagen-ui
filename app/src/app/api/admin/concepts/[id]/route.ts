import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateApiRequest } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/concepts/[id]
 * Get a single concept by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate authentication
    await validateApiRequest(request, ['admin', 'content_manager']);

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Concept ID required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: concept, error } = await supabaseAdmin
      .from('concepts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ concept });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[concepts/[id]] GET error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/concepts/[id]
 * Update a concept (creates version history)
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate authentication (admin and content_manager can update overrides/is_active)
    const user = await validateApiRequest(request, ['admin', 'content_manager']);

    const { id } = await params;
    const body = await request.json();
    const { backend_data, overrides, is_active, reviewed, change_summary } = body;

    if (!id) {
      return NextResponse.json({ error: 'Concept ID required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const reviewedFields =
      reviewed === undefined
        ? {}
        : reviewed
          ? {
              reviewed_at: new Date().toISOString(),
              reviewed_by: user.id,
            }
          : {
              reviewed_at: null,
              reviewed_by: null,
            };

    // If updating backend_data or overrides, use the version function
    if (backend_data || overrides) {
      // Fetch current concept
      const { data: current } = await supabaseAdmin
        .from('concepts')
        .select('backend_data, overrides')
        .eq('id', id)
        .single();

      if (!current) {
        return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
      }

      // Call update_concept_with_version function
      const { data, error } = await supabaseAdmin
        .rpc('update_concept_with_version', {
          p_concept_id: id,
          p_backend_data: backend_data || current.backend_data,
          p_overrides: overrides || current.overrides,
          p_changed_by: user.id,
          p_change_summary: change_summary || 'Updated from Studio',
        });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (is_active === undefined && reviewed === undefined) {
        return NextResponse.json({ concept: data });
      }

      const postVersionUpdate: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        ...reviewedFields,
      };

      if (is_active !== undefined) {
        postVersionUpdate.is_active = is_active;
        if (is_active === true && reviewed === undefined) {
          postVersionUpdate.reviewed_at = new Date().toISOString();
          postVersionUpdate.reviewed_by = user.id;
        }
      }

      const { data: updatedConcept, error: updateError } = await supabaseAdmin
        .from('concepts')
        .update(postVersionUpdate)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ concept: updatedConcept });
    }

    // Simple update (e.g., is_active toggle)
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      ...reviewedFields,
    };

    if (is_active !== undefined) {
      updateData.is_active = is_active;
      if (is_active === true && reviewed === undefined) {
        updateData.reviewed_at = new Date().toISOString();
        updateData.reviewed_by = user.id;
      }
    }

    const { data: concept, error } = await supabaseAdmin
      .from('concepts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ concept });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[concepts/[id]] PUT error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/concepts/[id]
 * Delete a concept (only if not used by any customers)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    // Validate authentication (only admin can delete)
    await validateApiRequest(request, ['admin']);

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Concept ID required' }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if concept is used by any customers
    const { count } = await supabaseAdmin
      .from('customer_concepts')
      .select('*', { count: 'exact', head: true })
      .eq('concept_id', id);

    if (count && count > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete: concept is assigned to ${count} customer(s). Set is_active=false instead.`,
        },
        { status: 400 }
      );
    }

    // Delete concept
    const { error } = await supabaseAdmin.from('concepts').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[concepts/[id]] DELETE error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
