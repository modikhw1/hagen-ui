'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

type AuthStatus = 'loading' | 'set-password' | 'error' | 'success';

interface AuthState {
  status: AuthStatus;
  error: string | null;
  password: string;
  confirmPassword: string;
  businessName: string | null;
  isSubmitting: boolean;
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
  const sessionRef = useRef<any>(null); // Store session for reuse in handleSetPassword

  // Keep ref in sync with state
  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);

  const updateState = useCallback((updates: Partial<AuthState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleSessionEstablished = useCallback(async (session: any, isInviteFlow: boolean) => {
    console.log('[SESSION] Session established for:', session.user.email);
    console.log('[SESSION] isInviteFlow:', isInviteFlow);
    console.log('[SESSION] invited_at:', session.user.invited_at);
    console.log('[SESSION] email_confirmed_at:', session.user.email_confirmed_at);

    // Check if user already completed onboarding (has a profile)
    try {
      const profileRes = await fetch(`/api/admin/profiles/check?userId=${session.user.id}`);
      const profileData = await profileRes.json();
      
      if (profileData.hasProfile) {
        // User already has a profile - redirect to dashboard
        console.log('[SESSION] User already has profile, redirecting to dashboard');
        router.push('/?already_registered=true');
        return;
      }
    } catch (e) {
      console.error('[SESSION] Error checking profile:', e);
    }

    // Check if this is a new invite (should go to set password)
    // invited_at is set when user is invited but hasn't set password yet
    const hasInvitedAt = !!session.user.invited_at;
    
    if (hasInvitedAt) {
      // New invite - go to set password first
      console.log('[SESSION] New invite, going to set password');
      
      // Store session for set password flow
      sessionRef.current = session;
      const fetchedBusinessName = session.user.user_metadata?.business_name || null;
      updateState({ status: 'set-password', businessName: fetchedBusinessName });
      return;
    }

    // No invite flag - user might be logging in normally
    // Store session and check password status
    console.log('[SESSION] No invite flag, checking password status');
    sessionRef.current = session;

    // Get business name directly from user metadata (faster and more reliable)
    const fetchedBusinessName = session.user.user_metadata?.business_name || null;
    console.log('[SESSION] Business name from metadata:', fetchedBusinessName);

    console.log('[SESSION] Flow check:', { isInviteFlow, hasInvitedAt: !!session.user.invited_at, fetchedBusinessName });

    if (isInviteFlow || session.user.invited_at) {
      console.log('[SESSION] Calling updateState with set-password');
      updateState({ status: 'set-password', businessName: fetchedBusinessName });
      console.log('[SESSION] updateState called, new state should render');
    } else {
      // Normal login - redirect
      console.log('[SESSION] Setting status to success, redirecting');
      updateState({ status: 'success' });
      router.push('/');
    }
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
        
        // Wait a bit for any ongoing auth to complete
        await new Promise(r => setTimeout(r, 500));
        
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
          router.push('/');
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

    if (pwd.length < 6) {
      updateState({ error: 'Lösenordet måste vara minst 6 tecken', isSubmitting: false });
      return;
    }

    if (pwd !== confirmPwd) {
      updateState({ error: 'Lösenorden matchar inte', isSubmitting: false });
      return;
    }

    try {
      // Use cached session first (it was valid when handleSessionEstablished ran)
      let session = sessionRef.current;
      console.log('[PASSWORD] Checking cached session...');

      if (!session) {
        console.log('[PASSWORD] No cached session, this should not happen!');
        updateState({ error: 'Sessionen har gått ut. Klicka på inbjudningslänken igen.', isSubmitting: false });
        return;
      }

      console.log('[PASSWORD] Using session for:', session.user?.email);
      console.log('[PASSWORD] Setting password via direct API call...');

      // Make direct API call to Supabase Auth to bypass client issues
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
        },
        body: JSON.stringify({ password: pwd }),
      });

      console.log('[PASSWORD] API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Update error:', errorData);
        const errorMessage = errorData.message || errorData.error_description || 'Kunde inte uppdatera lösenord';

        // Handle specific password errors
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

      // Check for subscription in URL params OR in user metadata
      const subscriptionId = searchParams.get('subscription_id');
      const price = searchParams.get('price');
      const customerProfileId = session.user.user_metadata?.customer_profile_id;
      const stripeSubscriptionId = session.user.user_metadata?.stripe_subscription_id;

      // Get user data for onboarding
      const userId = session.user.id;
      const userEmail = session.user.email;
      const businessName = session.user.user_metadata?.business_name || 'Mitt företag';

      // Determine redirect path - go to welcome first
      let redirectPath = '/welcome';
      
      // Store onboarding data
      localStorage.setItem('pending_agreement_email', userEmail);
      localStorage.setItem('onboarding_business_name', businessName);
      localStorage.setItem('onboarding_price', price || '0');
      localStorage.setItem('onboarding_interval', 'month');
      localStorage.setItem('onboarding_customer_profile_id', customerProfileId || '');
      
      // If there's a Stripe subscription, we'll fetch the actual price from agreement page
      if (stripeSubscriptionId || customerProfileId) {
        // Will be handled by /onboarding → /agreement flow
        console.log('[PASSWORD] Has Stripe subscription, going to onboarding');
      }

      console.log('[PASSWORD] Redirecting to:', redirectPath);

      // Fire-and-forget: Update customer_profiles and create profiles row via API
      // Don't await - let redirect happen immediately
      if (customerProfileId) {
        fetch('/api/admin/profiles/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            userEmail,
            businessName,
            customerProfileId,
          }),
        }).catch(e => console.error('Background profile setup failed:', e));
      }

      // Store session directly in localStorage (bypass Supabase client which hangs)
      console.log('[PASSWORD] Storing session in localStorage...');
      const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const storageKey = `sb-${new URL(sbUrl).hostname.split('.')[0]}-auth-token`;

      const sessionData = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        token_type: 'bearer',
        user: session.user,
      };

      localStorage.setItem(storageKey, JSON.stringify(sessionData));
      console.log('[PASSWORD] Session stored with key:', storageKey);

      // Hard redirect to force full page reload
      window.location.href = redirectPath;

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
                placeholder="Minst 6 tecken"
                autoComplete="new-password"
                minLength={6}
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
