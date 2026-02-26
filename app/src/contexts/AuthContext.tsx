'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { User, Session, AuthError } from '@supabase/supabase-js';

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
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  error: AuthError | null;
}

interface AuthContextType extends AuthState {
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
    loading: true,
    error: null,
  });

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        // If profile doesn't exist, that's okay - return null
        if (error.code === 'PGRST116') {
          return null;
        }
        return null;
      }

      return data as Profile;
    } catch (err) {
      console.error('Profile fetch error:', err);
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (state.user) {
      const profileData = await fetchProfile(state.user.id);
      setState(prev => ({ ...prev, profile: profileData }));
    }
  }, [state.user, fetchProfile]);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    const initAuth = async () => {
      try {
        // Get initial session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (sessionError) {
          console.error('Session error:', sessionError);
          setState(prev => ({ 
            ...prev, 
            loading: false, 
            error: sessionError 
          }));
          return;
        }

        if (session?.user) {
          const profileData = await fetchProfile(session.user.id);
          
          if (!isMounted) return;
          
          setState({
            user: session.user,
            profile: profileData,
            session: session,
            loading: false,
            error: null,
          });
        } else {
          setState(prev => ({ 
            ...prev, 
            loading: false 
          }));
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Auth init error:', err);
        setState(prev => ({ 
          ...prev, 
          loading: false 
        }));
      }
    };

    // Initial auth check with timeout
    timeoutId = setTimeout(() => {
      if (isMounted && state.loading) {
        setState(prev => ({ 
          ...prev, 
          loading: false 
        }));
      }
    }, 10000); // 10 second timeout

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted) return;

        console.log('Auth state change:', event, session ? 'has session' : 'no session');

        switch (event) {
          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
            if (session?.user) {
              const profileData = await fetchProfile(session.user.id);
              setState({
                user: session.user,
                profile: profileData,
                session: session,
                loading: false,
                error: null,
              });
            }
            break;

          case 'SIGNED_OUT':
            setState({
              user: null,
              profile: null,
              session: null,
              loading: false,
              error: null,
            });
            break;

          case 'USER_UPDATED':
            if (session?.user) {
              // User was updated (e.g., password changed)
              const profileData = await fetchProfile(session.user.id);
              setState(prev => ({
                ...prev,
                user: session.user,
                profile: profileData,
                session: session,
              }));
            }
            break;

          case 'INITIAL_SESSION':
            // Handled by getSession above
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
      setState(prev => ({ ...prev, error: null, loading: true }));
      
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setState(prev => ({ ...prev, loading: false, error }));
        return { error };
      }

      // Loading will be set to false by onAuthStateChange
      return { error: null };
    } catch (err) {
      const error = err as Error;
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error as AuthError 
      }));
      return { error };
    }
  };

  const signUp = async (email: string, password: string, businessName: string) => {
    try {
      setState(prev => ({ ...prev, error: null, loading: true }));
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            business_name: businessName,
          },
        },
      });

      if (error) {
        setState(prev => ({ ...prev, loading: false, error }));
        return { error };
      }

      // Check if email confirmation is required
      if (data.user && !data.session) {
        setState(prev => ({ ...prev, loading: false }));
        return { error: null, needsConfirmation: true };
      }

      // If we have a session, onAuthStateChange will handle the state update
      return { error: null, needsConfirmation: false };
    } catch (err) {
      const error = err as Error;
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error as AuthError 
      }));
      return { error };
    }
  };

  const signOut = async () => {
    try {
      setState(prev => ({ ...prev, loading: true }));
      await supabase.auth.signOut();
      setState({
        user: null,
        profile: null,
        session: null,
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error('Sign out error:', err);
      // Still clear state even if there's an error
      setState({
        user: null,
        profile: null,
        session: null,
        loading: false,
        error: null,
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
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
