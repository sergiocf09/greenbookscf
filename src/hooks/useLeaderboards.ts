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

      // Fetch scores
      const { data: scoreData, error: scoreError } = await supabase
        .from('leaderboard_scores')
        .select('*')
        .eq('leaderboard_id', leaderboardId);
      if (scoreError) throw scoreError;
      setScores(scoreData || []);

      // Compute standings
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

      for (const score of (scoreData || [])) {
        const entry = standingsMap.get(score.participant_id);
        if (!entry) continue;
        entry.grossVsPar += score.gross_vs_par || 0;
        entry.netVsPar += score.net_vs_par || 0;
        entry.stablefordTotal += score.stableford_total || 0;
        entry.grossTotal += score.gross_total || 0;
        entry.netTotal += score.net_total || 0;
        entry.holesPlayed += score.holes_played || 0;
        if (score.holes_played && score.holes_played > 0) entry.roundsPlayed += 1;
      }

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
