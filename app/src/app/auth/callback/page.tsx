'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'set-password' | 'error' | 'success'>('loading');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const processedRef = useRef(false);

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
          if (errorParam === 'access_denied' && errorDesc?.includes('expired')) {
            setError('Länken har gått ut. Be om en ny inbjudan.');
          } else {
            setError(errorDesc || errorParam);
          }
          setStatus('error');
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
            setError('Kunde inte verifiera sessionen: ' + sessionError.message);
            setStatus('error');
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
          // Handle abort errors gracefully
          if (getSessionError.message?.includes('abort')) {
            console.log('Session check aborted, retrying...');
            // Wait a bit and retry
            await new Promise(r => setTimeout(r, 500));
            const retry = await supabase.auth.getSession();
            if (retry.data.session) {
              const flowParam = searchParams.get('flow');
              await handleSessionEstablished(retry.data.session, flowParam === 'invite');
              return;
            }
          }
          console.error('Get session error:', getSessionError);
          setError('Kunde inte hämta session');
          setStatus('error');
          return;
        }

        if (session) {
          const flowParam = searchParams.get('flow');
          await handleSessionEstablished(session, flowParam === 'invite' || !!session.user.invited_at);
          return;
        }

        // No session found - wait a bit for auth state change
        console.log('No immediate session, waiting for auth state...');

      } catch (err) {
        console.error('Auth error:', err);
        // Don't show error for abort signals - they're usually benign
        if (err instanceof Error && err.message?.includes('abort')) {
          console.log('Abort signal caught, continuing...');
          return;
        }
        setError('Ett fel uppstod vid verifiering');
        setStatus('error');
      }
    };

    const handleSessionEstablished = async (session: any, isInviteFlow: boolean) => {
      console.log('Session established for:', session.user.email);

      // Fetch profile to get business name
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('business_name')
          .eq('id', session.user.id)
          .single();

        if (profileData?.business_name) {
          setBusinessName(profileData.business_name);
        }
      } catch (e) {
        console.log('Could not fetch profile:', e);
      }

      console.log('Flow:', { isInviteFlow, hasInvitedAt: !!session.user.invited_at });

      if (isInviteFlow || session.user.invited_at) {
        setStatus('set-password');
      } else {
        setStatus('success');
        router.push('/');
      }
    };

    // Start auth handling
    handleAuth();

    // Also listen for auth state changes as backup
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event, 'Session:', !!session);

      if (event === 'USER_UPDATED' && session) {
        console.log('Password updated, redirecting to home...');
        router.push('/');
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session && status === 'loading') {
        const flowParam = searchParams.get('flow');
        await handleSessionEstablished(session, flowParam === 'invite' || !!session.user.invited_at);
      }

      if (event === 'SIGNED_OUT') {
        setError('Sessionen avslutades');
        setStatus('error');
      }
    });

    // Timeout fallback - longer timeout
    const timeout = setTimeout(() => {
      if (status === 'loading') {
        console.log('Timeout - no session established');
        setError('Kunde inte verifiera länken. Prova igen.');
        setStatus('error');
      }
    }, 15000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [searchParams, router, status]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Setting password...');
    setError(null);
    setIsSubmitting(true);

    if (password.length < 6) {
      setError('Lösenordet måste vara minst 6 tecken');
      setIsSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Lösenorden matchar inte');
      setIsSubmitting(false);
      return;
    }

    try {
      console.log('Calling updateUser...');
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: password,
      });
      console.log('updateUser returned:', { data: !!data, error: updateError });

      if (updateError) {
        console.error('Update error:', updateError);
        // If password already set, just redirect
        if (updateError.message.includes('different from the old')) {
          console.log('Password already set, redirecting...');
          router.push('/');
          return;
        }
        setError(updateError.message);
        setIsSubmitting(false);
        return;
      }

      console.log('Password set successfully! Redirecting...');
      router.push('/');
    } catch (err) {
      console.error('Password update error:', err);
      setError('Kunde inte uppdatera lösenord');
      setIsSubmitting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] p-5">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full shadow-lg text-center">
          <div className="w-12 h-12 bg-[#6B4423] rounded-full inline-flex items-center justify-center mb-6">
            <span className="font-serif italic text-base text-[#FAF8F5]">Le</span>
          </div>
          <h1 className="text-2xl text-[#1A1612] mb-2 font-semibold">Verifierar...</h1>
          <p className="text-[#5D4D3D] text-sm mb-6">Vänta medan vi verifierar din inbjudan</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF8F5] p-5">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full shadow-lg text-center">
          <div className="w-12 h-12 bg-[#6B4423] rounded-full inline-flex items-center justify-center mb-6">
            <span className="font-serif italic text-base text-[#FAF8F5]">Le</span>
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
                onChange={(e) => setPassword(e.target.value)}
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
                onChange={(e) => setConfirmPassword(e.target.value)}
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
              className="w-full py-3 bg-gradient-to-br from-[#6B4423] to-[#4A2F18] text-white rounded-lg font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
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
          <div className="w-12 h-12 bg-[#6B4423] rounded-full inline-flex items-center justify-center mb-6">
            <span className="font-serif italic text-base text-[#FAF8F5]">Le</span>
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
          <p className="text-[#5D4D3D]">Laddar...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
