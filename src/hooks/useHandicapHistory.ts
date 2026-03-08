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
}

export interface HandicapHistoryResult {
  handicapIndex: number | null;
  entries: HandicapHistoryEntry[];
  roundsUsed: number;
  totalRounds: number;
  minimumRoundsNeeded: number;
  isLoading: boolean;
  error: Error | null;
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
        return { handicapIndex: null, entries: [], roundsUsed: 0, totalRounds: 0, minimumRoundsNeeded: 3 };
      }

      // === TRY MATERIALIZED TABLE FIRST ===
      const { data: matData, error: matError } = await supabase
        .from('handicap_history')
        .select(`
          id, handicap, round_id, recorded_at, differential,
          adjusted_gross_score, gross_score, course_rating, slope_rating, tee_color,
          rounds!handicap_history_round_fk (
            id, date,
            golf_courses!inner ( name )
          )
        `)
        .eq('profile_id', profileId)
        .not('round_id', 'is', null)
        .not('differential', 'is', null)
        .order('recorded_at', { ascending: false })
        .limit(20);

      if (!matError && matData && matData.length > 0) {
        const entries: HandicapHistoryEntry[] = matData
          .filter((row: any) => row.rounds && row.differential != null)
          .map((row: any) => ({
            roundId: row.round_id,
            date: row.rounds.date,
            courseName: row.rounds.golf_courses?.name || 'Desconocido',
            teeColor: row.tee_color || 'white',
            totalStrokes: row.gross_score || 0,
            adjustedGrossScore: row.adjusted_gross_score || row.gross_score || 0,
            courseRating: Number(row.course_rating) || 72,
            slopeRating: Number(row.slope_rating) || 113,
            differential: Number(row.differential),
            handicapAtTime: Number(row.handicap),
          }));

        if (entries.length > 0) {
          const differentialValues = entries.map(e => e.differential);
          const handicapIndex = calculateHandicapIndexFromDifferentials(differentialValues);
          const roundsUsed = getNumDifferentialsToUse(entries.length);

          return { handicapIndex, entries, roundsUsed, totalRounds: entries.length, minimumRoundsNeeded: 3 };
        }
      }

      // === FALLBACK: Batch calculate from raw scores (same pattern as useUSGAHandicap) ===
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
        return { handicapIndex: null, entries: [], roundsUsed: 0, totalRounds: 0, minimumRoundsNeeded: 3 };
      }

      const recent = roundPlayers.slice(0, 20);
      const rpIds = recent.map(rp => rp.id);
      const courseIdSet = new Set<string>();
      for (const rp of recent) {
        courseIdSet.add((rp.rounds as any).golf_courses.id);
      }
      const uniqueCourseIds = Array.from(courseIdSet);

      const [holeScoresRes, courseHolesRes, courseTeesRes] = await Promise.all([
        supabase.from('hole_scores').select('round_player_id, hole_number, strokes, confirmed')
          .in('round_player_id', rpIds).eq('confirmed', true).not('strokes', 'is', null).order('hole_number'),
        supabase.from('course_holes').select('course_id, hole_number, par, stroke_index')
          .in('course_id', uniqueCourseIds).order('hole_number'),
        supabase.from('course_tees').select('course_id, tee_color, course_rating, slope_rating')
          .in('course_id', uniqueCourseIds),
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
          handicapAtTime: 0,
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
