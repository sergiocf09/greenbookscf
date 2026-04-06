import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface HandicapRankingEntry {
  profile_id: string;
  display_name: string;
  initials: string;
  avatar_color: string;
  current_handicap: number;
  avg_gross_score: number | null;
  best_gross_score: number | null;
  rounds_played: number;
  handicap_trend: number | null;
  rank?: number;
}

export type HandicapRankingScope = 'global' | 'group';

export function useHandicapRanking(roundId: string | null, scope: HandicapRankingScope) {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<HandicapRankingEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const buildEntry = async (p: { id: string; display_name: string; initials: string; avatar_color: string; current_handicap: number }) => {
    // Fetch last 20 handicap_history records for avg/best (consistent with USGA index)
    const { data: history } = await supabase
      .from('handicap_history')
      .select('handicap, gross_score, recorded_at')
      .eq('profile_id', p.id)
      .order('recorded_at', { ascending: false })
      .limit(20);

    // Total completed rounds for this player (all-time)
    const { count: totalRounds } = await supabase
      .from('round_players')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', p.id)
      .not('round_id', 'is', null);

    const rounds = history || [];
    const grossScores = rounds.map(r => r.gross_score).filter((s): s is number => s !== null);
    const avgGross = grossScores.length > 0
      ? Math.round(grossScores.reduce((a, b) => a + b, 0) / grossScores.length * 10) / 10
      : null;
    const bestGross = grossScores.length > 0 ? Math.min(...grossScores) : null;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const oldRecord = rounds.find(r => new Date(r.recorded_at) <= thirtyDaysAgo);
    const trend = oldRecord
      ? Math.round((p.current_handicap - oldRecord.handicap) * 10) / 10
      : null;

    return {
      profile_id: p.id,
      display_name: p.display_name,
      initials: p.initials,
      avatar_color: p.avatar_color,
      current_handicap: p.current_handicap,
      avg_gross_score: avgGross,
      best_gross_score: bestGross,
      rounds_played: totalRounds ?? 0,
      handicap_trend: trend,
    };
  };

  const fetchGlobal = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      // Use friendships table to get only actual friends
      const { data: friends } = await supabase
        .rpc('get_my_friends');

      const peerIds = new Set<string>([profile.id]);
      (friends || []).forEach(f => {
        if (f.friend_profile_id) peerIds.add(f.friend_profile_id);
      });

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, initials, avatar_color, current_handicap')
        .in('id', Array.from(peerIds));

      if (!profiles) return;

      const enriched = await Promise.all(profiles.map(buildEntry));
      setEntries(
        enriched
          .sort((a, b) => a.current_handicap - b.current_handicap)
          .map((e, idx) => ({ ...e, rank: idx + 1 }))
      );
    } catch (err) {
      console.error('Error fetching global handicap ranking:', err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  const fetchGroup = useCallback(async () => {
    if (!roundId) { setEntries([]); return; }
    setLoading(true);
    try {
      const { data: roundPlayers } = await supabase
        .from('round_players')
        .select('profile_id')
        .eq('round_id', roundId)
        .not('profile_id', 'is', null);

      if (!roundPlayers?.length) { setEntries([]); return; }

      const profileIds = roundPlayers.map(rp => rp.profile_id).filter(Boolean) as string[];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, initials, avatar_color, current_handicap')
        .in('id', profileIds);

      if (!profiles) return;

      const enriched = await Promise.all(profiles.map(buildEntry));
      setEntries(
        enriched
          .sort((a, b) => a.current_handicap - b.current_handicap)
          .map((e, idx) => ({ ...e, rank: idx + 1 }))
      );
    } catch (err) {
      console.error('Error fetching group handicap ranking:', err);
    } finally {
      setLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    if (scope === 'global') fetchGlobal();
    else fetchGroup();
  }, [scope, fetchGlobal, fetchGroup]);

  return { entries, loading };
}

/**
 * Hook for fetching handicap ranking for a specific set of profile IDs
 * (used in MoneyRankingDetail to show handicap data for ranking members)
 */
export function useHandicapRankingByIds(profileIds: string[]) {
  const [entries, setEntries] = useState<HandicapRankingEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!profileIds.length) { setEntries([]); return; }
    setLoading(true);
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, initials, avatar_color, current_handicap')
        .in('id', profileIds);

      if (!profiles) return;

      const enriched = await Promise.all(profiles.map(async (p) => {
        const { data: history } = await supabase
          .from('handicap_history')
          .select('handicap, gross_score, recorded_at')
          .eq('profile_id', p.id)
          .order('recorded_at', { ascending: false })
          .limit(20);

        const { count: totalRounds } = await supabase
          .from('round_players')
          .select('id', { count: 'exact', head: true })
          .eq('profile_id', p.id)
          .not('round_id', 'is', null);

        const rounds = history || [];
        const grossScores = rounds.map(r => r.gross_score).filter((s): s is number => s !== null);
        const avgGross = grossScores.length > 0
          ? Math.round(grossScores.reduce((a, b) => a + b, 0) / grossScores.length * 10) / 10
          : null;
        const bestGross = grossScores.length > 0 ? Math.min(...grossScores) : null;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const oldRecord = rounds.find(r => new Date(r.recorded_at) <= thirtyDaysAgo);
        const trend = oldRecord
          ? Math.round((p.current_handicap - oldRecord.handicap) * 10) / 10
          : null;

        return {
          profile_id: p.id,
          display_name: p.display_name,
          initials: p.initials,
          avatar_color: p.avatar_color,
          current_handicap: p.current_handicap,
          avg_gross_score: avgGross,
          best_gross_score: bestGross,
          rounds_played: totalRounds ?? 0,
          handicap_trend: trend,
        };
      }));

      setEntries(
        enriched
          .sort((a, b) => a.current_handicap - b.current_handicap)
          .map((e, idx) => ({ ...e, rank: idx + 1 }))
      );
    } catch (err) {
      console.error('Error fetching handicap ranking by ids:', err);
    } finally {
      setLoading(false);
    }
  }, [profileIds.join(',')]);

  useEffect(() => { fetch(); }, [fetch]);

  return { entries, loading };
}
