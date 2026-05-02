import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/api-auth';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

export const POST = withAuth(
  async (request: NextRequest, user) => {
    const hagenBase = process.env.HAGEN_BASE_URL;
    if (!hagenBase) {
      return NextResponse.json({ error: 'HAGEN_BASE_URL is not configured' }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const videoId = typeof body?.video_id === 'string' ? body.video_id.trim() : '';

    if (!videoId) {
      return NextResponse.json({ error: 'video_id is required' }, { status: 400 });
    }

    const prepareResponse = await fetch(`${hagenBase}/api/letrend/concept/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: videoId }),
      signal: AbortSignal.timeout(20000),
    });

    const prepared = await prepareResponse.json();
    if (!prepareResponse.ok) {
      return NextResponse.json(prepared, { status: prepareResponse.status });
    }

    const supabase = createSupabaseAdmin();

    const conceptInsert = {
      id: prepared.concept_id,
      source: 'hagen',
      created_by: user.id,
      backend_data: prepared.backend_data,
      overrides: {},
      is_active: false,
      version: 1,
      updated_at: new Date().toISOString(),
    };

    const { data: concept, error } = await supabase
      .from('concepts')
      .upsert(conceptInsert, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      concept,
    });
  },
  ['admin', 'content_manager']
);
