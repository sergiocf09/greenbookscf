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

export interface CupStandings extends CupPoints {
  team_a: CupTeam | null;
  team_b: CupTeam | null;
}

export interface CupSlotStandings extends CupPoints {
  day_number: number;
  session_number: number;
  round_id: string | null;
  points_available: number;
}

/** Basic info of a round linked to a cup slot. */
export interface CupRoundInfo {
  status: 'setup' | 'in_progress' | 'completed';
  date: string | null;
  courseName: string | null;
}

export function useTeamsCup(leaderboardId: string | null) {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<CupTeam[]>([]);
  const [matches, setMatches] = useState<CupMatch[]>([]);
  const [participants, setParticipants] = useState<CupParticipant[]>([]);
  const [matchResults, setMatchResults] = useState<Map<string, CupMatchResult>>(new Map());
  const [days, setDays] = useState<CupDay[]>([]);
  const [hcpByRound, setHcpByRound] = useState<Map<string, Map<string, { hcp: number; tee: TeeColor | null }>>>(new Map());
  const [groupByParticipant, setGroupByParticipant] = useState<Map<string, Map<string, number>>>(new Map());
  const [roundInfoById, setRoundInfoById] = useState<Map<string, CupRoundInfo>>(new Map());
  const [loading, setLoading] = useState(true);


  const fetchAll = useCallback(async () => {
    if (!leaderboardId) return;
    setLoading(true);
    try {
      const [teamsRes, matchesRes, partRes, linkedRoundsRes, eventRes] = await Promise.all([
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
          .order('added_at', { ascending: false }),
        supabase.from('leaderboard_events')
          .select('rules_json, cup_format, start_date')
          .eq('id', leaderboardId)
          .maybeSingle(),
      ]);

      if (teamsRes.error) throw teamsRes.error;
      if (matchesRes.error) throw matchesRes.error;
      if (partRes.error) throw partRes.error;

      const teamData = teamsRes.data as CupTeam[];
      let matchData = (matchesRes.data as any[]).map(m => ({
        ...m,
        points_per_match: m.points_per_match ?? 1,
        day_number: m.day_number ?? 1,
        session_number: m.session_number ?? 1,
      })) as CupMatch[];
      const rawParts = partRes.data || [];

      // ── Day / session configuration
      const ev: any = eventRes.data ?? null;
      const cupDays = getCupDays(
        (ev?.rules_json ?? null) as CupRulesJson | null,
        (ev?.cup_format as CupFormat) || 'match_individual',
        ev?.start_date ?? null,
      );
      const slotCount = cupDays.reduce((s, d) => s + d.sessions.length, 0);
      const isSingleSlot = slotCount <= 1;
      setDays(cupDays);

      // ── Backfill (legacy single-session cups only): assign the linked round
      // to matches without a round so live results can compute. For multi-day
      // or multi-session cups each slot owns its own round, so we never
      // auto-assign across slots.
      const latestRoundId = linkedRoundsRes.data?.[0]?.round_id ?? null;
      if (isSingleSlot && latestRoundId) {
        const orphanIds = matchData.filter(m => !m.round_id).map(m => m.id);
        if (orphanIds.length > 0) {
          await supabase
            .from('cup_matches')
            .update({ round_id: latestRoundId, status: 'active' } as any)
            .in('id', orphanIds);
          matchData = matchData.map(m =>
            orphanIds.includes(m.id) ? { ...m, round_id: latestRoundId, status: 'active' as const } : m
          );
        }
      }

      // ── Course HCP per linked round.
      // Each round (i.e. each day/session) can be played on a different course
      // or tees, so we index the Course Handicap by round and resolve it per
      // match instead of overwriting a single global value.
      const roundIdsToLoad = Array.from(new Set([
        ...matchData.map(m => m.round_id).filter(Boolean) as string[],
        ...(latestRoundId ? [latestRoundId] : []),
      ]));
      const hcpMap = new Map<string, Map<string, { hcp: number; tee: TeeColor | null }>>();
      const groupMap = new Map<string, Map<string, number>>();
      const roundInfoMap = new Map<string, CupRoundInfo>();
      if (roundIdsToLoad.length > 0) {
        const [{ data: rps }, { data: groupsData }, { data: roundsData }] = await Promise.all([
          supabase
            .from('round_players')
            .select('round_id, profile_id, guest_name, handicap_for_round, tee_color, group_id')
            .in('round_id', roundIdsToLoad),
          supabase
            .from('round_groups')
            .select('id, round_id, group_number')
            .in('round_id', roundIdsToLoad),
          supabase
            .from('rounds')
            .select('id, status, date, golf_courses(name)')
            .in('id', roundIdsToLoad),
        ]);

        (roundsData ?? []).forEach((r: any) => {
          roundInfoMap.set(r.id as string, {
            status: r.status,
            date: r.date ?? null,
            courseName: r.golf_courses?.name ?? null,
          });
        });

        const groupNumById = new Map<string, number>();
        (groupsData ?? []).forEach((g: any) => groupNumById.set(g.id, Number(g.group_number)));


        (rps ?? []).forEach(r => {
          const rid = r.round_id as string;
          if (!hcpMap.has(rid)) hcpMap.set(rid, new Map());
          if (!groupMap.has(rid)) groupMap.set(rid, new Map());
          const part = r.profile_id
            ? rawParts.find(p => p.profile_id === r.profile_id)
            : rawParts.find(p => !!p.guest_name && p.guest_name === r.guest_name);
          if (part) {
            hcpMap.get(rid)!.set(part.id, {
              hcp: Number(r.handicap_for_round ?? 0),
              tee: (r.tee_color as TeeColor | null) ?? null,
            });
            const gnum = groupNumById.get(r.group_id as string);
            if (gnum !== undefined) {
              groupMap.get(rid)!.set(part.id, gnum);
            }
          }
        });
      }
      setHcpByRound(hcpMap);
      setGroupByParticipant(groupMap);
      setRoundInfoById(roundInfoMap);


      // Default (display) Course HCP = most recent linked round.
      const courseHcpByPart = latestRoundId
        ? (hcpMap.get(latestRoundId) ?? new Map())
        : new Map<string, { hcp: number; tee: TeeColor | null }>();

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
      // stored. Only for single-slot cups: with several days/sessions the HCP
      // is resolved per round and must not be flattened into one column.
      if (isSingleSlot) {
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
    } catch (err: any) {
      console.error('useTeamsCup fetchAll error:', err);
    } finally {
      setLoading(false);
    }
  }, [leaderboardId]);

  /** Accumulated standings across the whole cup (closed + live provisional). */
  const standings: CupStandings | null = useMemo(() => {
    if (teams.length !== 2) return null;
    return {
      ...computeCupPoints(matches, matchResults),
      team_a: teams[0] ?? null,
      team_b: teams[1] ?? null,
    };
  }, [teams, matches, matchResults]);

  /** Standings per day/session slot, keyed by `${day}-${session}`. */
  const standingsBySlot: Map<string, CupSlotStandings> = useMemo(() => {
    const map = new Map<string, CupSlotStandings>();
    for (const d of days) {
      for (const s of d.sessions) {
        const key = cupSlotKey(d.day_number, s.session_number);
        const slotMatches = matches.filter(
          m => m.day_number === d.day_number && m.session_number === s.session_number,
        );
        map.set(key, {
          ...computeCupPoints(slotMatches, matchResults),
          day_number: d.day_number,
          session_number: s.session_number,
          round_id: slotMatches.find(m => m.round_id)?.round_id ?? null,
          points_available: totalPointsAvailable(slotMatches),
        });
      }
    }
    return map;
  }, [days, matches, matchResults]);

  /** Standings per day (all its sessions combined). */
  const standingsByDay: Map<number, CupPoints> = useMemo(() => {
    const map = new Map<number, CupPoints>();
    for (const d of days) {
      map.set(d.day_number, computeCupPoints(
        matches.filter(m => m.day_number === d.day_number), matchResults,
      ));
    }
    return map;
  }, [days, matches, matchResults]);

  /**
   * Participants with the Course HCP of a specific round (day/session).
   * Falls back to the default participant HCP when the round has no data.
   */
  const participantsForRound = useCallback((roundId: string | null | undefined): CupParticipant[] => {
    if (!roundId) return participants;
    const m = hcpByRound.get(roundId);
    if (!m || m.size === 0) return participants;
    return participants.map(p => {
      const info = m.get(p.id);
      return info ? { ...p, match_handicap: info.hcp, tee_color: info.tee ?? p.tee_color } : p;
    });
  }, [participants, hcpByRound]);


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

  /**
   * Derive the foursome (round_groups.group_number) a match belongs to by looking
   * at where its players are placed in the linked round. Falls back to Infinity
   * (sorted last) when no group data exists.
   */
  const getMatchGroupNumber = useCallback((match: CupMatch): number => {
    if (!match.round_id) return Infinity;
    const roundMap = groupByParticipant.get(match.round_id);
    if (!roundMap) return Infinity;
    const ids = [match.player_a1_id, match.player_a2_id, match.player_b1_id, match.player_b2_id].filter(Boolean) as string[];
    const groups = ids.map(id => roundMap.get(id)).filter((g): g is number => g !== undefined);
    if (groups.length === 0) return Infinity;
    const counts = new Map<number, number>();
    groups.forEach(g => counts.set(g, (counts.get(g) || 0) + 1));
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    return sorted[0][0];
  }, [groupByParticipant]);

  /**
   * A slot (day/session) is "closed" when the round linked to its matches has
   * been closed by the organizer (`rounds.status = 'completed'`). Sharing
   * results is only allowed for closed slots.
   */
  const isSlotClosed = useCallback((slotKey: string): boolean => {
    const st = standingsBySlot.get(slotKey);
    const roundId = st?.round_id ?? null;
    if (!roundId) return false;
    return roundInfoById.get(roundId)?.status === 'completed';
  }, [standingsBySlot, roundInfoById]);

  return {
    teams, matches, participants, matchResults, standings,
    days, standingsBySlot, standingsByDay, participantsForRound,
    loading, fetchAll,
    assignTeam, updateMatchHandicap, updateTeam, batchUpdateParticipants,
    createMatch, updateMatch, deleteMatch,
    isCreator, myParticipant, calcMatchHandicap, calcFourballHandicap,
    getMatchGroupNumber, roundInfoById, isSlotClosed,
  };
}

