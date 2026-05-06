# B-1/B-2 Patch Plan — Express Customer Create + Initial TikTok Ingest

**Date:** 2026-05-06  
**Scope:** Fix the stubbed `POST /api/admin/customers/create` handler so that:
1. Invite email is sent via Supabase Auth + Resend when `send_invite_now: true`
2. `tiktok_handle` is written to DB at create time (currently missing — cron never triggers)
3. `triggerInitialTikTokSyncBackground` is called immediately after insert when handle is present

**Related audit findings:** B-1 (HIGH), B-2 (MEDIUM) in `docs/audits/hagen-letrend-ingestion-audit.md`

---

## Current State

### What exists and where

| Component | Location | Status |
|---|---|---|
| Express `/create` stub | `artifacts/api-server/src/routes/admin/customers.ts:1163–1213` | Plain `.insert()`, always returns `inviteSent: false`, never writes `tiktok_handle` |
| Dead Next.js server action | `artifacts/letrend/src/lib/admin/customers/create.server.ts` | Full logic (RPC, invite, activity log) — unreachable at runtime; `sendCustomerInvite` traces to a browser stub that throws |
| `InviteCustomerModal.tsx` | `artifacts/letrend/src/components/admin/customers/InviteCustomerModal.tsx:122–136` | Already handles `inviteSent: true/false` correctly — `toast.success` vs `toast.warning` with warnings text |
| Resend (dynamic import) | `artifacts/api-server/src/routes/studio-v2.ts:1081` | Working pattern: `await import('resend')` + `RESEND_API_KEY` env var |
| `triggerInitialTikTokSyncBackground` | `artifacts/api-server/src/lib/studio/tiktok-sync.ts:1011` | Exported, fire-and-forget, already used via dynamic import in PATCH handler at `customers.ts:315` |
| TikTok handle normalization | `artifacts/letrend/src/lib/tiktok/customer-profile-link.ts` | Client-side only — not importable in api-server. PATCH handler uses inline regex `match(/@([\w.]+)/)` + lowercase |
| `supabase.auth.admin.generateLink` | Supabase service role client | Available — api-server already uses service role via `createSupabaseAdmin()` |

---

## What to Change

### Only 1 file changes: `artifacts/api-server/src/routes/admin/customers.ts`

Replace lines **1163–1213** (the stub handler) with the implementation below.

**No frontend changes needed** — `InviteCustomerModal.tsx` response handling is already correct.  
**Do not touch** `create.server.ts` — dead code cleanup is tracked separately as C-2.  
**Do not touch** feed planner or demos.

---

## Patch

Replace the entire `router.post('/create', ...)` block with:

```typescript
// POST /api/admin/customers/create
router.post('/create', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body as Record<string, unknown>;
    const sendInviteNow = body.send_invite_now === true;

    // ── TikTok: extract handle inline from profile URL ──────────────────────
    const rawTikTokUrl = typeof body.tiktok_profile_url === 'string' ? body.tiktok_profile_url.trim() : '';
    let tiktokProfileUrl: string | null = null;
    let tiktokHandle: string | null = null;
    if (rawTikTokUrl) {
      const handleMatch = rawTikTokUrl.match(/@([\w.]+)/);
      tiktokHandle = handleMatch ? handleMatch[1].toLowerCase() : null;
      tiktokProfileUrl = tiktokHandle ? `https://www.tiktok.com/@${tiktokHandle}` : null;
    }

    const insert: Record<string, unknown> = {
      business_name: typeof body.business_name === 'string' ? body.business_name.trim() : null,
      contact_email: typeof body.contact_email === 'string' ? body.contact_email.trim().toLowerCase() : null,
      customer_contact_name: typeof body.customer_contact_name === 'string' ? body.customer_contact_name.trim() : null,
      phone: typeof body.phone === 'string' ? body.phone.trim() : null,
      account_manager: typeof body.account_manager === 'string' ? body.account_manager.trim() : null,
      account_manager_profile_id: typeof body.account_manager_profile_id === 'string' ? body.account_manager_profile_id : null,
      monthly_price: typeof body.monthly_price === 'number' ? body.monthly_price : null,
      status: sendInviteNow ? 'invited' : 'draft',
      concepts_per_week: typeof body.concepts_per_week === 'number' ? body.concepts_per_week : 1,
      subscription_interval: typeof body.subscription_interval === 'string' ? body.subscription_interval : 'month',
      tiktok_profile_url: tiktokProfileUrl,
      tiktok_handle: tiktokHandle,
      contract_start_date: typeof body.contract_start_date === 'string' ? body.contract_start_date : null,
      billing_day_of_month: typeof body.billing_day_of_month === 'number' ? body.billing_day_of_month : 25,
      ...(sendInviteNow ? { invited_at: new Date().toISOString() } : {}),
    };

    const { data, error } = await supabase
      .from('customer_profiles')
      .insert(insert)
      .select('id, business_name, contact_email, status, tiktok_handle')
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const customer = data as Record<string, unknown>;
    const customerId = customer.id as string;
    const contactEmail = customer.contact_email as string | null;
    const businessName = customer.business_name as string | null;
    const savedHandle = customer.tiktok_handle as string | null;

    let inviteSent = false;
    const warnings: string[] = [];

    // ── Invite email: Supabase Auth invite link + Resend ────────────────────
    if (sendInviteNow && contactEmail) {
      try {
        const redirectTo = `${req.protocol}://${req.headers.host}/studio`;
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'invite',
          email: contactEmail,
          options: { redirectTo },
        });

        if (linkError || !linkData?.properties?.action_link) {
          warnings.push(`Supabase invite-länk kunde inte skapas: ${linkError?.message ?? 'okänt fel'}`);
        } else {
          const inviteUrl = linkData.properties.action_link;
          const resendApiKey = process.env['RESEND_API_KEY'];

          if (!resendApiKey) {
            warnings.push('RESEND_API_KEY saknas — e-post skickades inte.');
          } else {
            // Same dynamic import pattern as studio-v2.ts:1081
            const ResendMod = await (import('resend').catch(() => null)) as {
              Resend: new (key: string) => {
                emails: {
                  send: (opts: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
                };
              };
            } | null;

            if (!ResendMod) {
              warnings.push('Resend-paketet saknas — e-post skickades inte.');
            } else {
              const resend = new ResendMod.Resend(resendApiKey);
              const fromEmail = process.env['RESEND_FROM_EMAIL'] ?? 'LeTrend <hej@letrend.se>';
              const greeting = businessName ? ` till ${businessName}` : '';
              const html = [
                `<p>Hej!</p>`,
                `<p>Du har blivit inbjuden${greeting} på LeTrend-plattformen.</p>`,
                `<p><a href="${inviteUrl}">Aktivera ditt konto</a></p>`,
                `<p>Länken är giltig i 24 timmar.</p>`,
                `<p>Välkommen!<br>LeTrend-teamet</p>`,
              ].join('\n');

              const { error: sendError } = await resend.emails.send({
                from: fromEmail,
                to: [contactEmail],
                subject: 'Du är inbjuden till LeTrend',
                html,
              });

              if (sendError) {
                warnings.push(`E-post kunde inte skickas: ${sendError.message ?? 'okänt fel'}`);
              } else {
                inviteSent = true;
              }
            }
          }
        }
      } catch (inviteErr) {
        logger.error(inviteErr, 'admin customer create: invite send failed');
        warnings.push('Inbjudan kunde inte skickas — se serverlogen.');
      }
    }

    // ── TikTok: fire-and-forget initial backfill ────────────────────────────
    if (savedHandle) {
      const { triggerInitialTikTokSyncBackground } = await import('../../lib/studio/tiktok-sync.js');
      triggerInitialTikTokSyncBackground({ customerId, tiktokHandle: savedHandle, source: 'invite' });
    }

    const origin = `${req.protocol}://${req.headers.host}`;
    res.status(201).json({
      customerId,
      inviteSent,
      profileUrl: `${origin}/admin/customers/${customerId}`,
      warnings,
      customer,
    });
  } catch (err) {
    logger.error(err, 'admin customer create error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});
```

---

## Why Not the `admin_create_customer` RPC?

`create.server.ts` calls `supabase.rpc('admin_create_customer', ...)` — a stored procedure that bundles assignment creation, billing setup, concepts, game_plan, and scope_items in one transaction. However:

1. It may not exist in all environments (the dead code has a guard for this: `isMissingAdminCreateCustomerRpc`).
2. The current modal form does not send `scope_items`, `game_plan`, or `concepts` — those fields are empty arrays / `{}`.
3. The plain `.insert()` path already works in production (customers are being created today, just without email).

**Decision:** Keep the plain `.insert()` and implement email + TikTok sync alongside it. The RPC can be used in a future refactor if the form is extended.

---

## Response Shape (unchanged)

The modal already reads this shape correctly at `InviteCustomerModal.tsx:34–38`:

```typescript
type InviteCustomerResult = {
  customerId: string;
  inviteSent: boolean;      // true → toast.success; false → toast.warning
  profileUrl: string;
  warnings: string[];       // shown as individual toast.warning
};
```

No frontend changes required.

---

## Env Vars Required

| Var | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | ✅ | Already provisioned in Replit secrets |
| `RESEND_FROM_EMAIL` | Optional | Defaults to `LeTrend <hej@letrend.se>` |
| `RAPIDAPI_KEY` | Optional | If absent, TikTok backfill is skipped with a log warning (existing behaviour) |

---

## Testing Checklist

After applying the patch, verify:

1. **Draft create** (`send_invite_now: false`): row inserted with `status='draft'`, no email, `inviteSent: false`, no warnings.
2. **Invite create, no TikTok** (`send_invite_now: true`, no URL): row with `status='invited'`, `invited_at` set, email sent to address, `inviteSent: true`.
3. **Invite create + TikTok** (`send_invite_now: true`, valid TikTok URL): as above + `tiktok_handle` written to DB + background sync triggered (check server log for "initial tiktok backfill done").
4. **Invite create, RESEND_API_KEY missing**: `inviteSent: false`, warning `'RESEND_API_KEY saknas'` shown in modal.
5. **Invalid TikTok URL** (no `@` in string): `tiktok_handle = null`, `tiktok_profile_url = null` written, no sync triggered.

---

## Files Touched

| File | Change |
|---|---|
| `artifacts/api-server/src/routes/admin/customers.ts` | Replace lines 1163–1213 with the patch above |

## Files NOT Touched

| File | Reason |
|---|---|
| `artifacts/letrend/src/components/admin/customers/InviteCustomerModal.tsx` | Response handling already correct |
| `artifacts/letrend/src/lib/admin/customers/create.server.ts` | Dead code — cleanup tracked separately (C-2) |
| Feed planner / demos | Out of scope |
