'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Check, Trash2, RefreshCw } from 'lucide-react';
import type { TikTokProfilePreview } from '@/lib/tiktok/profile';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerRouteRefresh } from '@/hooks/admin/useAdminRefresh';
import { apiClient } from '@/lib/admin/api-client';
import {
  CustomerActionButton,
  CustomerRouteError,
  CustomerSectionSkeleton,
  CustomerSection,
} from '@/components/admin/customers/routes/shared';
import { cn } from '@/lib/utils';

function normalizeTikTokProfileInput(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export default function TikTokProfileSection({ customerId }: { customerId: string }) {
  const { data: customer, isLoading, error } = useCustomerDetail(customerId);
  const refresh = useCustomerRouteRefresh(customerId);
  const [input, setInput] = useState('');
  const [step, setStep] = useState<'input' | 'verify' | 'save'>('input');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<TikTokProfilePreview | null>(null);

  useEffect(() => {
    if (customer?.tiktok_profile_url) {
      setInput(customer.tiktok_profile_url);
    }
  }, [customer?.tiktok_profile_url]);

  if (isLoading) return <CustomerSectionSkeleton blocks={2} />;
  if (error || !customer) return <CustomerRouteError message={error?.message || 'Hittade inte kunden'} />;

  const onVerify = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const payload = await apiClient.get<{ preview?: TikTokProfilePreview }>('/api/admin/tiktok/profile-preview', {
        query: { input },
      });
      if (!payload.preview) throw new Error('Kunde inte hitta profilen');
      setPreview(payload.preview);
      setStep('save');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Verifiering misslyckades');
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiClient.patch(`/api/studio-v2/customers/${customer.id}/profile`, {
        tiktok_profile_url: input || null,
        tiktok_profile_preview: preview,
      });
      await refresh();
      setStep('input');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Kunde inte spara');
    } finally {
      setBusy(false);
    }
  };

  const onUnlink = async () => {
    if (!confirm('Vill du verkligen ta bort kopplingen?')) return;
    setBusy(true);
    try {
      await apiClient.patch(`/api/studio-v2/customers/${customer.id}/profile`, {
        tiktok_profile_url: null,
        tiktok_profile_preview: null,
      });
      await refresh();
      setInput('');
      setStep('input');
    } catch (e) {
      setErrorMsg('Kunde inte ta bort koppling');
    } finally {
      setBusy(false);
    }
  };

  return (
    <CustomerSection title="TikTok-profil">
      <div className="space-y-4">
        {customer.tiktok_handle ? (
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">@{customer.tiktok_handle}</span>
                <span className="rounded-full bg-status-success-bg px-2 py-0.5 text-[10px] font-medium text-status-success-fg">Kopplad</span>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{customer.tiktok_profile_url}</div>
            </div>
            <button 
              onClick={onUnlink} 
              disabled={busy}
              className="rounded-md p-2 text-muted-foreground hover:bg-status-danger-bg hover:text-status-danger-fg transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {step === 'input' && (
              <>
                <div className="text-xs text-muted-foreground">Koppla en TikTok-profil för att börja hämta statistik och videor.</div>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
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
                      <img src={preview.cover_image_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground">@{preview.handle}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{preview.title || preview.author_name}</div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <CustomerActionButton onClick={() => setStep('input')} disabled={busy} className="bg-secondary">
                    Tillbaka
                  </CustomerActionButton>
                  <CustomerActionButton onClick={onSave} disabled={busy} className="bg-primary text-primary-foreground">
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

        {customer.tiktok_handle && (
          <button
            onClick={async () => {
              setBusy(true);
              try {
                await apiClient.post(`/api/studio-v2/customers/${customer.id}/fetch-profile-history`, {});
                alert('Historik hämtas nu.');
              } catch (e) {
                setErrorMsg('Kunde inte hämta historik');
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={cn("h-3 w-3", busy && "animate-spin")} />
            Hämta full historik
          </button>
        )}
      </div>
    </CustomerSection>
  );
}
