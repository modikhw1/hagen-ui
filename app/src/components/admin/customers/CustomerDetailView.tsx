'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Pencil, X } from 'lucide-react';
import AdminAvatar from '@/components/admin/AdminAvatar';
import { customerBufferStatus } from '@/lib/admin-derive/buffer';
import { blockingDisplayDays, customerBlocking } from '@/lib/admin-derive/blocking';
import { deriveOnboardingState, settleIfDue } from '@/lib/admin-derive/onboarding';
import { formatSek, sekToOre } from '@/lib/admin/money';
import { customerStatusConfig, intervalLong } from '@/lib/admin/labels';
import { shortDateSv, timeAgoSv } from '@/lib/admin/time';
import {
  useCustomerActivity,
  useCustomerDetail,
  useCustomerInvoices,
  useTikTokStats,
} from '@/hooks/admin/useCustomerDetail';
import { useTeamMembers } from '@/hooks/admin/useCustomers';
import { ChartSVG, smoothData, ViewsScatterChart } from './ChartSVG';
import PendingInvoiceItems from './PendingInvoiceItems';
import ContractEditForm from './ContractEditForm';
import ContactEditForm from './ContactEditForm';
import InvoiceOperationsModal from '@/components/admin/billing/InvoiceOperationsModal';
import SubscriptionPriceChangeModal from '@/components/admin/billing/SubscriptionPriceChangeModal';
import SubscriptionActions from './SubscriptionActions';
import DiscountModal from './modals/DiscountModal';
import ManualInvoiceModal from './modals/ManualInvoiceModal';
import ChangeCMModal from './modals/ChangeCMModal';
import {
  getLikeRateTier,
  getSuccessThresholds,
  type LikeRateTier,
} from '@/lib/customer-detail/success';
import type { TikTokProfilePreview } from '@/lib/tiktok/profile';

const likeRateTierClass: Record<LikeRateTier, string> = {
  poor: 'text-destructive',
  ok: 'text-warning',
  good: 'text-success',
  great: 'text-success',
};

const likeRateTierLabel: Record<LikeRateTier, string> = {
  poor: 'Lagt',
  ok: 'Ok',
  good: 'Bra',
  great: 'Mycket bra',
};

function normalizeTikTokProfileInput(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export default function CustomerDetailView({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: customer, isLoading, error } = useCustomerDetail(id);
  const { data: invoices = [] } = useCustomerInvoices(id);
  const { data: tiktok } = useTikTokStats(id);
  const { data: activityData } = useCustomerActivity(id);
  const { data: team = [] } = useTeamMembers();

  const [editingContact, setEditingContact] = useState(false);
  const [editingPricing, setEditingPricing] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showManualInvoice, setShowManualInvoice] = useState(false);
  const [showPriceChange, setShowPriceChange] = useState(false);
  const [showChangeCM, setShowChangeCM] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showSubscriptionActions, setShowSubscriptionActions] = useState(false);
  const [tiktokProfileUrlInput, setTiktokProfileUrlInput] = useState('');
  const [savingTikTokProfile, setSavingTikTokProfile] = useState(false);
  const [verifyingTikTokProfile, setVerifyingTikTokProfile] = useState(false);
  const [fetchingProfileHistory, setFetchingProfileHistory] = useState(false);
  const [tiktokProfileError, setTiktokProfileError] = useState<string | null>(null);
  const [tiktokProfileMessage, setTiktokProfileMessage] = useState<string | null>(null);
  const [tiktokProfilePreview, setTiktokProfilePreview] = useState<TikTokProfilePreview | null>(null);
  const [updatingAttention, setUpdatingAttention] = useState(false);
  const [attentionMessage, setAttentionMessage] = useState<string | null>(null);
  const [attentionError, setAttentionError] = useState<string | null>(null);
  const [customerActionPending, setCustomerActionPending] = useState<string | null>(null);
  const [customerActionError, setCustomerActionError] = useState<string | null>(null);
  const [customerActionMessage, setCustomerActionMessage] = useState<string | null>(null);
  const returnTo = searchParams?.get('from') ?? null;
  const focusSection = searchParams?.get('focus') ?? null;
  const focusedInvoiceId = searchParams?.get('invoice') ?? null;
  const openedFocusedInvoice = useRef<string | null>(null);

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

  useEffect(() => {
    if (!focusSection || isLoading) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(
        `[data-admin-section="${focusSection}"]`,
      );
      if (!element) {
        return;
      }

      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusSection, isLoading]);

  useEffect(() => {
    if (
      focusSection !== 'invoices' ||
      !focusedInvoiceId ||
      invoices.length === 0 ||
      openedFocusedInvoice.current === focusedInvoiceId
    ) {
      return;
    }

    const invoiceExists = invoices.some((invoice) => invoice.id === focusedInvoiceId);
    if (!invoiceExists) {
      return;
    }

    openedFocusedInvoice.current = focusedInvoiceId;
    setSelectedInvoiceId(focusedInvoiceId);
  }, [focusSection, focusedInvoiceId, invoices]);

  const followerSmoothed = useMemo(
    () => (tiktok ? smoothData(tiktok.follower_history_30d, 7) : []),
    [tiktok]
  );

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

  const cm = customer?.account_manager
    ? team.find(
        (member) =>
          member.email === customer.account_manager ||
          member.name === customer.account_manager
      )
    : undefined;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id, 'invoices'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id, 'tiktok'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id, 'activity'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id, 'pending-items'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'customer', id, 'subscription'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'billing', 'subscriptions'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'billing', 'invoices'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'overview'] });
  };

  const handleVerifyTikTokProfile = async () => {
    if (!customer?.id || verifyingTikTokProfile) return null;

    const input = tiktokProfileUrlInput.trim();
    if (!input) {
      setTiktokProfilePreview(null);
      setTiktokProfileError('Ange en TikTok-profil först.');
      setTiktokProfileMessage(null);
      return null;
    }

    setVerifyingTikTokProfile(true);
    setTiktokProfileError(null);
    setTiktokProfileMessage(null);

    try {
      const response = await fetch(
        `/api/admin/tiktok/profile-preview?input=${encodeURIComponent(input)}`,
        {
          credentials: 'include',
        }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        preview?: TikTokProfilePreview;
      };

      if (!response.ok || !payload.preview) {
        throw new Error(payload.error || 'Kunde inte verifiera TikTok-profilen');
      }

      setTiktokProfilePreview(payload.preview);
      setTiktokProfileMessage(`Verifierade @${payload.preview.handle}. Spara för att koppla profilen.`);
      return payload.preview;
    } catch (verifyError: unknown) {
      setTiktokProfilePreview(null);
      setTiktokProfileError(
        verifyError instanceof Error
          ? verifyError.message
          : 'Kunde inte verifiera TikTok-profilen'
      );
      return null;
    } finally {
      setVerifyingTikTokProfile(false);
    }
  };

  const handleSaveTikTokProfile = async () => {
    if (!customer?.id || savingTikTokProfile) return;

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
          tiktok_profile_url: input ? tiktokProfilePreview?.canonical_url ?? input : null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte spara TikTok-profil');
      }

      setTiktokProfileMessage(
        input
          ? `TikTok-profil sparad för @${tiktokProfilePreview?.handle ?? input}.`
          : 'TikTok-profil borttagen.'
      );
      if (!input) {
        setTiktokProfilePreview(null);
      }
      invalidate();
    } catch (saveError: unknown) {
      setTiktokProfileError(
        saveError instanceof Error ? saveError.message : 'Kunde inte spara TikTok-profil'
      );
    } finally {
      setSavingTikTokProfile(false);
    }
  };

  const handleFetchTikTokProfile = async () => {
    if (!customer?.id || fetchingProfileHistory) return;

    setFetchingProfileHistory(true);
    setTiktokProfileError(null);
    setTiktokProfileMessage(null);

    try {
      const response = await fetch(`/api/studio-v2/customers/${customer.id}/fetch-profile-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ count: 12 }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        fetched?: number;
        imported?: number;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte hamta TikTok-profil');
      }

      setTiktokProfileMessage(
        `Profil uppdaterad. Hamtade ${payload.fetched ?? 0} klipp, importerade ${payload.imported ?? 0}.`
      );
      invalidate();
    } catch (fetchError: unknown) {
      setTiktokProfileError(
        fetchError instanceof Error ? fetchError.message : 'Kunde inte hamta TikTok-profil'
      );
    } finally {
      setFetchingProfileHistory(false);
    }
  };

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Laddar kund...</div>;
  }

  if (error || !customer) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Kunden hittades inte.
      </div>
    );
  }

  const status = customerStatusConfig(customer.status);
  const today = new Date();
  const blocking = customerBlocking({
    lastPublishedAt: customer.last_published_at
      ? new Date(customer.last_published_at)
      : null,
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
    contentPlanSet:
      (customer.expected_concepts_per_week ?? customer.concepts_per_week ?? 2) >= 1,
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
    blocking.daysSincePublish === 999
      ? 999
      : Math.max(0, blocking.daysSincePublish);
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
  const canRecoverInvite = ['invited', 'pending', 'pending_payment', 'pending_invoice'].includes(
    customer.status,
  );

  const runAttentionSnooze = async (
    subjectType: 'onboarding' | 'customer_blocking',
    days: number | null,
  ) => {
    setUpdatingAttention(true);
    setAttentionError(null);
    setAttentionMessage(null);

    try {
      const response = await fetch(
        `/api/admin/attention/${subjectType}/${customer.id}/snooze`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ days }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte markera som hanteras');
      }

      setAttentionMessage(
        days == null
          ? 'Markeringen ligger kvar tills vidare.'
          : `Markerad som hanteras i ${days} dagar.`,
      );
      invalidate();
    } catch (actionError: unknown) {
      setAttentionError(
        actionError instanceof Error
          ? actionError.message
          : 'Kunde inte markera som hanteras',
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
      const response = await fetch(
        `/api/admin/attention/${subjectType}/${customer.id}/snooze`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte slappa hanteras-markeringen');
      }

      setAttentionMessage('Hanteras-markeringen ar borttagen.');
      invalidate();
    } catch (actionError: unknown) {
      setAttentionError(
        actionError instanceof Error
          ? actionError.message
          : 'Kunde inte slappa hanteras-markeringen',
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
          : new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
      const response = await fetch(`/api/admin/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ paused_until: pausedUntil }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte satta planerad paus');
      }

      setAttentionMessage(
        pausedUntil
          ? `Planerad paus satt till ${shortDateSv(pausedUntil)}.`
          : 'Planerad paus borttagen.',
      );
      invalidate();
    } catch (actionError: unknown) {
      setAttentionError(
        actionError instanceof Error
          ? actionError.message
          : 'Kunde inte satta planerad paus',
      );
    } finally {
      setUpdatingAttention(false);
    }
  };

  const runCustomerAction = async (action: 'resend_invite') => {
    setCustomerActionPending(action);
    setCustomerActionError(null);
    setCustomerActionMessage(null);

    try {
      const response = await fetch(`/api/admin/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte uppdatera kunden');
      }

      setCustomerActionMessage(payload.message || 'Atgarden genomfordes.');
      invalidate();
    } catch (actionError: unknown) {
      setCustomerActionError(
        actionError instanceof Error ? actionError.message : 'Kunde inte uppdatera kunden',
      );
    } finally {
      setCustomerActionPending(null);
    }
  };

  return (
    <div>
      <button
        onClick={() => {
          if (returnTo?.startsWith('/admin/customers')) {
            router.push(returnTo, { scroll: false });
            return;
          }
          if (window.history.length > 1) {
            router.back();
            return;
          }
          router.push('/admin/customers');
        }}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Tillbaka till kunder
      </button>

      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold text-foreground">
            {customer.business_name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {customer.contact_email}
            {customer.customer_contact_name ? ` · ${customer.customer_contact_name}` : ''}
            {customer.tiktok_handle ? (
              <span className="ml-2 text-primary">@{customer.tiktok_handle}</span>
            ) : null}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {tiktok && thresholds ? (
            <Section title="TikTok-statistik" sectionId="tiktok-stats">
              <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Snitt visningar"
                  title={`Forvantat intervall for ${tiktok.followers.toLocaleString('sv-SE')} foljare: ${thresholds.expected_min.toLocaleString('sv-SE')}-${thresholds.expected_max.toLocaleString('sv-SE')}`}
                  value={meanViews30d.toLocaleString('sv-SE')}
                  emphasis={meanViews30d >= thresholds.expected_min ? 'success' : 'default'}
                  sub="30d · per klipp"
                />
                <MetricCard
                  label="Genombrott"
                  title={`Hit >= ${thresholds.hit.toLocaleString('sv-SE')} visningar · Viral >= ${thresholds.viral.toLocaleString('sv-SE')} visningar`}
                  value={
                    <>
                      <span className="text-success">{viralCount}</span>
                      <span className="text-sm font-normal text-muted-foreground"> / </span>
                      <span className="text-info">{hitCount}</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        {' '}
                        / {recentVideos.length}
                      </span>
                    </>
                  }
                  sub="viral / hit / klipp (30d)"
                />
                <MetricCard
                  label="Like rate"
                  title="Likes / visningar. <2% lagt · 2-4% ok · 4-7% bra · 7%+ mycket bra"
                  value={`${likeRate.toFixed(1)}%`}
                  emphasis={likeTier}
                  sub={likeRateTierLabel[likeTier]}
                />
              </div>

              <div className="mb-5">
                <div className="mb-2 flex items-baseline justify-between">
                  <div className="text-xs font-semibold text-foreground">
                    Visningar per klipp (30d)
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground" />
                      Klipp
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-info" />
                      Hit
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-success" />
                      Viral
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-0.5 w-3 rounded bg-primary" />
                      Snitt
                    </span>
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
                    <span
                      className={`ml-2 text-[10px] font-normal ${
                        tiktok.follower_delta_30d >= 0 ? 'text-success' : 'text-destructive'
                      }`}
                    >
                      {tiktok.follower_delta_30d > 0 ? '+' : ''}
                      {tiktok.follower_delta_30d}%
                    </span>
                  </div>
                  <div className="text-[10px] italic text-muted-foreground">slapande resultat</div>
                </div>
                <div className="rounded-lg bg-secondary/30 p-3">
                  <ChartSVG
                    data={tiktok.follower_history_30d}
                    smoothed={followerSmoothed}
                    height={50}
                  />
                </div>
              </div>
            </Section>
          ) : null}

          <Section
            title="Avtal & Prissattning"
            sectionId="contract"
            action={
              <button
                onClick={() => setEditingPricing((value) => !value)}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {editingPricing ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                {editingPricing ? 'Avbryt' : 'Redigera'}
              </button>
            }
          >
            {editingPricing ? (
              <ContractEditForm
                customer={customer}
                onSaved={() => {
                  setEditingPricing(false);
                  invalidate();
                }}
              />
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Manadspris"
                  value={
                    (customer.monthly_price ?? 0) > 0
                      ? `${(customer.monthly_price ?? 0).toLocaleString('sv-SE')} kr`
                      : 'Ej satt'
                  }
                />
                <Field label="Intervall" value={intervalLong(customer.subscription_interval)} />
                <Field label="Nasta faktura" value={shortDateSv(customer.next_invoice_date)} />
                <Field label="Kund sedan" value={shortDateSv(customer.created_at)} />
                {customer.discount_type && customer.discount_type !== 'none' ? (
                  <Field
                    label="Rabatt"
                    value={
                      customer.discount_type === 'percent'
                        ? `${customer.discount_value || 0}%`
                        : customer.discount_type === 'amount'
                          ? `${customer.discount_value || 0} kr`
                          : `${customer.discount_value || 0} gratis manader`
                    }
                  />
                ) : null}
              </div>
            )}
          </Section>

          {customer.next_invoice_date && (customer.monthly_price ?? 0) > 0 ? (
            <Section
              title="Nastkommande faktura"
              sectionId="upcoming-invoice"
              action={
                <span className="text-xs text-muted-foreground">
                  {shortDateSv(customer.next_invoice_date)}
                </span>
              }
            >
              <div className="space-y-4">
                <div className="rounded-md border border-border bg-secondary/30 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground">Manadsabonnemang</span>
                    <span className="font-medium text-foreground">
                      {formatSek(sekToOre(customer.monthly_price ?? 0))}
                    </span>
                  </div>
                </div>
                <PendingInvoiceItems customerId={id} />
              </div>
            </Section>
          ) : null}

          <Section title="Fakturahistorik" sectionId="invoices">
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inga fakturor annu.</p>
            ) : (
              <div className="space-y-3">
                {invoices.map((invoice) => (
                  <button
                    key={invoice.id}
                    type="button"
                    onClick={() => setSelectedInvoiceId(invoice.id)}
                    className="w-full overflow-hidden rounded-lg border border-border text-left transition-colors hover:border-primary/30"
                  >
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-foreground">
                          {typeof invoice.amount_due === 'number' ? formatSek(invoice.amount_due) : '-'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {shortDateSv(invoice.created_at)}
                        </span>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          invoice.status === 'paid'
                            ? 'bg-success/10 text-success'
                            : invoice.status === 'open'
                              ? 'bg-warning/10 text-warning'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {invoice.status === 'paid'
                          ? 'Betald'
                          : invoice.status === 'open'
                            ? 'Opppen'
                            : invoice.status}
                      </span>
                    </div>
                    {invoice.line_items && invoice.line_items.length > 0 ? (
                      <div className="border-t border-border bg-secondary/30 px-4 py-2">
                        {invoice.line_items.map((item, index) => (
                          <div
                            key={`${invoice.id}-${index}`}
                            className="flex justify-between py-1 text-xs"
                          >
                            <span className="text-muted-foreground">{item.description}</span>
                            <span className="font-medium text-foreground">
                              {formatSek(item.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Operativ status" sectionId="operations">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <StatusPill
                  label={onboardingLabel(onboardingState)}
                  tone={onboardingState === 'settled' || onboardingState === 'live' ? 'success' : onboardingState === 'cm_ready' ? 'warning' : 'info'}
                />
                <StatusPill
                  label={bufferLabel(bufferStatus)}
                  tone={bufferStatus === 'ok' ? 'success' : bufferStatus === 'under' ? 'danger' : bufferStatus === 'paused' ? 'neutral' : 'warning'}
                />
                {blocking.state !== 'none' ? (
                  <StatusPill
                    label={`${blocking.state === 'escalated' ? 'Eskalerad' : 'Blockerad'} ${visibleBlockingDays}d`}
                    tone={blocking.state === 'escalated' ? 'danger' : 'warning'}
                  />
                ) : null}
              </div>

              <div className="rounded-md border border-border bg-secondary/30 p-3">
                <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Onboarding-checklista
                </div>
                <ChecklistRow
                  label="Innehallsplan satt"
                  done={onboardingChecklist.contentPlanSet}
                />
                <ChecklistRow
                  label="Startbuffer laddad"
                  done={onboardingChecklist.startConceptsLoaded}
                />
                <ChecklistRow
                  label="TikTok-profil bekraftad"
                  done={onboardingChecklist.tiktokHandleConfirmed}
                />
                <ChecklistRow
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
                    Hanteras {activeSnooze.snoozed_until ? `till ${shortDateSv(activeSnooze.snoozed_until)}` : 'utan sluttid'}
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
                    <ActionButton onClick={() => void runAttentionSnooze('customer_blocking', 3)}>
                      Markera blockerad kund som hanteras i 3 dagar
                    </ActionButton>
                    <ActionButton onClick={() => void runAttentionSnooze('customer_blocking', 7)}>
                      Markera blockerad kund som hanteras i 7 dagar
                    </ActionButton>
                    <ActionButton onClick={() => void setPlannedPause(7)}>
                      Satt planerad paus i 7 dagar
                    </ActionButton>
                    {customer.paused_until ? (
                      <ActionButton onClick={() => void setPlannedPause(null)}>
                        Ta bort planerad paus
                      </ActionButton>
                    ) : null}
                  </>
                ) : null}
                {onboardingState === 'cm_ready' ? (
                  <ActionButton onClick={() => void runAttentionSnooze('onboarding', 3)}>
                    Markera onboarding som hanteras i 3 dagar
                  </ActionButton>
                ) : null}
              </div>
            </div>
          </Section>

          <Section title="Content Manager" sectionId="cm">
            {cm ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <AdminAvatar name={cm.name} avatarUrl={cm.avatar_url} size="md" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">{cm.name}</div>
                    <div className="text-xs text-muted-foreground">{cm.email}</div>
                  </div>
                </div>
                {customer.coverage_absences.length > 0 ? (
                  <div className="space-y-2">
                    {customer.coverage_absences.map((absence) => (
                      <div
                        key={absence.id}
                        className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground"
                      >
                        <div className="font-semibold text-foreground">
                          {absence.is_active ? 'Aktiv coverage' : 'Schemalagd coverage'}
                        </div>
                        <div>
                          {absence.starts_on} - {absence.ends_on}
                          {absence.backup_cm_name ? ` · ${absence.backup_cm_name}` : ''}
                        </div>
                        <div>
                          Payroll: {absence.compensation_mode === 'primary_cm' ? 'ordinarie CM' : 'covering CM'}
                        </div>
                        {absence.note ? <div className="mt-1">{absence.note}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Ingen CM tilldelad</p>
            )}
          </Section>

          <Section
            title="Kontaktuppgifter"
            sectionId="contact"
            action={
              <button
                onClick={() => setEditingContact((value) => !value)}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {editingContact ? <X className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                {editingContact ? 'Avbryt' : 'Redigera'}
              </button>
            }
          >
            {editingContact ? (
              <ContactEditForm
                customer={customer}
                onSaved={() => {
                  setEditingContact(false);
                  invalidate();
                }}
              />
            ) : (
              <div className="space-y-3">
                <Field label="E-post" value={customer.contact_email} />
                <Field label="Kontaktperson" value={customer.customer_contact_name || '-'} />
                <Field label="Telefon" value={customer.phone || '-'} />
              </div>
            )}
          </Section>

          <Section
            title="TikTok-profil"
            sectionId="tiktok-profile"
            action={
              customer.last_history_sync_at ? (
                <span className="text-[11px] text-muted-foreground">
                  Senast syncad {shortDateSv(customer.last_history_sync_at)}
                </span>
              ) : undefined
            }
          >
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
                  {tiktokProfilePreview.author_name ? (
                    <div>{tiktokProfilePreview.author_name}</div>
                  ) : null}
                  {tiktokProfilePreview.title ? (
                    <div className="mt-1">{tiktokProfilePreview.title}</div>
                  ) : null}
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
                <button
                  type="button"
                  onClick={() => void handleVerifyTikTokProfile()}
                  disabled={verifyingTikTokProfile || !tiktokProfileUrlInput.trim()}
                  className="rounded-md border border-border px-4 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {verifyingTikTokProfile ? 'Verifierar profil...' : 'Verifiera profil'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSaveTikTokProfile()}
                  disabled={
                    savingTikTokProfile ||
                    (Boolean(tiktokProfileUrlInput.trim()) && !tiktokProfilePreview)
                  }
                  className="rounded-md border border-border px-4 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {savingTikTokProfile
                    ? 'Sparar profil...'
                    : tiktokProfileUrlInput.trim()
                      ? 'Spara verifierad profil'
                      : 'Ta bort TikTok-profil'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleFetchTikTokProfile()}
                  disabled={
                    fetchingProfileHistory || !customer.tiktok_handle || !customer.tiktok_profile_url
                  }
                  className="rounded-md border border-border px-4 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {fetchingProfileHistory ? 'Hamtar profil...' : 'Hamta profil till kunden'}
                </button>
                {!customer.tiktok_handle ? (
                  <div className="rounded-md border border-border bg-secondary/30 px-4 py-3 text-xs text-muted-foreground">
                    OAuth anvands inte i den har integrationen. Koppla kunden genom att verifiera
                    och spara profil-URL. Viss metadata kan saknas eller variera beroende pa
                    provider-svaret fran RapidAPI.
                  </div>
                ) : null}
              </div>
            </div>
          </Section>

          <Section title="Aktivitetslogg" sectionId="activity">
            <div className="space-y-3">
              {activityData?.schemaWarnings?.length ? (
                <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                  {activityData.schemaWarnings[0]}
                </div>
              ) : null}

              {activityData?.activities?.length ? (
                activityData.activities.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-md border border-border bg-secondary/20 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-foreground">
                        {entry.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {timeAgoSv(entry.at)}
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {entry.description}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      <span className="rounded-full bg-background px-2 py-1">
                        {entry.kind}
                      </span>
                      <span>{entry.actorLabel || 'System'}</span>
                      <span>{shortDateSv(entry.at)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-border bg-secondary/20 px-4 py-4 text-sm text-muted-foreground">
                  Ingen historik hittades for kunden an.
                </div>
              )}
            </div>
          </Section>

          <Section title="Atgarder" sectionId="actions">
            <div className="space-y-2">
              {canRecoverInvite ? (
                <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-4">
                  <div className="text-sm font-semibold text-foreground">Invite recovery</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Anvand detta om kunden fastnat i callback-flodet eller ser fel som
                    &quot;lanken har gatt ut&quot; eller &quot;lanken ar ogiltig&quot;.
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Ny lank skickas till {customer.contact_email}
                    {customer.invited_at ? ` • senaste invite ${shortDateSv(customer.invited_at)}` : ''}
                  </div>
                  <div className="mt-3">
                    <ActionButton onClick={() => void runCustomerAction('resend_invite')}>
                      {customerActionPending === 'resend_invite'
                        ? 'Skickar ny invite...'
                        : 'Skicka ny invite / recovery-lank'}
                    </ActionButton>
                  </div>
                </div>
              ) : null}
              <ActionButton onClick={() => setShowChangeCM(true)}>
                Andra Content Manager
              </ActionButton>
              <ActionButton onClick={() => setShowDiscountModal(true)}>
                Hantera rabatt
              </ActionButton>
              {customer.stripe_subscription_id ? (
                <ActionButton onClick={() => setShowPriceChange(true)}>
                  Andra abonnemangspris
                </ActionButton>
              ) : null}
              <ActionButton onClick={() => setShowManualInvoice(true)}>
                Skapa manuell faktura
              </ActionButton>
              {customer.stripe_subscription_id || customer.status === 'archived' ? (
                <ActionButton onClick={() => setShowSubscriptionActions((value) => !value)}>
                  Hantera abonnemang
                </ActionButton>
              ) : null}
              {showSubscriptionActions ? (
                <SubscriptionActions
                  customerId={id}
                  customer={customer}
                  onChanged={invalidate}
                />
              ) : null}
              {customerActionMessage ? (
                <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
                  {customerActionMessage}
                </div>
              ) : null}
              {customerActionError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {customerActionError}
                </div>
              ) : null}
            </div>
          </Section>
        </div>
      </div>

      <DiscountModal
        open={showDiscountModal}
        customerId={id}
        customerName={customer.business_name}
        onClose={() => setShowDiscountModal(false)}
        onApplied={() => {
          setShowDiscountModal(false);
          invalidate();
        }}
      />
      <ManualInvoiceModal
        open={showManualInvoice}
        customerId={id}
        customerName={customer.business_name}
        onClose={() => setShowManualInvoice(false)}
        onCreated={() => {
          setShowManualInvoice(false);
          invalidate();
        }}
      />
      <SubscriptionPriceChangeModal
        open={showPriceChange}
        customerId={id}
        customerName={customer.business_name}
        currentPriceSek={customer.monthly_price}
        onClose={() => setShowPriceChange(false)}
        onChanged={() => {
          setShowPriceChange(false);
          invalidate();
        }}
      />
      <ChangeCMModal
        open={showChangeCM}
        customerId={id}
        currentCM={customer.account_manager}
        currentMonthlyPrice={customer.monthly_price}
        team={team}
        onClose={() => setShowChangeCM(false)}
        onChanged={() => {
          setShowChangeCM(false);
          invalidate();
        }}
      />
      <InvoiceOperationsModal
        invoiceId={selectedInvoiceId}
        open={Boolean(selectedInvoiceId)}
        onClose={() => setSelectedInvoiceId(null)}
        onUpdated={invalidate}
      />
    </div>
  );
}

function Section({
  title,
  sectionId,
  action,
  children,
}: {
  title: string;
  sectionId?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      data-admin-section={sectionId}
      className="rounded-lg border border-border bg-card p-5"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  title,
  emphasis = 'default',
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  title?: string;
  emphasis?: 'default' | 'success' | LikeRateTier;
}) {
  const valueClass =
    emphasis === 'default'
      ? 'text-foreground'
      : emphasis === 'success'
        ? 'text-success'
        : likeRateTierClass[emphasis];
  const subClass =
    emphasis === 'poor' || emphasis === 'ok' || emphasis === 'good' || emphasis === 'great'
      ? likeRateTierClass[emphasis]
      : 'text-muted-foreground';

  return (
    <div className="rounded-lg bg-secondary/50 p-3" title={title}>
      <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`font-heading text-xl font-bold ${valueClass}`}>{value}</div>
      <div className={`mt-0.5 text-[10px] ${subClass}`}>{sub}</div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-md border border-border px-4 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
    >
      {children}
    </button>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}) {
  const className =
    tone === 'success'
      ? 'bg-success/10 text-success'
      : tone === 'warning'
        ? 'bg-warning/10 text-warning'
        : tone === 'danger'
          ? 'bg-destructive/10 text-destructive'
          : tone === 'info'
            ? 'bg-info/10 text-info'
            : 'bg-secondary text-muted-foreground';

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function ChecklistRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-foreground">{label}</span>
      <span className={done ? 'text-success' : 'text-warning'}>
        {done ? 'Klar' : 'Saknas'}
      </span>
    </div>
  );
}

function onboardingLabel(state: 'invited' | 'cm_ready' | 'live' | 'settled') {
  if (state === 'cm_ready') return 'CM-redo';
  if (state === 'live') return 'Live';
  if (state === 'settled') return 'Stabil';
  return 'Inviterad';
}

function bufferLabel(status: 'ok' | 'thin' | 'under' | 'paused' | 'blocked') {
  if (status === 'ok') return 'Buffer ok';
  if (status === 'thin') return 'Tunn buffer';
  if (status === 'under') return 'Underfylld';
  if (status === 'blocked') return 'Buffrad men blockerad';
  return 'Pausad';
}
