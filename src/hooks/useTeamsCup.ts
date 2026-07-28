import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { calculateCourseHandicap } from '@/lib/usgaHandicap';
import { computeCupPoints, totalPointsAvailable, type CupPoints } from '@/lib/teamsCupAggregation';
import { getCupDays, cupSlotKey, type CupDay, type CupRulesJson } from '@/types/leaderboard';

export type CupFormat = 'match_individual' | 'fourball';

export interface CupTeam {
  id: string;
  leaderboard_id: string;
  name: string;
  color: string;
}

export interface CupMatch {
  id: string;
  leaderboard_id: string;
  format: CupFormat;
  player_a1_id: string | null;
  player_a2_id: string | null;
  player_b1_id: string | null;
  player_b2_id: string | null;
  strokes_advantage: number;
  advantage_side: 'a' | 'b' | 'none';
  status: 'pending' | 'active' | 'completed';
  result_type: 'a_wins' | 'b_wins' | 'halved' | null;
  result_detail: string | null;
  result_override: boolean;
  round_id: string | null;
  match_order: number;
  points_per_match: number;
  stroke_receiver_player_id: string | null;
  day_number: number;
  session_number: number;
}


export interface CupHoleBreakdown {
  hole: number;
  side_a_net: number;
  side_b_net: number;
  hole_winner: 'a' | 'b' | 'halved';
  running_a_up: number;
}

export interface CupMatchResult {
  match_id: string;
  holes_played: number;
  holes_remaining: number;
  side_a_holes_won: number;
  side_b_holes_won: number;
  current_standing: string;
  result_type: string;
  match_closed: boolean;
  hole_breakdown: CupHoleBreakdown[];
}

export type TeeColor = 'blue' | 'white' | 'yellow' | 'red';

export interface CupParticipant {
  id: string;
  profile_id: string | null;
  display_name: string;
  initials: string;
  avatar_color: string;
  handicap_for_leaderboard: number;
  match_handicap: number;
  cup_team_id: string | null;
  tee_color: TeeColor | null;
}

export interface CupStandings {
  team_a: CupTeam | null;
  team_b: CupTeam | null;
  points_a: number;
  points_b: number;
  matches_total: number;
  matches_completed: number;
  has_in_progress: boolean;
}

export function useTeamsCup(leaderboardId: string | null) {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<CupTeam[]>([]);
  const [matches, setMatches] = useState<CupMatch[]>([]);
  const [participants, setParticipants] = useState<CupParticipant[]>([]);
  const [matchResults, setMatchResults] = useState<Map<string, CupMatchResult>>(new Map());
  const [standings, setStandings] = useState<CupStandings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!leaderboardId) return;
    setLoading(true);
    try {
      const [teamsRes, matchesRes, partRes, linkedRoundsRes] = await Promise.all([
        supabase.from('cup_teams').select('*')
          .eq('leaderboard_id', leaderboardId).order('created_at'),
        supabase.from('cup_matches').select('*')
          .eq('leaderboard_id', leaderboardId).order('match_order'),
        supabase.from('leaderboard_participants')
          .select('id, profile_id, handicap_for_leaderboard, match_handicap, cup_team_id, tee_color, is_active, guest_name, guest_initials, guest_color')
          .eq('leaderboard_id', leaderboardId)
          .eq('is_active', true),
        supabase.from('leaderboard_rounds')
          .select('round_id, added_at')
          .eq('leaderboard_id', leaderboardId)
          .order('added_at', { ascending: false })
          .limit(1),
      ]);

      if (teamsRes.error) throw teamsRes.error;
      if (matchesRes.error) throw matchesRes.error;
      if (partRes.error) throw partRes.error;

      const teamData = teamsRes.data as CupTeam[];
      let matchData = (matchesRes.data as any[]).map(m => ({
        ...m,
        points_per_match: m.points_per_match ?? 1,
      })) as CupMatch[];
      const rawParts = partRes.data || [];

      // ── Backfill: if a round is linked to this leaderboard and any
      // matches have no round_id, auto-assign so live results can compute.
      const linkedRoundId = linkedRoundsRes.data?.[0]?.round_id ?? null;
      if (linkedRoundId) {
        const orphanIds = matchData.filter(m => !m.round_id).map(m => m.id);
        if (orphanIds.length > 0) {
          await supabase
            .from('cup_matches')
            .update({ round_id: linkedRoundId, status: 'active' } as any)
            .in('id', orphanIds);
          matchData = matchData.map(m =>
            orphanIds.includes(m.id) ? { ...m, round_id: linkedRoundId, status: 'active' as const } : m
          );
        }
      }

      // ── Course HCP from linked round (overrides leaderboard Index when present)
      // For each participant, look up the Course Handicap stored in round_players
      // for the linked round. This is the HCP the player actually plays from,
      // given the course + tee chosen at round creation. It supersedes the
      // leaderboard Index for all match calcs and displays.
      const courseHcpByPart = new Map<string, { hcp: number; tee: TeeColor | null }>();
      if (linkedRoundId) {
        const { data: rps } = await supabase
          .from('round_players')
          .select('profile_id, guest_name, handicap_for_round, tee_color')
          .eq('round_id', linkedRoundId);
        if (rps) {
          rawParts.forEach(p => {
            const m = p.profile_id
              ? rps.find(r => r.profile_id === p.profile_id)
              : rps.find(r => !!r.guest_name && r.guest_name === p.guest_name);
            if (m) {
              courseHcpByPart.set(p.id, {
                hcp: Number(m.handicap_for_round ?? 0),
                tee: (m.tee_color as TeeColor | null) ?? null,
              });
            }
          });
        }
      }

      // Enrich participants with profile data
      const profileIds = rawParts.filter(p => p.profile_id).map(p => p.profile_id!);
      let profileMap: Record<string, { display_name: string; initials: string; avatar_color: string }> = {};
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, initials, avatar_color')
          .in('id', profileIds);
        if (profiles) profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
      }

      const enrichedParts: CupParticipant[] = rawParts.map(p => {
        const prof = p.profile_id ? profileMap[p.profile_id] : null;
        const hcpForLb = p.handicap_for_leaderboard ?? 0;
        const rawMatchHcp = p.match_handicap ?? 0;
        const courseInfo = courseHcpByPart.get(p.id);
        // Effective match handicap priority:
        //  1) Course HCP from the linked round (real-world HCP given course+tee).
        //  2) Stored match_handicap (legacy / manual overrides).
        //  3) Leaderboard Index as last-resort fallback.
        const effectiveMatchHcp = courseInfo
          ? courseInfo.hcp
          : (rawMatchHcp !== 0 ? rawMatchHcp : hcpForLb);
        return {
          id: p.id,
          profile_id: p.profile_id,
          display_name: prof?.display_name ?? p.guest_name ?? 'Jugador',
          initials: prof?.initials ?? p.guest_initials ?? '??',
          avatar_color: prof?.avatar_color ?? p.guest_color ?? '#3B82F6',
          handicap_for_leaderboard: hcpForLb,
          match_handicap: effectiveMatchHcp,
          cup_team_id: p.cup_team_id,
          tee_color: courseInfo?.tee ?? ((p.tee_color as TeeColor | null) ?? null),
        };
      });

      // Persist match_handicap whenever the effective value differs from what's
      // stored. This keeps Course-HCP-driven match calcs consistent across all
      // users without forcing every render to depend on the linked round.
      const toSync = rawParts.filter(p => {
        const courseInfo = courseHcpByPart.get(p.id);
        const target = courseInfo
          ? courseInfo.hcp
          : ((p.match_handicap ?? 0) === 0 && (p.handicap_for_leaderboard ?? 0) !== 0
              ? p.handicap_for_leaderboard
              : null);
        return target !== null && target !== (p.match_handicap ?? 0);
      });
      if (toSync.length > 0) {
        Promise.all(toSync.map(p => {
          const courseInfo = courseHcpByPart.get(p.id);
          const target = courseInfo ? courseInfo.hcp : p.handicap_for_leaderboard;
          return supabase
            .from('leaderboard_participants')
            .update({ match_handicap: target })
            .eq('id', p.id);
        })).catch(err => console.warn('match_handicap sync failed:', err));
      }

      setTeams(teamData);
      setMatches(matchData);
      setParticipants(enrichedParts);

      // Fetch live results for matches with a round OR manual override
      const matchesNeedingResult = matchData.filter(
        m => m.round_id !== null || m.result_override
      );
      const resultsMap = new Map<string, CupMatchResult>();
      await Promise.all(
        matchesNeedingResult.map(async (m) => {
          const { data } = await supabase.rpc('get_cup_match_result', { p_match_id: m.id });
          if (data?.[0]) {
            const row: any = data[0];
            resultsMap.set(m.id, {
              match_id: m.id,
              holes_played: row.holes_played,
              holes_remaining: row.holes_remaining,
              side_a_holes_won: row.side_a_holes_won,
              side_b_holes_won: row.side_b_holes_won,
              current_standing: row.current_standing,
              result_type: row.result_type,
              match_closed: row.match_closed,
              hole_breakdown: Array.isArray(row.hole_breakdown) ? row.hole_breakdown : [],
            });
          }
        })
      );
      setMatchResults(resultsMap);

      // Calculate global standings (closed + in-progress provisional)
      if (teamData.length === 2) {
        let pointsA = 0, pointsB = 0, completed = 0, hasInProgress = false;
        for (const m of matchData) {
          const pts = m.points_per_match ?? 1;
          const live = resultsMap.get(m.id);
          // Final result if closed (or manual override)
          const closed = live?.match_closed ?? false;
          const rtype = closed ? live!.result_type : m.result_type;

          if (rtype === 'a_wins')  { pointsA += pts; completed++; }
          else if (rtype === 'b_wins') { pointsB += pts; completed++; }
          else if (rtype === 'halved') { pointsA += pts / 2; pointsB += pts / 2; completed++; }
          else if (live && live.holes_played > 0 && live.result_type === 'in_progress') {
            // Provisional: leader gets full pts, AS = half each
            hasInProgress = true;
            const diff = live.side_a_holes_won - live.side_b_holes_won;
            if (diff > 0) pointsA += pts;
            else if (diff < 0) pointsB += pts;
            else { pointsA += pts / 2; pointsB += pts / 2; }
          }
        }
        setStandings({
          team_a: teamData[0] ?? null,
          team_b: teamData[1] ?? null,
          points_a: pointsA,
          points_b: pointsB,
          matches_total: matchData.length,
          matches_completed: completed,
          has_in_progress: hasInProgress,
        });
      }
    } catch (err: any) {
      console.error('useTeamsCup fetchAll error:', err);
    } finally {
      setLoading(false);
    }
  }, [leaderboardId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Mutations ─────────────────────────────────────────────

  const updateTeam = useCallback(async (teamId: string, updates: Partial<Pick<CupTeam, 'name' | 'color'>>) => {
    try {
      const { error } = await supabase
        .from('cup_teams')
        .update(updates)
        .eq('id', teamId);
      if (error) throw error;
      await fetchAll();
    } catch (err: any) {
      toast.error('Error al actualizar equipo: ' + err.message);
    }
  }, [fetchAll]);

  const assignTeam = useCallback(async (participantId: string, teamId: string | null) => {
    try {
      const { error } = await supabase
        .from('leaderboard_participants')
        .update({ cup_team_id: teamId })
        .eq('id', participantId);
      if (error) throw error;
      await fetchAll();
    } catch (err: any) {
      toast.error('Error al asignar equipo: ' + err.message);
    }
  }, [fetchAll]);

  const updateMatchHandicap = useCallback(async (participantId: string, matchHandicap: number) => {
    try {
      const { error } = await supabase
        .from('leaderboard_participants')
        .update({ match_handicap: matchHandicap })
        .eq('id', participantId);
      if (error) throw error;
      await fetchAll();
    } catch (err: any) {
      toast.error('Error al actualizar hándicap: ' + err.message);
    }
  }, [fetchAll]);

  /**
   * Persist multiple participant changes (team + handicap) in one network round-trip
   * and refresh state once at the end. Used by the assign-teams panel to avoid
   * UI flicker on every click.
   */
  const batchUpdateParticipants = useCallback(async (
    updates: Array<{
      id: string;
      cup_team_id?: string | null;
      match_handicap?: number;
      handicap_for_leaderboard?: number;
      tee_color?: TeeColor | null;
    }>
  ) => {
    if (updates.length === 0) return true;
    try {
      const partResults = await Promise.all(updates.map(u => {
        const patch: any = {};
        if ('cup_team_id' in u) patch.cup_team_id = u.cup_team_id;
        if ('match_handicap' in u) patch.match_handicap = u.match_handicap;
        if ('handicap_for_leaderboard' in u) patch.handicap_for_leaderboard = u.handicap_for_leaderboard;
        if ('tee_color' in u) patch.tee_color = u.tee_color;
        return supabase.from('leaderboard_participants').update(patch).eq('id', u.id);
      }));
      const partError = partResults.find(r => r.error)?.error;
      if (partError) throw partError;

      const needsRoundSync = updates.some(u => 'tee_color' in u || 'handicap_for_leaderboard' in u || 'match_handicap' in u);
      if (needsRoundSync && leaderboardId) {
        const { data: linkedRows } = await supabase
          .from('leaderboard_rounds')
          .select('round_id')
          .eq('leaderboard_id', leaderboardId)
          .order('added_at', { ascending: false })
          .limit(1);
        const linkedRoundId = linkedRows?.[0]?.round_id ?? null;

        if (linkedRoundId) {
          const { data: round } = await supabase
            .from('rounds')
            .select('course_id')
            .eq('id', linkedRoundId)
            .maybeSingle();

          let coursePar = 72;
          const teeData = new Map<string, { rating: number; slope: number }>();
          if (round?.course_id) {
            const [teesRes, holesRes] = await Promise.all([
              supabase.from('course_tees').select('tee_color, course_rating, slope_rating').eq('course_id', round.course_id),
              supabase.from('course_holes').select('par').eq('course_id', round.course_id),
            ]);
            (teesRes.data ?? []).forEach((t: any) => {
              teeData.set(t.tee_color, { rating: Number(t.course_rating) || 72, slope: Number(t.slope_rating) || 113 });
            });
            coursePar = (holesRes.data ?? []).reduce((sum: number, h: any) => sum + (Number(h.par) || 0), 0) || 72;
          }

          const updateById = new Map(updates.map(u => [u.id, u]));
          const syncTargets = participants.filter(p => updateById.has(p.id));
          const roundResults = await Promise.all(syncTargets.map(p => {
            const u = updateById.get(p.id)!;
            const tee = (('tee_color' in u ? u.tee_color : p.tee_color) ?? 'white') as TeeColor;
            const index = Number(('handicap_for_leaderboard' in u ? u.handicap_for_leaderboard : p.handicap_for_leaderboard) ?? 0);
            const td = teeData.get(tee);
            const courseHcp = td ? calculateCourseHandicap(index, td.slope, td.rating, coursePar) : Math.round(index);
            const patch = { tee_color: tee, handicap_for_round: courseHcp };

            let q = supabase.from('round_players').update(patch).eq('round_id', linkedRoundId);
            q = p.profile_id ? q.eq('profile_id', p.profile_id) : q.eq('guest_name', p.display_name);
            return q;
          }));
          const roundError = roundResults.find(r => r.error)?.error;
          if (roundError) throw roundError;
        }
      }
      await fetchAll();
      return true;
    } catch (err: any) {
      toast.error('Error al guardar cambios: ' + err.message);
      return false;
    }
  }, [fetchAll, leaderboardId, participants]);

  const createMatch = useCallback(async (params: Partial<CupMatch>) => {
    if (!leaderboardId) return null;
    try {
      const { data, error } = await supabase
        .from('cup_matches')
        .insert({ leaderboard_id: leaderboardId, ...params } as any)
        .select().single();
      if (error) throw error;
      toast.success('Match creado');
      await fetchAll();
      return data as CupMatch;
    } catch (err: any) {
      toast.error('Error al crear match: ' + err.message);
      return null;
    }
  }, [leaderboardId, fetchAll]);

  const updateMatch = useCallback(async (matchId: string, updates: Partial<CupMatch>) => {
    try {
      const { error } = await supabase
        .from('cup_matches').update(updates as any).eq('id', matchId);
      if (error) throw error;
      await fetchAll();
    } catch (err: any) {
      toast.error('Error al actualizar match: ' + err.message);
    }
  }, [fetchAll]);

  const deleteMatch = useCallback(async (matchId: string) => {
    try {
      const { error } = await supabase.from('cup_matches').delete().eq('id', matchId);
      if (error) throw error;
      toast.success('Match eliminado');
      await fetchAll();
    } catch (err: any) {
      toast.error('Error al eliminar match: ' + err.message);
    }
  }, [fetchAll]);

  const isCreator = useCallback(
    (event: { created_by: string } | null) => event?.created_by === profile?.id,
    [profile?.id]
  );

  const myParticipant = participants.find(p => p.profile_id === profile?.id) ?? null;

  /**
   * Match individual: el jugador con MAYOR hándicap recibe la diferencia de strokes.
   * `advantage_side` = lado que RECIBE los strokes.
   */
  const calcMatchHandicap = useCallback((
    partA: CupParticipant | undefined,
    partB: CupParticipant | undefined
  ): { strokes_advantage: number; advantage_side: 'a' | 'b' | 'none' } => {
    if (!partA || !partB) return { strokes_advantage: 0, advantage_side: 'none' };
    const diff = partA.match_handicap - partB.match_handicap;
    if (diff === 0) return { strokes_advantage: 0, advantage_side: 'none' };
    // El de mayor HCP recibe.
    if (diff > 0) return { strokes_advantage: diff, advantage_side: 'a' };
    return { strokes_advantage: Math.abs(diff), advantage_side: 'b' };
  }, []);

  /**
   * Fourball: HCP equipo = HCP_j1 + HCP_j2.
   * Ventaja = |team_a_total - team_b_total|, la recibe el equipo de mayor combinado.
   * Dentro de la pareja receptora, los strokes los lleva el jugador de mayor HCP individual.
   * Si empatan, retorna receiver_id = null para que la UI pida decisión.
   */
  const calcFourballHandicap = useCallback((
    a1: CupParticipant | undefined, a2: CupParticipant | undefined,
    b1: CupParticipant | undefined, b2: CupParticipant | undefined,
  ): {
    strokes_advantage: number;
    advantage_side: 'a' | 'b' | 'none';
    receiver_player_id: string | null;
    receiver_tied: boolean;
  } => {
    if (!a1 || !a2 || !b1 || !b2) {
      return { strokes_advantage: 0, advantage_side: 'none', receiver_player_id: null, receiver_tied: false };
    }
    const totalA = a1.match_handicap + a2.match_handicap;
    const totalB = b1.match_handicap + b2.match_handicap;
    const diff = totalA - totalB;
    if (diff === 0) {
      return { strokes_advantage: 0, advantage_side: 'none', receiver_player_id: null, receiver_tied: false };
    }
    const advantage_side: 'a' | 'b' = diff > 0 ? 'a' : 'b';
    const pair = advantage_side === 'a' ? [a1, a2] : [b1, b2];
    const tied = pair[0].match_handicap === pair[1].match_handicap;
    const receiver_player_id = tied ? null : (pair[0].match_handicap > pair[1].match_handicap ? pair[0].id : pair[1].id);
    return {
      strokes_advantage: Math.abs(diff),
      advantage_side,
      receiver_player_id,
      receiver_tied: tied,
    };
  }, []);

  return {
    teams, matches, participants, matchResults, standings,
    loading, fetchAll,
    assignTeam, updateMatchHandicap, updateTeam, batchUpdateParticipants,
    createMatch, updateMatch, deleteMatch,
    isCreator, myParticipant, calcMatchHandicap, calcFourballHandicap,
  };
}
