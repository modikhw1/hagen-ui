'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { TikTokProfilePreview } from '@/lib/tiktok/profile';
import { useCustomerDetail } from '@/hooks/admin/useCustomerDetail';
import { useCustomerRouteRefresh } from '@/hooks/admin/useAdminRefresh';
import {
  CustomerActionButton,
  CustomerRouteError,
  CustomerRouteLoading,
  CustomerSection,
} from '@/components/admin/customers/routes/shared';

function normalizeTikTokProfileInput(value: string) {
  return value.trim().replace(/^@/, '').toLowerCase();
}

export default function TikTokProfileSection({ customerId }: { customerId: string }) {
  const { data: customer, isLoading, error } = useCustomerDetail(customerId);
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

  if (isLoading) {
    return <CustomerRouteLoading label="Laddar TikTok-profil..." />;
  }

  if (error || !customer) {
    return <CustomerRouteError message={error?.message || 'Kunden hittades inte.'} />;
  }

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
    } catch (previewError) {
      setTiktokProfilePreview(null);
      setTiktokProfileError(
        previewError instanceof Error
          ? previewError.message
          : 'Kunde inte verifiera TikTok-profilen',
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
    } catch (saveError) {
      setTiktokProfileError(
        saveError instanceof Error ? saveError.message : 'Kunde inte spara TikTok-profilen',
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
      const response = await fetch(`/api/studio-v2/customers/${customer.id}/fetch-profile-history`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || 'Kunde inte hamta profilhistorik');
      }

      setTiktokProfileMessage('Profilhistorik hamtas nu.');
      await refresh();
    } catch (historyError) {
      setTiktokProfileError(
        historyError instanceof Error ? historyError.message : 'Kunde inte hamta profilhistorik',
      );
    } finally {
      setFetchingProfileHistory(false);
    }
  };

  return (
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
            Ingen profil ar kopplad an. Spara forst ratt TikTok-URL sa att studioflodet kan byggas
            fran ratt konto.
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
          <CustomerActionButton onClick={() => void handleVerifyTikTokProfile()} disabled={verifyingTikTokProfile || !tiktokProfileUrlInput.trim()}>
            {verifyingTikTokProfile ? 'Verifierar profil...' : 'Verifiera profil'}
          </CustomerActionButton>
          <CustomerActionButton
            onClick={() => void handleSaveTikTokProfile()}
            disabled={savingTikTokProfile || (Boolean(tiktokProfileUrlInput.trim()) && !tiktokProfilePreview)}
          >
            {savingTikTokProfile
              ? 'Sparar profil...'
              : tiktokProfileUrlInput.trim()
                ? 'Spara verifierad profil'
                : 'Ta bort TikTok-profil'}
          </CustomerActionButton>
          <CustomerActionButton
            onClick={() => void handleFetchTikTokProfile()}
            disabled={fetchingProfileHistory || !customer.tiktok_handle || !customer.tiktok_profile_url}
          >
            {fetchingProfileHistory ? 'Hamtar profil...' : 'Hamta profil till kunden'}
          </CustomerActionButton>
        </div>
      </div>
    </CustomerSection>
  );
}
