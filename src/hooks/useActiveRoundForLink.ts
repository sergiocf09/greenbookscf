import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Player, PlayerGroup } from '@/types/golf';

/**
 * Detects the current user's most recent NON-completed round (where they're a
 * participant) and loads its players + groups in the shape that
 * LinkRoundToLeaderboardDialog expects.
 *
 * Used by standalone leaderboard pages (e.g. TeamsCupDetail) that don't have
 * direct access to RoundContext but still need to offer "Vincular ronda".
 */
export function useActiveRoundForLink() {
  const { profile } = useAuth();
  const [roundId, setRoundId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerGroups, setPlayerGroups] = useState<PlayerGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!profile?.id) {
      setRoundId(null);
      setPlayers([]);
      setPlayerGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1) Find rounds where this profile is a participant
      const { data: myRps, error: myErr } = await supabase
        .from('round_players')
        .select('round_id')
        .eq('profile_id', profile.id);
      if (myErr) throw myErr;

      const candidateRoundIds = Array.from(
        new Set((myRps || []).map(r => r.round_id).filter(Boolean) as string[])
      );

      if (candidateRoundIds.length === 0) {
        setRoundId(null);
        setPlayers([]);
        setPlayerGroups([]);
        return;
      }

      // 2) Pick the most recent non-completed round
      const { data: rounds, error: rErr } = await supabase
        .from('rounds')
        .select('id, status, created_at')
        .in('id', candidateRoundIds)
        .neq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1);
      if (rErr) throw rErr;

      const active = rounds?.[0];
      if (!active) {
        setRoundId(null);
        setPlayers([]);
        setPlayerGroups([]);
        return;
      }

      const activeRoundId = active.id;

      // 3) Load players + groups for that round
      const [groupsRes, rpsRes] = await Promise.all([
        supabase.from('round_groups')
          .select('id, group_number')
          .eq('round_id', activeRoundId)
          .order('group_number'),
        supabase.from('round_players')
          .select('id, profile_id, group_id, handicap_for_round, guest_name, guest_initials, guest_color')
          .eq('round_id', activeRoundId),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (rpsRes.error) throw rpsRes.error;

      const rps = rpsRes.data || [];

      // Enrich with profile data for non-guest players
      const profileIds = rps.filter(rp => rp.profile_id).map(rp => rp.profile_id!);
      let profileMap: Record<string, { display_name: string; initials: string; avatar_color: string }> = {};
      if (profileIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, display_name, initials, avatar_color')
          .in('id', profileIds);
        if (profs) profileMap = Object.fromEntries(profs.map(p => [p.id, p]));
      }

      const enrichedPlayers: Player[] = rps.map(rp => {
        const prof = rp.profile_id ? profileMap[rp.profile_id] : null;
        return {
          id: rp.id,
          name: prof?.display_name ?? rp.guest_name ?? 'Jugador',
          initials: prof?.initials ?? rp.guest_initials ?? '??',
          color: prof?.avatar_color ?? rp.guest_color ?? '#3B82F6',
          handicap: Number(rp.handicap_for_round ?? 0),
          profileId: rp.profile_id ?? undefined,
          groupId: rp.group_id,
        } as Player;
      });

      const enrichedGroups: PlayerGroup[] = (groupsRes.data || []).map(g => ({
        id: g.id,
        groupNumber: g.group_number,
        playerIds: enrichedPlayers.filter(p => p.groupId === g.id).map(p => p.id),
      } as PlayerGroup));

      setRoundId(activeRoundId);
      setPlayers(enrichedPlayers);
      setPlayerGroups(enrichedGroups);
    } catch (err) {
      console.error('[useActiveRoundForLink] error:', err);
      setRoundId(null);
      setPlayers([]);
      setPlayerGroups([]);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  return { roundId, players, playerGroups, loading, refresh };
}
