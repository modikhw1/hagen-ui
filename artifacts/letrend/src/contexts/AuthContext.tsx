'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { resolveLegacyProfileRole } from '@/lib/auth/roles';
import { clearOnboardingSession } from '@/lib/onboarding/session';
import { logInteraction } from '@/lib/interactions';
import { setAuthToken } from '@/lib/auth/token-store';

const PROFILE_CACHE_TTL_MS = 5 * 60_000; // 5 min
const QUERY_TIMEOUT_MS = 10_000;

interface Profile {
  id: string;
  email: string;
  business_name: string;
  business_description: string | null;
  social_links: { tiktok?: string; instagram?: string; [key: string]: string | undefined };
  tone: string[];
  energy: string | null;
  industry: string | null;
  matching_data: Record<string, unknown>;
  has_paid: boolean;
  has_concepts: boolean;
  is_admin: boolean;
  role: 'admin' | 'content_manager' | 'customer' | 'user';
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  authLoading: boolean;
  profileLoading: boolean;
  profileNotFound: boolean;
  status: 'initializing' | 'authenticated' | 'unauthenticated' | 'signing_in' | 'signing_up' | 'signing_out' | 'error';
  error: AuthError | null;
}

interface AuthContextType extends AuthState {
  loading: boolean; // backward-compat: authLoading || profileLoading
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, businessName: string) => Promise<{ error: Error | null; needsConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    authLoading: true,
    profileLoading: false,
    profileNotFound: false,
    status: 'initializing',
    error: null,
  });

  // Profile cache to avoid redundant fetches
  const profileCacheRef = useRef<{ userId: string; profile: Profile | null; ts: number } | null>(null);
  // Inflight dedup: only one fetch per userId at a time
  const inflightRef = useRef<Map<string, Promise<{ profile: Profile | null; notFound: boolean }>>>(new Map());

  const fetchProfile = useCallback(async (userId: string, opts?: { force?: boolean; token?: string }): Promise<{ profile: Profile | null; notFound: boolean }> => {
    const force = opts?.force ?? false;

    // Return cached profile if fresh
    if (!force && profileCacheRef.current) {
      const { userId: cachedId, profile: cachedProfile, ts } = profileCacheRef.current;
      if (cachedId === userId && Date.now() - ts < PROFILE_CACHE_TTL_MS) {
        return { profile: cachedProfile, notFound: cachedProfile === null };
      }
    }

    // Return existing inflight promise for same user
    const existing = inflightRef.current.get(userId);
    if (existing) return existing;

    const promise = (async (): Promise<{ profile: Profile | null; notFound: boolean }> => {
      try {
        // Use the API server's /api/me endpoint which uses the service-role key
        // to bypass RLS — required for admin/content_manager profiles which the
        // anon key cannot read due to RLS policies on the profiles table.
        // Prefer the token passed in directly (avoids a second getSession() call
        // that might race against the session being written to storage).
        const accessToken = opts?.token ?? (await supabase.auth.getSession()).data.session?.access_token;
        if (!accessToken) return { profile: null, notFound: false };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);

        let data: unknown;
        try {
          const response = await fetch('/api/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.status === 404) {
            // No profile row — genuine new user
            console.log('Profile does not exist yet for user:', userId);
            return { profile: null, notFound: true };
          }
          if (!response.ok) {
            // Server/network error — profile may exist but couldn't be fetched
            console.error('Error fetching profile, status:', response.status);
            return { profile: null, notFound: false };
          }
          data = await response.json();
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          throw fetchErr;
        }

        // Resolve role from profiles fields (canonical source)
        const resolvedRole = resolveLegacyProfileRole(data as { role?: string | null; is_admin?: boolean | null });
        const resolvedIsAdmin = resolvedRole === 'admin';

        const baseProfile = data as Omit<Profile, 'role' | 'is_admin'> &
          Partial<Pick<Profile, 'role' | 'is_admin'>>;

        const profile = {
          ...baseProfile,
          role: resolvedRole,
          is_admin: resolvedIsAdmin,
        } as Profile;

        profileCacheRef.current = { userId, profile, ts: Date.now() };
        console.log('Profile fetched:', { email: profile.email, role: profile.role });
        return { profile, notFound: false };
      } catch (err) {
        console.error('Profile fetch error:', err);
        return { profile: null, notFound: false };
      } finally {
        inflightRef.current.delete(userId);
      }
    })();

    inflightRef.current.set(userId, promise);
    return promise;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (state.user) {
      setState(prev => ({ ...prev, profileLoading: true }));
      const { profile: profileData, notFound } = await fetchProfile(state.user.id, { force: true });
      setState(prev => ({ ...prev, profile: profileData, profileNotFound: notFound, profileLoading: false }));
    }
  }, [state.user, fetchProfile]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Global timeout — unblock UI if something hangs
    const timeoutId: NodeJS.Timeout = setTimeout(() => {
      if (isMounted) {
        setState(prev => {
          if (!prev.authLoading && !prev.profileLoading) return prev;
          return {
            ...prev,
            authLoading: false,
            profileLoading: false,
            status: prev.user ? prev.status : 'unauthenticated',
          };
        });
      }
    }, 12000);

    const initAuth = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (!isMounted) return;

        if (userError) {
          // AuthSessionMissingError just means no active session — treat as
          // unauthenticated, not a real error worth surfacing or logging loudly.
          if (userError.name !== 'AuthSessionMissingError') {
            console.error('Auth error:', userError);
          }
          clearOnboardingSession();
          setState(prev => ({
            ...prev,
            user: null,
            profile: null,
            session: null,
            authLoading: false,
            profileLoading: false,
            status: 'unauthenticated',
            error: null,
          }));
          return;
        }

        if (user) {
          // Get the session to extract the access token for the profile fetch
          const { data: { session } } = await supabase.auth.getSession();

          // Store token globally so apiClient can attach it to every request
          // without needing to call getSession() (avoids race conditions).
          setAuthToken(session?.access_token ?? null);

          // Show authenticated immediately, then load profile
          setState(prev => ({
            ...prev,
            user: user,
            session,
            authLoading: false,
            profileLoading: true,
            status: 'authenticated',
            error: null,
          }));

          // Pass the token directly so fetchProfile doesn't re-read session storage
          const { profile: profileData, notFound: profileNotFound } = await fetchProfile(user.id, { token: session?.access_token });
          if (!isMounted) return;

          setState({
            user: user,
            profile: profileData,
            profileNotFound,
            session,
            authLoading: false,
            profileLoading: false,
            status: 'authenticated',
            error: null,
          });
        } else {
          // No session — clear onboarding localStorage so stale data
          // doesn't leak to the next user on the same device (covers
          // session expiry / cookie clear without explicit signOut).
          clearOnboardingSession();
          setState(prev => ({
            ...prev,
            user: null,
            profile: null,
            session: null,
            authLoading: false,
            profileLoading: false,
            status: 'unauthenticated',
            error: null,
          }));
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Auth init error:', err);
        setState(prev => ({
          ...prev,
          authLoading: false,
          profileLoading: false,
          status: 'error',
        }));
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        switch (event) {
          case 'SIGNED_IN': {
            if (!session?.user) break;

            // Keep token store current so apiClient has a valid Bearer token
            setAuthToken(session.access_token);

            // Skip profile re-fetch if same user is already loaded
            setState(prev => {
              if (prev.user?.id === session.user.id && prev.profile && prev.status === 'authenticated') {
                return { ...prev, session, authLoading: false, error: null };
              }
              return {
                ...prev,
                user: session.user,
                session,
                authLoading: false,
                profileLoading: true,
                status: 'authenticated',
                error: null,
              };
            });

            // Re-check state to decide if we should fetch
            const needsFetch = !profileCacheRef.current || profileCacheRef.current.userId !== session.user.id;
            if (!needsFetch) break;

            // Pass token directly — avoids a race between SIGNED_IN firing and
            // the session being written to localStorage/cookies.
            const { profile: profileData, notFound: profileNotFound } = await fetchProfile(session.user.id, { token: session.access_token });
            if (!isMounted) return;
            setState({
              user: session.user,
              profile: profileData,
              profileNotFound,
              session,
              authLoading: false,
              profileLoading: false,
              status: 'authenticated',
              error: null,
            });
            break;
          }

          case 'TOKEN_REFRESHED':
            if (session?.user) {
              setAuthToken(session.access_token);
              setState(prev => ({
                ...prev,
                user: session.user,
                session,
                authLoading: false,
                error: null,
              }));
            }
            break;

          case 'SIGNED_OUT':
            // Clear onboarding localStorage (covers cross-tab signout)
            clearOnboardingSession();
            setAuthToken(null);
            setState({
              user: null,
              profile: null,
              profileNotFound: false,
              session: null,
              authLoading: false,
              profileLoading: false,
              status: 'unauthenticated',
              error: null,
            });
            break;

          case 'USER_UPDATED':
            if (session?.user) {
              setState(prev => ({ ...prev, user: session.user, session, profileLoading: true }));
              const { profile: profileData, notFound: profileNotFound } = await fetchProfile(session.user.id, { force: true, token: session.access_token });
              if (!isMounted) return;
              setState(prev => ({
                ...prev,
                user: session.user,
                profile: profileData,
                profileNotFound,
                session,
                authLoading: false,
                profileLoading: false,
                status: 'authenticated',
              }));
            }
            break;

          case 'INITIAL_SESSION':
            break;

          default:
            break;
        }
      }
    );

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    try {
      setState(prev => ({ ...prev, error: null, authLoading: true, status: 'signing_in' }));
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setState(prev => ({ ...prev, authLoading: false, profileLoading: false, status: 'error', error }));
        return { error };
      }
      if (data.user) {
        void logInteraction({
          type: 'login',
          cmProfileId: data.user.id,
          metadata: { source: 'auth_context' },
          client: supabase,
        });
      }
      return { error: null };
    } catch (err) {
      const error = err as AuthError;
      setState(prev => ({ ...prev, authLoading: false, profileLoading: false, status: 'error', error }));
      return { error };
    }
  };

  const signUp = async (email: string, password: string, businessName: string) => {
    try {
      setState(prev => ({ ...prev, error: null, authLoading: true, status: 'signing_up' }));
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { business_name: businessName } },
      });
      if (error) {
        setState(prev => ({ ...prev, authLoading: false, profileLoading: false, status: 'error', error }));
        return { error };
      }
      if (data.user && !data.session) {
        setState(prev => ({ ...prev, authLoading: false, profileLoading: false, status: 'unauthenticated' }));
        return { error: null, needsConfirmation: true };
      }
      return { error: null, needsConfirmation: false };
    } catch (err) {
      const error = err as AuthError;
      setState(prev => ({ ...prev, authLoading: false, profileLoading: false, status: 'error', error }));
      return { error };
    }
  };

  const signOut = async () => {
    try {
      setState(prev => ({ ...prev, authLoading: true, profileLoading: false, status: 'signing_out' }));
      // Clear onboarding state so the next user on the same device starts fresh
      clearOnboardingSession();
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      setAuthToken(null);
      setState({
        user: null,
        profile: null,
        profileNotFound: false,
        session: null,
        authLoading: false,
        profileLoading: false,
        status: 'unauthenticated',
        error: null,
      });
    }
  };

  const loading = state.authLoading || state.profileLoading;

  return (
    <AuthContext.Provider
      value={{
        ...state,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
