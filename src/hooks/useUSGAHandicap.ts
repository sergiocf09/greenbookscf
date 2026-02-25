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
 * Hook to fetch and calculate USGA handicap index for a player.
 * Uses Net Double Bogey adjustment per hole and tee-specific ratings.
 */
export const useUSGAHandicap = (profileId: string | null) => {
  const query = useQuery({
    queryKey: ['usga-handicap', profileId],
    queryFn: async (): Promise<Omit<USGAHandicapResult, 'isLoading' | 'error'>> => {
      if (!profileId) {
        return { handicapIndex: null, differentials: [], roundsUsed: 0, totalRounds: 0, minimumRoundsNeeded: 3 };
      }

      // 1. Fetch completed rounds for this player
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

      const differentials: RoundDifferential[] = [];

      for (const rp of roundPlayers.slice(0, 20)) {
        const round = rp.rounds as any;
        const course = round.golf_courses;
        const playerTeeColor = (rp as any).tee_color || round.tee_color || 'white';
        const handicapUsed = Number((rp as any).handicap_for_round) || 0;

        // Get confirmed hole scores
        const { data: holeScores, error: hsError } = await supabase
          .from('hole_scores')
          .select('hole_number, strokes, confirmed')
          .eq('round_player_id', rp.id)
          .eq('confirmed', true)
          .not('strokes', 'is', null)
          .order('hole_number');

        if (hsError || !holeScores || holeScores.length < 18) continue;

        // Get course holes (par + stroke_index) for Net Double Bogey
        const { data: courseHoles, error: chError } = await supabase
          .from('course_holes')
          .select('hole_number, par, stroke_index')
          .eq('course_id', course.id)
          .order('hole_number');

        if (chError || !courseHoles || courseHoles.length < 18) continue;

        // Get tee-specific rating and slope
        const { data: teeData } = await supabase
          .from('course_tees')
          .select('course_rating, slope_rating')
          .eq('course_id', course.id)
          .eq('tee_color', playerTeeColor)
          .maybeSingle();

        const courseRating = teeData?.course_rating || 72;
        const slopeRating = teeData?.slope_rating || 113;

        // Build arrays for NDB calculation
        const holePars = courseHoles.map(h => h.par);
        const holeStrokesArr: (number | null)[] = new Array(18).fill(null);
        for (const hs of holeScores) {
          if (hs.hole_number >= 1 && hs.hole_number <= 18) {
            holeStrokesArr[hs.hole_number - 1] = hs.strokes;
          }
        }

        // Build a minimal GolfCourse for strokesPerHole calculation
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

        // Apply Net Double Bogey
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

      // Sort by date descending
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
