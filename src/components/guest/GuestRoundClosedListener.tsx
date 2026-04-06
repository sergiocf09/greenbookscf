import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { GuestConversionModal } from './GuestConversionModal';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

/**
 * Global listener mounted inside Index.tsx.
 * Detects when a guest (anonymous user) is participating in a round
 * and shows the conversion modal when the round is closed.
 * Covers "Case A": guest is connected when the organizer closes the round.
 */
export const GuestRoundClosedListener: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [guestSession, setGuestSession] = useState<{
    roundId: string;
    session_id: string;
    ghost_profile_id: string;
    round_player_id: string;
    display_name: string;
  } | null>(null);

  useEffect(() => {
    // Only run for anonymous users
    if (!user?.is_anonymous) return;

    // Find the guest session from localStorage
    const prefix = 'guest_session_';
    let foundSession: typeof guestSession = null;
    let foundRoundId: string | null = null;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) {
        const roundId = key.slice(prefix.length);
        try {
          const data = JSON.parse(localStorage.getItem(key) || '');
          foundSession = { roundId, ...data };
          foundRoundId = roundId;
          break; // Only one active guest session expected
        } catch {
          // skip invalid
        }
      }
    }

    if (!foundSession || !foundRoundId) return;

    setGuestSession(foundSession);

    // Check current round status first
    const checkStatus = async () => {
      const { data } = await supabase
        .from('rounds')
        .select('status')
        .eq('id', foundRoundId!)
        .single();
      if (data?.status === 'completed') {
        setShowModal(true);
      }
    };
    checkStatus();

    // Listen for real-time changes
    const channel = supabase
      .channel(`guest-round-status-${foundRoundId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rounds',
          filter: `id=eq.${foundRoundId}`,
        },
        (payload) => {
          if (payload.new && (payload.new as any).status === 'completed') {
            setShowModal(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  if (!guestSession) return null;

  return (
    <GuestConversionModal
      open={showModal}
      onOpenChange={setShowModal}
      roundId={guestSession.roundId}
      guestSessionId={guestSession.session_id}
      ghostProfileId={guestSession.ghost_profile_id}
      displayName={guestSession.display_name}
      onConverted={() => {
        setShowModal(false);
        toast.success('¡Bienvenido! Tu historial está vinculado.');
        navigate('/');
      }}
      onDismissed={() => {
        setGuestSession(null);
      }}
    />
  );
};
