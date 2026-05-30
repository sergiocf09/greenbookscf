import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  calculateHandicapIndexFromDifferentials,
  getNumDifferentialsToUse,
  calculateDifferential,
  calculateAdjustedGrossScore,
} from '@/lib/usgaHandicap';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { GolfCourse, HoleInfo } from '@/types/golf';

export interface HandicapHistoryEntry {
  roundId: string;
  date: string;
  courseName: string;
  teeColor: string;
  totalStrokes: number;
  adjustedGrossScore: number;
  courseRating: number;
  slopeRating: number;
  differential: number;
  handicapAtTime: number;
  isAttested: boolean;
}

export interface HandicapHistoryResult {
  handicapIndex: number | null;
  entries: HandicapHistoryEntry[];
  roundsUsed: number;
  totalRounds: number;
  minimumRoundsNeeded: number;
  isLoading: boolean;
  error: Error | null;
  attestationStats: { totalRounds: number; attestedRounds: number } | null;
}

/**
 * Hook that first tries the materialized handicap_history table (instant),
 * and falls back to batch calculation from raw scores if no history exists.
 */
export const useHandicapHistory = (profileId: string | null) => {
  const query = useQuery({
    queryKey: ['handicap-history-materialized', profileId],
    queryFn: async (): Promise<Omit<HandicapHistoryResult, 'isLoading' | 'error'>> => {
      if (!profileId) {
        return { handicapIndex: null, entries: [], roundsUsed: 0, totalRounds: 0, minimumRoundsNeeded: 3, attestationStats: null };
      }

      // Fetch overall attestation stats (across ALL completed rounds, not just the 20 shown)
      let attestationStats: { totalRounds: number; attestedRounds: number } | null = null;
      try {
        const { data: statsData } = await supabase.rpc('get_attestation_stats', {
          p_profile_id: profileId,
        });
        if (statsData && statsData.length > 0) {
          attestationStats = {
            totalRounds: Number(statsData[0].total_rounds ?? 0),
            attestedRounds: Number(statsData[0].attested_rounds ?? 0),
          };
        }
      } catch (_) {
        // non-blocking
      }

      // === PRIMARY: Batch calculate from raw scores ===
      const { data: roundPlayers, error: rpError } = await supabase
        .from('round_players')
        .select(`
          id, round_id, tee_color, handicap_for_round,
          rounds!inner ( id, date, status, course_id, tee_color, golf_courses!inner ( id, name ) )
        `)
        .eq('profile_id', profileId)
        .eq('rounds.status', 'completed')
        .order('rounds(date)', { ascending: false });

      if (rpError) throw rpError;
      if (!roundPlayers?.length) {
        return { handicapIndex: null, entries: [], roundsUsed: 0, totalRounds: 0, minimumRoundsNeeded: 3, attestationStats };
      }

      const recent = roundPlayers.slice(0, 20);
      const rpIds = recent.map(rp => rp.id);
      const roundIds = recent.map(rp => rp.round_id).filter(Boolean) as string[];
      const courseIdSet = new Set<string>();
      for (const rp of recent) {
        courseIdSet.add((rp.rounds as any).golf_courses.id);
      }
      const uniqueCourseIds = Array.from(courseIdSet);

      const [holeScoresRes, courseHolesRes, courseTeesRes, matHistoryRes] = await Promise.all([
        supabase.from('hole_scores').select('round_player_id, hole_number, strokes, confirmed')
          .in('round_player_id', rpIds).eq('confirmed', true).not('strokes', 'is', null).order('hole_number'),
        supabase.from('course_holes').select('course_id, hole_number, par, stroke_index')
          .in('course_id', uniqueCourseIds).order('hole_number'),
        supabase.from('course_tees').select('course_id, tee_color, course_rating, slope_rating')
          .in('course_id', uniqueCourseIds),
        supabase.from('handicap_history')
          .select('round_id, handicap, is_attested, recorded_at')
          .eq('profile_id', profileId)
          .in('round_id', roundIds)
          .order('recorded_at', { ascending: false }),
      ]);

      if (holeScoresRes.error) throw holeScoresRes.error;
      if (courseHolesRes.error) throw courseHolesRes.error;

      // Index data
      const scoresByRpId = new Map<string, typeof holeScoresRes.data>();
      for (const hs of holeScoresRes.data || []) {
        const arr = scoresByRpId.get(hs.round_player_id) || [];
        arr.push(hs);
        scoresByRpId.set(hs.round_player_id, arr);
      }
      const holesByCourseId = new Map<string, typeof courseHolesRes.data>();
      for (const ch of courseHolesRes.data || []) {
        const arr = holesByCourseId.get(ch.course_id) || [];
        arr.push(ch);
        holesByCourseId.set(ch.course_id, arr);
      }
      const teeMap = new Map<string, { course_rating: number; slope_rating: number }>();
      for (const t of courseTeesRes.data || []) {
        teeMap.set(`${t.course_id}|${t.tee_color}`, { course_rating: t.course_rating, slope_rating: t.slope_rating });
      }
      // Materialized lookup by round_id (keep most recent record per round)
      const matByRoundId = new Map<string, { handicap: number; is_attested: boolean }>();
      for (const row of (matHistoryRes.data || []) as any[]) {
        if (!row.round_id || matByRoundId.has(row.round_id)) continue;
        matByRoundId.set(row.round_id, {
          handicap: Number(row.handicap) || 0,
          is_attested: row.is_attested ?? false,
        });
      }

      const entries: HandicapHistoryEntry[] = [];

      for (const rp of recent) {
        const round = rp.rounds as any;
        const course = round.golf_courses;
        const playerTeeColor = (rp as any).tee_color || round.tee_color || 'white';
        const handicapUsed = Number((rp as any).handicap_for_round) || 0;

        const holeScores = scoresByRpId.get(rp.id);
        if (!holeScores || holeScores.length < 18) continue;

        const courseHoles = holesByCourseId.get(course.id);
        if (!courseHoles || courseHoles.length < 18) continue;

        const teeData = teeMap.get(`${course.id}|${playerTeeColor}`);
        const courseRating = teeData?.course_rating || 72;
        const slopeRating = teeData?.slope_rating || 113;

        const holePars = courseHoles.map(h => h.par);
        const holeStrokesArr: (number | null)[] = new Array(18).fill(null);
        for (const hs of holeScores) {
          if (hs.hole_number >= 1 && hs.hole_number <= 18) {
            holeStrokesArr[hs.hole_number - 1] = hs.strokes;
          }
        }

        const minimalCourse: GolfCourse = {
          id: course.id, name: course.name, location: '',
          holes: courseHoles.map(h => ({ number: h.hole_number, par: h.par, handicapIndex: h.stroke_index })) as HoleInfo[],
        };
        const strokesPerHole = calculateStrokesPerHole(handicapUsed, minimalCourse);
        const adjustedGrossScore = calculateAdjustedGrossScore(holeStrokesArr, holePars, strokesPerHole);
        const totalStrokes = holeScores.reduce((sum, h) => sum + (h.strokes || 0), 0);
        const differential = calculateDifferential(adjustedGrossScore, courseRating, slopeRating);
        const mat = matByRoundId.get(rp.round_id);

        entries.push({
          roundId: round.id,
          date: round.date,
          courseName: course.name,
          teeColor: playerTeeColor,
          totalStrokes,
          adjustedGrossScore,
          courseRating,
          slopeRating,
          differential,
          handicapAtTime: mat?.handicap ?? 0,
          isAttested: mat?.is_attested ?? false,
        });
      }

      const differentialValues = entries.map(e => e.differential);
      const handicapIndex = calculateHandicapIndexFromDifferentials(differentialValues);
      const roundsUsed = getNumDifferentialsToUse(entries.length);

      return { handicapIndex, entries, roundsUsed, totalRounds: entries.length, minimumRoundsNeeded: 3 };

    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    handicapIndex: query.data?.handicapIndex ?? null,
    entries: query.data?.entries ?? [],
    roundsUsed: query.data?.roundsUsed ?? 0,
    totalRounds: query.data?.totalRounds ?? 0,
    minimumRoundsNeeded: query.data?.minimumRoundsNeeded ?? 3,
    isLoading: query.isLoading,
    error: query.error,
  };
};
