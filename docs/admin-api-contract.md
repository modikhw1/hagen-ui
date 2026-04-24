# Admin API Contract

`/api/admin/**` ska konvergera mot en gemensam wrapper och ett gemensamt svarskontrakt.

## JSON-shape

- Lyckade JSON-svar: `{ data: ... }`
- Felsvar: `{ error: { code, message } }`

CSV/filexporter får returnera rå `Response`, men ska fortfarande använda samma auth- och fellager via wrappern.

## Regler

- Input valideras med `zod` innan handlern körs.
- Output valideras med `zod` när handlern returnerar JSON-data.
- Session verifieras server-side via Supabase SSR-klient.
- Adminbehörighet verifieras server-side via `has_role(user_id, 'admin')`.
- Alla wrappers loggar `{ route, user_id, duration_ms, status, method }`.

## Wrapper

- Primär wrapper: `app/src/lib/admin/with-admin.ts`
- Canary-migrerad route: `app/src/app/api/admin/customers/export/route.ts`

## Exempel

```ts
import { z } from 'zod';
import { withAdmin } from '@/lib/admin/with-admin';

export const GET = withAdmin(
  async ({ input }) => {
    return { count: input.limit };
  },
  {
    input: z.object({ limit: z.coerce.number().int().positive().default(10) }),
    output: z.object({ count: z.number().int().positive() }),
  },
);
```
