import { sortAttention } from '@/lib/admin-derive/attention';
import { customerBufferStatus } from '@/lib/admin-derive/buffer';
import { blockingDisplayDays, customerBlocking } from '@/lib/admin-derive/blocking';
import { cmAggregate, sortCmRows, type SortMode } from '@/lib/admin-derive/cm-pulse';
import { deriveOnboardingState, settleIfDue } from '@/lib/admin-derive/onboarding';
import { findActiveCmAbsence } from '@/lib/admin/cm-absences';
import {
  activeCustomersCard,
  costsCard,
  demosCard,
  monthlyRevenueCard,
} from '@/lib/admin-derive/overview-cards';
import type { OverviewPayload } from './overview-types';

const DEFAULT_COST_SERVICES = [
  'Google Cloud (Vertex + GCS)',
  'Gemini API',
  'TikTok Fetcher',
  'Supabase',
  'Stripe',
] as const;

export function deriveOverview(
  payload: OverviewPayload,
  options: {
    sortMode?: SortMode;
    now?: Date;
  } = {},
) {
  const sortMode = options.sortMode ?? 'standard';
  const today = options.now ?? new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const bufferByCustomerId = new Map(
    payload.bufferRows.map((row) => [row.customer_id, row]),
  );
  const teamByProfileId = new Map(
    payload.team.map((member) => [member.profile_id, member]),
  );
  const snoozed = new Set(
    payload.attentionSnoozes
      .filter(
        (item) =>
          item.released_at === null &&
          (!item.snoozed_until || new Date(item.snoozed_until) > today),
      )
      .map((item) => `${item.subject_type}:${item.subject_id}`),
  );

  const customers = payload.customers.map((customer) => {
    const buffer = bufferByCustomerId.get(customer.id);
    const expectedConceptsPerWeek =
      customer.expected_concepts_per_week ?? customer.concepts_per_week ?? 2;
    const blocking = customerBlocking({
      lastPublishedAt: buffer?.last_published_at
        ? new Date(buffer.last_published_at)
        : null,
      activatedAt:
        customer.agreed_at || customer.created_at
          ? new Date(customer.agreed_at || customer.created_at || today.toISOString())
          : null,
      isLive:
        customer.status === 'active' ||
        customer.status === 'agreed' ||
        customer.onboarding_state === 'live' ||
        customer.onboarding_state === 'settled',
      pausedUntil: customer.paused_until ? new Date(customer.paused_until) : null,
      today,
    });

    const onboardingChecklist = {
      contractSigned: true,
      contentPlanSet: expectedConceptsPerWeek >= 1,
      startConceptsLoaded: Boolean(buffer?.latest_planned_publish_date),
      tiktokHandleConfirmed: Boolean(customer.tiktok_handle),
      firstPublication: Boolean(buffer?.last_published_at),
    };

    const onboardingState = settleIfDue(
      customer.onboarding_state ?? deriveOnboardingState(onboardingChecklist),
      buffer?.last_published_at ? new Date(buffer.last_published_at) : null,
      today,
    );

    const blockedDays =
      blocking.daysSincePublish === 999
        ? 999
        : Math.max(0, blocking.daysSincePublish);
    const bufferStatus = customerBufferStatus(
      {
        pace: expectedConceptsPerWeek as 1 | 2 | 3 | 4 | 5,
        latestPlannedPublishDate: buffer?.latest_planned_publish_date
          ? new Date(buffer.latest_planned_publish_date)
          : null,
        pausedUntil: customer.paused_until
          ? new Date(customer.paused_until)
          : null,
        today,
      },
      blockedDays,
    );

    return {
      ...customer,
      bufferStatus,
      blocking,
      blockingDisplayDays: blockingDisplayDays(blocking),
      onboardingState,
      lastPublishedAt: buffer?.last_published_at
        ? new Date(buffer.last_published_at)
        : null,
    };
  });

  const cmRows = payload.team.map((member) => {
    const memberCustomers = customers.filter(
      (customer) =>
        (member.profile_id &&
          customer.account_manager_profile_id === member.profile_id) ||
        customer.account_manager?.toLowerCase() === member.name.toLowerCase() ||
        customer.account_manager?.toLowerCase() === member.email?.toLowerCase(),
    );

    const memberInteractions = payload.interactions
      .filter((interaction) => interaction.cm_id === member.id && interaction.created_at)
      .map((interaction) => ({
        type: interaction.type ?? 'unknown',
        created_at: new Date(interaction.created_at as string),
      }))
      .filter(
        (interaction) =>
          +interaction.created_at >= +(new Date(Date.now() - 7 * 86_400_000)),
      );

    return {
      member,
      aggregate: cmAggregate({
        cm: { id: member.id, name: member.name, avatarUrl: member.avatar_url },
        activeAbsence: (() => {
          const activeAbsence = findActiveCmAbsence(
            payload.absences,
            member.id,
            today.toISOString().slice(0, 10),
          );
          if (!activeAbsence) {
            return null;
          }

          const backupMember = payload.team.find(
            (entry) => entry.id === activeAbsence.backup_cm_id,
          );
          return {
            absenceType: activeAbsence.absence_type,
            startsOn: activeAbsence.starts_on,
            endsOn: activeAbsence.ends_on,
            backupCmName: backupMember?.name ?? null,
          };
        })(),
        customers: memberCustomers.map((customer) => ({
          id: customer.id,
          name: customer.business_name,
          bufferStatus: customer.bufferStatus,
          pace:
            (customer.expected_concepts_per_week ?? customer.concepts_per_week ?? 2) as
              | 1
              | 2
              | 3
              | 4
              | 5,
          onboardingState: customer.onboardingState,
          lastPublishedAt: customer.lastPublishedAt,
        })),
        interactions7d: memberInteractions,
        lastInteractionAt: memberInteractions[0]?.created_at ?? null,
        now: today,
      }),
    };
  });

  const sortedCmRows = sortCmRows(
    cmRows.map((row) => row.aggregate),
    sortMode,
  )
    .map((aggregate) =>
      cmRows.find((row) => row.aggregate.cmId === aggregate.cmId),
    )
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const allAttentionItems = sortAttention([
    ...payload.cmNotifications.map((notification) => ({
      kind: 'cm_notification' as const,
      id: notification.id,
      subjectType: 'cm_notification' as const,
      subjectId: notification.id,
      priority: notification.priority,
      createdAt: new Date(notification.created_at),
      from: teamByProfileId.get(notification.from_cm_id)?.name || 'CM-notis',
      message: notification.message,
      customerId: notification.customer_id,
      })),
    ...payload.scheduledAssignmentChanges
      .filter((change) => change.effective_date === todayKey)
      .map((change) => ({
        kind: 'cm_change_due_today' as const,
        id: `${change.customer_id}:${change.effective_date}`,
        subjectType: 'cm_assignment' as const,
        subjectId: `${change.customer_id}:${change.effective_date}`,
        customerId: change.customer_id,
        customerName: change.customer_name,
        currentCmName: change.current_cm_name,
        nextCmName: change.next_cm_name,
        effectiveDate: new Date(`${change.effective_date}T00:00:00`),
      })),
    ...customers
      .filter((customer) => customer.paused_until === todayKey)
      .map((customer) => ({
        kind: 'pause_resume_due_today' as const,
        id: customer.id,
        subjectType: 'subscription_pause_resume' as const,
        subjectId: customer.id,
        customerId: customer.id,
        customerName: customer.business_name,
        resumeDate: new Date(`${customer.paused_until}T00:00:00`),
      })),
    ...cmRows
      .filter((row) => {
        if (row.aggregate.status === 'away') {
          return false;
        }

        return (
          row.aggregate.status === 'needs_action' ||
          row.aggregate.interaction_count_7d === 0
        );
      })
      .map((row) => ({
        kind: 'cm_low_activity' as const,
        id: row.member.id,
        subjectType: 'cm_activity' as const,
        subjectId: row.member.id,
        customerId: null,
        cmName: row.member.name,
        interactionCount7d: row.aggregate.interaction_count_7d,
        expectedConcepts7d: row.aggregate.expected_concepts_7d,
        lastInteractionDays: row.aggregate.last_interaction_days,
      })),
    ...payload.invoices
      .filter((invoice) => invoice.customer_id && invoice.due_date)
      .map((invoice) => ({
        kind: 'invoice_unpaid' as const,
        id: invoice.id,
        subjectType: 'invoice' as const,
        subjectId: invoice.stripe_invoice_id ?? invoice.id,
        customerId: invoice.customer_id as string,
        daysPastDue: Math.max(
          0,
          Math.floor(
            (+today - +(new Date(invoice.due_date as string))) / 86_400_000,
          ),
        ),
        amount_ore: invoice.amount_due,
      }))
      .filter((invoice) => invoice.daysPastDue > 0),
    ...customers
      .filter(
        (customer) =>
          customer.onboardingState === 'cm_ready' &&
          customer.onboarding_state_changed_at,
      )
      .map((customer) => ({
        kind: 'onboarding_stuck' as const,
        id: customer.id,
        subjectType: 'onboarding' as const,
        subjectId: customer.id,
        customerId: customer.id,
        daysSinceCmReady: Math.floor(
          (+today -
            +(new Date(customer.onboarding_state_changed_at as string))) /
            86_400_000,
        ),
      }))
      .filter((customer) => customer.daysSinceCmReady >= 7),
    ...payload.demos.demos
      .filter((demo) => demo.status === 'responded' && demo.responded_at)
      .map((demo) => ({
        kind: 'demo_responded' as const,
        id: demo.id,
        subjectType: 'demo_response' as const,
        subjectId: demo.id,
        respondedAt: new Date(demo.responded_at as string),
        companyName: demo.company_name,
      })),
    ...customers
      .filter((customer) => customer.blocking.state === 'escalated')
      .map((customer) => ({
        kind: 'customer_blocked' as const,
        id: customer.id,
        subjectType: 'customer_blocking' as const,
        subjectId: customer.id,
        customerId: customer.id,
        daysBlocked: customer.blockingDisplayDays,
      })),
  ]);

  const attentionItems = allAttentionItems.filter((item) => {
    const subjectKey = `${item.subjectType}:${item.subjectId}`;
    return !snoozed.has(subjectKey);
  });

  const snoozedAttentionItems = allAttentionItems.filter((item) => {
    const subjectKey = `${item.subjectType}:${item.subjectId}`;
    return snoozed.has(subjectKey);
  });

  const cardInput = {
    activeSubscriptions: payload.subscriptions
      .filter((subscription) =>
        ['active', 'trialing', 'past_due'].includes(subscription.status),
      )
      .map((subscription) => ({
        mrr_ore: Number(subscription.amount ?? 0),
        created_at: new Date(
          subscription.created_at || subscription.created || today.toISOString(),
        ),
        canceled_at: subscription.canceled_at
          ? new Date(subscription.canceled_at)
          : null,
      })),
    customers: customers.map((customer) => ({
      id: customer.id,
      status: (
        customer.status === 'archived'
          ? 'churned'
          : customer.paused_until
            ? 'paused'
            : 'active'
      ) as 'active' | 'paused' | 'churned',
      activated_at:
        customer.status === 'active' || customer.status === 'agreed'
          ? new Date(customer.agreed_at || customer.created_at || today.toISOString())
          : null,
      churned_at:
        customer.status === 'archived'
          ? new Date(customer.created_at || today.toISOString())
          : null,
    })),
    demos: payload.demos.demos.map((demo) => ({
      id: demo.id,
      status: demo.status,
      status_changed_at: new Date(demo.status_changed_at),
      resolved_at: demo.resolved_at ? new Date(demo.resolved_at) : null,
    })),
    costs30d_ore: Math.round((payload.serviceCosts.total || 0) * 100),
    now: today,
  };

  const costEntries =
    payload.serviceCosts.entries.length > 0
      ? payload.serviceCosts.entries
      : DEFAULT_COST_SERVICES.map((service) => ({
          service,
          calls_30d: 0,
          cost_30d: 0,
          trend: [],
        }));

  return {
    revenueCard: monthlyRevenueCard(cardInput),
    activeCard: activeCustomersCard(cardInput),
    demosCard: demosCard(cardInput),
    costsCard: costsCard(cardInput),
    sortedCmRows,
    attentionItems,
    snoozedAttentionItems,
    costEntries,
  };
}
