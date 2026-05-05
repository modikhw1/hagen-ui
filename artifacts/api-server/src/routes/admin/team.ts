import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { createSupabaseAdmin } from '../../lib/supabase.js';
import { logger } from '../../lib/logger.js';
import { resolveExpectedConceptsPerWeek } from '../../lib/admin-derive/expected-per-week.js';

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

    // Customer ids referenced by *any* assignment (active or historical).
    // We need the names for assignment-history rendering, but the active
    // ones get a richer signal payload below.
    const allCustomerIds = Array.from(new Set(
      (assignmentsResult.data ?? []).map((a: any) => a.customer_id).filter(Boolean),
    )) as string[];

    // Active assignment customer ids — the ones we surface as table rows.
    const activeCustomerIds = Array.from(new Set(
      Array.from(activeAssignmentsByCm.values()).flat().map((a: any) => a.customer_id).filter(Boolean),
    )) as string[];

    // Batch-fetch customer rows + signals (planned/overdue counts, last_published_at)
    // and the latest follower / engagement snapshot. Mirrors the lookup pattern in
    // routes/admin/customers.ts (v_admin_customer_list view + tiktok_history_snapshots).
    const customerNameById = new Map<string, string>();
    const customerProfileById = new Map<string, any>();
    const customerSignalsById = new Map<string, any>();
    const tiktokByCustomer = new Map<string, {
      followers: number;
      engagement_rate: number;
      videos_last_7d: number;
    }>();

    if (allCustomerIds.length > 0) {
      const { data: customers } = await (supabase as any)
        .from('customer_profiles')
        .select('id, business_name, monthly_price, status, paused_until, expected_concepts_per_week, concepts_per_week, brief, last_upload_at, tiktok_handle, account_manager_profile_id')
        .in('id', allCustomerIds);
      for (const c of customers ?? []) {
        customerNameById.set(c.id as string, (c.business_name as string) ?? '');
        customerProfileById.set(c.id as string, c);
      }
    }

    // Per-customer "planned this week" — concepts with planned_publish_at in
    // the current ISO week (måndag-baserat) that are not yet published or
    // archived. This is the same definition CustomerPulseRoute uses, so the
    // team-page flöde dots and the customer-page pulse bar agree on the
    // numerator of the planned/expected ratio.
    const plannedThisWeekByCustomer = new Map<string, number>();
    if (activeCustomerIds.length > 0) {
      // Calendar-based week boundary so DST transitions don't shift the
      // window by ±1 hour (which would mis-bucket concepts planned right at
      // the Sunday/Monday midnight seam).
      const now = new Date();
      const dow = now.getDay();
      const daysSinceMonday = (dow + 6) % 7;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - daysSinceMonday);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      weekEnd.setHours(0, 0, 0, 0);

      const conceptsResult = await (supabase as any)
        .from('customer_concepts')
        .select('customer_profile_id, planned_publish_at, status, published_at')
        .in('customer_profile_id', activeCustomerIds)
        .gte('planned_publish_at', weekStart.toISOString())
        .lt('planned_publish_at', weekEnd.toISOString());
      if (!conceptsResult.error) {
        for (const row of conceptsResult.data ?? []) {
          const status = row.status as string | null;
          if (row.published_at) continue;
          if (status === 'published' || status === 'archived') continue;
          const cid = row.customer_profile_id as string;
          plannedThisWeekByCustomer.set(cid, (plannedThisWeekByCustomer.get(cid) ?? 0) + 1);
        }
      }
    }

    if (activeCustomerIds.length > 0) {
      // v_admin_customer_list already exposes planned_concepts_count,
      // overdue_7d_concepts_count and last_published_at per customer — same
      // source the /admin/customers route relies on. Fall back gracefully if
      // the view isn't present so we never crash the team page.
      const signalsResult = await (supabase as any)
        .from('v_admin_customer_list')
        .select('id, planned_concepts_count, overdue_7d_concepts_count, last_published_at, latest_planned_publish_date')
        .in('id', activeCustomerIds);
      if (!signalsResult.error) {
        for (const row of signalsResult.data ?? []) {
          customerSignalsById.set(row.id as string, row);
        }
      }

      // Latest TikTok signals: pull recent snapshots for all customers in
      // one query and bucket by customer in JS so we don't N+1.
      const snapshotsResult = await (supabase as any)
        .from('tiktok_history_snapshots')
        .select('customer_profile_id, snapshot_date, followers, engagement_rate, videos_last_24h')
        .in('customer_profile_id', activeCustomerIds)
        .order('snapshot_date', { ascending: false })
        .limit(activeCustomerIds.length * 14);
      if (!snapshotsResult.error) {
        const grouped = new Map<string, any[]>();
        for (const row of snapshotsResult.data ?? []) {
          const id = row.customer_profile_id as string;
          const arr = grouped.get(id) ?? [];
          arr.push(row);
          grouped.set(id, arr);
        }
        for (const [id, snaps] of grouped) {
          const latest = snaps[0];
          const last7 = snaps.slice(0, 7);
          tiktokByCustomer.set(id, {
            followers: Number(latest?.followers ?? 0),
            engagement_rate: Number(latest?.engagement_rate ?? 0),
            videos_last_7d: last7.reduce(
              (sum, s) => sum + Number(s.videos_last_24h ?? 0),
              0,
            ),
          });
        }
      }
    }

    // Collect all displayed member ids so interaction stats cover every CM card,
    // regardless of whether they currently have active customer assignments.
    const allMemberIds = (membersResult.data ?? []).map((m: any) => m['id'] as string).filter(Boolean);

    // Batch-fetch cm_interactions — two parallel queries, no N+1:
    //   1. Last-7-days window  → interactionCount7d per CM
    //   2. All-time (no limit) → lastInteractionDays per CM.
    //      We intentionally omit a row limit here so that high-activity CMs
    //      cannot crowd out lower-activity CMs from the result set.
    //      The query is bounded to the displayed CM id set which is small.
    type InteractionStats = { count7d: number; lastAt: Date | null };
    const interactionStatsByCm = new Map<string, InteractionStats>();
    if (allMemberIds.length > 0) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [recent7dResult, allTimeResult] = await Promise.all([
        (supabase as any)
          .from('cm_interactions')
          .select('cm_id, created_at')
          .in('cm_id', allMemberIds)
          .gte('created_at', sevenDaysAgo.toISOString()),
        // No limit — fetches all interactions for these CMs so every CM is
        // guaranteed a row; team pages typically have < 20 CMs.
        (supabase as any)
          .from('cm_interactions')
          .select('cm_id, created_at')
          .in('cm_id', allMemberIds),
      ]);

      // Count 7-day interactions per CM.
      if (!recent7dResult.error) {
        for (const row of recent7dResult.data ?? []) {
          const cmId = row.cm_id as string;
          if (!cmId) continue;
          let s = interactionStatsByCm.get(cmId);
          if (!s) {
            s = { count7d: 0, lastAt: null };
            interactionStatsByCm.set(cmId, s);
          }
          s.count7d += 1;
        }
      }

      // Track the all-time latest interaction per CM.
      if (!allTimeResult.error) {
        for (const row of allTimeResult.data ?? []) {
          const cmId = row.cm_id as string;
          if (!cmId) continue;
          const at = new Date(row.created_at as string);
          let s = interactionStatsByCm.get(cmId);
          if (!s) {
            s = { count7d: 0, lastAt: null };
            interactionStatsByCm.set(cmId, s);
          }
          if (!s.lastAt || at > s.lastAt) s.lastAt = at;
        }
      }
    }

    const includeInactive = req.query['includeInactive'] === '1';
    const sort = (req.query['sort'] as string | undefined) ?? 'standard';

    // All assignments (active *and* historical) per CM — needed for the
    // history list, separate from the active-only map used for the cards.
    const allAssignmentsByCm = new Map<string, Array<any>>();
    for (const a of assignmentsResult.data ?? []) {
      const cmId = (a as any).cm_id as string | null;
      if (!cmId) continue;
      const arr = allAssignmentsByCm.get(cmId) ?? [];
      arr.push(a);
      allAssignmentsByCm.set(cmId, arr);
    }

    const members = (membersResult.data ?? [])
      .filter((m: any) => includeInactive || m['is_active'])
      .map((member: Record<string, any>) => {
        const memberId = member['id'] as string;
        const memberAssignments = activeAssignmentsByCm.get(memberId) ?? [];

        const absRow = activeAbsenceByCm.get(memberId) ?? upcomingAbsenceByCm.get(memberId) ?? null;
        const isActiveAbsence = !!activeAbsenceByCm.get(memberId);
        const isUpcomingAbsence = !isActiveAbsence && !!upcomingAbsenceByCm.get(memberId);

        // While an absence is active *and* compensation is set to "covering_cm",
        // the backup CM owns these customers for payout/coverage purposes.
        const coveringBackupId =
          isActiveAbsence && absRow?.compensation_mode === 'covering_cm' && absRow?.backup_cm_id
            ? (absRow.backup_cm_id as string)
            : null;

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

        // Build the customer table rows for this CM from the active assignments.
        const customers = memberAssignments
          .map((a: any) => {
            const profile = customerProfileById.get(a.customer_id as string);
            if (!profile) return null;
            const signals = customerSignalsById.get(a.customer_id as string) ?? {};
            const tiktok = tiktokByCustomer.get(a.customer_id as string) ?? {
              followers: 0,
              engagement_rate: 0,
              videos_last_7d: 0,
            };
            const lastUpload = profile.last_upload_at ?? null;
            const lastPublished = signals.last_published_at ?? null;
            const last_publication_source: 'letrend' | 'tiktok' | null =
              lastPublished && lastUpload && new Date(lastUpload).getTime() >= new Date(lastPublished).getTime()
                ? 'tiktok'
                : lastPublished
                  ? 'letrend'
                  : lastUpload
                    ? 'tiktok'
                    : null;
            return {
              id: String(profile.id),
              business_name: String(profile.business_name ?? ''),
              monthly_price: Number(profile.monthly_price ?? 0),
              status: String(profile.status ?? 'active'),
              paused_until: profile.paused_until ?? null,
              followers: Number(tiktok.followers ?? 0),
              videos_last_7d: Number(tiktok.videos_last_7d ?? 0),
              engagement_rate: Number(tiktok.engagement_rate ?? 0),
              last_upload_at: lastUpload,
              last_published_at: lastPublished,
              last_publication_source,
              // Lifetime pipeline count from v_admin_customer_list — kept on
              // the row for any UI that still needs the long-tail number.
              planned_concepts_count: Number(signals.planned_concepts_count ?? 0),
              // This-week count, same definition CustomerPulseRoute uses.
              // The team-page flöde dots prefer this so the team and customer
              // pages agree on the planned/expected ratio numerator.
              planned_concepts_this_week: Number(plannedThisWeekByCustomer.get(profile.id as string) ?? 0),
              // Resolved through the shared chain
              // briefDays → expected_concepts_per_week → concepts_per_week → 2
              // so customers whose tempo was set only via the studio's
              // TempoModal (brief.posting_weekdays) still get the right
              // expected count here.
              expected_concepts_per_week: resolveExpectedConceptsPerWeek({
                brief: profile.brief ?? null,
                expected_concepts_per_week: profile.expected_concepts_per_week ?? null,
                concepts_per_week: profile.concepts_per_week ?? null,
              }),
              overdue_7d_concepts_count: Number(signals.overdue_7d_concepts_count ?? 0),
              covered_by_absence: !!coveringBackupId,
              payout_cm_id: coveringBackupId ?? memberId,
            };
          })
          .filter(Boolean) as Array<any>;

        const customerCount = customers.length;
        const overloaded = customerCount >= 12;

        // Recompute pulse counts from the real rows.
        let n_paused = 0;
        let n_under = 0;
        let n_ok = 0;
        let mrrSekTotal = 0;
        let plannedConceptsTotal = 0;
        let expectedConcepts7d = 0;
        for (const c of customers) {
          mrrSekTotal += c.monthly_price ?? 0;
          const isPaused =
            c.status === 'paused' || (c.paused_until && c.paused_until > today);
          if (isPaused) {
            n_paused += 1;
            continue;
          }
          const expected = c.expected_concepts_per_week ?? 0;
          // Use the same this-week-planned count as the per-row flöde dots
          // so the CM-card aggregate counts and the per-customer dots line up.
          const planned = c.planned_concepts_this_week ?? c.planned_concepts_count ?? 0;
          plannedConceptsTotal += planned;
          expectedConcepts7d += expected;
          if (c.overdue_7d_concepts_count > 0 || (expected > 0 && planned < expected)) {
            n_under += 1;
          } else {
            n_ok += 1;
          }
        }

        const customerLoadLevel: 'ok' | 'warn' | 'overload' =
          customerCount >= 12 ? 'overload' : customerCount >= 8 ? 'warn' : 'ok';

        // History should only show *past* assignments — active rows are now
        // surfaced in the customer table above.
        const assignmentHistory = (allAssignmentsByCm.get(memberId) ?? [])
          .filter((a: any) => {
            const validTo = a.valid_to as string | null;
            return !!validTo && validTo < today;
          })
          .map((a: any) => ({
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
            plannedConceptsTotal,
            expectedConcepts7d,
            interactionCount7d: interactionStatsByCm.get(memberId)?.count7d ?? 0,
            lastInteractionDays: (() => {
              const lastAt = interactionStatsByCm.get(memberId)?.lastAt ?? null;
              if (!lastAt) return 999;
              return Math.floor((Date.now() - lastAt.getTime()) / 86_400_000);
            })(),
            counts: { n_under, n_thin: 0, n_blocked: 0, n_ok, n_paused },
          },
          customers,
          assignmentHistory,
          customerCount,
          mrr_ore: Math.round(mrrSekTotal * 100),
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
router.get('/lite', requireAuth, requireRole(['admin', 'content_manager']), async (req, res) => {
  try {
    const supabase = createSupabaseAdmin();
    const includeInactive = req.query['includeInactive'] === '1';
    const role = req.query['role'] as string | undefined;

    let query = (supabase as any)
      .from('team_members')
      .select('id, profile_id, name, email, role, is_active, avatar_url, color')
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

    const members = [...(data ?? [])];
    const includeAdminProfiles = !role || role === 'admin';

    if (includeAdminProfiles) {
      const linkedProfileIds = new Set(
        members
          .map((member: Record<string, unknown>) => member['profile_id'])
          .filter(Boolean),
      );
      const { data: adminProfiles } = await (supabase as any)
        .from('profiles')
        .select('id, email, avatar_url, role, is_admin')
        .or('role.eq.admin,is_admin.eq.true')
        .order('email');

      for (const profile of adminProfiles ?? []) {
        if (linkedProfileIds.has(profile.id)) continue;
        const email = typeof profile.email === 'string' ? profile.email : '';
        members.push({
          id: profile.id,
          name: email.split('@')[0] || email || `Admin ${String(profile.id).slice(0, 8)}`,
          email,
          role: 'admin',
          is_active: true,
          avatar_url: profile.avatar_url ?? null,
          color: '#4f46e5',
          commission_rate: 0,
        });
      }
    }

    res.json({ members });
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
