/**
 * Humor Analysis Review Queue API
 * 
 * GET - Returns videos that need humor analysis review
 *       (low confidence or flagged for review)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const confidenceThreshold = parseFloat(searchParams.get('threshold') || '0.6');

    const { data, error } = await supabase.rpc('get_humor_review_queue', {
      p_limit: limit,
      p_confidence_threshold: confidenceThreshold
    });

    if (error) {
      console.error('Failed to get review queue:', error);
      return NextResponse.json(
        { error: 'Failed to get review queue', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      videos: data || []
    });

  } catch (err) {
    console.error('Review queue error:', err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Failed to get review queue'
    }, { status: 500 });
  }
}
