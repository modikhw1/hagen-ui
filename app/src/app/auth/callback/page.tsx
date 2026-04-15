'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getPrimaryRouteForRole } from '@/lib/auth/navigation';
import { supabase } from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';

type AuthStatus = 'loading' | 'set-password' | 'error' | 'success';
const INVITE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface AuthState {
  status: AuthStatus;
  error: string | null;
  password: string;
  confirmPassword: string;
  businessName: string | null;
  isSubmitting: boolean;
}

function parseMetadataDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

async function resolveRoleDestination(userId: string): Promise<string> {
  const { data: profileData } = await supabase
    .from('profiles')
    .select('is_admin, role')
    .eq('id', userId)
    .maybeSingle();

  return getPrimaryRouteForRole(profileData, { fallback: '/feed' });
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    error: null,
    password: '',
    confirmPassword: '',
    businessName: null,
    isSubmitting: false,
  });
  const processedRef = useRef(false);
  const statusRef = useRef<AuthStatus>('loading');
  const sessionRef = useRef<Session | null>(null); // Store session for reuse in handleSetPassword

  // Keep ref in sync with state
  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);

  const updateState = useCallback((updates: Partial<AuthState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleSessionEstablished = useCallback(async (session: Session, isInviteFlow: boolean) => {
    console.log('[SESSION] Session established for:', session.user.email);
    console.log('[SESSION] isInviteFlow:', isInviteFlow);
    console.log('[SESSION] user_metadata.invited_at:', session.user.user_metadata?.invited_at);
    console.log('[SESSION] email_confirmed_at:', session.user.email_confirmed_at);

    // Check invite markers first to keep set-password flow deterministic.
    const metadataInvitedAt = parseMetadataDate(session.user.user_metadata?.invited_at);
    const sessionInvitedAt = parseMetadataDate(session.user.invited_at);
    const hasInviteMarker = Boolean(metadataInvitedAt || sessionInvitedAt);

    if (hasInviteMarker) {
      const invitedAt = metadataInvitedAt || sessionInvitedAt;
      const explicitExpiry = parseMetadataDate(session.user.user_metadata?.invite_expires_at);
      const fallbackExpiry = invitedAt ? new Date(invitedAt.getTime() + INVITE_LINK_TTL_MS) : null;
      const effectiveExpiry = explicitExpiry || fallbackExpiry;

      if (effectiveExpiry && Date.now() > effectiveExpiry.getTime()) {
        await supabase.auth.signOut();
        updateState({ status: 'error', error: 'Inbjudningslanken har gatt ut. Be om en ny inbjudan.' });
        return;
      }

      // New invite - go to set password first (regardless of profile status)
      console.log('[SESSION] New invite detected, going to set password');

      // Store session for set password flow
      sessionRef.current = session;
      const fetchedBusinessName = session.user.user_metadata?.business_name || session.user.user_metadata?.name || null;
      updateState({ status: 'set-password', businessName: fetchedBusinessName });
      return;
    }

    if (isInviteFlow) {
      // Recovery/invite links can be valid even without custom invited_at metadata.
      sessionRef.current = session;
      const fetchedBusinessName = session.user.user_metadata?.business_name || session.user.user_metadata?.name || null;
      updateState({ status: 'set-password', businessName: fetchedBusinessName });
      return;
    }

    // Not an invite - check if user already completed onboarding (has a profile)
    try {
      const profileRes = await fetch(`/api/admin/profiles/check?userId=${session.user.id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      const profileData = await profileRes.json();

      if (profileData.hasProfile) {
        // User already has a profile and no invite flag - they're returning
        console.log('[SESSION] User already has profile, redirecting to dashboard');
        const destination = await resolveRoleDestination(session.user.id);
        const joiner = destination.includes('?') ? '&' : '?';
        router.replace(`${destination}${joiner}already_registered=true`);
        return;
      }
    } catch (e) {
      console.error('[SESSION] Error checking profile:', e);
    }

    // No invite flag and no profile - check if this is part of invite flow
    console.log('[SESSION] No invite flag, checking flow params');
    sessionRef.current = session;

    // Get business name directly from user metadata (faster and more reliable)
    const fetchedBusinessName = session.user.user_metadata?.business_name || session.user.user_metadata?.name || null;
    console.log('[SESSION] Business name from metadata:', fetchedBusinessName);

    console.log('[SESSION] Flow check:', { isInviteFlow, hasInviteMarker, fetchedBusinessName });

    // Normal login - redirect (isInviteFlow paths already returned above)
    console.log('[SESSION] Setting status to success, redirecting');
    updateState({ status: 'success' });
    const destination = await resolveRoleDestination(session.user.id);
    router.replace(destination);
  }, [router, updateState]);

  useEffect(() => {
    // Prevent double processing
    if (processedRef.current) return;
    processedRef.current = true;

    const handleAuth = async () => {
      try {
        // Check for error in URL first
        const errorParam = searchParams.get('error');
        const errorDesc = searchParams.get('error_description');

        if (errorParam) {
          console.log('Error in URL:', errorParam, errorDesc);
          
          // Handle specific error cases
          if (errorParam === 'access_denied') {
            if (errorDesc?.includes('expired')) {
              updateState({ status: 'error', error: 'Länken har gått ut. Be om en ny inbjudan.' });
            } else if (errorDesc?.includes('invalid') || errorDesc?.includes('malformed')) {
              updateState({ status: 'error', error: 'Länken är ogiltig. Be om en ny inbjudan.' });
            } else {
              updateState({ status: 'error', error: errorDesc || 'Åtkomst nekad' });
            }
          } else if (errorParam === 'server_error') {
            updateState({ status: 'error', error: 'Serverfel. Försök igen senare.' });
          } else {
            updateState({ status: 'error', error: errorDesc || errorParam });
          }
          return;
        }

        // Get the hash from URL (Supabase puts tokens there after redirect)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');

        console.log('Hash params:', { hasAccessToken: !!accessToken, type });

        // If we have tokens in the hash, set the session manually
        if (accessToken && refreshToken) {
          console.log('Setting session from hash tokens...');
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            console.error('Session error:', sessionError);
            updateState({ status: 'error', error: 'Kunde inte verifiera sessionen. Länken kan ha gått ut.' });
            return;
          }

          if (data.session) {
            await handleSessionEstablished(data.session, type === 'invite' || type === 'recovery');
            return;
          }
        }

        // Fallback: check if we already have a session
        console.log('Checking existing session...');
        const { data: { session }, error: getSessionError } = await supabase.auth.getSession();

        if (getSessionError) {
          console.error('Get session error:', getSessionError);
          
          // Check for network errors
          if (getSessionError.message?.includes('network') || getSessionError.message?.includes('fetch')) {
            updateState({ status: 'error', error: 'Nätverksfel. Kontrollera din internetanslutning.' });
          } else {
            updateState({ status: 'error', error: 'Kunde inte hämta session' });
          }
          return;
        }

        if (session) {
          const flowParam = searchParams.get('flow');
          await handleSessionEstablished(session, flowParam === 'invite' || !!session.user.invited_at);
          return;
        }

        // No session found - could be an error scenario
        console.log('No session found after all attempts');
        
        // Check if this looks like a failed auth attempt
        const hashParamsStr = window.location.hash;
        if (hashParamsStr && !accessToken) {
          // Has hash but no valid tokens - likely an error
          updateState({ status: 'error', error: 'Autentiseringen misslyckades. Länken kan ha gått ut.' });
          return;
        }

        // Otherwise show loading state
        updateState({ status: 'loading' });

      } catch (err) {
        console.error('Auth error:', err);
        
        // Don't show error for abort signals
        if (err instanceof Error && (err.message?.includes('abort') || err.message?.includes('network'))) {
          console.log('Network/abort error caught, retrying...');
          return;
        }
        
        updateState({ status: 'error', error: 'Ett fel uppstod vid verifiering' });
      }
    };

    // Start auth handling
    handleAuth();

    // Also listen for auth state changes as backup
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event, 'Session:', !!session, 'Current status:', statusRef.current);

      // Handle USER_UPDATED specially - check if we're in password flow
      if (event === 'USER_UPDATED' && session) {
        if (statusRef.current === 'set-password') {
          console.log('User updated but in set-password flow, ignoring redirect');
          return;
        }
        // Only redirect if we're in loading state (not yet handled)
        if (statusRef.current === 'loading') {
          console.log('User updated, redirecting...');
          const destination = await resolveRoleDestination(session.user.id);
          router.replace(destination);
        }
        return;
      }

      // Skip other events if we've already handled auth
      if (statusRef.current !== 'loading') return;

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        const flowParam = searchParams.get('flow');
        await handleSessionEstablished(session, flowParam === 'invite' || !!session.user.invited_at);
        return;
      }

      if (event === 'SIGNED_OUT') {
        updateState({ status: 'error', error: 'Sessionen avslutades. Försök logga in igen.' });
        return;
      }
    });

    // Timeout fallback
    const timeout = setTimeout(() => {
      if (statusRef.current === 'loading') {
        console.log('Timeout - no session established');
        updateState({ status: 'error', error: 'Verifieringen tog för lång tid. Försök igen eller begär en ny länk.' });
      }
    }, 30000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [searchParams, router, handleSessionEstablished, updateState]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[PASSWORD] ========== handleSetPassword CALLED ==========');
    console.log('[PASSWORD] Form submitted');
    updateState({ error: null, isSubmitting: true });
    console.log('[PASSWORD] State updated to isSubmitting: true');

    const pwd = state.password;
    const confirmPwd = state.confirmPassword;

    if (pwd.length < 8) {
      updateState({ error: 'Lösenordet måste vara minst 8 tecken', isSubmitting: false });
      return;
    }

    if (pwd !== confirmPwd) {
      updateState({ error: 'Lösenorden matchar inte', isSubmitting: false });
      return;
    }

    try {
      // Always fetch a fresh session — the cached ref may hold an expired token
      // if the user took several minutes to fill in the password form.
      const { data: { session: freshSession } } = await supabase.auth.getSession();
      const session = freshSession ?? sessionRef.current;
      console.log('[PASSWORD] Checking session...');

      if (!session) {
        console.log('[PASSWORD] No session available!');
        updateState({ error: 'Sessionen har gått ut. Klicka på inbjudningslänken igen.', isSubmitting: false });
        return;
      }

      console.log('[PASSWORD] Using session for:', session.user?.email);

      // Update password via the Supabase client (handles token refresh automatically)
      const { error: updateError } = await supabase.auth.updateUser({ password: pwd });

      if (updateError) {
        console.error('Update error:', updateError);
        const errorMessage = updateError.message || 'Kunde inte uppdatera lösenord';

        if (errorMessage.includes('different from the old') || errorMessage.includes('same password')) {
          updateState({ error: 'Detta lösenord har redan använts. Välj ett annat.', isSubmitting: false });
          return;
        }

        if (errorMessage.includes('weak') || errorMessage.includes('strength')) {
          updateState({ error: 'Lösenordet är för svagt. Använd minst 6 tecken.', isSubmitting: false });
          return;
        }

        updateState({ error: errorMessage, isSubmitting: false });
        return;
      }

      console.log('Password set successfully!');

      // Clear invited_at from user metadata to prevent re-triggering password set flow
      try {
        await supabase.auth.updateUser({
          data: {
            ...session.user.user_metadata,
            invited_at: null,
          },
        });
        console.log('[PASSWORD] Cleared invited_at flag');
      } catch (err) {
        console.error('[PASSWORD] Failed to clear invited_at:', err);
        // Continue anyway - not critical
      }

      // Check for subscription in URL params OR in user metadata
      const price = searchParams.get('price');
      const customerProfileId = session.user.user_metadata?.customer_profile_id;
      const stripeSubscriptionId = session.user.user_metadata?.stripe_subscription_id;

      // Get user data for onboarding
      const userId = session.user.id;
      const userEmail = session.user.email || '';
      const businessName = session.user.user_metadata?.business_name || 'Mitt företag';

      // Check if this is a team member invite
      const isTeamInvite =
        session.user.user_metadata?.invited_as === 'team_member' ||
        session.user.user_metadata?.isTeamMember === true ||  // 1.1: legacy key support
        searchParams.get('flow') === 'team_invite';

      // Determine redirect path
      const redirectPath = isTeamInvite ? '/studio/customers' : '/welcome';

      // Ensure profile setup completes before redirect so onboarding APIs can authenticate reliably.
      if (isTeamInvite) {
        console.log('[PASSWORD] Ensuring team-member profile is created before redirect');
        const teamRole = session.user.user_metadata?.role || 'content_manager';

        const setupResponse = await fetch('/api/admin/profiles/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            userEmail,
            businessName: session.user.user_metadata?.name || businessName,
            isTeamMember: true,
            role: teamRole,
          }),
        });

        if (!setupResponse.ok) {
          const setupPayload = await setupResponse.json().catch(() => ({} as Record<string, unknown>));
          const setupError = typeof setupPayload.error === 'string'
            ? setupPayload.error
            : 'Kunde inte skapa teamprofil.';
          updateState({ error: setupError, isSubmitting: false });
          return;
        }
      } else {
        // Store onboarding data for customer flow only
        localStorage.setItem('pending_agreement_email', userEmail);
        localStorage.setItem('onboarding_business_name', businessName);
        localStorage.setItem('onboarding_interval', 'month');
        localStorage.setItem('onboarding_customer_profile_id', customerProfileId || '');
        if (price && Number(price) > 0) {
          localStorage.setItem('onboarding_price', price);
        } else {
          localStorage.removeItem('onboarding_price');
        }

        // If there's a Stripe subscription, we'll fetch the actual price from agreement page
        if (stripeSubscriptionId || customerProfileId) {
          // Will be handled by /onboarding → /agreement flow
          console.log('[PASSWORD] Has Stripe subscription, going to onboarding');
        }

        const setupResponse = await fetch('/api/admin/profiles/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            userEmail,
            businessName,
            customerProfileId: customerProfileId || undefined,
          }),
        });

        if (!setupResponse.ok) {
          const setupPayload = await setupResponse.json().catch(() => ({} as Record<string, unknown>));
          const setupError = typeof setupPayload.error === 'string'
            ? setupPayload.error
            : 'Kunde inte skapa kundprofil.';
          updateState({ error: setupError, isSubmitting: false });
          return;
        }
      }

      console.log('[PASSWORD] Redirecting to:', redirectPath, isTeamInvite ? '(team member)' : '(customer)');

      // Single client-side transition keeps auth/navigation flow predictable.
      console.log('[PASSWORD] Redirecting to:', redirectPath);
      router.replace(redirectPath);
      router.refresh();

    } catch (err) {
      console.error('[PASSWORD] Error in handleSetPassword:', err);
      // Show the actual error message if available
      const errorMessage = err instanceof Error ? err.message : 'Kunde inte uppdatera lösenord';
      updateState({ error: errorMessage, isSubmitting: false });
      // Explicit return - NO redirect on error
      return;
    }
  };

  const { status, error, password, confirmPassword, businessName, isSubmitting } = state;

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] p-5">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full shadow-lg text-center">
          <div className="w-12 h-12 bg-[#6B4423] rounded-full inline-flex items-center justify-center mb-6">
            <span className="font-serif italic text-base text-[#FAF8F5]">Le</span>
          </div>
          <h1 className="text-2xl text-[#1A1612] mb-2 font-semibold">Verifierar...</h1>
          <p className="text-[#5D4D3D] text-sm mb-6">Vänta medan vi verifierar din inbjudan</p>
          <div className="flex justify-center">
            <div className="w-6 h-6 border-2 border-[#6B4423] border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] p-5">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full shadow-lg text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full inline-flex items-center justify-center mb-6">
            <span className="text-red-600 text-xl">✕</span>
          </div>
          <h1 className="text-2xl text-[#1A1612] mb-2 font-semibold">Något gick fel</h1>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="w-full py-3 bg-gradient-to-br from-[#6B4423] to-[#4A2F18] text-white rounded-lg font-semibold cursor-pointer"
          >
            Tillbaka till login
          </button>
        </div>
      </div>
    );
  }

  if (status === 'set-password') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] p-5">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full shadow-lg text-center">
          <div className="w-12 h-12 bg-[#6B4423] rounded-full inline-flex items-center justify-center mb-6">
            <span className="font-serif italic text-base text-[#FAF8F5]">Le</span>
          </div>
          <h1 className="text-2xl text-[#1A1612] mb-2 font-semibold">
            Välkommen{businessName ? `, ${businessName}` : ''}!
          </h1>
          <p className="text-[#5D4D3D] text-sm mb-6">
            Välj ett lösenord för att slutföra din registrering
          </p>

          <form onSubmit={handleSetPassword} className="text-left">
            <div className="mb-4">
              <label className="block text-sm font-medium text-[#1A1612] mb-1">Lösenord</label>
              <input
                type="password"
                value={password}
                onChange={(e) => updateState({ password: e.target.value })}
                className="w-full p-3 text-sm text-[#1A1612] bg-white border border-[#E5E0DA] rounded-lg outline-none focus:border-[#6B4423]"
                placeholder="Minst 8 tecken"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-[#1A1612] mb-1">Bekräfta lösenord</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => updateState({ confirmPassword: e.target.value })}
                className="w-full p-3 text-sm text-[#1A1612] bg-white border border-[#E5E0DA] rounded-lg outline-none focus:border-[#6B4423]"
                placeholder="Skriv lösenordet igen"
                autoComplete="new-password"
                required
              />
            </div>

            {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-gradient-to-br from-[#6B4423] to-[#4A2F18] text-white rounded-lg font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting && (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {isSubmitting ? 'Sparar...' : 'Skapa konto'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] p-5">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full shadow-lg text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full inline-flex items-center justify-center mb-6">
            <span className="text-green-600 text-xl">✓</span>
          </div>
          <h1 className="text-2xl text-[#1A1612] mb-2 font-semibold">Klart!</h1>
          <p className="text-[#5D4D3D] text-sm">Du skickas vidare...</p>
        </div>
      </div>
    );
  }

  return null;
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] p-5">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full shadow-lg text-center">
          <div className="w-12 h-12 bg-[#6B4423] rounded-full inline-flex items-center justify-center mb-6">
            <span className="font-serif italic text-base text-[#FAF8F5]">Le</span>
          </div>
          <p className="text-[#5D4D3D]">Laddar...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
