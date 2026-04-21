'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { resolveLegacyProfileRole } from '@/lib/auth/roles';
import { clearOnboardingSession } from '@/lib/onboarding/session';
import { logInteraction } from '@/lib/interactions';

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
    status: 'initializing',
    error: null,
  });

  // Profile cache to avoid redundant fetches
  const profileCacheRef = useRef<{ userId: string; profile: Profile | null; ts: number } | null>(null);
  // Inflight dedup: only one fetch per userId at a time
  const inflightRef = useRef<Map<string, Promise<Profile | null>>>(new Map());

  const fetchProfile = useCallback(async (userId: string, opts?: { force?: boolean }): Promise<Profile | null> => {
    const force = opts?.force ?? false;

    // Return cached profile if fresh
    if (!force && profileCacheRef.current) {
      const { userId: cachedId, profile: cachedProfile, ts } = profileCacheRef.current;
      if (cachedId === userId && Date.now() - ts < PROFILE_CACHE_TTL_MS) {
        return cachedProfile;
      }
    }

    // Return existing inflight promise for same user
    const existing = inflightRef.current.get(userId);
    if (existing) return existing;

    const promise = (async (): Promise<Profile | null> => {
      try {
        const { data, error } = await Promise.race([
          supabase.from('profiles').select('*').eq('id', userId).single(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Profile query timeout')), QUERY_TIMEOUT_MS)
          ),
        ]);

        if (error) {
          console.error('Error fetching profile:', error);
          if (error.code === 'PGRST116') {
            console.log('Profile does not exist yet for user:', userId);
          }
          return null;
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
        return profile;
      } catch (err) {
        console.error('Profile fetch error:', err);
        return null;
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
      const profileData = await fetchProfile(state.user.id, { force: true });
      setState(prev => ({ ...prev, profile: profileData, profileLoading: false }));
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
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (sessionError) {
          console.error('Session error:', sessionError);
          setState(prev => ({
            ...prev,
            authLoading: false,
            profileLoading: false,
            status: 'error',
            error: sessionError,
          }));
          return;
        }

        if (session?.user) {
          // Show authenticated immediately, then load profile
          setState(prev => ({
            ...prev,
            user: session.user,
            session,
            authLoading: false,
            profileLoading: true,
            status: 'authenticated',
            error: null,
          }));

          const profileData = await fetchProfile(session.user.id);
          if (!isMounted) return;

          setState({
            user: session.user,
            profile: profileData,
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

            const profileData = await fetchProfile(session.user.id);
            if (!isMounted) return;
            setState({
              user: session.user,
              profile: profileData,
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
            setState({
              user: null,
              profile: null,
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
              const profileData = await fetchProfile(session.user.id, { force: true });
              if (!isMounted) return;
              setState(prev => ({
                ...prev,
                user: session.user,
                profile: profileData,
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
      setState({
        user: null,
        profile: null,
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
