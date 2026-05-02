import { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';
import type { TablesUpdate } from '@/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function conceptIdError() {
  return jsonError('Koncept-ID kravs', 400);
}

export const GET = withAuth(
  async (_request: NextRequest, _user, { params }: RouteParams) => {
    try {
      const { id } = await params;

      if (!id) {
        return conceptIdError();
      }

      const supabaseAdmin = createSupabaseAdmin();
      const { data: concept, error } = await supabaseAdmin
        .from('concepts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return jsonError('Konceptet hittades inte', 404);
        }
        return jsonError(error.message, 500);
      }

      return jsonOk({ concept });
    } catch (error) {
      console.error('[concepts/[id]] GET error:', error);
      return jsonError('Internt serverfel', 500);
    }
  },
  ['admin', 'content_manager'],
);

export const PUT = withAuth(
  async (request: NextRequest, user, { params }: RouteParams) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const { backend_data, overrides, is_active, reviewed, change_summary } = body;

      if (!id) {
        return conceptIdError();
      }

      const supabaseAdmin = createSupabaseAdmin();
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

      if (backend_data || overrides) {
        const { data: current, error: currentError } = await supabaseAdmin
          .from('concepts')
          .select('backend_data, overrides')
          .eq('id', id)
          .single();

        if (currentError) {
          if (currentError.code === 'PGRST116') {
            return jsonError('Konceptet hittades inte', 404);
          }
          return jsonError(currentError.message, 500);
        }

        const { data, error } = await supabaseAdmin.rpc(
          'update_concept_with_version',
          {
            p_concept_id: id,
            p_backend_data: backend_data || current.backend_data,
            p_overrides: overrides || current.overrides,
            p_changed_by: user.id,
            p_change_summary: change_summary || 'Uppdaterad fran admin',
          },
        );

        if (error) {
          return jsonError(error.message, 500);
        }

        if (is_active === undefined && reviewed === undefined) {
          return jsonOk({ concept: data });
        }

        const postVersionUpdate: TablesUpdate<'concepts'> = {
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
          return jsonError(updateError.message, 500);
        }

        return jsonOk({ concept: updatedConcept });
      }

      const updateData: TablesUpdate<'concepts'> = {
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
        return jsonError(error.message, 500);
      }

      return jsonOk({ concept });
    } catch (error) {
      console.error('[concepts/[id]] PUT error:', error);
      return jsonError('Internt serverfel', 500);
    }
  },
  ['admin', 'content_manager'],
);

export const DELETE = withAuth(
  async (_request: NextRequest, _user, { params }: RouteParams) => {
    try {
      const { id } = await params;

      if (!id) {
        return conceptIdError();
      }

      const supabaseAdmin = createSupabaseAdmin();
      const { count, error: countError } = await supabaseAdmin
        .from('customer_concepts')
        .select('*', { count: 'exact', head: true })
        .eq('concept_id', id);

      if (countError) {
        return jsonError(countError.message, 500);
      }

      if (count && count > 0) {
        return jsonError(
          `Konceptet kan inte tas bort eftersom det ar kopplat till ${count} kund${count === 1 ? '' : 'er'}. Satt is_active=false i stallet.`,
          400,
        );
      }

      const { error } = await supabaseAdmin
        .from('concepts')
        .delete()
        .eq('id', id);

      if (error) {
        return jsonError(error.message, 500);
      }

      return jsonOk({ success: true });
    } catch (error) {
      console.error('[concepts/[id]] DELETE error:', error);
      return jsonError('Internt serverfel', 500);
    }
  },
  ['admin'],
);
