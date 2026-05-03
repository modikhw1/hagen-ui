// Tillstånds-medveten banner i kundheadern.
// Visar EN kontextuell rad med primär-action utifrån var kunden står i livscykeln.
// Tyst när allt rullar.

import {
  AlertCircle,
  Mail,
  Tag as TagIcon,
  Pause,
  PlayCircle,
  PhoneCall,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { loadAdminCustomerHeader } from '@/lib/admin/customer-detail/load';
import { shortDateSv } from '@/lib/admin/time';

type HeaderData = Awaited<ReturnType<typeof loadAdminCustomerHeader>>;

type BannerTone = 'info' | 'warning' | 'danger' | 'neutral';

type Banner = {
  tone: BannerTone;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  title: string;
  detail?: string;
  actions: Array<{
    label: string;
    href?: string;
    target?: '_blank';
    intent?: 'primary' | 'ghost';
    /** klient-id som kopplas in i CustomerHeaderBannerActions */
    actionId?: string;
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
  const d = new Date(iso);
  return d.toDateString() === today.toDateString();
}

export function deriveHeaderBanner(
  c: HeaderData,
  today = new Date(),
): Banner | null {
  const ds = c.derived_status;

  // 1. Inbjuden, ej godkänt avtal → primär: skicka om / kopiera länk
  if (ds === 'invited_new' || ds === 'invited_stale') {
    const days = daysSince(c.invited_at, today);
    return {
      tone: ds === 'invited_stale' ? 'warning' : 'info',
      icon: Mail,
      title: 'Inbjuden — väntar på inloggning',
      detail:
        days !== null
          ? `Skickad för ${days} ${days === 1 ? 'dag' : 'dagar'} sedan.`
          : 'Kunden har inte loggat in än.',
      actions: [
        { label: 'Kopiera länk', actionId: 'copy_invite', intent: 'primary' },
        { label: 'Skicka om', actionId: 'resend_invite', intent: 'ghost' },
      ],
    };
  }

  // 2. Avtal ok men pris saknas → primär: SÄTT pris (tom-tillstånd, inte ändra)
  if (
    c.pricing_status === 'unknown' ||
    (!c.monthly_price_ore && (ds === 'draft' || c.agreed_at))
  ) {
    return {
      tone: 'warning',
      icon: TagIcon,
      title: 'Pris saknas',
      detail: 'Kunden kan inte gå live förrän pris är satt.',
      actions: [
        {
          label: 'Sätt pris',
          href: `/admin/customers/${c.id}/avtal?manualInvoice=0&focus=set-price`,
          intent: 'primary',
        },
      ],
    };
  }

  // 3. Pausad — paus slutar idag eller om kort
  if (c.paused_until) {
    const pauseEnd = new Date(c.paused_until);
    const daysUntil = Math.ceil(
      (pauseEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (isToday(c.paused_until, today)) {
      return {
        tone: 'warning',
        icon: PlayCircle,
        title: 'Paus slutar idag',
        detail: 'Bekräfta återupptagning eller förläng pausen.',
        actions: [
          { label: 'Återuppta', actionId: 'resume_subscription', intent: 'primary' },
          { label: 'Förläng paus', actionId: 'extend_pause', intent: 'ghost' },
        ],
      };
    }
    if (daysUntil > 0 && daysUntil <= 7) {
      return {
        tone: 'info',
        icon: Pause,
        title: `Paus slutar om ${daysUntil} ${daysUntil === 1 ? 'dag' : 'dagar'}`,
        detail: `Återupptas ${shortDateSv(c.paused_until)}.`,
        actions: [
          { label: 'Återuppta nu', actionId: 'resume_subscription', intent: 'ghost' },
          { label: 'Förläng', actionId: 'extend_pause', intent: 'ghost' },
        ],
      };
    }
    return {
      tone: 'neutral',
      icon: Pause,
      title: 'Pausad',
      detail: `Återupptas ${shortDateSv(c.paused_until)}.`,
      actions: [
        { label: 'Återuppta nu', actionId: 'resume_subscription', intent: 'ghost' },
      ],
    };
  }

  // 4. Eskalerad / obetalt
  if (ds === 'escalated') {
    return {
      tone: 'danger',
      icon: AlertCircle,
      title: 'Eskalerad',
      detail: 'Kräver manuellt beslut.',
      actions: [
        {
          label: 'Öppna fakturor',
          href: `/admin/customers/${c.id}/avtal`,
          intent: 'primary',
        },
      ],
    };
  }

  // 5. Live men ingen publicering på länge → human-action
  const daysSincePublish = daysSince(c.last_published_at, today);
  if (
    (ds === 'live_underfilled' || ds === 'live_healthy') &&
    daysSincePublish !== null &&
    daysSincePublish >= 7
  ) {
    return {
      tone: daysSincePublish >= 14 ? 'danger' : 'warning',
      icon: PhoneCall,
      title: `Inget publicerat på ${daysSincePublish} dagar`,
      detail: 'Hör av dig till kunden eller CM.',
      actions: [
        ...(c.contact_email
          ? [
              {
                label: 'Maila kund',
                href: `mailto:${c.contact_email}`,
                intent: 'primary' as const,
              },
            ]
          : []),
        { label: 'Snooza 3d', actionId: 'snooze_blocking_3d', intent: 'ghost' },
      ],
    };
  }

  // 6. Live men under-planerad
  if (ds === 'live_underfilled') {
    return {
      tone: 'info',
      icon: Clock,
      title: 'Behöver planeras',
      detail: 'Bufferten är låg — fyll på Feed Plannern.',
      actions: [
        {
          label: 'Planera i Studio',
          href: `/studio/customers/${c.id}`,
          target: '_blank',
          intent: 'primary',
        },
      ],
    };
  }

  // 7. Prospect
  if (ds === 'prospect') {
    return {
      tone: 'info',
      icon: Sparkles,
      title: 'Shadow-profil (demo)',
      detail: 'Förbered Studio-vyn innan konvertering.',
      actions: [
        {
          label: 'Öppna Studio',
          href: `/studio/customers/${c.id}`,
          target: '_blank',
          intent: 'primary',
        },
      ],
    };
  }

  // Allt rullar — ingen banner.
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
  const banner = deriveHeaderBanner(customer);
  if (!banner) return null;

  const Icon = banner.icon;

  return (
    <div
      className={`mt-3 flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${TONE_STYLES[banner.tone]}`}
      role="status"
    >
      <div className="flex items-start gap-2 min-w-0">
        <Icon className={`mt-0.5 shrink-0 ${TONE_ICON[banner.tone]}`} size={16} />
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">{banner.title}</div>
          {banner.detail && (
            <div className="text-xs opacity-80 leading-tight mt-0.5">
              {banner.detail}
            </div>
          )}
        </div>
      </div>
      {banner.actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 sm:shrink-0">
          {banner.actions.map((action, idx) => {
            const baseCls =
              'inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors';
            const cls =
              action.intent === 'primary'
                ? `${baseCls} bg-foreground text-background hover:opacity-90`
                : `${baseCls} border border-current/20 hover:bg-background/40`;

            if (action.href) {
              return (
                <a
                  key={idx}
                  href={action.href}
                  target={action.target}
                  rel={action.target === '_blank' ? 'noreferrer' : undefined}
                  className={cls}
                >
                  {action.label}
                </a>
              );
            }
            // actionId-baserade actions hanteras i CustomerHeaderBannerActions (klient).
            // Tills vidare renderas de som disabled-knappar för att undvika tysta no-ops.
            return (
              <button
                key={idx}
                type="button"
                className={cls}
                data-action-id={action.actionId}
                disabled
                title="Hanteras i nästa steg"
              >
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
