import type { TablesUpdate } from '@/types/database';
import { deriveTikTokHandle, toCanonicalTikTokProfileUrl } from '@/lib/tiktok/profile';

export type NormalizedTikTokProfileIdentity = {
  tiktok_profile_url: string | null;
  tiktok_handle: string | null;
};

export function normalizeTikTokProfileIdentityInput(input: string | null | undefined):
  | { ok: true; value: NormalizedTikTokProfileIdentity }
  | { ok: false } {
  const rawValue = typeof input === 'string' && input.trim() !== '' ? input.trim() : null;

  if (!rawValue) {
    return {
      ok: true,
      value: {
        tiktok_profile_url: null,
        tiktok_handle: null,
      },
    };
  }

  const canonicalTikTokProfileUrl = toCanonicalTikTokProfileUrl(rawValue);
  const tiktokHandle = deriveTikTokHandle(rawValue);
  if (!canonicalTikTokProfileUrl || !tiktokHandle) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      tiktok_profile_url: canonicalTikTokProfileUrl,
      tiktok_handle: tiktokHandle,
    },
  };
}

export function buildTikTokProfileLinkPatch(params: {
  input: string | null | undefined;
  previousProfileUrl?: string | null;
}):
  | { ok: true; patch: TablesUpdate<'customer_profiles'>; changed: boolean }
  | { ok: false } {
  const normalized = normalizeTikTokProfileIdentityInput(params.input);
  if (!normalized.ok) {
    return { ok: false };
  }

  const previousProfileUrl =
    typeof params.previousProfileUrl === 'string' && params.previousProfileUrl.trim() !== ''
      ? params.previousProfileUrl
      : null;
  const nextProfileUrl = normalized.value.tiktok_profile_url;
  const changed = previousProfileUrl !== nextProfileUrl;

  const patch: TablesUpdate<'customer_profiles'> = {
    ...normalized.value,
    tiktok_user_id: null,
  };

  if (changed) {
    patch.last_history_sync_at = null;
    patch.last_upload_at = null;
    patch.pending_history_advance_at = null;
    patch.tiktok_profile_pic_url = null;
  }

  return { ok: true, patch, changed };
}
