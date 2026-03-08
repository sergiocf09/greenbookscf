/**
 * USGA World Handicap System utilities
 * 
 * *** SINGLE SOURCE OF TRUTH ***
 * All handicap calculations MUST use functions from this file.
 * Do NOT duplicate this logic elsewhere.
 */

/** Maximum Handicap Index per WHS rules */
export const MAX_HANDICAP_INDEX = 54.0;

/**
 * Number of best differentials to use based on total rounds available.
 * Per USGA WHS lookup table.
 */
export const getNumDifferentialsToUse = (totalRounds: number): number => {
  if (totalRounds >= 20) return 8;
  if (totalRounds === 19) return 7;
  if (totalRounds === 18) return 7;
  if (totalRounds === 17) return 6;
  if (totalRounds === 16) return 6;
  if (totalRounds === 15) return 5;
  if (totalRounds === 14) return 5;
  if (totalRounds === 13) return 4;
  if (totalRounds === 12) return 4;
  if (totalRounds === 11) return 3;
  if (totalRounds === 10) return 3;
  if (totalRounds === 9) return 2;
  if (totalRounds === 8) return 2;
  if (totalRounds === 7) return 2;
  if (totalRounds === 6) return 1;
  if (totalRounds === 5) return 1;
  if (totalRounds === 4) return 1;
  if (totalRounds === 3) return 1;
  return 0;
};

/**
 * Calculate Handicap Index from an array of score differentials.
 * Applies the 0.96 multiplier and caps at MAX_HANDICAP_INDEX (54.0).
 */
export const calculateHandicapIndexFromDifferentials = (
  differentials: number[]
): number | null => {
  const totalRounds = differentials.length;
  const numToUse = getNumDifferentialsToUse(totalRounds);
  if (numToUse <= 0) return null;

  const best = [...differentials].sort((a, b) => a - b).slice(0, numToUse);
  if (!best.length) return null;

  const avg = best.reduce((sum, d) => sum + d, 0) / best.length;
  const handicapIndex = avg * 0.96;
  // Round to 1 decimal and cap at 54.0
  const rounded = Math.round(handicapIndex * 10) / 10;
  return Math.min(rounded, MAX_HANDICAP_INDEX);
};

/**
 * Calculate USGA Score Differential
 * Formula: (Adjusted Gross Score - Course Rating) × 113 / Slope Rating
 */
export const calculateDifferential = (
  adjustedGrossScore: number,
  courseRating: number,
  slopeRating: number
): number => {
  const differential = ((adjustedGrossScore - courseRating) * 113) / slopeRating;
  return Math.round(differential * 10) / 10;
};

/**
 * Calculate Course Handicap from Handicap Index
 * Formula: Index × (Slope / 113) + (Rating - Par)
 */
export const calculateCourseHandicap = (
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  coursePar: number
): number => {
  return Math.round(handicapIndex * (slopeRating / 113) + (courseRating - coursePar));
};

/**
 * Net Double Bogey adjustment (WHS Rule 3.1)
 *
 * Before summing strokes for the differential, each hole's score is capped at:
 *   maximum = par + 2 + strokesReceived on that hole
 *
 * @param holeStrokes  Array of 18 raw stroke values (index 0 = hole 1)
 * @param holePars     Array of 18 par values
 * @param strokesPerHole Array of 18 strokes-received values (from handicap allocation)
 * @returns The Adjusted Gross Score (sum of capped hole scores)
 */
export const calculateAdjustedGrossScore = (
  holeStrokes: (number | null)[],
  holePars: number[],
  strokesPerHole: number[]
): number => {
  let adjustedTotal = 0;
  for (let i = 0; i < 18; i++) {
    const strokes = holeStrokes[i];
    if (strokes === null || strokes === undefined) continue;
    const par = holePars[i] ?? 4;
    const received = strokesPerHole[i] ?? 0;
    const maxScore = par + 2 + received;
    adjustedTotal += Math.min(strokes, maxScore);
  }
  return adjustedTotal;
};

/**
 * Calculate USGA Handicap Index for a profile from their completed round history.
 * Extracted for reuse in bulk calculations and persistence.
 * Returns the Handicap Index (e.g. 8.3) or null if insufficient rounds.
 */
export const calculateHandicapIndexForProfile = async (
  profileId: string
): Promise<number | null> => {
  const { supabase } = await import('@/integrations/supabase/client');
  const { calculateStrokesPerHole } = await import('@/lib/handicapUtils');

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
  if (!roundPlayers?.length) return null;

  const differentials: number[] = [];

  for (const rp of roundPlayers.slice(0, 20)) {
    const round = rp.rounds as any;
    const course = round.golf_courses;
    const playerTeeColor = (rp as any).tee_color || round.tee_color || 'white';
    const handicapUsed = Number((rp as any).handicap_for_round) || 0;

    const { data: holeScores, error: hsError } = await supabase
      .from('hole_scores')
      .select('hole_number, strokes, confirmed')
      .eq('round_player_id', rp.id)
      .eq('confirmed', true)
      .not('strokes', 'is', null)
      .order('hole_number');

    if (hsError || !holeScores || holeScores.length < 18) continue;

    const { data: courseHoles, error: chError } = await supabase
      .from('course_holes')
      .select('hole_number, par, stroke_index')
      .eq('course_id', course.id)
      .order('hole_number');

    if (chError || !courseHoles || courseHoles.length < 18) continue;

    const { data: teeData } = await supabase
      .from('course_tees')
      .select('course_rating, slope_rating')
      .eq('course_id', course.id)
      .eq('tee_color', playerTeeColor)
      .maybeSingle();

    const courseRating = teeData?.course_rating || 72;
    const slopeRating = teeData?.slope_rating || 113;

    const holePars = courseHoles.map(h => h.par);
    const holeStrokesArr: (number | null)[] = new Array(18).fill(null);
    for (const hs of holeScores) {
      if (hs.hole_number >= 1 && hs.hole_number <= 18) {
        holeStrokesArr[hs.hole_number - 1] = hs.strokes;
      }
    }

    const minimalCourse = {
      id: course.id,
      name: course.name,
      location: '',
      holes: courseHoles.map(h => ({
        number: h.hole_number,
        par: h.par,
        handicapIndex: h.stroke_index,
      })),
    };

    const strokesPerHole = calculateStrokesPerHole(handicapUsed, minimalCourse as any);
    const adjustedGrossScore = calculateAdjustedGrossScore(holeStrokesArr, holePars, strokesPerHole);
    const differential = calculateDifferential(adjustedGrossScore, courseRating, slopeRating);
    differentials.push(differential);
  }

  return calculateHandicapIndexFromDifferentials(differentials);
};
