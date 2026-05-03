import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { ZodError, type ZodType } from 'zod';
import { logAdminRoute } from '@/lib/admin/logger';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

type AdminErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'INTERNAL_SERVER_ERROR';

type AdminErrorPayload = {
  error: {
    code: AdminErrorCode | string;
    message: string;
  };
};

type WithAdminDeps = {
  getSessionUserId: (request: NextRequest) => Promise<string | null>;
  checkAdminRole: (userId: string) => Promise<boolean>;
  now: () => number;
  log: (entry: { route: string; user_id: string | null; duration_ms: number; status: number; method?: string }) => void;
};

type WithAdminContext<TInput> = {
  request: NextRequest;
  userId: string;
  input: TInput;
};

type WithAdminOptions<TInput, TOutput> = {
  input?: ZodType<TInput>;
  output?: ZodType<TOutput>;
  getInput?: (request: NextRequest) => Promise<unknown> | unknown;
  route?: string;
};

class AdminRouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: AdminErrorCode | string,
    message: string,
  ) {
    super(message);
    this.name = 'AdminRouteError';
  }
}

const jsonError = (status: number, code: AdminErrorCode | string, message: string) =>
  NextResponse.json<AdminErrorPayload>(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );

async function defaultGetSessionUserId() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new AdminRouteError(500, 'INTERNAL_SERVER_ERROR', 'Supabase-klienten ar inte konfigurerad');
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    const message = error.message.toLowerCase();
    if (error.status === 401 || message.includes('auth session missing')) {
      return null;
    }

    throw new AdminRouteError(500, 'INTERNAL_SERVER_ERROR', error.message);
  }

  return user?.id ?? null;
}

async function defaultCheckAdminRole(userId: string) {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc('has_role', {
    _user_id: userId,
    _role: 'admin',
  });

  if (error) {
    throw new AdminRouteError(500, 'INTERNAL_SERVER_ERROR', error.message);
  }

  return Boolean(data);
}

const defaultDeps: WithAdminDeps = {
  getSessionUserId: defaultGetSessionUserId,
  checkAdminRole: defaultCheckAdminRole,
  now: () => Date.now(),
  log: logAdminRoute,
};

function defaultInputResolver(request: NextRequest) {
  if (request.method === 'GET' || request.method === 'DELETE') {
    return Object.fromEntries(request.nextUrl.searchParams.entries());
  }

  return request.json().catch(() => ({}));
}

export function createWithAdmin(overrides: Partial<WithAdminDeps> = {}) {
  const deps: WithAdminDeps = {
    ...defaultDeps,
    ...overrides,
  };

  return function withAdmin<TInput = Record<string, string>, TOutput = unknown>(
    handler: (context: WithAdminContext<TInput>) => Promise<TOutput | Response>,
    options: WithAdminOptions<TInput, TOutput> = {},
  ) {
    return async (request: NextRequest) => {
      const startedAt = deps.now();
      let userId: string | null = null;
      let status = 200;

      try {
        userId = await deps.getSessionUserId(request);
        if (!userId) {
          status = 401;
          return jsonError(401, 'UNAUTHENTICATED', 'Du maste logga in');
        }

        const isAdmin = await deps.checkAdminRole(userId);
        if (!isAdmin) {
          status = 403;
          return jsonError(403, 'FORBIDDEN', 'Du saknar adminbehorighet');
        }

        const rawInput = options.getInput
          ? await options.getInput(request)
          : await defaultInputResolver(request);
        const input = options.input ? options.input.parse(rawInput) : (rawInput as TInput);
        const result = await handler({ request, userId, input });

        if (result instanceof Response) {
          status = result.status;
          return result;
        }

        const output = options.output ? options.output.parse(result) : result;
        status = 200;
        return NextResponse.json({ data: output }, { status: 200 });
      } catch (error) {
        if (error instanceof ZodError) {
          status = 400;
          return jsonError(400, 'BAD_REQUEST', error.issues[0]?.message || 'Ogiltig payload');
        }

        if (error instanceof AdminRouteError) {
          status = error.status;
          return jsonError(error.status, error.code, error.message);
        }

        status = 500;
        return jsonError(500, 'INTERNAL_SERVER_ERROR', 'Internt serverfel');
      } finally {
        deps.log({
          route: options.route ?? request.nextUrl.pathname,
          user_id: userId,
          duration_ms: deps.now() - startedAt,
          status,
          method: request.method,
        });
      }
    };
  };
}

export const withAdmin = createWithAdmin();
