import { NextRequest, NextResponse } from 'next/server';
import { AuthError, validateApiRequest } from '@/lib/auth/api-auth';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} ar inte konfigurerad.`);
  }
  return value;
}

export function getCronSecret() {
  return process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || '';
}

export function isCronAuthorized(request: NextRequest) {
  const cronSecret = getCronSecret();
  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const xSecret = request.headers.get('x-cron-secret') || '';

  return bearer === cronSecret || xSecret === cronSecret;
}

export async function requireCronOrAdmin(request: NextRequest) {
  if (isCronAuthorized(request)) {
    return;
  }

  await validateApiRequest(request, ['admin']);
}

async function readJsonSafe(response: Response): Promise<JsonValue> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return { raw: text };
  }
}

export async function proxySupabaseFunction(
  request: NextRequest,
  functionName: string,
  options: { body?: JsonValue } = {},
) {
  try {
    await requireCronOrAdmin(request);

    const supabaseUrl = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
    const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const cronSecret = getCronSecret();

    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET ar inte konfigurerad.' },
        { status: 503 },
      );
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${cronSecret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(options.body ?? {}),
      cache: 'no-store',
    });

    const payload = await readJsonSafe(response);
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron-proxy misslyckades.' },
      { status: 500 },
    );
  }
}
