import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { devError } from '@/lib/logger';

export interface CrossBetInvitation {
  invitationId: string;
  roundId: string;
  initiatorProfileId: string;
  initiatorName: string;
  initiatorInitials: string;
  initiatorColor: string;
  courseName: string;
  holesPlayed: number;
  betConfigProposal: Record<string, any>;
  createdAt: string;
}

export interface CrossBet {
  crossBetId: string;
  initiatorProfileId: string;
  initiatorName: string;
  initiatorInitials: string;
  initiatorColor: string;
  targetProfileId: string;
  targetName: string;
  targetInitials: string;
  targetColor: string;
  targetRoundPlayerId: string | null;
  betConfig: Record<string, any>;
}

export function useCrossBets(roundId: string | null) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const pendingQuery = useQuery({
    queryKey: ['cross-invitations-pending', profile?.id],
    enabled: !!profile?.id,
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async (): Promise<CrossBetInvitation[]> => {
      const { data, error } = await supabase.rpc('get_my_pending_cross_invitations');
      if (error) { devError('useCrossBets pending:', error); return []; }
      return (data ?? []).map((r: any) => ({
        invitationId: r.invitation_id,
        roundId: r.round_id,
        initiatorProfileId: r.initiator_profile_id,
        initiatorName: r.initiator_name,
        initiatorInitials: r.initiator_initials,
        initiatorColor: r.initiator_color,
        courseName: r.course_name,
        holesPlayed: r.holes_played ?? 0,
        betConfigProposal: r.bet_config_proposal ?? {},
        createdAt: r.created_at,
      }));
    },
  });

  const crossBetsQuery = useQuery({
    queryKey: ['cross-bets-round', roundId],
    enabled: !!roundId,
    staleTime: 60_000,
    queryFn: async (): Promise<CrossBet[]> => {
      if (!roundId) return [];
      const { data, error } = await supabase.rpc('get_cross_bets_for_round', { p_round_id: roundId });
      if (error) { devError('useCrossBets for round:', error); return []; }
      return (data ?? []).map((r: any) => ({
        crossBetId: r.cross_bet_id,
        initiatorProfileId: r.initiator_profile_id,
        initiatorName: r.initiator_name,
        initiatorInitials: r.initiator_initials,
        initiatorColor: r.initiator_color,
        targetProfileId: r.target_profile_id,
        targetName: r.target_name,
        targetInitials: r.target_initials,
        targetColor: r.target_color,
        targetRoundPlayerId: r.target_round_player_id,
        betConfig: r.bet_config ?? {},
      }));
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['cross-invitations-pending', profile?.id] });
    if (roundId) queryClient.invalidateQueries({ queryKey: ['cross-bets-round', roundId] });
  };

  const sendInvitation = useMutation({
    mutationFn: async ({ targetProfileId, betConfigProposal }: { targetProfileId: string; betConfigProposal: Record<string, any> }) => {
      if (!roundId) throw new Error('no_round');
      const { data, error } = await supabase.rpc('send_cross_bet_invitation', {
        p_round_id: roundId,
        p_target_profile_id: targetProfileId,
        p_bet_config_proposal: betConfigProposal,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
    onError: (err: any) => devError('sendInvitation failed:', err),
  });

  const acceptInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { data, error } = await supabase.rpc('accept_cross_bet_invitation', { p_invitation_id: invitationId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: invalidate,
    onError: (err: any) => devError('acceptInvitation failed:', err),
  });

  const declineInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase.rpc('decline_cross_bet_invitation', { p_invitation_id: invitationId });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (err: any) => devError('declineInvitation failed:', err),
  });

  const cancelInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase.rpc('cancel_cross_bet_invitation', { p_invitation_id: invitationId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    pendingInvitations: pendingQuery.data ?? [],
    pendingCount: (pendingQuery.data ?? []).length,
    isLoadingPending: pendingQuery.isLoading,
    crossBets: crossBetsQuery.data ?? [],
    isLoadingCrossBets: crossBetsQuery.isLoading,
    refetchCrossBets: crossBetsQuery.refetch,
    sendInvitation: sendInvitation.mutateAsync,
    isSending: sendInvitation.isPending,
    sendError: sendInvitation.error,
    acceptInvitation: acceptInvitation.mutateAsync,
    isAccepting: acceptInvitation.isPending,
    declineInvitation: declineInvitation.mutateAsync,
    isDeclining: declineInvitation.isPending,
    cancelInvitation: cancelInvitation.mutateAsync,
  };
}
