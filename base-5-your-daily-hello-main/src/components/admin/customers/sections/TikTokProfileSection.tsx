'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Trash2 } from 'lucide-react';
import type { TikTokProfilePreview } from '@/lib/tiktok/profile';
import { useAdminRefresh } from '@/hooks/admin/useAdminRefresh';
import { apiClient } from '@/lib/admin/api-client';
import {
  CustomerActionButton,
  CustomerRouteError,
  CustomerSectionSkeleton,
  CustomerSection,
} from '@/components/admin/customers/routes/shared';

type TikTokSectionCustomer = {
  id: string;
  tiktok_profile_url: string | null;
  tiktok_handle: string | null;
  tiktok_profile_pic_url: string | null;
  last_history_sync_at: string | null;
};

type TikTokProfileResponse = {
  id: string;
  tiktok_profile_url: string | null;
  tiktok_handle: string | null;
  tiktok_profile_pic_url: string | null;
  last_history_sync_at: string | null;
  tiktok_runtime?: {
    profile?: {
      tiktok_profile_url?: string | null;
      tiktok_handle?: string | null;
      tiktok_profile_pic_url?: string | null;
      last_history_sync_at?: string | null;
    } | null;
  } | null;
};

async function fetchTikTokSectionCustomer(customerId: string): Promise<TikTokSectionCustomer> {
  const payload = await apiClient.get<TikTokProfileResponse>(
    `/api/studio-v2/customers/${customerId}/profile`,
  );
  const runtimeProfile = payload.tiktok_runtime?.profile ?? null;

  return {
    id: payload.id,
    tiktok_profile_url: runtimeProfile?.tiktok_profile_url ?? payload.tiktok_profile_url ?? null,
    tiktok_handle: runtimeProfile?.tiktok_handle ?? payload.tiktok_handle ?? null,
    tiktok_profile_pic_url:
      runtimeProfile?.tiktok_profile_pic_url ?? payload.tiktok_profile_pic_url ?? null,
    last_history_sync_at:
      runtimeProfile?.last_history_sync_at ?? payload.last_history_sync_at ?? null,
  };
}

function formatSyncTimestamp(value: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function TikTokProfileSection({ customerId }: { customerId: string }) {
  const refreshFn = useAdminRefresh();
  const refresh = () => refreshFn([{ type: 'customer', customerId }]);
  const [customer, setCustomer] = useState<TikTokSectionCustomer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [step, setStep] = useState<'input' | 'verify' | 'save'>('input');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<TikTokProfilePreview | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const nextCustomer = await fetchTikTokSectionCustomer(customerId);
        if (cancelled) return;
        setCustomer(nextCustomer);
        setInput(nextCustomer.tiktok_profile_url ?? '');
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : 'Kunde inte ladda TikTok-profil');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (isLoading) return <CustomerSectionSkeleton blocks={2} />;
  if (loadError || !customer) {
    return <CustomerRouteError message={loadError || 'Hittade inte kunden'} />;
  }

  const reloadCustomer = async () => {
    const nextCustomer = await fetchTikTokSectionCustomer(customerId);
    setCustomer(nextCustomer);
    setInput(nextCustomer.tiktok_profile_url ?? '');
    return nextCustomer;
  };

  const onVerify = async () => {
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const payload = await apiClient.get<{ preview?: TikTokProfilePreview }>(
        '/api/admin/tiktok/profile-preview',
        {
          query: { input },
        },
      );
      if (!payload.preview) throw new Error('Kunde inte hitta profilen');
      setPreview(payload.preview);
      setStep('save');
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Verifiering misslyckades');
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiClient.patch(`/api/studio-v2/customers/${customer.id}/profile`, {
        tiktok_profile_url: input || null,
        tiktok_profile_preview: preview,
      });
      const nextCustomer = await reloadCustomer();
      await refresh();
      setStep('input');
      setPreview(null);
      setSuccessMsg(
        nextCustomer.last_history_sync_at
          ? 'TikTok-profil kopplad och historik synkad.'
          : 'TikTok-profil kopplad.',
      );
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Kunde inte spara');
    } finally {
      setBusy(false);
    }
  };

  const onUnlink = async () => {
    if (!confirm('Vill du verkligen ta bort kopplingen?')) return;
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await apiClient.patch(`/api/studio-v2/customers/${customer.id}/profile`, {
        tiktok_profile_url: null,
        tiktok_profile_preview: null,
      });
      await reloadCustomer();
      await refresh();
      setStep('input');
      setPreview(null);
    } catch {
      setErrorMsg('Kunde inte ta bort koppling');
    } finally {
      setBusy(false);
    }
  };

  const syncedAtLabel = formatSyncTimestamp(customer.last_history_sync_at);

  return (
    <CustomerSection title="TikTok-profil">
      <div className="space-y-4">
        {customer.tiktok_handle ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">@{customer.tiktok_handle}</span>
                <span className="rounded-full bg-status-success-bg px-2 py-0.5 text-[10px] font-medium text-status-success-fg">
                  Kopplad
                </span>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {customer.tiktok_profile_url}
              </div>
              {syncedAtLabel && (
                <div className="mt-1 text-[10px] text-muted-foreground">
                  Historik synkad {syncedAtLabel}
                </div>
              )}
            </div>
            <button
              onClick={onUnlink}
              disabled={busy}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-status-danger-bg hover:text-status-danger-fg"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {step === 'input' && (
              <>
                <div className="text-xs text-muted-foreground">
                  Koppla en TikTok-profil for att borja hamta statistik och videor.
                </div>
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="https://www.tiktok.com/@konto"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <CustomerActionButton onClick={onVerify} disabled={busy || !input.trim()}>
                  {busy ? 'Verifierar...' : 'Verifiera profil'}
                </CustomerActionButton>
              </>
            )}

            {step === 'save' && preview && (
              <div className="space-y-3">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-3">
                    {preview.cover_image_url && (
                      <Image
                        src={preview.cover_image_url}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground">@{preview.handle}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {preview.title || preview.author_name}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CustomerActionButton
                    onClick={() => setStep('input')}
                    disabled={busy}
                    className="bg-secondary"
                  >
                    Tillbaka
                  </CustomerActionButton>
                  <CustomerActionButton
                    onClick={onSave}
                    disabled={busy}
                    className="bg-primary text-primary-foreground"
                  >
                    {busy ? 'Sparar...' : 'Spara & koppla'}
                  </CustomerActionButton>
                </div>
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="rounded-md border border-status-danger-fg/30 bg-status-danger-bg px-3 py-2 text-xs text-status-danger-fg">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="rounded-md border border-status-success-fg/30 bg-status-success-bg px-3 py-2 text-xs text-status-success-fg">
            {successMsg}
          </div>
        )}
      </div>
    </CustomerSection>
  );
}
