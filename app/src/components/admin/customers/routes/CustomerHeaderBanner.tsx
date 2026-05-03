'use client';

import type { ComponentType } from 'react';
import { useState } from 'react';
import {
  AlertCircle,
  Clock,
  Mail,
  Pause,
  PhoneCall,
  PlayCircle,
  Sparkles,
  Tag as TagIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { useCustomerMutation } from '@/hooks/admin/useCustomerMutation';
import { apiClient } from '@/lib/admin/api-client';
import type { loadAdminCustomerHeader } from '@/lib/admin/customer-detail/load';
import { shortDateSv } from '@/lib/admin/time';

type HeaderData = Awaited<ReturnType<typeof loadAdminCustomerHeader>>;
type BannerTone = 'info' | 'warning' | 'danger' | 'neutral';
type BannerActionId = 'copy_invite' | 'resend_invite' | 'resume_subscription' | 'snooze_blocking_3d';

type Banner = {
  tone: BannerTone;
  icon: ComponentType<{ className?: string; size?: number }>;
  title: string;
  detail?: string;
  actions: Array<{
    label: string;
    href?: string;
    target?: '_blank';
    intent?: 'primary' | 'ghost';
    actionId?: BannerActionId;
  }>;
};

function daysSince(iso: string | null | undefined, today = new Date()): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor((today.getTime() - ms) / (1000 * 60 * 60 * 24));
}

function isToday(iso: string | null | undefined, today = new Date()): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  return date.toDateString() === today.toDateString();
}

function hasActiveSnooze(
  customer: HeaderData,
  subjectType: 'onboarding' | 'customer_blocking',
  today = new Date(),
) {
  return (customer.attention_snoozes ?? []).some((snooze) => {
    const snoozeSubjectType =
      typeof snooze.subject_type === 'string' ? snooze.subject_type : null;
    const releasedAt =
      typeof snooze.released_at === 'string' ? snooze.released_at : null;
    const snoozedUntil =
      typeof snooze.snoozed_until === 'string' ? snooze.snoozed_until : null;

    if (snoozeSubjectType !== subjectType || releasedAt) {
      return false;
    }

    if (!snoozedUntil) {
      return true;
    }

    return new Date(snoozedUntil) > today;
  });
}

export function deriveHeaderBanner(
  customer: HeaderData,
  today = new Date(),
): Banner | null {
  const status = customer.derived_status;

  if (status === 'invited_new' || status === 'invited_stale') {
    const days = daysSince(customer.invited_at, today);
    return {
      tone: status === 'invited_stale' ? 'warning' : 'info',
      icon: Mail,
      title: 'Inbjuden - väntar på inloggning',
      detail:
        days !== null
          ? `Skickad för ${days} ${days === 1 ? 'dag' : 'dagar'} sedan.`
          : 'Kunden har inte loggat in ännu.',
      actions: [
        { label: 'Kopiera länk', actionId: 'copy_invite', intent: 'primary' },
        { label: 'Skicka om', actionId: 'resend_invite', intent: 'ghost' },
      ],
    };
  }

  if (
    customer.pricing_status === 'unknown' ||
    (!customer.monthly_price_ore && (status === 'draft' || customer.agreed_at))
  ) {
    return {
      tone: 'warning',
      icon: TagIcon,
      title: 'Pris saknas',
      detail: 'Kunden kan inte gå live förrän pris är satt.',
      actions: [
        {
          label: 'Sätt pris',
          href: `/admin/customers/${customer.id}/avtal?manualInvoice=0&focus=set-price`,
          intent: 'primary',
        },
      ],
    };
  }

  if (customer.paused_until) {
    const pauseEnd = new Date(customer.paused_until);
    const daysUntil = Math.ceil(
      (pauseEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (isToday(customer.paused_until, today)) {
      return {
        tone: 'warning',
        icon: PlayCircle,
        title: 'Paus slutar idag',
        detail: 'Bekräfta återupptagning eller förläng pausen.',
        actions: [
          { label: 'Återuppta', actionId: 'resume_subscription', intent: 'primary' },
          { label: 'Förläng paus', href: `/admin/customers/${customer.id}/avtal`, intent: 'ghost' },
        ],
      };
    }

    if (daysUntil > 0 && daysUntil <= 7) {
      return {
        tone: 'info',
        icon: Pause,
        title: `Paus slutar om ${daysUntil} ${daysUntil === 1 ? 'dag' : 'dagar'}`,
        detail: `Återupptas ${shortDateSv(customer.paused_until)}.`,
        actions: [
          { label: 'Återuppta nu', actionId: 'resume_subscription', intent: 'ghost' },
          { label: 'Förläng', href: `/admin/customers/${customer.id}/avtal`, intent: 'ghost' },
        ],
      };
    }

    return {
      tone: 'neutral',
      icon: Pause,
      title: 'Pausad',
      detail: `Återupptas ${shortDateSv(customer.paused_until)}.`,
      actions: [
        { label: 'Återuppta nu', actionId: 'resume_subscription', intent: 'ghost' },
      ],
    };
  }

  if (status === 'escalated') {
    return {
      tone: 'danger',
      icon: AlertCircle,
      title: 'Eskalerad',
      detail: 'Kräver manuellt beslut.',
      actions: [
        {
          label: 'Öppna fakturor',
          href: `/admin/customers/${customer.id}/avtal`,
          intent: 'primary',
        },
      ],
    };
  }

  const daysSincePublish = daysSince(customer.last_published_at, today);
  if (
    (status === 'live_underfilled' || status === 'live_healthy') &&
    daysSincePublish !== null &&
    daysSincePublish >= 7 &&
    !hasActiveSnooze(customer, 'customer_blocking', today)
  ) {
    return {
      tone: daysSincePublish >= 14 ? 'danger' : 'warning',
      icon: PhoneCall,
      title: `Inget publicerat på ${daysSincePublish} dagar`,
      detail: 'Kan betyda att kunden är blockerad eller att material inte laddats upp i tid.',
      actions: [
        ...(customer.contact_email
          ? [
              {
                label: 'Maila kund',
                href: `mailto:${customer.contact_email}`,
                intent: 'primary' as const,
              },
            ]
          : []),
        { label: 'Snooza 3d', actionId: 'snooze_blocking_3d', intent: 'ghost' },
      ],
    };
  }

  if (status === 'live_underfilled') {
    return {
      tone: 'info',
      icon: Clock,
      title: 'Behöver planeras',
      detail: 'Bufferten är låg - fyll på Feed Plannern.',
      actions: [
        {
          label: 'Planera i Studio',
          href: `/studio/customers/${customer.id}`,
          target: '_blank',
          intent: 'primary',
        },
      ],
    };
  }

  if (status === 'prospect') {
    return {
      tone: 'info',
      icon: Sparkles,
      title: 'Shadow-profil (demo)',
      detail: 'Förbered Studio-vyn innan konvertering.',
      actions: [
        {
          label: 'Öppna Studio',
          href: `/studio/customers/${customer.id}`,
          target: '_blank',
          intent: 'primary',
        },
      ],
    };
  }

  return null;
}

const TONE_STYLES: Record<BannerTone, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-900',
  neutral: 'border-border bg-muted text-foreground',
};

const TONE_ICON: Record<BannerTone, string> = {
  info: 'text-blue-600',
  warning: 'text-amber-600',
  danger: 'text-red-600',
  neutral: 'text-muted-foreground',
};

export default function CustomerHeaderBanner({
  customer,
}: {
  customer: HeaderData;
}) {
  const refresh = useAdminRefresh();
  const [pendingAction, setPendingAction] = useState<BannerActionId | null>(null);
  const resendInvite = useCustomerMutation(customer.id, 'resend_invite', {
    onSuccess: async () => {
      toast.success('Inbjudan skickades igen.');
      await refresh([{ type: 'customer', customerId: customer.id }]);
    },
  });
  const resumeSubscription = useCustomerMutation(customer.id, 'resume_subscription', {
    onSuccess: async () => {
      toast.success('Abonnemanget återupptogs.');
      await refresh([{ type: 'customer', customerId: customer.id }]);
    },
  });
  const banner = deriveHeaderBanner(customer);
  if (!banner) return null;

  const Icon = banner.icon;

  async function runAction(actionId: BannerActionId) {
    setPendingAction(actionId);
    try {
      if (actionId === 'copy_invite') {
        const response = await apiClient.post<{
          success: true;
          data: { invite_link: string };
        }>(`/api/admin/customers/${customer.id}/invite/link`, {});
        await navigator.clipboard.writeText(response.data.invite_link);
        toast.success('Invite-länk kopierad.');
        return;
      }

      if (actionId === 'resend_invite') {
        await resendInvite.mutateAsync({});
        return;
      }

      if (actionId === 'resume_subscription') {
        await resumeSubscription.mutateAsync({});
        return;
      }

      if (actionId === 'snooze_blocking_3d') {
        await apiClient.post(
          `/api/admin/attention/customer_blocking/${customer.id}/snooze`,
          { days: 3 },
        );
        toast.success('Blockeringen snoozades i 3 dagar.');
        await refresh([{ type: 'customer', customerId: customer.id }]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Kunde inte köra åtgärden.');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div
      className={`mt-3 flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${TONE_STYLES[banner.tone]}`}
      role="status"
    >
      <div className="min-w-0 flex items-start gap-2">
        <Icon className={`mt-0.5 shrink-0 ${TONE_ICON[banner.tone]}`} size={16} />
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">{banner.title}</div>
          {banner.detail ? (
            <div className="mt-0.5 text-xs leading-tight opacity-80">{banner.detail}</div>
          ) : null}
        </div>
      </div>
      {banner.actions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 sm:shrink-0">
          {banner.actions.map((action, index) => {
            const baseClassName =
              'inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors';
            const className =
              action.intent === 'primary'
                ? `${baseClassName} bg-foreground text-background hover:opacity-90`
                : `${baseClassName} border border-current/20 hover:bg-background/40`;

            if (action.href) {
              return (
                <a
                  key={index}
                  href={action.href}
                  target={action.target}
                  rel={action.target === '_blank' ? 'noreferrer' : undefined}
                  className={className}
                >
                  {action.label}
                </a>
              );
            }

            return (
              <button
                key={index}
                type="button"
                className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
                disabled={pendingAction === action.actionId}
                onClick={() => {
                  if (action.actionId) {
                    void runAction(action.actionId);
                  }
                }}
              >
                {pendingAction === action.actionId ? 'Arbetar...' : action.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
