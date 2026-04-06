import React, { createContext, useContext, useEffect, useState } from 'react';
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

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (data && !error) {
      // Try to get the handicap from the last completed round
      const { data: lastRoundData } = await supabase
        .from('round_players')
        .select(`
          handicap_for_round,
          rounds!inner(status, date)
        `)
        .eq('profile_id', data.id)
        .eq('rounds.status', 'completed')
        .order('rounds(date)', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Use last round handicap if available, otherwise use profile's current_handicap
      const effectiveHandicap = lastRoundData?.handicap_for_round ?? data.current_handicap;
      
      setProfile({
        ...data,
        current_handicap: Number(effectiveHandicap) || Number(data.current_handicap) || 0,
      });
    }
  };

  // Detect and execute pending guest-to-user conversion after email confirmation
  const handlePendingGuestConversion = async (currentUser: User) => {
    // Only for non-anonymous users with a pending guest_session_id in metadata
    const guestSessionId = currentUser.user_metadata?.guest_session_id;
    if (!guestSessionId || currentUser.is_anonymous) return;
    
    // Email must be confirmed
    if (!currentUser.email_confirmed_at) return;

    console.log('[Auth] Detected pending guest conversion, executing...');
    try {
      const { error } = await supabase.rpc('convert_ghost_to_profile', {
        p_session_id: guestSessionId,
        p_auth_uid: currentUser.id,
      });

      if (error) {
        console.error('[Auth] Guest conversion error:', error);
        return;
      }

      // Clear the guest metadata now that conversion is complete
      await supabase.auth.updateUser({
        data: {
          guest_session_id: null,
          guest_round_id: null,
        },
      });

      // Clean up any pending_conversion localStorage entries
      const roundId = currentUser.user_metadata?.guest_round_id;
      if (roundId) {
        localStorage.removeItem(`pending_conversion_${roundId}`);
      }

      console.log('[Auth] Guest conversion completed successfully');
      
      // Re-fetch profile to get the converted one
      await fetchProfile(currentUser.id);
    } catch (err) {
      console.error('[Auth] Unexpected error during guest conversion:', err);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Use setTimeout to avoid potential deadlocks
          setTimeout(() => {
            fetchProfile(session.user.id);
            handlePendingGuestConversion(session.user);
          }, 0);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    // THEN get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        handlePendingGuestConversion(session.user);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

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
        data: { display_name: displayName }
      }
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!profile) return;
    
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id);

    if (error) {
      throw error;
    }

    setProfile({ ...profile, ...updates });
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      session,
      loading,
      signIn,
      signUp,
      signOut,
      updateProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
