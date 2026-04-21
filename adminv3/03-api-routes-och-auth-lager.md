# 03 – API-routes och auth-lager

> De flesta API-routerna finns redan i bundlen och är produktionsdugliga.
> Detta dokument täcker: (1) full implementation av `lib/auth/api-auth.ts`,
> (2) Zod-schemas som vissa routes refererar, (3) `lib/server/supabase-admin.ts`,
> (4) checklista över routes från bundlen som ska kopieras in oförändrat.

## 1. `lib/auth/api-auth.ts` (full kod)

```ts
import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export type AppRole = 'admin' | 'content_manager' | 'customer' | 'user';

export interface AuthUser {
  id: string;
  email: string | null;
  role: AppRole;
  is_admin: boolean;
}

export class AuthError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function validateApiRequest(
  request: NextRequest,
  allowedRoles: AppRole[] = ['admin']
): Promise<AuthUser> {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new AuthError('Unauthorized', 401);

  // Hämta roll via service-role för att kringgå RLS
  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: profile } = await admin
    .from('profiles')
    .select('role, is_admin, email')
    .eq('id', session.user.id)
    .maybeSingle();

  // Fallback: läs user_roles om profile saknas
  let role: AppRole = (profile?.role as AppRole) ?? 'user';
  let isAdmin = Boolean(profile?.is_admin);
  if (!profile) {
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', session.user.id);
    if (roles?.some((r) => r.role === 'admin')) { role = 'admin'; isAdmin = true; }
    else if (roles?.some((r) => r.role === 'content_manager')) role = 'content_manager';
    else if (roles?.some((r) => r.role === 'customer')) role = 'customer';
  }

  if (!allowedRoles.includes(role) && !(allowedRoles.includes('admin') && isAdmin)) {
    throw new AuthError('Insufficient permissions', 403);
  }

  return { id: session.user.id, email: session.user.email ?? profile?.email ?? null, role, is_admin: isAdmin };
}

type RouteHandler<T = any> = (
  request: NextRequest,
  user: AuthUser,
  ctx: T
) => Promise<Response> | Response;

export function withAuth<T = any>(handler: RouteHandler<T>, allowedRoles: AppRole[] = ['admin']) {
  return async (request: NextRequest, ctx: T) => {
    try {
      const user = await validateApiRequest(request, allowedRoles);
      return await handler(request, user, ctx);
    } catch (err) {
      if (err instanceof AuthError) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: err.statusCode,
          headers: { 'content-type': 'application/json' },
        });
      }
      console.error('[withAuth] error', err);
      return new Response(JSON.stringify({ error: (err as Error)?.message ?? 'Internal' }), {
        status: 500, headers: { 'content-type': 'application/json' },
      });
    }
  };
}
```

## 2. `lib/server/supabase-admin.ts`

```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export function createSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

## 3. `lib/url/public.ts`

```ts
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
}
```

## 4. Saknade Zod-scheman

`lib/schemas/customer-discount.ts`:

```ts
import { z } from 'zod';
export const customerDiscountSchema = z.object({
  type: z.enum(['percent', 'amount', 'free_months']),
  value: z.number().positive(),
  duration_months: z.number().int().positive().optional().nullable(),
  ongoing: z.boolean().default(false),
}).strict();
```

`lib/schemas/customer.ts` — full version finns i bundle 02 (rad 996+). Komplettera med fält som visas där.

## 5. `lib/studio/account-manager.ts`

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export async function resolveAccountManagerAssignment(
  supabaseAdmin: SupabaseClient,
  managerHint: string | null | undefined
) {
  if (!managerHint) return { accountManager: null, accountManagerProfileId: null };
  const hint = managerHint.trim();
  // Försök matcha team_members på email först, sen namn
  const { data } = await supabaseAdmin
    .from('team_members')
    .select('id, name, email, profile_id')
    .or(`email.ilike.${hint},name.ilike.${hint}`)
    .maybeSingle();
  if (!data) return { accountManager: hint, accountManagerProfileId: null };
  return { accountManager: data.email || data.name, accountManagerProfileId: data.profile_id };
}
```

## 6. Routes som kopieras oförändrat från bundles

Använd dem precis som de är (bara fixa importer för aliaset):

| Route | Bundle | Anteckningar |
|-------|--------|--------------|
| `app/api/admin/customers/route.ts` | 09 | GET/POST |
| `app/api/admin/customers/[id]/route.ts` | 02 | GET/PATCH/DELETE — innehåller send_invite-action med Stripe |
| `app/api/admin/customers/[id]/discount/route.ts` | 02 | POST/DELETE |
| `app/api/admin/customers/[id]/invoice-items/route.ts` | 04 | GET/POST |
| `app/api/admin/customers/[id]/invoice-items/[itemId]/route.ts` | 07 | DELETE |
| `app/api/admin/customers/[id]/tiktok-stats/route.ts` | 07 | GET (TikTok) |
| `app/api/admin/customers/decline-agreement/route.ts` | 06 | POST |
| `app/api/admin/invoices/route.ts` | 07 | GET (med env-filter) |
| `app/api/admin/invoices/create/route.ts` | 04 | POST manuell faktura |
| `app/api/admin/subscriptions/route.ts` | 09 | GET |
| `app/api/admin/billing-health/route.ts` | 06 | GET |
| `app/api/admin/billing-health/log/route.ts` | 02 | GET |
| `app/api/admin/team/route.ts` | 10 | GET/POST/resend |
| `app/api/admin/team/[id]/route.ts` | 04 | PATCH/DELETE |
| `app/api/admin/profiles/route.ts` | 03 | GET/PATCH |
| `app/api/admin/profiles/check/route.ts` | 06 | GET |
| `app/api/admin/profiles/setup/route.ts` | 05 | POST |
| `app/api/admin/profiles/update-stripe/route.ts` | 10 | POST |
| `app/api/admin/concepts/route.ts` | 09 | GET/POST |
| `app/api/admin/concepts/[id]/route.ts` | 03 | GET/PUT/DELETE |
| `app/api/admin/concepts/translate-vertex/route.ts` | 04 | POST |
| `app/api/admin/tiktok-summary/route.ts` | 03 | GET |
| `app/api/admin/service-costs/route.ts` | 06 | GET |
| `app/api/admin/demos/route.ts` | 04 | GET (stub) |
| `app/api/admin/test-email/route.ts` | 06 | POST (Resend) |
| `app/api/admin/migrate-stripe/route.ts` | 04 | POST (utility) |
| `app/api/studio/stripe/sync-invoices/route.ts` | 01 | POST/GET |
| `app/api/studio/stripe/sync-subscriptions/route.ts` | 08 | POST |
| `app/api/studio/stripe/status/route.ts` | 07 | GET/POST |

## Checklista

- [ ] Skriv `lib/auth/api-auth.ts`, `lib/server/supabase-admin.ts`, `lib/url/public.ts`
- [ ] Skriv `lib/schemas/customer.ts` (från bundle 02), `customer-discount.ts`
- [ ] Skriv `lib/studio/account-manager.ts`, `lib/billing/first-invoice.ts` (bundle 04), `lib/activity/logger.ts` (bundle 03)
- [ ] Kopiera in alla routes från tabellen ovan
- [ ] Testa: `curl -b cookies.txt http://localhost:3000/api/admin/customers` ⇒ 200 som admin, 403 som CM, 401 anonym

Klart? Gå till `04-ui-paritet-komponenter-hooks-sidor.md`.
