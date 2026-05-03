import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { getStripe } from '../../lib/stripe-client.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin']);

// ── Helper ─────────────────────────────────────────────────────────────────

/** Fetch a single invoice row by stripe_invoice_id or UUID primary key. */
async function findInvoice(supabase: ReturnType<typeof createSupabaseAdmin>, invoiceId: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId);
  const field = isUuid ? 'id' : 'stripe_invoice_id';
  const { data, error } = await (supabase as any)
    .from('invoices')
    .select(
      'id, stripe_invoice_id, stripe_subscription_id, customer_profile_id, amount_due, amount_paid, currency, invoice_number, status, hosted_invoice_url, invoice_pdf, due_date, paid_at, environment, created_at',
    )
    .eq(field, invoiceId)
    .maybeSingle();
  return { row: data as Record<string, unknown> | null, error };
}

// ── GET /api/admin/invoices ────────────────────────────────────────────────
router.get('/', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const limit = Math.min(Number(req.query['limit'] ?? 50), 200);
    const page = Math.max(Number(req.query['page'] ?? 1), 1);
    const offset = (page - 1) * limit;
    const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
    const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined;
    const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined;
    const environment = typeof req.query['environment'] === 'string' ? req.query['environment'] : undefined;
    const customerProfileId =
      typeof req.query['customer_profile_id'] === 'string' ? req.query['customer_profile_id']
      : typeof req.query['customerProfileId'] === 'string' ? req.query['customerProfileId']
      : undefined;

    let query = supabase
      .from('invoices')
      .select(
        'id, stripe_invoice_id, customer_profile_id, amount_due, amount_paid, status, created_at, due_date, hosted_invoice_url, currency',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = (query as any).eq('status', status);
    if (customerProfileId) query = (query as any).eq('customer_profile_id', customerProfileId);
    if (from) query = (query as any).gte('created_at', from);
    if (to) query = (query as any).lte('created_at', to + 'T23:59:59Z');
    if (environment && environment !== 'all') query = (query as any).eq('environment', environment);

    const { data, error, count } = await query;

    if (error) {
      const msg = String(error.message ?? '').toLowerCase();
      if (msg.includes('does not exist')) {
        res.json({ invoices: [], environment: environment ?? 'all', pagination: { total: 0, page, limit, totalPages: 0 }, summary: null });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    const total = count ?? 0;

    let summary = { openOre: 0, paidOre: 0, invoicesNeedingActionCount: 0 };
    try {
      let summaryQuery = supabase.from('invoices').select('amount_due, amount_paid, status');
      if (customerProfileId) summaryQuery = (summaryQuery as any).eq('customer_profile_id', customerProfileId);
      if (environment && environment !== 'all') summaryQuery = (summaryQuery as any).eq('environment', environment);
      const { data: allRows } = await summaryQuery;
      for (const row of (allRows ?? []) as Array<{ amount_due: number | null; amount_paid: number | null; status: string | null }>) {
        const st = (row.status ?? '').toLowerCase();
        if (st === 'open' || st === 'past_due') summary.openOre += Number(row.amount_due ?? 0);
        if (st === 'paid') summary.paidOre += Number(row.amount_paid ?? row.amount_due ?? 0);
        if (st === 'open' || st === 'past_due' || st === 'uncollectible') summary.invoicesNeedingActionCount += 1;
      }
    } catch (e) {
      logger.warn(e, 'invoices summary derivation failed');
    }

    res.json({
      invoices: data ?? [],
      environment: environment ?? 'all',
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      summary,
    });
  } catch (err) {
    logger.error(err, 'invoices list error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// ── GET /api/admin/invoices/:id ────────────────────────────────────────────
router.get('/:id', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const id = String(req.params['id'] ?? '');
    const supabase = createSupabaseAdmin();

    const { row: inv, error: invErr } = await findInvoice(supabase, id);
    if (invErr) {
      logger.error({ err: invErr.message }, 'invoice detail query failed');
      res.status(500).json({ error: 'Kunde inte hämta faktura' });
      return;
    }
    if (!inv) {
      res.status(404).json({ error: 'Faktura hittades inte' });
      return;
    }

    const stripeInvoiceId = String(inv['stripe_invoice_id'] ?? id);
    const customerProfileId = String(inv['customer_profile_id'] ?? '');

    // Parallel: customer name, line items, operations
    const [customerResult, linesResult, opsResult, subscriptionResult] = await Promise.all([
      (supabase as any)
        .from('customer_profiles')
        .select('business_name, stripe_subscription_id')
        .eq('id', customerProfileId)
        .maybeSingle(),
      (supabase as any)
        .from('invoice_line_items')
        .select('id, description, amount, quantity')
        .eq('stripe_invoice_id', stripeInvoiceId),
      (supabase as any)
        .from('credit_note_operations')
        .select('id, operation_type, status, requires_attention, attention_reason, stripe_credit_note_id, stripe_reissue_invoice_id, error_message, idempotency_key, created_at')
        .eq('source_invoice_id', stripeInvoiceId)
        .order('created_at', { ascending: false })
        .limit(20),
      customerProfileId
        ? (supabase as any)
            .from('customer_profiles')
            .select('stripe_subscription_id')
            .eq('id', customerProfileId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const customerName = (customerResult.data?.business_name as string | null) ?? 'Okänd kund';
    const lines = ((linesResult.data ?? []) as Array<Record<string, unknown>>).map((l) => ({
      id: String(l['id'] ?? ''),
      description: String(l['description'] ?? ''),
      amount: Number(l['amount'] ?? 0),
      quantity: Number(l['quantity'] ?? 1),
    }));
    const operations = ((opsResult.data ?? []) as Array<Record<string, unknown>>).map((op) => ({
      id: String(op['id'] ?? ''),
      operation_type: String(op['operation_type'] ?? ''),
      status: String(op['status'] ?? ''),
      requires_attention: Boolean(op['requires_attention']),
      attention_reason: (op['attention_reason'] as string | null) ?? null,
      stripe_credit_note_id: (op['stripe_credit_note_id'] as string | null) ?? null,
      stripe_reissue_invoice_id: (op['stripe_reissue_invoice_id'] as string | null) ?? null,
      error_message: (op['error_message'] as string | null) ?? null,
      idempotency_key: String(op['idempotency_key'] ?? ''),
      created_at: String(op['created_at'] ?? ''),
    }));

    const status = String(inv['status'] ?? '');
    const canManageAdjustments = ['draft', 'open', 'past_due'].includes(status);

    const stripeSubId =
      (subscriptionResult.data as Record<string, unknown> | null)?.['stripe_subscription_id'] as string | null
      ?? (inv['stripe_subscription_id'] as string | null)
      ?? null;

    res.json({
      stripe_invoice_id: stripeInvoiceId,
      number: (inv['invoice_number'] as string | null) ?? null,
      status,
      amount_due: Number(inv['amount_due'] ?? 0),
      amount_paid: Number(inv['amount_paid'] ?? 0),
      currency: String(inv['currency'] ?? 'sek'),
      customer_name: customerName,
      customer_profile_id: customerProfileId,
      hosted_invoice_url: (inv['hosted_invoice_url'] as string | null) ?? null,
      invoice_pdf: (inv['invoice_pdf'] as string | null) ?? null,
      created_at: String(inv['created_at'] ?? ''),
      due_date: (inv['due_date'] as string | null) ?? null,
      environment: (inv['environment'] as 'test' | 'live') ?? 'live',
      lines,
      operations,
      permissions: {
        can_manage_adjustments: canManageAdjustments,
      },
      billing_context: {
        stripe_subscription_id: stripeSubId,
        has_active_subscription: Boolean(stripeSubId),
        can_refund_payment_method: status === 'paid',
      },
    });
  } catch (err) {
    logger.error(err, 'invoice detail error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// ── GET /api/admin/invoices/:id/lines ─────────────────────────────────────
router.get('/:id/lines', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const id = String(req.params['id'] ?? '');
    const supabase = createSupabaseAdmin();
    const stripeInvoiceId = id;

    try {
      const { data, error } = await (supabase as any)
        .from('invoice_line_items')
        .select('id, description, amount, quantity')
        .eq('stripe_invoice_id', stripeInvoiceId);
      if (error) {
        res.json({ lines: [] });
        return;
      }
      res.json({ lines: data ?? [] });
    } catch {
      res.json({ lines: [] });
    }
  } catch (err) {
    logger.error(err, 'invoice lines GET error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// ── GET /api/admin/invoices/:id/timeline ──────────────────────────────────
router.get('/:id/timeline', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const id = String(req.params['id'] ?? '');
    const supabase = createSupabaseAdmin();

    const { row: inv } = await findInvoice(supabase, id);

    const events: Array<{
      id: string;
      at: string;
      kind: string;
      title: string;
      description?: string | null;
      actor?: string | null;
      source: 'stripe_webhook' | 'admin' | 'system' | 'milestone';
      status: 'success' | 'warning' | 'error' | 'info';
    }> = [];

    if (inv) {
      const createdAt = String(inv['created_at'] ?? '');
      const invoiceStatus = String(inv['status'] ?? '');
      const paidAt = (inv['paid_at'] as string | null) ?? null;
      const dueDate = (inv['due_date'] as string | null) ?? null;

      // Synthesise milestone events from known invoice fields.
      if (createdAt) {
        events.push({
          id: 'created',
          at: createdAt,
          kind: 'created',
          title: 'Faktura skapad',
          source: 'milestone',
          status: 'info',
        });
      }

      if (dueDate) {
        const dueDateMs = new Date(dueDate).getTime();
        events.push({
          id: 'due',
          at: dueDate,
          kind: 'finalized',
          title: 'Förfallodatum',
          source: 'milestone',
          status: dueDateMs < Date.now() && invoiceStatus !== 'paid' ? 'warning' : 'info',
        });
      }

      if (paidAt) {
        events.push({
          id: 'paid',
          at: paidAt,
          kind: 'paid',
          title: 'Faktura betald',
          source: 'milestone',
          status: 'success',
        });
      }

      if (invoiceStatus === 'void') {
        events.push({
          id: 'voided',
          at: paidAt ?? createdAt,
          kind: 'voided',
          title: 'Faktura annullerad',
          source: 'admin',
          status: 'error',
        });
      }

      if (invoiceStatus === 'uncollectible') {
        events.push({
          id: 'uncollectible',
          at: createdAt,
          kind: 'uncollectible',
          title: 'Markerad som svårindrivbar',
          source: 'admin',
          status: 'warning',
        });
      }

      // Try to pull real webhook events if the table exists.
      try {
        const stripeInvoiceId = String(inv['stripe_invoice_id'] ?? id);
        const { data: webhookEvents } = await (supabase as any)
          .from('stripe_sync_events')
          .select('id, event_type, received_at, status, error_message')
          .eq('object_id', stripeInvoiceId)
          .order('received_at', { ascending: true })
          .limit(50);

        for (const ev of (webhookEvents ?? []) as Array<Record<string, unknown>>) {
          const evType = String(ev['event_type'] ?? '');
          const kind = evType.replace('invoice.', '');
          events.push({
            id: String(ev['id'] ?? evType),
            at: String(ev['received_at'] ?? createdAt),
            kind: kind || 'webhook',
            title: evType,
            description: (ev['error_message'] as string | null) ?? null,
            source: 'stripe_webhook',
            status: ev['status'] === 'failed' ? 'error' : 'info',
          });
        }
      } catch {
        // stripe_sync_events table may not exist — fall back to synthesised events.
      }
    }

    // Sort ascending by time.
    events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    // Deduplicate by id.
    const seen = new Set<string>();
    const dedupedEvents = events.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    res.json({ events: dedupedEvents });
  } catch (err) {
    logger.error(err, 'invoice timeline error');
    res.json({ events: [] });
  }
});

// ── POST /api/admin/invoices/:id/actions ──────────────────────────────────
router.post('/:id/actions', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const id = String(req.params['id'] ?? '');
    const body = req.body as Record<string, unknown>;
    const action = String(body['action'] ?? '');
    const supabase = createSupabaseAdmin();
    const adminEmail = (req as any).user?.email ?? 'admin';

    const { row: inv } = await findInvoice(supabase, id);
    if (!inv) {
      res.status(404).json({ error: 'Faktura hittades inte' });
      return;
    }

    const stripeInvoiceId = String(inv['stripe_invoice_id'] ?? id);
    const stripe = getStripe();

    switch (action) {
      case 'mark_paid': {
        const amountDue = Number(inv['amount_due'] ?? 0);
        const { error } = await (supabase as any)
          .from('invoices')
          .update({ status: 'paid', amount_paid: amountDue, paid_at: new Date().toISOString() })
          .eq('stripe_invoice_id', stripeInvoiceId as string);
        if (error) {
          res.status(500).json({ error: error.message });
          return;
        }
        logger.info({ invoiceId: stripeInvoiceId, actor: adminEmail }, 'admin mark_paid');
        res.json({ success: true, status: 'paid' });
        return;
      }

      case 'resend': {
        // Attempt Stripe resend; fail gracefully if key is expired.
        if (stripe) {
          try {
            await (stripe as any).invoices.sendInvoice(stripeInvoiceId);
            logger.info({ invoiceId: stripeInvoiceId, actor: adminEmail }, 'stripe resend succeeded');
          } catch (stripeErr) {
            logger.warn(
              { err: stripeErr instanceof Error ? stripeErr.message : String(stripeErr), invoiceId: stripeInvoiceId },
              'stripe resend failed; operation logged but not blocking',
            );
          }
        }
        res.json({ success: true, warning: stripe ? undefined : 'Stripe ej konfigurerat — ingen e-post skickades' });
        return;
      }

      case 'resync': {
        // Attempt Stripe retrieve and sync local DB.
        if (stripe) {
          try {
            const stripeInv = await (stripe as any).invoices.retrieve(stripeInvoiceId);
            const updatePayload: Record<string, unknown> = {
              status: stripeInv.status ?? inv['status'],
              amount_due: stripeInv.amount_due ?? inv['amount_due'],
              amount_paid: stripeInv.amount_paid ?? inv['amount_paid'],
              hosted_invoice_url: stripeInv.hosted_invoice_url ?? inv['hosted_invoice_url'],
              invoice_pdf: stripeInv.invoice_pdf ?? inv['invoice_pdf'],
            };
            if (stripeInv.status === 'paid' && stripeInv.status_transitions?.paid_at) {
              updatePayload['paid_at'] = new Date(stripeInv.status_transitions.paid_at * 1000).toISOString();
            }
            await (supabase as any)
              .from('invoices')
              .update(updatePayload)
              .eq('stripe_invoice_id', stripeInvoiceId as string);
            logger.info({ invoiceId: stripeInvoiceId }, 'invoice resynced from Stripe');
          } catch (stripeErr) {
            logger.warn(
              { err: stripeErr instanceof Error ? stripeErr.message : String(stripeErr), invoiceId: stripeInvoiceId },
              'stripe resync retrieve failed; returning local data',
            );
          }
        }
        res.json({ success: true, warning: stripe ? undefined : 'Stripe ej konfigurerat — lokal data visas' });
        return;
      }

      case 'pay_now': {
        if (stripe) {
          try {
            await (stripe as any).invoices.pay(stripeInvoiceId);
            logger.info({ invoiceId: stripeInvoiceId, actor: adminEmail }, 'stripe pay_now succeeded');
          } catch (stripeErr) {
            const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
            logger.warn({ err: msg, invoiceId: stripeInvoiceId }, 'stripe pay_now failed');
            res.status(422).json({ error: `Stripe-betalning misslyckades: ${msg}` });
            return;
          }
        }
        res.json({ success: true, warning: stripe ? undefined : 'Stripe ej konfigurerat — ingen betalning initierades' });
        return;
      }

      default:
        res.status(400).json({ error: `Okänd åtgärd: ${action}` });
    }
  } catch (err) {
    logger.error(err, 'invoice action error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// ── PATCH /api/admin/invoices/:id ─────────────────────────────────────────
router.patch('/:id', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const id = String(req.params['id'] ?? '');
    const body = req.body as Record<string, unknown>;
    const action = String(body['action'] ?? '');
    const supabase = createSupabaseAdmin();
    const adminEmail = (req as any).user?.email ?? 'admin';

    const { row: inv } = await findInvoice(supabase, id);
    if (!inv) {
      res.status(404).json({ error: 'Faktura hittades inte' });
      return;
    }

    const stripeInvoiceId = String(inv['stripe_invoice_id'] ?? id);
    const stripe = getStripe();

    if (action === 'void') {
      if (stripe) {
        try {
          await (stripe as any).invoices.voidInvoice(stripeInvoiceId);
        } catch (stripeErr) {
          logger.warn({ err: stripeErr instanceof Error ? stripeErr.message : String(stripeErr), invoiceId: stripeInvoiceId }, 'stripe void failed; updating local only');
        }
      }
      const { error } = await (supabase as any)
        .from('invoices')
        .update({ status: 'void' })
        .eq('stripe_invoice_id', stripeInvoiceId as string);
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      logger.info({ invoiceId: stripeInvoiceId, actor: adminEmail }, 'admin void invoice');
      res.json({ success: true, status: 'void' });
      return;
    }

    if (action === 'mark_uncollectible') {
      if (stripe) {
        try {
          await (stripe as any).invoices.markUncollectible(stripeInvoiceId);
        } catch (stripeErr) {
          logger.warn({ err: stripeErr instanceof Error ? stripeErr.message : String(stripeErr), invoiceId: stripeInvoiceId }, 'stripe markUncollectible failed; updating local only');
        }
      }
      const { error } = await (supabase as any)
        .from('invoices')
        .update({ status: 'uncollectible' })
        .eq('stripe_invoice_id', stripeInvoiceId as string);
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      logger.info({ invoiceId: stripeInvoiceId, actor: adminEmail }, 'admin mark_uncollectible');
      res.json({ success: true, status: 'uncollectible' });
      return;
    }

    res.status(400).json({ error: `Okänd åtgärd: ${action}` });
  } catch (err) {
    logger.error(err, 'invoice PATCH error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// ── PATCH /api/admin/invoices/:id/lines ───────────────────────────────────
// Used by InvoiceLineEditor for update_memo and add_line actions.
router.patch('/:id/lines', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const id = String(req.params['id'] ?? '');
    const body = req.body as Record<string, unknown>;
    const action = String(body['action'] ?? '');
    const supabase = createSupabaseAdmin();

    const { row: inv } = await findInvoice(supabase, id);
    if (!inv) {
      res.status(404).json({ error: 'Faktura hittades inte' });
      return;
    }

    const stripeInvoiceId = String(inv['stripe_invoice_id'] ?? id);

    if (action === 'update_memo') {
      // The invoices table has no memo column — accept silently for UI compatibility.
      res.json({ success: true });
      return;
    }

    if (action === 'add_line') {
      const description = typeof body['description'] === 'string' ? body['description'].trim() : '';
      const amountOre = Number(body['amount_ore'] ?? 0);
      const quantity = Math.max(1, Math.round(Number(body['quantity'] ?? 1)));

      if (!description) {
        res.status(400).json({ error: 'Beskrivning saknas' });
        return;
      }
      if (!Number.isFinite(amountOre) || amountOre <= 0) {
        res.status(400).json({ error: 'Ange ett belopp över 0' });
        return;
      }

      try {
        const { error } = await (supabase as any)
          .from('invoice_line_items')
          .insert({
            stripe_line_item_id: `manual_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            stripe_invoice_id: stripeInvoiceId,
            description,
            amount: amountOre,
            quantity,
          });
        if (error) {
          res.status(500).json({ error: error.message });
          return;
        }
      } catch (insertErr) {
        logger.warn({ err: insertErr }, 'invoice_line_items insert failed');
        res.status(500).json({ error: 'Kunde inte lägga till rad' });
        return;
      }

      res.json({ success: true });
      return;
    }

    res.status(400).json({ error: `Okänd åtgärd: ${action}` });
  } catch (err) {
    logger.error(err, 'invoice lines PATCH error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
