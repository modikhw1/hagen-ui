import { NextRequest, NextResponse } from 'next/server';
import { AuthError, validateApiRequest } from '@/lib/auth/api-auth';
import { runStripeOrphanReconcile } from '@/jobs/stripe-orphan-reconcile';

const cronSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || '';

function isAuthorized(request: NextRequest) {
  if (!cronSecret) return false;

  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const xSecret = request.headers.get('x-cron-secret') || '';

  return bearer === cronSecret || xSecret === cronSecret;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      await validateApiRequest(request, ['admin']);
    }

    const result = await runStripeOrphanReconcile();
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Stripe orphan reconciliation failed',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
