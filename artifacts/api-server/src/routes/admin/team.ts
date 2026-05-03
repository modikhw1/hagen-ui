import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';

const router = Router();
const ADMIN_ONLY = requireRole(['admin']);

// GET /api/admin/team
router.get('/', requireAuth, ADMIN_ONLY, async (req, res) => {
  const t0 = Date.now();
  try {
    const supabase = createSupabaseAdmin();

    const [membersResult, assignmentsResult, absencesResult] = await Promise.all([
      (supabase as any)
        .from('team_members')
        .select('id, profile_id, name, email, phone, role, is_active, commission_rate, avatar_url, region, city, bio, start_date, color, created_at')
        .order('name'),
      supabase
        .from('cm_assignments')
        .select('id, customer_id, cm_id, valid_from, valid_to, handover_note, scheduled_change'),
      supabase
        .from('cm_absences')
        .select('id, cm_id, backup_cm_id, absence_type, compensation_mode, starts_on, ends_on, note')
        .order('starts_on', { ascending: false })
        .limit(500),
    ]);

    if (membersResult.error) {
      const msg = String(membersResult.error?.message ?? '').toLowerCase();
      if (msg.includes('does not exist')) {
        res.json({ members: [], asOfDate: new Date().toISOString().slice(0, 10), schemaWarnings: ['Tabellen team_members saknas'], buildDurationMs: Date.now() - t0 });
        return;
      }
      res.status(500).json({ error: membersResult.error.message });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    // Build CM name lookup for absences and assignments
    const memberById = new Map<string, any>();
    for (const m of membersResult.data ?? []) {
      memberById.set(m['id'] as string, m);
    }

    // Active assignments per CM
    const activeAssignmentsByCm = new Map<string, Array<any>>();
    for (const a of assignmentsResult.data ?? []) {
      const validTo = (a as any).valid_to as string | null;
      if (validTo && validTo < today) continue;
      const cmId = (a as any).cm_id as string | null;
      if (!cmId) continue;
      const arr = activeAssignmentsByCm.get(cmId) ?? [];
      arr.push(a);
      activeAssignmentsByCm.set(cmId, arr);
    }

    // Pick first active absence per CM
    const activeAbsenceByCm = new Map<string, any>();
    const upcomingAbsenceByCm = new Map<string, any>();
    for (const absence of absencesResult.data ?? []) {
      const cmId = (absence as any)['cm_id'] as string;
      if (!cmId) continue;
      const start = (absence as any)['starts_on'] as string;
      const end = (absence as any)['ends_on'] as string;
      if (start <= today && end >= today) {
        if (!activeAbsenceByCm.has(cmId)) activeAbsenceByCm.set(cmId, absence);
      } else if (start > today) {
        if (!upcomingAbsenceByCm.has(cmId)) upcomingAbsenceByCm.set(cmId, absence);
      }
    }

    // Lookup customer business names for assignment history
    const customerIds = Array.from(new Set(
      (assignmentsResult.data ?? []).map((a: any) => a.customer_id).filter(Boolean),
    )) as string[];
    let customerNameById = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: customers } = await (supabase as any)
        .from('customer_profiles')
        .select('id, business_name')
        .in('id', customerIds);
      for (const c of customers ?? []) {
        customerNameById.set(c.id as string, (c.business_name as string) ?? '');
      }
    }

    const includeInactive = req.query['includeInactive'] === '1';
    const sort = (req.query['sort'] as string | undefined) ?? 'standard';

    const members = (membersResult.data ?? [])
      .filter((m: any) => includeInactive || m['is_active'])
      .map((member: Record<string, any>) => {
        const memberId = member['id'] as string;
        const memberAssignments = activeAssignmentsByCm.get(memberId) ?? [];
        const customerCount = memberAssignments.length;
        const overloaded = customerCount >= 12;

        const absRow = activeAbsenceByCm.get(memberId) ?? upcomingAbsenceByCm.get(memberId) ?? null;
        const isActiveAbsence = !!activeAbsenceByCm.get(memberId);
        const isUpcomingAbsence = !isActiveAbsence && !!upcomingAbsenceByCm.get(memberId);

        const active_absence = absRow
          ? {
              id: String(absRow.id),
              cm_id: String(absRow.cm_id),
              customer_profile_id: null,
              backup_cm_id: absRow.backup_cm_id ?? null,
              backup_cm_name: absRow.backup_cm_id ? (memberById.get(absRow.backup_cm_id as string)?.name ?? null) : null,
              cm_name: member['name'] ?? null,
              absence_type: String(absRow.absence_type ?? 'other'),
              compensation_mode: (absRow.compensation_mode === 'covering_cm' ? 'covering_cm' : 'primary_cm') as 'covering_cm' | 'primary_cm',
              starts_on: String(absRow.starts_on),
              ends_on: String(absRow.ends_on),
              note: absRow.note ?? null,
              is_active: isActiveAbsence,
              is_upcoming: isUpcomingAbsence,
            }
          : null;

        const customerLoadLevel: 'ok' | 'warn' | 'overload' =
          customerCount >= 12 ? 'overload' : customerCount >= 8 ? 'warn' : 'ok';

        const assignmentHistory = memberAssignments.map((a: any) => ({
          id: String(a.id),
          customer_id: String(a.customer_id),
          customer_name: customerNameById.get(a.customer_id as string) ?? '',
          starts_on: a.valid_from ?? undefined,
          ends_on: a.valid_to ?? null,
          valid_from: String(a.valid_from ?? ''),
          valid_to: a.valid_to ?? null,
          handover_note: a.handover_note ?? null,
          scheduled_effective_date: null,
          previous_cm_name: null,
          next_cm_name: null,
        }));

        return {
          id: memberId,
          name: String(member['name'] ?? ''),
          email: String(member['email'] ?? ''),
          phone: member['phone'] ?? null,
          city: member['city'] ?? member['region'] ?? null,
          bio: member['bio'] ?? null,
          avatar_url: member['avatar_url'] ?? null,
          role: String(member['role'] ?? 'content_manager'),
          is_active: !!member['is_active'],
          commission_rate: Number(member['commission_rate'] ?? 0),
          active_absence,
          pulse: {
            status: isActiveAbsence ? 'absent' : overloaded ? 'overloaded' : 'standard',
            fillPct: Math.min(1, customerCount / 12),
            barLabel: `${customerCount} kunder`,
            plannedConceptsTotal: 0,
            expectedConcepts7d: 0,
            interactionCount7d: 0,
            lastInteractionDays: 0,
            counts: { n_under: 0, n_thin: 0, n_blocked: 0, n_ok: customerCount, n_paused: 0 },
          },
          customers: [],
          assignmentHistory,
          customerCount,
          mrr_ore: 0,
          activityCount: 0,
          activeWorkflowSteps: 0,
          activityRatio: 0,
          activitySeries: [],
          activityDots: [],
          activitySummary: { activeDays: 0, total: 0, median: 0, longestRest: 0 },
          activityBaseline: 0,
          activityAverage7d: 0,
          activityDeviation: 0,
          customerLoadLevel,
          customerLoadClass: customerLoadLevel,
          customerLoadLabel: customerLoadLevel === 'overload' ? 'Överbelastad' : customerLoadLevel === 'warn' ? 'Hög belastning' : 'Normal belastning',
          overloaded,
          isCovering: false,
        };
      });

    // Sort
    let sorted = members;
    if (sort === 'name') {
      sorted = [...members].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'standard') {
      sorted = [...members].sort((a, b) =>
        (b.customerCount ?? 0) - (a.customerCount ?? 0) || a.name.localeCompare(b.name),
      );
    } else {
      const rank: Record<string, number> = { absent: 0, overloaded: 1, standard: 2 };
      sorted = [...members].sort((a, b) => {
        const ra = rank[a.pulse.status] ?? 3;
        const rb = rank[b.pulse.status] ?? 3;
        return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
      });
    }

    res.json({
      members: sorted,
      asOfDate: today,
      schemaWarnings: [],
      buildDurationMs: Date.now() - t0,
    });
  } catch (err) {
    logger.error(err, 'team list error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/team/lite
router.get('/lite', requireAuth, ADMIN_ONLY, async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const includeInactive = req.query['includeInactive'] === '1';
    const role = req.query['role'] as string | undefined;

    let query = (supabase as any)
      .from('team_members')
      .select('id, name, email, role, is_active, avatar_url, color')
      .order('name');

    if (!includeInactive) query = query.eq('is_active', true);
    if (role === 'admin' || role === 'content_manager') query = query.eq('role', role);

    const { data, error } = await query;

    if (error) {
      const msg = String(error.message ?? '').toLowerCase();
      if (msg.includes('does not exist')) {
        res.json({ members: [] });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ members: data ?? [] });
  } catch (err) {
    logger.error(err, 'team lite error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/team/absences
router.get('/absences', requireAuth, ADMIN_ONLY, async (_req, res) => {
  try {
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from('cm_absences')
      .select('id, cm_id, backup_cm_id, absence_type, compensation_mode, starts_on, ends_on, note, created_at, created_by')
      .order('starts_on', { ascending: false })
      .limit(200);

    if (error) {
      const msg = String(error.message ?? '').toLowerCase();
      if (msg.includes('does not exist')) {
        res.json({ absences: [] });
        return;
      }
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ absences: data ?? [] });
  } catch (err) {
    logger.error(err, 'team absences get error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/team/absences
router.post('/absences', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body ?? {};

    if (!body.cm_id || !body.starts_on || !body.ends_on || !body.absence_type) {
      res.status(422).json({ error: 'cm_id, starts_on, ends_on och absence_type krävs' });
      return;
    }

    if (body.ends_on < body.starts_on) {
      res.status(422).json({ error: 'ends_on får inte vara före starts_on' });
      return;
    }

    const { data, error } = await supabase
      .from('cm_absences')
      .insert({
        cm_id: body.cm_id,
        backup_cm_id: body.backup_cm_id ?? null,
        absence_type: body.absence_type,
        compensation_mode: body.compensation_mode ?? 'primary_cm',
        starts_on: body.starts_on,
        ends_on: body.ends_on,
        note: body.note ?? null,
        created_by: (req as any).user?.id ?? null,
      } as any)
      .select()
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(201).json({
      absence: data,
      payrollImpact: {
        primaryCmEarnsDuringAbsence: body.compensation_mode === 'primary_cm',
        coveringCmEarns: body.compensation_mode === 'covering_cm',
      },
    });
  } catch (err) {
    logger.error(err, 'team absences post error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/team/create
router.post('/create', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body ?? {};

    if (!body.name?.trim() || !body.email?.trim() || !body.role) {
      res.status(400).json({ error: 'name, email och role krävs' });
      return;
    }

    // Check for existing member
    const { data: existingMember } = await (supabase as any)
      .from('team_members')
      .select('id, name')
      .ilike('email', body.email.trim())
      .maybeSingle();

    if (existingMember) {
      res.status(409).json({ error: `E-postadressen används redan av ${existingMember['name']}` });
      return;
    }

    const commissionRate = body.role === 'content_manager' ? (body.commission_rate ?? 0.3) : 0;

    const { data: member, error: insertError } = await (supabase as any)
      .from('team_members')
      .insert({
        name: body.name.trim(),
        email: body.email.trim(),
        phone: body.phone?.trim() || null,
        region: body.city?.trim() || null,
        bio: body.bio?.trim() || null,
        avatar_url: body.avatar_url?.trim() || null,
        color: body.color ?? null,
        role: body.role,
        is_active: true,
        commission_rate: commissionRate,
      })
      .select('id, name, email, phone, role, is_active, commission_rate, avatar_url, color')
      .single();

    if (insertError || !member) {
      res.status(500).json({ error: insertError?.message || 'Kunde inte skapa teammedlem' });
      return;
    }

    let warning: string | null = null;
    if (body.sendInvite) {
      const appUrl = process.env['VITE_APP_URL'] ?? process.env['APP_URL'] ?? 'https://letrend.se';
      const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(body.email.trim(), {
        data: {
          isTeamMember: true,
          invited_as: 'team_member',
          role: body.role,
          name: body.name.trim(),
          team_member_id: member['id'],
        },
        redirectTo: `${appUrl}/auth/callback?flow=team_invite`,
      });

      if (inviteError) {
        warning = `Teammedlem skapad men inbjudan misslyckades: ${inviteError.message}`;
      }
    }

    res.json({ member, invited: body.sendInvite && !warning, warning });
  } catch (err) {
    logger.error(err, 'team create error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/team/handover/cancel
router.post('/handover/cancel', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body ?? {};

    if (!body.customer_id) {
      res.status(400).json({ error: 'customer_id krävs' });
      return;
    }

    // Cancel scheduled handover by nullifying effective_date on pending assignments
    const { data, error } = await supabase
      .from('cm_assignments')
      .update({ valid_to: new Date().toISOString() } as any)
      .eq('customer_id', body.customer_id)
      .not('valid_from', 'is', null)
      .gt('valid_from', new Date().toISOString())
      .select();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!data || data.length === 0) {
      res.status(404).json({ error: 'Ingen schemalagd handover hittades för kunden' });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error(err, 'team handover cancel error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// POST /api/admin/team/handover/reschedule
router.post('/handover/reschedule', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = req.body ?? {};

    if (!body.customer_id || !body.effective_date) {
      res.status(400).json({ error: 'customer_id och effective_date krävs' });
      return;
    }

    const { data, error } = await supabase
      .from('cm_assignments')
      .update({ valid_from: body.effective_date } as any)
      .eq('customer_id', body.customer_id)
      .gt('valid_from', new Date().toISOString())
      .select();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!data || data.length === 0) {
      res.status(404).json({ error: 'Ingen schemalagd handover hittades för kunden' });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error(err, 'team handover reschedule error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

// GET /api/admin/account-managers/available  (re-exported via index)
router.get('/available', requireAuth, ADMIN_ONLY, async (_req, res) => {
  try {
    const supabase = createSupabaseAdmin();

    const [membersResult, assignmentsResult, absencesResult] = await Promise.all([
      (supabase as any)
        .from('team_members')
        .select('id, name, email, role, is_active, commission_rate, avatar_url, region, color')
        .in('role', ['content_manager', 'admin'])
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('cm_assignments')
        .select('customer_id, cm_id')
        .is('valid_to', null),
      supabase
        .from('cm_absences')
        .select('cm_id, starts_on, ends_on')
        .lte('starts_on', new Date().toISOString().slice(0, 10))
        .gte('ends_on', new Date().toISOString().slice(0, 10)),
    ]);

    if (membersResult.error) {
      res.json({ members: [] });
      return;
    }

    const customerCountByCm = new Map<string, number>();
    for (const assignment of assignmentsResult.data ?? []) {
      const cmId = assignment.cm_id as string;
      if (!cmId) continue;
      customerCountByCm.set(cmId, (customerCountByCm.get(cmId) ?? 0) + 1);
    }

    const hasAbsence = new Set((absencesResult.data ?? []).map((a: any) => a['cm_id']));

    const members = (membersResult.data ?? []).map((m: Record<string, unknown>) => ({
      ...m,
      customer_count: customerCountByCm.get(m['id'] as string) ?? 0,
      has_active_absence: hasAbsence.has(m['id'] as string),
    }));

    res.json({ members });
  } catch (err) {
    logger.error(err, 'account-managers available error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
