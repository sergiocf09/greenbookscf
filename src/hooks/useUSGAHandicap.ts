import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateHandicapIndexFromDifferentials, getNumDifferentialsToUse } from '@/lib/usgaHandicap';

export interface RoundDifferential {
  roundId: string;
  date: string;
  courseName: string;
  teeColor: string;
  totalStrokes: number;
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
 * Calculate USGA differential for a round
 * Formula: (Adjusted Gross Score - Course Rating) × 113 / Slope Rating
 */
const calculateDifferential = (
  totalStrokes: number,
  courseRating: number,
  slopeRating: number
): number => {
  const differential = ((totalStrokes - courseRating) * 113) / slopeRating;
  // Round to one decimal place
  return Math.round(differential * 10) / 10;
};

/**
 * Hook to fetch and calculate USGA handicap index for a player
 */
export const useUSGAHandicap = (profileId: string | null) => {
  const query = useQuery({
    queryKey: ['usga-handicap', profileId],
    queryFn: async (): Promise<Omit<USGAHandicapResult, 'isLoading' | 'error'>> => {
      if (!profileId) {
        return {
          handicapIndex: null,
          differentials: [],
          roundsUsed: 0,
          totalRounds: 0,
          minimumRoundsNeeded: 3,
        };
      }

      // Fetch completed rounds for this player with their tee color
      const { data: roundPlayers, error: rpError } = await supabase
        .from('round_players')
        .select(`
          id,
          round_id,
          tee_color,
          rounds!inner (
            id,
            date,
            status,
            course_id,
            tee_color,
            golf_courses!inner (
              id,
              name
            )
          )
        `)
        .eq('profile_id', profileId)
        .eq('rounds.status', 'completed')
        .order('rounds(date)', { ascending: false });

      if (rpError) throw rpError;
      if (!roundPlayers || roundPlayers.length === 0) {
        return {
          handicapIndex: null,
          differentials: [],
          roundsUsed: 0,
          totalRounds: 0,
          minimumRoundsNeeded: 3,
        };
      }

      // For each round, get confirmed hole scores and course par
      const differentials: RoundDifferential[] = [];

      for (const rp of roundPlayers) {
        const round = rp.rounds as any;
        const course = round.golf_courses;
        
        // Determine tee color: player's specific tee or round default
        const playerTeeColor = (rp as any).tee_color || round.tee_color || 'white';

        // Get confirmed hole scores for this round_player
        const { data: holeScores, error: hsError } = await supabase
          .from('hole_scores')
          .select('hole_number, strokes, confirmed')
          .eq('round_player_id', rp.id)
          .eq('confirmed', true)
          .not('strokes', 'is', null);

        if (hsError) continue;
        if (!holeScores || holeScores.length < 18) continue; // Need full 18 holes

        // Get course par
        const { data: courseHoles, error: chError } = await supabase
          .from('course_holes')
          .select('hole_number, par')
          .eq('course_id', course.id);

        if (chError || !courseHoles) continue;

        // Get tee-specific rating and slope from course_tees table
        const { data: teeData } = await supabase
          .from('course_tees')
          .select('course_rating, slope_rating')
          .eq('course_id', course.id)
          .eq('tee_color', playerTeeColor)
          .maybeSingle();

        const totalStrokes = holeScores.reduce((sum, h) => sum + (h.strokes || 0), 0);
        const coursePar = courseHoles.reduce((sum, h) => sum + h.par, 0);
        
        // Use tee-specific rating/slope or defaults
        const courseRating = teeData?.course_rating || 72;
        const slopeRating = teeData?.slope_rating || 113;

        const differential = calculateDifferential(totalStrokes, courseRating, slopeRating);

        differentials.push({
          roundId: round.id,
          date: round.date,
          courseName: course.name,
          teeColor: playerTeeColor,
          totalStrokes,
          coursePar,
          courseRating,
          slopeRating,
          differential,
          holesPlayed: holeScores.length,
          isComplete: holeScores.length >= 18,
        });
      }

      // Sort by differential (ascending) for display, but keep date order for calculation
      const sortedByDate = [...differentials].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      // Take most recent 20 rounds max (USGA uses last 20)
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
    staleTime: 5 * 60 * 1000, // 5 minutes
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
