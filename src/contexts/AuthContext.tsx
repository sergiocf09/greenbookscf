import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  initials: string;
  avatar_color: string;
  current_handicap: number;
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

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchProfile = useCallback(async (userId: string): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, display_name, initials, avatar_color, current_handicap')
        .eq('user_id', userId)
        .eq('is_ghost', false)
        .maybeSingle();

      if (!mountedRef.current) return;
      setProfile(error || !data ? null : {
        ...data,
        current_handicap: Number(data.current_handicap) || 0,
      });
    } catch {
      if (mountedRef.current) setProfile(null);
    } finally {
      if (mountedRef.current) setLoading(false);
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
      if (error) { console.error('[Auth] Guest conversion error:', error); return; }
      await supabase.auth.updateUser({ data: { guest_session_id: null, guest_round_id: null } });
      const roundId = currentUser.user_metadata?.guest_round_id;
      if (roundId) localStorage.removeItem(`pending_conversion_${roundId}`);
    } catch (err) {
      console.error('[Auth] Unexpected error during guest conversion:', err);
    }
  }, []);

  useEffect(() => {
    // Hidratación inicial — fuente de verdad
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mountedRef.current) return;
      setSession(s);
      const u = s?.user ?? null;
      setUser(u);

      if (!u || u.is_anonymous) {
        setProfile(null);
        setLoading(false);
        return;
      }
      // fetchProfile llama setLoading(false) al terminar
      void fetchProfile(u.id);
      void handlePendingGuestConversion(u);
    }).catch(() => {
      if (!mountedRef.current) return;
      setProfile(null);
      setLoading(false);
    });

    // Listener de cambios posteriores (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mountedRef.current) return;
      setSession(nextSession);
      const nextUser = nextSession?.user ?? null;
      setUser(nextUser);

      if (!nextUser || nextUser.is_anonymous) {
        setProfile(null);
        setLoading(false);
        return;
      }

      // Nuevo usuario real: recargar profile
      setLoading(true);
      void fetchProfile(nextUser.id);
      void handlePendingGuestConversion(nextUser);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, handlePendingGuestConversion]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: displayName },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    setLoading(false);
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!profile) return;
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id);
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
