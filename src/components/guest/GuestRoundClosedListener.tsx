import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { GuestConversionModal } from './GuestConversionModal';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

/**
 * Checks localStorage for a guest session pointing at a completed round.
 * Returns the session data or null.
 */
export function getCompletedGuestSession(): {
  roundId: string;
  session_id: string;
  ghost_profile_id: string;
  round_player_id: string;
  display_name: string;
} | null {
  const prefix = 'guest_session_';
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) {
      const roundId = key.slice(prefix.length);
      try {
        const data = JSON.parse(localStorage.getItem(key) || '');
        return { roundId, ...data };
      } catch {
        // skip invalid
      }
    }
  }
  return null;
}

/**
 * Full-screen blocking component for guests with a completed round.
 * Renders INSTEAD of the main app — the guest must choose to register or dismiss.
 */
export const GuestConversionScreen: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [guestSession, setGuestSession] = useState(getCompletedGuestSession);
  const [roundCompleted, setRoundCompleted] = useState(false);
  const [checking, setChecking] = useState(true);

  // Clean up residual guest localStorage if user is already a real authenticated user
  useEffect(() => {
    if (user && !user.is_anonymous) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('guest_session_') || key?.startsWith('pending_conversion_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    }
  }, [user]);

  useEffect(() => {
    if (!guestSession) {
      setChecking(false);
      return;
    }

    // Verify the round is actually completed
    const check = async () => {
      const { data } = await supabase
        .from('rounds')
        .select('status')
        .eq('id', guestSession.roundId)
        .single();
      setRoundCompleted(data?.status === 'completed');
      setChecking(false);
    };
    check();

    // Also listen for real-time changes (organizer closes while guest is on the app)
    const channel = supabase
      .channel(`guest-round-status-${guestSession.roundId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rounds',
          filter: `id=eq.${guestSession.roundId}`,
        },
        (payload) => {
          if (payload.new && (payload.new as any).status === 'completed') {
            setRoundCompleted(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [guestSession]);

  // Not a guest or no session — render nothing (parent will render the app)
  if (!user?.is_anonymous || !guestSession || checking) return null;

  // Round not completed yet — don't block
  if (!roundCompleted) return null;

  // Block the entire screen with the conversion modal
  return (
    <GuestConversionModal
      open={true}
      onOpenChange={() => {
        // Prevent closing without a decision
      }}
      roundId={guestSession.roundId}
      guestSessionId={guestSession.session_id}
      ghostProfileId={guestSession.ghost_profile_id}
      displayName={guestSession.display_name}
      onConverted={() => {
        toast.success('¡Bienvenido! Tu historial está vinculado.');
        navigate('/');
      }}
      onDismissed={() => {
        setGuestSession(null);
      }}
    />
  );
};
