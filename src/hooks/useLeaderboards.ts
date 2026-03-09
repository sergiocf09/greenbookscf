import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatPlayerName } from '@/lib/playerInput';

export interface LeaderboardEvent {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  start_date: string;
  end_date: string | null;
  scoring_modes: string[];
  rules_json: Record<string, any>;
  code: string;
  created_by: string;
  created_at: string;
  creator_name?: string;
}

export interface LeaderboardParticipant {
  id: string;
  leaderboard_id: string;
  profile_id: string | null;
  guest_name: string | null;
  guest_initials: string | null;
  guest_color: string | null;
  handicap_for_leaderboard: number;
  is_active: boolean;
  display_name?: string;
  initials?: string;
  avatar_color?: string;
}

export interface LeaderboardScore {
  id: string;
  participant_id: string;
  round_id: string;
  gross_total: number | null;
  net_total: number | null;
  stableford_total: number | null;
  gross_vs_par: number | null;
  net_vs_par: number | null;
  holes_played: number;
}

export interface StandingsEntry {
  participant: LeaderboardParticipant;
  grossVsPar: number;
  netVsPar: number;
  stablefordTotal: number;
  grossTotal: number;
  netTotal: number;
  holesPlayed: number;
  roundsPlayed: number;
}

export function useLeaderboards() {
  const { profile } = useAuth();
  const [events, setEvents] = useState<LeaderboardEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leaderboard_events')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch creator names
      const creatorIds = [...new Set((data || []).map(e => e.created_by))];
      let creatorMap: Record<string, string> = {};
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', creatorIds);
        if (profiles) {
          creatorMap = Object.fromEntries(profiles.map(p => [p.id, formatPlayerName(p.display_name)]));
        }
      }

      setEvents((data || []).map(e => ({
        ...e,
        scoring_modes: Array.isArray(e.scoring_modes) ? e.scoring_modes as string[] : ['gross', 'net'],
        rules_json: (e.rules_json || {}) as Record<string, any>,
        creator_name: creatorMap[e.created_by] || 'Organizador',
      })));
    } catch (err: any) {
      console.error('Error fetching leaderboards:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const createEvent = useCallback(async (params: {
    name: string;
    description?: string;
    scoring_modes: string[];
    start_date: string;
  }) => {
    if (!profile) return null;
    try {
      const { data, error } = await supabase
        .from('leaderboard_events')
        .insert({
          name: params.name,
          description: params.description || null,
          type: 'single_day',
          scoring_modes: params.scoring_modes,
          start_date: params.start_date,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) throw error;
      toast.success('Leaderboard creado');
      await fetchEvents();
      return data;
    } catch (err: any) {
      toast.error('Error al crear leaderboard: ' + err.message);
      return null;
    }
  }, [profile, fetchEvents]);

  const joinByCode = useCallback(async (code: string) => {
    try {
      const { data: eventId, error } = await supabase
        .rpc('resolve_leaderboard_by_code', { p_code: code });
      
      if (error) throw error;
      if (!eventId) {
        toast.error('No se encontró un leaderboard con ese código');
        return null;
      }
      return eventId as string;
    } catch (err: any) {
      toast.error('Error: ' + err.message);
      return null;
    }
  }, []);

  return { events, loading, fetchEvents, createEvent, joinByCode };
}

export function useLeaderboardDetail(leaderboardId: string | null) {
  const { profile } = useAuth();
  const [event, setEvent] = useState<LeaderboardEvent | null>(null);
  const [participants, setParticipants] = useState<LeaderboardParticipant[]>([]);
  const [scores, setScores] = useState<LeaderboardScore[]>([]);
  const [standings, setStandings] = useState<StandingsEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(async () => {
    if (!leaderboardId) return;
    setLoading(true);
    try {
      // Fetch event
      const { data: eventData, error: eventError } = await supabase
        .from('leaderboard_events')
        .select('*')
        .eq('id', leaderboardId)
        .single();
      if (eventError) throw eventError;

      setEvent({
        ...eventData,
        scoring_modes: Array.isArray(eventData.scoring_modes) ? eventData.scoring_modes as string[] : ['gross', 'net'],
        rules_json: (eventData.rules_json || {}) as Record<string, any>,
      });

      // Fetch participants with profile data
      const { data: partData, error: partError } = await supabase
        .from('leaderboard_participants')
        .select('*')
        .eq('leaderboard_id', leaderboardId)
        .eq('is_active', true);
      if (partError) throw partError;

      // Resolve profile names
      const profileIds = (partData || []).filter(p => p.profile_id).map(p => p.profile_id!);
      let profileMap: Record<string, { display_name: string; initials: string; avatar_color: string }> = {};
      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, initials, avatar_color')
          .in('id', profileIds);
        if (profiles) {
          profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
        }
      }

      const enrichedParticipants: LeaderboardParticipant[] = (partData || []).map(p => {
        const prof = p.profile_id ? profileMap[p.profile_id] : null;
        return {
          ...p,
          display_name: prof ? formatPlayerName(prof.display_name) : formatPlayerName(p.guest_name || 'Invitado'),
          initials: prof ? prof.initials : (p.guest_initials || '??'),
          avatar_color: prof ? prof.avatar_color : (p.guest_color || '#3B82F6'),
        };
      });
      setParticipants(enrichedParticipants);

      // Fetch linked rounds
      const { data: linkedRounds } = await supabase
        .from('leaderboard_rounds')
        .select('round_id')
        .eq('leaderboard_id', leaderboardId);
      const roundIds = (linkedRounds || []).map(lr => lr.round_id);

      // Compute standings from live hole_scores data
      const standingsMap = new Map<string, StandingsEntry>();
      for (const part of enrichedParticipants) {
        standingsMap.set(part.id, {
          participant: part,
          grossVsPar: 0,
          netVsPar: 0,
          stablefordTotal: 0,
          grossTotal: 0,
          netTotal: 0,
          holesPlayed: 0,
          roundsPlayed: 0,
        });
      }

      if (roundIds.length > 0) {
        // Get round_players for linked rounds that match participant profiles
        const { data: rpData } = await supabase
          .from('round_players')
          .select('id, profile_id, round_id, handicap_for_round, guest_name')
          .in('round_id', roundIds);

        // Get course info for each round to know pars
        const { data: roundsData } = await supabase
          .from('rounds')
          .select('id, course_id')
          .in('id', roundIds);
        
        const courseIds = [...new Set((roundsData || []).map(r => r.course_id))];
        let holesMap: Record<string, { hole_number: number; par: number; stroke_index: number }[]> = {};
        if (courseIds.length > 0) {
          const { data: holesData } = await supabase
            .from('course_holes')
            .select('course_id, hole_number, par, stroke_index')
            .in('course_id', courseIds);
          for (const h of (holesData || [])) {
            if (!holesMap[h.course_id]) holesMap[h.course_id] = [];
            holesMap[h.course_id].push(h);
          }
        }

        // Map round_id -> course_id
        const roundCourseMap: Record<string, string> = {};
        for (const r of (roundsData || [])) {
          roundCourseMap[r.id] = r.course_id;
        }

        // Map participant profile_id/guest_name -> participant_id
        const profileToParticipant = new Map<string, string>();
        const guestToParticipant = new Map<string, string>();
        for (const part of enrichedParticipants) {
          if (part.profile_id) profileToParticipant.set(part.profile_id, part.id);
          if (part.guest_name) guestToParticipant.set(part.guest_name, part.id);
        }

        // Get the round_player_ids that match participants
        const rpIds: string[] = [];
        const rpToParticipant = new Map<string, string>();
        const rpToRound = new Map<string, string>();
        const rpToHandicap = new Map<string, number>(); // leaderboard handicap
        for (const rp of (rpData || [])) {
          let participantId: string | undefined;
          if (rp.profile_id && profileToParticipant.has(rp.profile_id)) {
            participantId = profileToParticipant.get(rp.profile_id);
          } else if (rp.guest_name && guestToParticipant.has(rp.guest_name)) {
            participantId = guestToParticipant.get(rp.guest_name);
          }
          if (participantId) {
            rpIds.push(rp.id);
            rpToParticipant.set(rp.id, participantId);
            rpToRound.set(rp.id, rp.round_id);
            // Use leaderboard handicap
            const partEntry = standingsMap.get(participantId);
            rpToHandicap.set(rp.id, partEntry?.participant.handicap_for_leaderboard ?? rp.handicap_for_round);
          }
        }

        // Fetch confirmed hole_scores
        if (rpIds.length > 0) {
          const { data: holeScores } = await supabase
            .from('hole_scores')
            .select('round_player_id, hole_number, strokes, confirmed')
            .in('round_player_id', rpIds)
            .eq('confirmed', true);

          for (const hs of (holeScores || [])) {
            const participantId = rpToParticipant.get(hs.round_player_id);
            if (!participantId || !hs.strokes) continue;
            const entry = standingsMap.get(participantId);
            if (!entry) continue;

            const roundId = rpToRound.get(hs.round_player_id)!;
            const courseId = roundCourseMap[roundId];
            const courseHoles = holesMap[courseId] || [];
            const holeInfo = courseHoles.find(h => h.hole_number === hs.hole_number);
            const par = holeInfo?.par || 4;

            // Calculate strokes received on this hole using leaderboard handicap
            const handicap = rpToHandicap.get(hs.round_player_id) ?? 0;
            const sortedHoles = [...courseHoles].sort((a, b) => a.stroke_index - b.stroke_index);
            const holeStrokeIndex = sortedHoles.findIndex(h => h.hole_number === hs.hole_number);
            const fullStrokes = Math.floor(handicap / 18);
            const remainder = Math.round(handicap) % 18;
            const strokesReceived = fullStrokes + (holeStrokeIndex < remainder ? 1 : 0);

            const netStrokes = hs.strokes - strokesReceived;
            const grossVsPar = hs.strokes - par;
            const netVsPar = netStrokes - par;

            // Stableford: points based on net score vs par
            const diff = netStrokes - par;
            let stbPoints = 0;
            if (diff <= -3) stbPoints = 5;
            else if (diff === -2) stbPoints = 4;
            else if (diff === -1) stbPoints = 3;
            else if (diff === 0) stbPoints = 2;
            else if (diff === 1) stbPoints = 1;

            entry.grossTotal += hs.strokes;
            entry.grossVsPar += grossVsPar;
            entry.netTotal += netStrokes;
            entry.netVsPar += netVsPar;
            entry.stablefordTotal += stbPoints;
            entry.holesPlayed += 1;
          }

          // Count rounds played
          for (const [, entry] of standingsMap) {
            if (entry.holesPlayed > 0) entry.roundsPlayed = 1;
          }
        }
      }

      setScores([]);
      setStandings(Array.from(standingsMap.values()));
    } catch (err: any) {
      console.error('Error fetching leaderboard detail:', err);
    } finally {
      setLoading(false);
    }
  }, [leaderboardId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const addParticipant = useCallback(async (params: {
    profile_id?: string;
    guest_name?: string;
    guest_initials?: string;
    guest_color?: string;
    handicap_for_leaderboard: number;
    source_round_id?: string;
  }) => {
    if (!leaderboardId) return;
    try {
      const { error } = await supabase
        .from('leaderboard_participants')
        .insert({
          leaderboard_id: leaderboardId,
          profile_id: params.profile_id || null,
          guest_name: params.guest_name || null,
          guest_initials: params.guest_initials || null,
          guest_color: params.guest_color || null,
          handicap_for_leaderboard: params.handicap_for_leaderboard,
          source_round_id: params.source_round_id || null,
        });
      if (error) throw error;
      await fetchDetail();
    } catch (err: any) {
      toast.error('Error al agregar participante: ' + err.message);
    }
  }, [leaderboardId, fetchDetail]);

  const updateParticipantHandicap = useCallback(async (participantId: string, handicap: number) => {
    try {
      const { error } = await supabase
        .from('leaderboard_participants')
        .update({ handicap_for_leaderboard: handicap })
        .eq('id', participantId);
      if (error) throw error;
      await fetchDetail();
    } catch (err: any) {
      toast.error('Error al actualizar handicap: ' + err.message);
    }
  }, [fetchDetail]);

  const linkRound = useCallback(async (roundId: string) => {
    if (!leaderboardId || !profile) return;
    try {
      const { error } = await supabase
        .from('leaderboard_rounds')
        .insert({
          leaderboard_id: leaderboardId,
          round_id: roundId,
          added_by: profile.id,
        });
      if (error) throw error;
      toast.success('Ronda vinculada al leaderboard');
      await fetchDetail();
    } catch (err: any) {
      toast.error('Error al vincular ronda: ' + err.message);
    }
  }, [leaderboardId, profile, fetchDetail]);

  const isCreator = event?.created_by === profile?.id;

  return {
    event,
    participants,
    scores,
    standings,
    loading,
    isCreator,
    fetchDetail,
    addParticipant,
    updateParticipantHandicap,
    linkRound,
  };
}
