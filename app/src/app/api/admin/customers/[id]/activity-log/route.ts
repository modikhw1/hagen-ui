import { withAuth } from '@/lib/auth/api-auth';
import { listAuditLog } from '@/lib/admin/audit-log';
import { jsonError, jsonOk } from '@/lib/server/api-response';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

type ActivityEntry = {
  id: string;
  at: string;
  kind: 'audit' | 'cm_activity' | 'game_plan' | 'concept';
  title: string;
  description: string;
  actorLabel: string | null;
  actorRole: string | null;
};

function metadataCustomerProfileId(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  return typeof metadata?.customer_profile_id === 'string'
    ? metadata.customer_profile_id
    : null;
}

function humanizeAuditAction(action: string) {
  const labels: Record<string, string> = {
    'admin.customer.created': 'Kund skapad',
    'admin.customer.invited': 'Kund inbjuden',
    'admin.customer.invite_resent': 'Invite skickad igen',
    'admin.customer.activated': 'Kund aktiverad',
    'admin.customer.reactivated': 'Arkiverad kund ateraktiverad',
    'admin.customer.updated': 'Kunduppgifter uppdaterade',
    'admin.customer.archived': 'Kund arkiverad',
    'admin.customer.cm_changed': 'Content Manager andrad',
    'admin.customer.cm_change_scheduled': 'CM-byte schemalagt',
    'admin.customer.subscription_cancelled': 'Abonnemang avslutat',
    'admin.customer.subscription_paused': 'Abonnemang pausat',
    'admin.customer.subscription_resumed': 'Abonnemang aterupptaget',
    'admin.customer.subscription_price_changed': 'Abonnemangspris andrat',
    'admin.customer.discount_applied': 'Rabatt applicerad',
    'admin.customer.discount_removed': 'Rabatt borttagen',
    'admin.customer.temporary_coverage_created': 'Tillfallig CM-coverage skapad',
    'admin.invoice.created': 'Manuell faktura skapad',
    'admin.invoice.paid': 'Faktura markerad som betald',
    'admin.invoice.voided': 'Faktura annullerad',
    'admin.invoice.credit_note_created': 'Kreditnota skapad',
    'admin.invoice.credit_note_reissued': 'Kreditnota skapad och ersattningsfaktura skickad',
    'admin.invoice.credit_note_reissue_failed': 'Kreditnota skapad men ersattningsfaktura misslyckades',
    'admin.invoice_item.created': 'Pending invoice item skapad',
    'admin.invoice_item.deleted': 'Pending invoice item borttagen',
    'system.customer.auto_archived_after_subscription_end': 'Kund auto-arkiverad efter avslutat abonnemang',
  };

  return labels[action] || action;
}

function buildAuditDescription(entry: {
  action: string;
  metadata: Record<string, unknown> | null;
}) {
  if (entry.action === 'admin.customer.invited' || entry.action === 'admin.customer.invite_resent') {
    return 'En ny onboarding-lank skickades till kunden.';
  }

  if (entry.action === 'admin.customer.cm_changed' || entry.action === 'admin.customer.cm_change_scheduled') {
    const date = typeof entry.metadata?.effective_date === 'string'
      ? entry.metadata.effective_date
      : null;
    return date ? `Galler fran ${date}.` : 'CM-ansvaret uppdaterades.';
  }

  if (entry.action === 'admin.customer.subscription_price_changed') {
    const monthlyPrice = typeof entry.metadata?.monthly_price === 'number'
      ? entry.metadata.monthly_price
      : null;
    return monthlyPrice != null
      ? `Nytt manadspris ${monthlyPrice.toLocaleString('sv-SE')} kr.`
      : 'Abonnemangspriset andrades.';
  }

  if (entry.action === 'admin.customer.discount_applied') {
    const type = typeof entry.metadata?.type === 'string' ? entry.metadata.type : 'discount';
    const value = typeof entry.metadata?.value === 'number' ? entry.metadata.value : null;
    return value != null ? `${type} satt till ${value}.` : 'Rabatt lades till pa kunden.';
  }

  if (entry.action === 'admin.invoice.created') {
    const itemCount = typeof entry.metadata?.item_count === 'number' ? entry.metadata.item_count : null;
    return itemCount != null
      ? `${itemCount} rad${itemCount === 1 ? '' : 'er'} lades pa fakturan.`
      : 'En manuell faktura skapades.';
  }

  return 'Handelsen loggades via adminpanelen.';
}

export const GET = withAuth(async (_request, _user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!id) {
    return jsonError('Kund-ID kravs', 400);
  }

  try {
    const supabaseAdmin = createSupabaseAdmin();

    const [
      auditResult,
      cmActivitiesResult,
      gamePlanResult,
      conceptTimelineResult,
    ] = await Promise.all([
      listAuditLog(supabaseAdmin, 250),
      supabaseAdmin
        .from('cm_activities')
        .select('id, activity_type, description, cm_email, created_at')
        .eq('customer_profile_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('customer_game_plans')
        .select('updated_at, updated_by')
        .eq('customer_id', id)
        .maybeSingle(),
      supabaseAdmin
        .from('customer_concepts')
        .select('id, custom_headline, added_at, sent_at, produced_at, published_at')
        .eq('customer_profile_id', id)
        .order('updated_at', { ascending: false })
        .limit(12),
    ]);

    const activity: ActivityEntry[] = [];

    auditResult.entries
      .filter((entry) =>
        (entry.entity_type === 'customer_profile' && entry.entity_id === id) ||
        metadataCustomerProfileId(entry.metadata) === id,
      )
      .forEach((entry) => {
        activity.push({
          id: `audit:${entry.id}`,
          at: entry.created_at,
          kind: 'audit',
          title: humanizeAuditAction(entry.action),
          description: buildAuditDescription(entry),
          actorLabel: entry.actor_email || null,
          actorRole: entry.actor_role || null,
        });
      });

    (cmActivitiesResult.data ?? []).forEach((entry) => {
      if (!entry.created_at) return;
      activity.push({
        id: `cm_activity:${entry.id}`,
        at: entry.created_at,
        kind: 'cm_activity',
        title: 'CM-aktivitet',
        description: entry.description,
        actorLabel: entry.cm_email,
        actorRole: entry.activity_type || 'content_manager',
      });
    });

    if (gamePlanResult.data?.updated_at) {
      let actorLabel: string | null = null;
      if (gamePlanResult.data.updated_by) {
        const profileResult = await supabaseAdmin
          .from('profiles')
          .select('email')
          .eq('id', gamePlanResult.data.updated_by)
          .maybeSingle();
        actorLabel = profileResult.data?.email ?? null;
      }

      activity.push({
        id: `game_plan:${id}`,
        at: gamePlanResult.data.updated_at,
        kind: 'game_plan',
        title: 'Game Plan uppdaterad',
        description: 'Den personliga game planen justerades eller ersattes.',
        actorLabel,
        actorRole: gamePlanResult.data.updated_by ? 'editor' : null,
      });
    }

    (conceptTimelineResult.data ?? []).forEach((concept) => {
      const conceptLabel = concept.custom_headline?.trim() || 'Koncept';
      const milestones = [
        {
          key: 'published',
          at: concept.published_at,
          title: 'Video publicerad',
          description: `${conceptLabel} gick ut i historiken som publicerat innehall.`,
        },
        {
          key: 'produced',
          at: concept.produced_at,
          title: 'Video producerad',
          description: `${conceptLabel} markerades som producerad.`,
        },
        {
          key: 'sent',
          at: concept.sent_at,
          title: 'Koncept delat med kund',
          description: `${conceptLabel} skickades ut till kunden.`,
        },
        {
          key: 'added',
          at: concept.added_at,
          title: 'Koncept lagt i plan',
          description: `${conceptLabel} lades till i kundens feed.`,
        },
      ] as const;

      const milestone = milestones.find((entry) => typeof entry.at === 'string');
      if (!milestone || typeof milestone.at !== 'string') {
        return;
      }

      activity.push({
        id: `concept:${concept.id}:${milestone.key}`,
        at: milestone.at,
        kind: 'concept',
        title: milestone.title,
        description: milestone.description,
        actorLabel: null,
        actorRole: null,
      });
    });

    activity.sort((left, right) => +new Date(right.at) - +new Date(left.at));

    return jsonOk({
      activities: activity.slice(0, 40),
      schemaWarnings: auditResult.schemaWarnings,
    });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : 'Kunde inte hamta aktivitetsloggen',
      500,
    );
  }
}, ['admin']);
