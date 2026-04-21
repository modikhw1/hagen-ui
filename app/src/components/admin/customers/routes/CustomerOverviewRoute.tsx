'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ChartSVG, smoothData, ViewsScatterChart } from '@/components/admin/customers/ChartSVG';
import {
  useCustomerDetail,
  useTikTokStats,
} from '@/hooks/admin/useCustomerDetail';
import { customerBufferStatus } from '@/lib/admin-derive/buffer';
import { blockingDisplayDays, customerBlocking } from '@/lib/admin-derive/blocking';
import { deriveOnboardingState, settleIfDue } from '@/lib/admin-derive/onboarding';
import {
  getLikeRateTier,
  getSuccessThresholds,
} from '@/lib/customer-detail/success';
import type { TikTokProfilePreview } from '@/lib/tiktok/profile';
import { shortDateSv } from '@/lib/admin/time';
import { useCustomerRouteRefresh } from './useCustomerRouteRefresh';
import {
  bufferLabel,
  CustomerActionButton,
  CustomerChecklistRow,
  CustomerMetricCard,
  CustomerRouteError,
  CustomerRouteLoading,
  CustomerSection,
  CustomerStatusPill,
  onboardingLabel,
} from './shared';

function normalizeTikTokProfileInput(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export default function CustomerOverviewRoute({ customerId }: { customerId: string }) {
  const { data: customer, isLoading, error } = useCustomerDetail(customerId);
  const { data: tiktok } = useTikTokStats(customerId);
  const refresh = useCustomerRouteRefresh(customerId);
  const [tiktokProfileUrlInput, setTiktokProfileUrlInput] = useState('');
  const [savingTikTokProfile, setSavingTikTokProfile] = useState(false);
  const [verifyingTikTokProfile, setVerifyingTikTokProfile] = useState(false);
  const [fetchingProfileHistory, setFetchingProfileHistory] = useState(false);
  const [tiktokProfileError, setTiktokProfileError] = useState<string | null>(null);
  const [tiktokProfileMessage, setTiktokProfileMessage] = useState<string | null>(null);
  const [tiktokProfilePreview, setTiktokProfilePreview] = useState<TikTokProfilePreview | null>(
    null,
  );
  const [updatingAttention, setUpdatingAttention] = useState(false);
  const [attentionMessage, setAttentionMessage] = useState<string | null>(null);
  const [attentionError, setAttentionError] = useState<string | null>(null);

  useEffect(() => {
    setTiktokProfileUrlInput(customer?.tiktok_profile_url || '');
  }, [customer?.tiktok_profile_url]);

  useEffect(() => {
    if (!tiktokProfilePreview) return;

    const inputHandle = normalizeTikTokProfileInput(tiktokProfileUrlInput);
    if (!inputHandle || inputHandle !== normalizeTikTokProfileInput(tiktokProfilePreview.handle)) {
      setTiktokProfilePreview(null);
    }
  }, [tiktokProfilePreview, tiktokProfileUrlInput]);

  const followerSmoothed = useMemo(
    () => (tiktok ? smoothData(tiktok.follower_history_30d, 7) : []),
    [tiktok],
  );

  if (isLoading) {
    return <CustomerRouteLoading label="Laddar oversikt..." />;
  }

  if (error || !customer) {
    return <CustomerRouteError message={error?.message || 'Kunden hittades inte.'} />;
  }

  const today = new Date();
  const blocking = customerBlocking({
    lastPublishedAt: customer.last_published_at ? new Date(customer.last_published_at) : null,
    activatedAt:
      customer.agreed_at || customer.created_at
        ? new Date(customer.agreed_at || customer.created_at)
        : null,
    isLive:
      customer.status === 'active' ||
      customer.status === 'agreed' ||
      customer.onboarding_state === 'live' ||
      customer.onboarding_state === 'settled',
    pausedUntil: customer.paused_until ? new Date(customer.paused_until) : null,
    today,
  });
  const visibleBlockingDays = blockingDisplayDays(blocking);
  const onboardingChecklist = {
    contractSigned: true,
    contentPlanSet: (customer.expected_concepts_per_week ?? customer.concepts_per_week ?? 2) >= 1,
    startConceptsLoaded: Boolean(customer.latest_planned_publish_date),
    tiktokHandleConfirmed: Boolean(customer.tiktok_handle),
    firstPublication: Boolean(customer.last_published_at),
  };
  const onboardingState = settleIfDue(
    customer.onboarding_state ?? deriveOnboardingState(onboardingChecklist),
    customer.last_published_at ? new Date(customer.last_published_at) : null,
    today,
  );
  const blockedDays =
    blocking.daysSincePublish === 999 ? 999 : Math.max(0, blocking.daysSincePublish);
  const bufferStatus = customerBufferStatus(
    {
      pace: (customer.expected_concepts_per_week ?? customer.concepts_per_week ?? 2) as
        | 1
        | 2
        | 3
        | 4
        | 5,
      latestPlannedPublishDate: customer.latest_planned_publish_date
        ? new Date(customer.latest_planned_publish_date)
        : null,
      pausedUntil: customer.paused_until ? new Date(customer.paused_until) : null,
      today,
    },
    blockedDays,
  );
  const activeSnooze = customer.attention_snoozes.find((snooze) => {
    if (snooze.released_at) return false;
    if (!snooze.snoozed_until) return true;
    return new Date(snooze.snoozed_until) > today;
  });
  const thresholds = tiktok ? getSuccessThresholds(tiktok.followers) : null;
  const recentVideos = tiktok?.recent_videos || [];
  const meanViews30d = recentVideos.length
    ? Math.round(recentVideos.reduce((sum, video) => sum + video.views, 0) / recentVideos.length)
    : 0;
  const viralCount = thresholds
    ? recentVideos.filter((video) => video.views >= thresholds.viral).length
    : 0;
  const hitCount = thresholds
    ? recentVideos.filter((video) => video.views >= thresholds.hit).length
    : 0;
  const totalLikes = recentVideos.reduce((sum, video) => sum + video.likes, 0);
  const totalViews = recentVideos.reduce((sum, video) => sum + video.views, 0);
  const likeRate = totalViews > 0 ? (totalLikes / totalViews) * 100 : 0;
  const likeTier = getLikeRateTier(likeRate);

  const handleVerifyTikTokProfile = async () => {
    if (verifyingTikTokProfile) return null;

    const input = tiktokProfileUrlInput.trim();
    if (!input) {
      setTiktokProfilePreview(null);
      setTiktokProfileError('Ange en TikTok-profil forst.');
      setTiktokProfileMessage(null);
      return null;
    }

    setVerifyingTikTokProfile(true);
    setTiktokProfileError(null);
    setTiktokProfileMessage(null);

    try {
      const response = await fetch(
        `/api/admin/tiktok/profile-preview?input=${encodeURIComponent(input)}`,
        { credentials: 'include' },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        preview?: TikTokProfilePreview;
      };

      if (!response.ok || !payload.preview) {
        throw new Error(payload.error || 'Kunde inte verifiera TikTok-profilen');
      }

      setTiktokProfilePreview(payload.preview);
      setTiktokProfileMessage(
        `Verifierade @${payload.preview.handle}. Spara for att koppla profilen.`,
      );
      return payload.preview;
    } catch (error) {
      setTiktokProfilePreview(null);
      setTiktokProfileError(
        error instanceof Error ? error.message : 'Kunde inte verifiera TikTok-profilen',
      );
      return null;
    } finally {
      setVerifyingTikTokProfile(false);
    }
  };

  const handleSaveTikTokProfile = async () => {
    if (savingTikTokProfile) return;

    const input = tiktokProfileUrlInput.trim();
    if (input) {
      const inputHandle = normalizeTikTokProfileInput(input);
      const preview =
        tiktokProfilePreview &&
        normalizeTikTokProfileInput(tiktokProfilePreview.handle) === inputHandle
          ? tiktokProfilePreview
          : null;

      if (!preview) {
        setTiktokProfileError('Verifiera profilen innan du sparar den.');
        setTiktokProfileMessage(null);
        return;
      }
    }

    setSavingTikTokProfile(true);
    setTiktokProfileError(null);
    setTiktokProfileMessage(null);

    try {
      const response = await fetch(`/api/studio-v2/customers/${customer.id}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tiktok_profile_url: input || null,
          tiktok_profile_preview: tiktokProfilePreview,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte spara TikTok-profilen');
      }

      setTiktokProfileMessage(input ? 'TikTok-profilen sparades.' : 'TikTok-profilen togs bort.');
      await refresh();
    } catch (error) {
      setTiktokProfileError(
        error instanceof Error ? error.message : 'Kunde inte spara TikTok-profilen',
      );
    } finally {
      setSavingTikTokProfile(false);
    }
  };

  const handleFetchTikTokProfile = async () => {
    if (fetchingProfileHistory || !customer.tiktok_handle || !customer.tiktok_profile_url) {
      return;
    }

    setFetchingProfileHistory(true);
    setTiktokProfileError(null);
    setTiktokProfileMessage(null);

    try {
      const response = await fetch(
        `/api/studio-v2/customers/${customer.id}/fetch-profile-history`,
        {
          method: 'POST',
          credentials: 'include',
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte hamta profilhistorik');
      }

      setTiktokProfileMessage('Profilhistorik hamtas nu.');
      await refresh();
    } catch (error) {
      setTiktokProfileError(
        error instanceof Error ? error.message : 'Kunde inte hamta profilhistorik',
      );
    } finally {
      setFetchingProfileHistory(false);
    }
  };

  const runAttentionSnooze = async (
    subjectType: 'onboarding' | 'customer_blocking',
    days: number | null,
  ) => {
    setUpdatingAttention(true);
    setAttentionError(null);
    setAttentionMessage(null);

    try {
      const response = await fetch(`/api/admin/attention/${subjectType}/${customer.id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ days }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte markera som hanteras');
      }

      setAttentionMessage(
        days == null
          ? 'Markeringen ligger kvar tills vidare.'
          : `Markerad som hanteras i ${days} dagar.`,
      );
      await refresh();
    } catch (error) {
      setAttentionError(
        error instanceof Error ? error.message : 'Kunde inte markera som hanteras',
      );
    } finally {
      setUpdatingAttention(false);
    }
  };

  const clearAttentionSnooze = async (subjectType: 'onboarding' | 'customer_blocking') => {
    setUpdatingAttention(true);
    setAttentionError(null);
    setAttentionMessage(null);

    try {
      const response = await fetch(`/api/admin/attention/${subjectType}/${customer.id}/snooze`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte ta bort hanteras-markering');
      }

      setAttentionMessage('Hanteras-markeringen togs bort.');
      await refresh();
    } catch (error) {
      setAttentionError(
        error instanceof Error ? error.message : 'Kunde inte ta bort hanteras-markering',
      );
    } finally {
      setUpdatingAttention(false);
    }
  };

  const setPlannedPause = async (days: number | null) => {
    setUpdatingAttention(true);
    setAttentionError(null);
    setAttentionMessage(null);

    try {
      const pausedUntil =
        days == null
          ? null
          : new Date(Date.now() + days * 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10);

      const response = await fetch(`/api/admin/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          paused_until: pausedUntil,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte satta planerad paus');
      }

      setAttentionMessage(
        pausedUntil
          ? `Planerad paus satt till ${shortDateSv(pausedUntil)}.`
          : 'Planerad paus borttagen.',
      );
      await refresh();
    } catch (error) {
      setAttentionError(
        error instanceof Error ? error.message : 'Kunde inte satta planerad paus',
      );
    } finally {
      setUpdatingAttention(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
      <div className="space-y-6">
        <CustomerSection title="TikTok">
          {tiktok ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <CustomerMetricCard
                  label="7d snitt"
                  value={Math.round(tiktok.avg_views_7d).toLocaleString('sv-SE')}
                  sub={`${tiktok.follower_delta_7d > 0 ? '+' : ''}${tiktok.follower_delta_7d}% vs forra veckan`}
                  emphasis={tiktok.avg_views_7d > 0 ? 'success' : 'default'}
                />
                <CustomerMetricCard
                  label="30d snitt"
                  value={meanViews30d.toLocaleString('sv-SE')}
                  sub={`${hitCount} hits · ${viralCount} virala`}
                />
                <CustomerMetricCard
                  label="Engagement"
                  value={`${tiktok.engagement_rate.toFixed(1)}%`}
                  sub={`${tiktok.total_videos} videor totalt`}
                />
                <CustomerMetricCard
                  label="Like rate"
                  value={`${likeRate.toFixed(1)}%`}
                  sub={likeTier}
                  emphasis={likeTier}
                />
              </div>

              {thresholds ? (
                <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                  <div>
                    <div className="mb-2 flex items-baseline justify-between">
                      <div className="text-xs font-semibold text-muted-foreground">
                        Videor senaste 30 dagarna
                      </div>
                      <div className="text-[10px] italic text-muted-foreground">
                        Hit {thresholds.hit.toLocaleString('sv-SE')} · Viral{' '}
                        {thresholds.viral.toLocaleString('sv-SE')}
                      </div>
                    </div>
                    <div className="rounded-lg bg-secondary/30 p-3">
                      <ViewsScatterChart
                        videos={recentVideos}
                        hitThreshold={thresholds.hit}
                        viralThreshold={thresholds.viral}
                        windowEndIso={tiktok.window_end_iso}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-baseline justify-between">
                      <div className="text-xs font-semibold text-muted-foreground">
                        Foljare (30d) · {tiktok.followers.toLocaleString('sv-SE')}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {tiktok.follower_delta_30d > 0 ? '+' : ''}
                        {tiktok.follower_delta_30d}%
                      </div>
                    </div>
                    <div className="rounded-lg bg-secondary/30 p-3">
                      <ChartSVG
                        data={tiktok.follower_history_30d}
                        smoothed={followerSmoothed}
                        height={50}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-md border border-border bg-secondary/20 px-4 py-4 text-sm text-muted-foreground">
              Ingen TikTok-data hittades for kunden an.
            </div>
          )}
        </CustomerSection>

        <CustomerSection title="TikTok-profil">
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Profil-URL
              </div>
              <input
                value={tiktokProfileUrlInput}
                onChange={(event) => setTiktokProfileUrlInput(event.target.value)}
                placeholder="https://www.tiktok.com/@konto"
                className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
              />
            </div>

            {customer.tiktok_handle ? (
              <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                <div className="font-semibold text-foreground">@{customer.tiktok_handle}</div>
                {customer.tiktok_user_id ? <div>TikTok-ID: {customer.tiktok_user_id}</div> : null}
              </div>
            ) : (
              <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                Ingen profil ar kopplad an. Spara forst ratt TikTok-URL sa att studioflodet kan byggas fran ratt konto.
              </div>
            )}

            {tiktokProfilePreview ? (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-3 text-xs text-muted-foreground">
                <div className="font-semibold text-foreground">
                  Verifierad profil: @{tiktokProfilePreview.handle}
                </div>
                {tiktokProfilePreview.author_name ? <div>{tiktokProfilePreview.author_name}</div> : null}
                {tiktokProfilePreview.title ? <div className="mt-1">{tiktokProfilePreview.title}</div> : null}
                <a
                  href={tiktokProfilePreview.canonical_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 font-medium text-primary hover:text-primary/80"
                >
                  Oppna profilen
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ) : null}

            {tiktokProfileMessage ? (
              <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
                {tiktokProfileMessage}
              </div>
            ) : null}
            {tiktokProfileError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {tiktokProfileError}
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <CustomerActionButton
                onClick={() => {
                  void handleVerifyTikTokProfile();
                }}
                disabled={verifyingTikTokProfile || !tiktokProfileUrlInput.trim()}
              >
                {verifyingTikTokProfile ? 'Verifierar profil...' : 'Verifiera profil'}
              </CustomerActionButton>
              <CustomerActionButton
                onClick={() => {
                  void handleSaveTikTokProfile();
                }}
                disabled={
                  savingTikTokProfile ||
                  (Boolean(tiktokProfileUrlInput.trim()) && !tiktokProfilePreview)
                }
              >
                {savingTikTokProfile
                  ? 'Sparar profil...'
                  : tiktokProfileUrlInput.trim()
                    ? 'Spara verifierad profil'
                    : 'Ta bort TikTok-profil'}
              </CustomerActionButton>
              <CustomerActionButton
                onClick={() => {
                  void handleFetchTikTokProfile();
                }}
                disabled={
                  fetchingProfileHistory || !customer.tiktok_handle || !customer.tiktok_profile_url
                }
              >
                {fetchingProfileHistory ? 'Hamtar profil...' : 'Hamta profil till kunden'}
              </CustomerActionButton>
            </div>
          </div>
        </CustomerSection>
      </div>

      <div className="space-y-6">
        <CustomerSection title="Operativ status">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <CustomerStatusPill
                label={onboardingLabel(onboardingState)}
                tone={
                  onboardingState === 'settled' || onboardingState === 'live'
                    ? 'success'
                    : onboardingState === 'cm_ready'
                      ? 'warning'
                      : 'info'
                }
              />
              <CustomerStatusPill
                label={bufferLabel(bufferStatus)}
                tone={
                  bufferStatus === 'ok'
                    ? 'success'
                    : bufferStatus === 'under'
                      ? 'danger'
                      : bufferStatus === 'paused'
                        ? 'neutral'
                        : 'warning'
                }
              />
              {blocking.state !== 'none' ? (
                <CustomerStatusPill
                  label={`${blocking.state === 'escalated' ? 'Eskalerad' : 'Blockerad'} ${visibleBlockingDays}d`}
                  tone={blocking.state === 'escalated' ? 'danger' : 'warning'}
                />
              ) : null}
            </div>

            <div className="rounded-md border border-border bg-secondary/30 p-3">
              <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                Onboarding-checklista
              </div>
              <CustomerChecklistRow
                label="Innehallsplan satt"
                done={onboardingChecklist.contentPlanSet}
              />
              <CustomerChecklistRow
                label="Startbuffer laddad"
                done={onboardingChecklist.startConceptsLoaded}
              />
              <CustomerChecklistRow
                label="TikTok-profil bekraftad"
                done={onboardingChecklist.tiktokHandleConfirmed}
              />
              <CustomerChecklistRow
                label="Forsta publicering gjord"
                done={onboardingChecklist.firstPublication}
              />
            </div>

            <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
              <div>
                Senaste publicering:{' '}
                {customer.last_published_at
                  ? shortDateSv(customer.last_published_at)
                  : 'Ingen an - blockerad sedan aktivering'}
              </div>
              <div>Planerad buffer till: {shortDateSv(customer.latest_planned_publish_date)}</div>
              <div>Planerad paus till: {shortDateSv(customer.paused_until)}</div>
            </div>

            {activeSnooze ? (
              <div className="rounded-md border border-info/30 bg-info/5 px-3 py-3 text-xs text-info">
                <div className="font-semibold">
                  Hanteras{' '}
                  {activeSnooze.snoozed_until
                    ? `till ${shortDateSv(activeSnooze.snoozed_until)}`
                    : 'utan sluttid'}
                </div>
                {activeSnooze.note ? <div className="mt-1">{activeSnooze.note}</div> : null}
                <button
                  type="button"
                  onClick={() => void clearAttentionSnooze(activeSnooze.subject_type)}
                  disabled={updatingAttention}
                  className="mt-2 text-xs font-semibold text-info hover:opacity-80 disabled:opacity-50"
                >
                  Ta bort hanteras-markering
                </button>
              </div>
            ) : null}

            {attentionMessage ? (
              <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
                {attentionMessage}
              </div>
            ) : null}
            {attentionError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {attentionError}
              </div>
            ) : null}

            <div className="space-y-2">
              {blocking.state !== 'none' ? (
                <>
                  <CustomerActionButton
                    onClick={() => {
                      void runAttentionSnooze('customer_blocking', 3);
                    }}
                    disabled={updatingAttention}
                  >
                    Markera blockerad kund som hanteras i 3 dagar
                  </CustomerActionButton>
                  <CustomerActionButton
                    onClick={() => {
                      void runAttentionSnooze('customer_blocking', 7);
                    }}
                    disabled={updatingAttention}
                  >
                    Markera blockerad kund som hanteras i 7 dagar
                  </CustomerActionButton>
                  <CustomerActionButton
                    onClick={() => {
                      void setPlannedPause(7);
                    }}
                    disabled={updatingAttention}
                  >
                    Satt planerad paus i 7 dagar
                  </CustomerActionButton>
                  {customer.paused_until ? (
                    <CustomerActionButton
                      onClick={() => {
                        void setPlannedPause(null);
                      }}
                      disabled={updatingAttention}
                    >
                      Ta bort planerad paus
                    </CustomerActionButton>
                  ) : null}
                </>
              ) : null}
              {onboardingState === 'cm_ready' ? (
                <CustomerActionButton
                  onClick={() => {
                    void runAttentionSnooze('onboarding', 3);
                  }}
                  disabled={updatingAttention}
                >
                  Markera onboarding som hanteras i 3 dagar
                </CustomerActionButton>
              ) : null}
            </div>
          </div>
        </CustomerSection>
      </div>
    </div>
  );
}
