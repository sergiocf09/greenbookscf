import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatPlayerName } from '@/lib/playerInput';
import { computeRoundModeTotals, type HoleInfo, type ScoringMode } from '@/lib/leaderboardAggregation';

export interface HistoricalCompetitionStanding {
  participantId: string;
  profile_id: string | null;
  display_name: string;
  initials: string;
  avatar_color: string;
  isMe: boolean;
  grossTotal: number;
  netTotal: number;
  grossVsPar: number;
  netVsPar: number;
  stablefordTotal: number;
  holesPlayed: number;
}

export interface HistoricalCompetition {
  id: string;
  name: string;
  competition_type: string;
  status: string;
  scoring_modes: ScoringMode[];
  /** Day number of this round inside a multi-day competition (null if N/A). */
  dayNumber: number | null;
  totalDays: number;
  totalParticipants: number;
  /** Standings for THIS round only, sorted per mode. */
  standingsByMode: Record<ScoringMode, HistoricalCompetitionStanding[]>;
  myPositionByMode: Record<ScoringMode, number | null>;
  myStanding: HistoricalCompetitionStanding | null;
}

const MODES: ScoringMode[] = ['gross', 'net', 'stableford'];

function sortByMode(list: HistoricalCompetitionStanding[], mode: ScoringMode) {
  const copy = [...list];
  copy.sort((a, b) =>
    mode === 'stableford'
      ? b.stablefordTotal - a.stablefordTotal
      : mode === 'gross'
        ? a.grossVsPar - b.grossVsPar
        : a.netVsPar - b.netVsPar,
  );
  return copy;
}

/**
 * Competitions (leaderboards) linked to a closed round, with the results of
 * THAT round only, per scoring mode. Teams Cups are returned too (with empty
 * stroke standings) so the caller can render the cup-specific summary.
 */
export function useHistoricalCompetitions(
  roundId: string,
  currentUserProfileId: string | null,
) {
  const [competitions, setCompetitions] = useState<HistoricalCompetition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const { data: linked } = await supabase
          .from('leaderboard_rounds')
          .select('leaderboard_id')
          .eq('round_id', roundId);

        const lbIds = (linked || []).map(l => l.leaderboard_id);
        if (lbIds.length === 0) {
          if (!cancelled) setCompetitions([]);
          return;
        }

        const [{ data: lbEvents }, { data: rpData }, { data: roundRow }] = await Promise.all([
          supabase.from('leaderboard_events')
            .select('id, name, status, competition_type, scoring_modes, rules_json')
            .in('id', lbIds),
          supabase.from('round_players')
            .select('id, profile_id, guest_name, handicap_for_round')
            .eq('round_id', roundId),
          supabase.from('rounds').select('course_id, date').eq('id', roundId).single(),
        ]);

        if (!lbEvents || lbEvents.length === 0) {
          if (!cancelled) setCompetitions([]);
          return;
        }

        const { data: holesData } = roundRow
          ? await supabase.from('course_holes')
              .select('hole_number, par, stroke_index')
              .eq('course_id', roundRow.course_id)
          : { data: [] as HoleInfo[] };
        const holes: HoleInfo[] = (holesData || []) as HoleInfo[];

        const rpIds = (rpData || []).map(rp => rp.id);
        const { data: holeScores } = rpIds.length > 0
          ? await supabase.from('hole_scores')
              .select('round_player_id, hole_number, strokes')
              .in('round_player_id', rpIds)
              .eq('confirmed', true)
          : { data: [] as any[] };

        const scoresByRp = new Map<string, { hole_number: number; strokes: number | null }[]>();
        for (const hs of (holeScores || [])) {
          const arr = scoresByRp.get(hs.round_player_id) || [];
          arr.push({ hole_number: hs.hole_number, strokes: hs.strokes });
          scoresByRp.set(hs.round_player_id, arr);
        }

        const rpByProfile = new Map<string, string>();
        const rpByGuest = new Map<string, string>();
        for (const rp of (rpData || [])) {
          if (rp.profile_id) rpByProfile.set(rp.profile_id, rp.id);
          else if (rp.guest_name) rpByGuest.set(rp.guest_name, rp.id);
        }

        const result: HistoricalCompetition[] = [];

        for (const lb of lbEvents) {
          const { data: parts } = await supabase
            .from('leaderboard_participants')
            .select('id, profile_id, guest_name, guest_initials, guest_color, handicap_for_leaderboard')
            .eq('leaderboard_id', lb.id)
            .eq('is_active', true);

          const profileIds = (parts || []).filter(p => p.profile_id).map(p => p.profile_id!);
          let profileMap: Record<string, any> = {};
          if (profileIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, display_name, initials, avatar_color')
              .in('id', profileIds);
            if (profiles) profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
          }

          const base: HistoricalCompetitionStanding[] = (parts || []).map(part => {
            const rpId = part.profile_id
              ? rpByProfile.get(part.profile_id)
              : (part.guest_name ? rpByGuest.get(part.guest_name) : undefined);
            const scores = rpId ? (scoresByRp.get(rpId) || []) : [];
            const totals = computeRoundModeTotals(
              scores, holes, Number(part.handicap_for_leaderboard) || 0,
            );
            const prof = part.profile_id ? profileMap[part.profile_id] : null;
            return {
              participantId: part.id,
              profile_id: part.profile_id,
              display_name: formatPlayerName(
                prof?.display_name ?? part.guest_name ?? 'Jugador',
              ),
              initials: prof?.initials ?? part.guest_initials ?? '??',
              avatar_color: prof?.avatar_color ?? part.guest_color ?? '#3B82F6',
              isMe: !!part.profile_id && part.profile_id === currentUserProfileId,
              ...totals,
            };
          }).filter(s => s.holesPlayed > 0);

          const scoringModes = (Array.isArray(lb.scoring_modes)
            ? (lb.scoring_modes as string[])
            : ['gross', 'net'])
            .filter(m => MODES.includes(m as ScoringMode)) as ScoringMode[];

          const standingsByMode = {} as Record<ScoringMode, HistoricalCompetitionStanding[]>;
          const myPositionByMode = {} as Record<ScoringMode, number | null>;
          for (const mode of MODES) {
            const sorted = sortByMode(base, mode);
            standingsByMode[mode] = sorted;
            const idx = sorted.findIndex(s => s.isMe);
            myPositionByMode[mode] = idx >= 0 ? idx + 1 : null;
          }

          const rules = (lb.rules_json || {}) as any;
          const days = Array.isArray(rules.days) ? rules.days : [];
          const dayNumber = roundRow?.date
            ? (days.find((d: any) => d.date === roundRow.date)?.day_number ?? null)
            : null;

          result.push({
            id: lb.id,
            name: lb.name,
            competition_type: (lb as any).competition_type ?? 'standard',
            status: lb.status,
            scoring_modes: scoringModes.length > 0 ? scoringModes : ['gross', 'net'],
            dayNumber,
            totalDays: days.length,
            totalParticipants: base.length,
            standingsByMode,
            myPositionByMode,
            myStanding: base.find(s => s.isMe) ?? null,
          });
        }

        if (!cancelled) {
          setCompetitions(result.filter(c =>
            c.competition_type === 'teams_cup' || c.totalParticipants > 0,
          ));
        }
      } catch (err) {
        console.warn('[useHistoricalCompetitions] error:', err);
        if (!cancelled) setCompetitions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [roundId, currentUserProfileId]);

  return { competitions, loading };
}
