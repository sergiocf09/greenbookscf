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

export interface RoundDifferential {
  roundId: string;
  date: string;
  courseName: string;
  teeColor: string;
  totalStrokes: number;
  adjustedGrossScore: number;
  coursePar: number;
  courseRating: number;
  slopeRating: number;
  differential: number;
  holesPlayed: number;
  isComplete: boolean;
}

export interface USGAHandicapResult {
  handicapIndex: number | null;
  differentials: RoundDifferential[];
  roundsUsed: number;
  totalRounds: number;
  minimumRoundsNeeded: number;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to calculate USGA handicap index using BATCH queries (4 total instead of 61).
 * Uses Net Double Bogey adjustment per hole and tee-specific ratings.
 */
export const useUSGAHandicap = (profileId: string | null) => {
  const query = useQuery({
    queryKey: ['usga-handicap', profileId],
    queryFn: async (): Promise<Omit<USGAHandicapResult, 'isLoading' | 'error'>> => {
      if (!profileId) {
        return { handicapIndex: null, differentials: [], roundsUsed: 0, totalRounds: 0, minimumRoundsNeeded: 3 };
      }

      // === QUERY 1: Fetch completed rounds for this player (1 request) ===
      const { data: roundPlayers, error: rpError } = await supabase
        .from('round_players')
        .select(`
          id,
          round_id,
          tee_color,
          handicap_for_round,
          rounds!inner (
            id, date, status, course_id, tee_color,
            golf_courses!inner ( id, name )
          )
        `)
        .eq('profile_id', profileId)
        .eq('rounds.status', 'completed')
        .order('rounds(date)', { ascending: false });

      if (rpError) throw rpError;
      if (!roundPlayers?.length) {
        return { handicapIndex: null, differentials: [], roundsUsed: 0, totalRounds: 0, minimumRoundsNeeded: 3 };
      }

      const recent = roundPlayers.slice(0, 20);
      const rpIds = recent.map(rp => rp.id);

      // Deduplicate course IDs
      const courseIdSet = new Set<string>();
      const teeKeys = new Set<string>(); // course_id|tee_color
      for (const rp of recent) {
        const round = rp.rounds as any;
        const courseId = round.golf_courses.id;
        courseIdSet.add(courseId);
        const teeColor = (rp as any).tee_color || round.tee_color || 'white';
        teeKeys.add(`${courseId}|${teeColor}`);
      }
      const uniqueCourseIds = Array.from(courseIdSet);

      // === QUERIES 2-4: Batch fetch all data in parallel (3 requests) ===
      const [holeScoresRes, courseHolesRes, courseTeesRes] = await Promise.all([
        // All hole scores for all round_players at once
        supabase
          .from('hole_scores')
          .select('round_player_id, hole_number, strokes, confirmed')
          .in('round_player_id', rpIds)
          .eq('confirmed', true)
          .not('strokes', 'is', null)
          .order('hole_number'),
        // All course holes for all unique courses
        supabase
          .from('course_holes')
          .select('course_id, hole_number, par, stroke_index')
          .in('course_id', uniqueCourseIds)
          .order('hole_number'),
        // All tee ratings for all unique courses
        supabase
          .from('course_tees')
          .select('course_id, tee_color, course_rating, slope_rating')
          .in('course_id', uniqueCourseIds),
      ]);

      if (holeScoresRes.error) throw holeScoresRes.error;
      if (courseHolesRes.error) throw courseHolesRes.error;

      // Index data for O(1) lookups
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
        teeMap.set(`${t.course_id}|${t.tee_color}`, {
          course_rating: t.course_rating,
          slope_rating: t.slope_rating,
        });
      }

      // === Process in memory (0 network requests) ===
      const differentials: RoundDifferential[] = [];

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
          id: course.id,
          name: course.name,
          location: '',
          holes: courseHoles.map(h => ({
            number: h.hole_number,
            par: h.par,
            handicapIndex: h.stroke_index,
          })) as HoleInfo[],
        };

        const strokesPerHole = calculateStrokesPerHole(handicapUsed, minimalCourse);
        const adjustedGrossScore = calculateAdjustedGrossScore(holeStrokesArr, holePars, strokesPerHole);
        const totalStrokes = holeScores.reduce((sum, h) => sum + (h.strokes || 0), 0);
        const coursePar = holePars.reduce((s, p) => s + p, 0);
        const differential = calculateDifferential(adjustedGrossScore, courseRating, slopeRating);

        differentials.push({
          roundId: round.id,
          date: round.date,
          courseName: course.name,
          teeColor: playerTeeColor,
          totalStrokes,
          adjustedGrossScore,
          coursePar,
          courseRating,
          slopeRating,
          differential,
          holesPlayed: holeScores.length,
          isComplete: holeScores.length >= 18,
        });
      }

      const sortedByDate = [...differentials].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const recentRounds = sortedByDate.slice(0, 20);
      const differentialValues = recentRounds.map(r => r.differential);
      const handicapIndex = calculateHandicapIndexFromDifferentials(differentialValues);
      const roundsUsed = getNumDifferentialsToUse(recentRounds.length);

      return {
        handicapIndex,
        differentials: recentRounds,
        roundsUsed,
        totalRounds: recentRounds.length,
        minimumRoundsNeeded: 3,
      };
    },
    enabled: !!profileId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    handicapIndex: query.data?.handicapIndex ?? null,
    differentials: query.data?.differentials ?? [],
    roundsUsed: query.data?.roundsUsed ?? 0,
    totalRounds: query.data?.totalRounds ?? 0,
    minimumRoundsNeeded: query.data?.minimumRoundsNeeded ?? 3,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};
