import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getAuthRedirectOrigin } from '@/lib/authRedirect';

interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  initials: string;
  avatar_color: string;
  current_handicap: number;
  subscription_tier?: string;
  subscription_expires_at?: string | null;
  is_founder?: boolean;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const hasHydratedSessionRef = useRef(false);
  const hasAuthEventRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const loadOnce = async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, initials, avatar_color, current_handicap')
        .eq('user_id', userId)
        .eq('is_ghost', false)
        .maybeSingle();

      if (error || !data) return null;

      return {
        ...data,
        current_handicap: Number(data.current_handicap) || 0,
      };
    };

    try {
      const immediateProfile = await loadOnce();
      if (immediateProfile) return immediateProfile;

      await new Promise((resolve) => window.setTimeout(resolve, 250));
      return await loadOnce();
    } catch {
      return null;
    }
  }, []);

  const handlePendingGuestConversion = useCallback(async (currentUser: User) => {
    const guestSessionId = currentUser.user_metadata?.guest_session_id;
    if (!guestSessionId || currentUser.is_anonymous) return;
    if (!currentUser.email_confirmed_at) return;

    try {
      const { error } = await supabase.rpc('convert_ghost_to_profile', {
        p_session_id: guestSessionId,
        p_auth_uid: currentUser.id,
      });

      if (error) {
        console.error('[Auth] Guest conversion error:', error);
        return;
      }

      await supabase.auth.updateUser({ data: { guest_session_id: null, guest_round_id: null } });
      const roundId = currentUser.user_metadata?.guest_round_id;
      if (roundId) localStorage.removeItem(`pending_conversion_${roundId}`);
    } catch (err) {
      console.error('[Auth] Unexpected error during guest conversion:', err);
    }
  }, []);

  const syncAuthState = useCallback(
    (nextSession: Session | null) => {
      if (!mountedRef.current) return;

      setSession(nextSession);
      const nextUser = nextSession?.user ?? null;

      if (!nextUser || nextUser.is_anonymous) {
        setUser(nextUser);
        setProfile(null);
        setLoading(false);
        return;
      }

      // Only set loading=true when user actually changes to avoid
      // re-setting loading after profile was already fetched
      setUser((prev) => {
        if (prev?.id === nextUser.id) return prev; // no change → no re-render → useEffect won't re-fire
        return nextUser;
      });
    },
    [],
  );

  useEffect(() => {
    if (!user || user.is_anonymous) {
      if (mountedRef.current) {
        setProfile(null);
        setLoading(false);
      }
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      const nextProfile = await fetchProfile(user.id);
      if (cancelled || !mountedRef.current) return;

      setProfile(nextProfile);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.is_anonymous, fetchProfile]);

  useEffect(() => {
    if (!user || user.is_anonymous) return;
    void handlePendingGuestConversion(user);
  }, [
    user?.id,
    user?.is_anonymous,
    user?.email_confirmed_at,
    user?.user_metadata?.guest_session_id,
    user?.user_metadata?.guest_round_id,
    handlePendingGuestConversion,
  ]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mountedRef.current) return;
      if (!hasHydratedSessionRef.current && event === 'INITIAL_SESSION') return;

      hasAuthEventRef.current = true;
      hasHydratedSessionRef.current = true;
      syncAuthState(nextSession);
    });

    supabase.auth
      .getSession()
      .then(({ data: { session: restoredSession } }) => {
        if (!mountedRef.current || hasAuthEventRef.current) return;
        hasHydratedSessionRef.current = true;
        syncAuthState(restoredSession);
      })
      .catch(() => {
        if (!mountedRef.current || hasAuthEventRef.current) return;
        hasHydratedSessionRef.current = true;
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, [syncAuthState]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      import('@/lib/sentry').then(({ setSentryUser }) =>
        setSentryUser(data.user!.id, data.user!.email ?? undefined)
      );
    }
    // NO llamar syncAuthState aquí — onAuthStateChange lo maneja automáticamente
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthRedirectOrigin(),
        data: { display_name: displayName },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    import('@/lib/sentry').then(({ clearSentryUser }) => clearSentryUser());
    setUser(null);
    setProfile(null);
    setSession(null);
    setLoading(false);
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!profile) return;

    const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id);
    if (error) throw error;

    setProfile({ ...profile, ...updates });
  };

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, signIn, signUp, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
