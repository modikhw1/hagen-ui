import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin']);

function getCurrentPeriodKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function parsePeriodKey(key: string) {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return null;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const label = start.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
  return {
    key,
    label: label.charAt(0).toUpperCase() + label.slice(1),
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
  };
}

function buildAvailablePeriods(count = 12) {
  const periods = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const info = parsePeriodKey(key);
    if (info) periods.push({ key: info.key, label: info.label });
  }
  return periods;
}

// GET /api/admin/payroll
router.get('/', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const periodKey = (req.query['period'] as string | undefined) ?? getCurrentPeriodKey();
    const period = parsePeriodKey(periodKey) ?? parsePeriodKey(getCurrentPeriodKey())!;
    const includeBreakdown = req.query['includeBreakdown'] !== '0';

    // Fetch active team members
    const { data: members, error: membersError } = await (supabase as any)
      .from('team_members')
      .select('id, name, email, commission_rate, is_active')
      .eq('is_active', true)
      .in('role', ['content_manager', 'admin'])
      .order('name');

    if (membersError) {
      const msg = String(membersError.message ?? '').toLowerCase();
      if (msg.includes('does not exist')) {
        const emptyResponse = {
          period,
          available_periods: buildAvailablePeriods(),
          rows: [],
          totals: { cm_count: 0, billed_ore: 0, payout_ore: 0, billable_days: 0 },
          schemaWarnings: ['Tabellen team_members saknas'],
        };
        res.json(emptyResponse);
        return;
      }
      res.status(500).json({ error: membersError.message });
      return;
    }

    // Fetch invoices for the period
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, customer_profile_id, amount_due, status, created_at')
      .eq('status', 'paid')
      .gte('created_at', period.start_date)
      .lte('created_at', period.end_date + 'T23:59:59Z');

    // Fetch CM assignments with customer info
    const { data: assignments } = await supabase
      .from('cm_assignments')
      .select('cm_id, customer_id')
      .is('valid_to', null);

    const customersByCm = new Map<string, string[]>();
    for (const a of assignments ?? []) {
      const cmId = (a as any)['cm_id'];
      const customerId = (a as any)['customer_id'];
      if (!cmId || !customerId) continue;
      if (!customersByCm.has(cmId)) customersByCm.set(cmId, []);
      customersByCm.get(cmId)!.push(customerId);
    }

    // Total billing days in period
    const startDate = new Date(period.start_date);
    const endDate = new Date(period.end_date);
    const billableDays = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const rows = (members ?? []).map((member: any) => {
      const commissionRate = member.commission_rate ?? 0;
      const assignedCustomers = customersByCm.get(member.id) ?? [];

      // Invoices for this CM's customers
      const cmInvoices = (invoices ?? []).filter((inv: any) =>
        assignedCustomers.includes(inv.customer_profile_id),
      );

      const billedOre = cmInvoices.reduce((sum: number, inv: any) => sum + (inv.amount_due ?? 0), 0);
      const payoutOre = Math.round(billedOre * commissionRate);

      const breakdown = includeBreakdown
        ? assignedCustomers.map((customerId) => {
            const customerInvoices = cmInvoices.filter((inv: any) => inv.customer_profile_id === customerId);
            const customerBilledOre = customerInvoices.reduce((sum: number, inv: any) => sum + (inv.amount_due ?? 0), 0);
            return {
              customer_id: customerId,
              customer_name: customerId, // would need to join profiles
              billed_ore: customerBilledOre,
              payout_ore: Math.round(customerBilledOre * commissionRate),
              billable_days: billableDays,
              pro_rata_label: null,
            };
          })
        : [];

      return {
        cm_id: member.id,
        cm_name: member.name,
        cm_email: member.email ?? null,
        commission_rate: commissionRate,
        assigned_customers: assignedCustomers.length,
        active_customers: assignedCustomers.length,
        billed_ore: billedOre,
        payout_ore: payoutOre,
        billable_days: billableDays,
        customer_breakdown: breakdown,
      };
    });

    const totals = {
      cm_count: rows.length,
      billed_ore: rows.reduce((sum: number, r: any) => sum + r.billed_ore, 0),
      payout_ore: rows.reduce((sum: number, r: any) => sum + r.payout_ore, 0),
      billable_days: billableDays,
    };

    res.json({
      period,
      available_periods: buildAvailablePeriods(),
      rows,
      totals,
      schemaWarnings: [],
    });
  } catch (err) {
    logger.error(err, 'payroll error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
