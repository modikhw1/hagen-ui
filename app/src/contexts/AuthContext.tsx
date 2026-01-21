'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface Profile {
  id: string;
  email: string;
  business_name: string;
  business_description: string | null;
  goals: string[];
  constraints: string[];
  industry_tags: string[];
  profile_completeness: number;
  social_tiktok: string | null;
  social_instagram: string | null;
  has_paid: boolean;
  has_concepts: boolean;
  // Subscription fields for Stripe integration
  subscription_status: string | null;
  subscription_id: string | null;
  stripe_customer_id: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  syncing: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, businessName: string) => Promise<{ error: Error | null; needsConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }

      return data as Profile;
    } catch (err) {
      console.error('Profile fetch error:', err);
      return null;
    }
  };

  // Sync Stripe customer data to Supabase (for pre-registered customers)
  const syncStripeCustomer = async (userId: string, email: string) => {
    try {
      const res = await fetch('/api/stripe/sync-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email }),
      });
      const data = await res.json();
      return data.synced;
    } catch (err) {
      console.error('Stripe sync error:', err);
      return false;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        try {
          // First fetch profile
          let profileData = await fetchProfile(session.user.id);
          setProfile(profileData);

          // Always sync from Stripe to get latest subscription status
          if (profileData && session.user.email) {
            setSyncing(true);
            try {
              const synced = await syncStripeCustomer(session.user.id, session.user.email);
              if (synced) {
                // Re-fetch profile after sync
                profileData = await fetchProfile(session.user.id);
                setProfile(profileData);
              }
            } catch (syncErr) {
              console.error('Stripe sync failed:', syncErr);
            } finally {
              setSyncing(false);
            }
          }
        } catch (err) {
          console.error('Profile fetch failed:', err);
        }
      }

      setLoading(false);
    }).catch(err => {
      console.error('getSession failed:', err);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event, session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          try {
            // First fetch profile
            let profileData = await fetchProfile(session.user.id);
            setProfile(profileData);

            // On sign in, always sync Stripe data to get latest subscription status
            if (event === 'SIGNED_IN' && profileData && session.user.email) {
              setSyncing(true);
              try {
                const synced = await syncStripeCustomer(session.user.id, session.user.email);
                if (synced) {
                  // Re-fetch profile after sync
                  profileData = await fetchProfile(session.user.id);
                  setProfile(profileData);
                }
              } catch (syncErr) {
                console.error('Stripe sync failed:', syncErr);
              } finally {
                setSyncing(false);
              }
            }
          } catch (err) {
            console.error('Profile fetch in auth change failed:', err);
          }
        } else {
          setProfile(null);
        }

        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error };
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signUp = async (email: string, password: string, businessName: string) => {
    try {
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
        return { error };
      }

      // Check if email confirmation is required
      if (data.user && !data.session) {
        return { error: null, needsConfirmation: true };
      }

      return { error: null, needsConfirmation: false };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        syncing,
        signIn,
        signUp,
        signOut,
        refreshProfile,
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
