import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── USGA Calculation Logic (replicated from frontend for edge function use) ──

const getNumDifferentialsToUse = (totalRounds: number): number => {
  if (totalRounds >= 20) return 8;
  if (totalRounds >= 17) return Math.floor((totalRounds - 11) / 2) + 3;
  if (totalRounds >= 15) return 5;
  if (totalRounds >= 13) return 4;
  if (totalRounds >= 11) return 3;
  if (totalRounds >= 9) return 2;
  if (totalRounds >= 7) return 2;
  if (totalRounds >= 3) return 1;
  return 0;
};

const calculateHandicapIndex = (differentials: number[]): number | null => {
  const numToUse = getNumDifferentialsToUse(differentials.length);
  if (numToUse <= 0) return null;
  const best = [...differentials].sort((a, b) => a - b).slice(0, numToUse);
  if (!best.length) return null;
  const avg = best.reduce((s, d) => s + d, 0) / best.length;
  return Math.round(avg * 0.96 * 10) / 10;
};

const calculateDifferential = (
  adjustedGross: number,
  courseRating: number,
  slopeRating: number
): number => {
  return Math.round(((adjustedGross - courseRating) * 113) / slopeRating * 10) / 10;
};

/**
 * Distribute handicap strokes across 18 holes using stroke index.
 * Simplified version: distributes evenly across all 18 holes by stroke index.
 */
const calculateStrokesPerHole = (
  handicap: number,
  strokeIndices: number[]
): number[] => {
  const strokes = new Array(18).fill(0);
  const totalStrokes = Math.round(handicap);
  if (totalStrokes <= 0) return strokes;

  // Create indexed array and sort by stroke index
  const indexed = strokeIndices.map((si, i) => ({ index: i, si }));
  indexed.sort((a, b) => a.si - b.si);

  let remaining = totalStrokes;
  // Multiple passes for high handicaps (>18, >36)
  while (remaining > 0) {
    for (const hole of indexed) {
      if (remaining <= 0) break;
      strokes[hole.index]++;
      remaining--;
    }
  }
  return strokes;
};

/**
 * Net Double Bogey adjustment: cap each hole at par + 2 + strokes received
 */
const calculateAdjustedGrossScore = (
  holeStrokes: (number | null)[],
  holePars: number[],
  strokesPerHole: number[]
): number => {
  let total = 0;
  for (let i = 0; i < 18; i++) {
    const s = holeStrokes[i];
    if (s === null || s === undefined) continue;
    const maxScore = (holePars[i] ?? 4) + 2 + (strokesPerHole[i] ?? 0);
    total += Math.min(s, maxScore);
  }
  return total;
};

// ── Main Handler ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the JWT using anon client
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client for data operations (bypasses RLS intentionally for backfill)
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Get all profiles
    const { data: allProfiles, error: profErr } = await supabase
      .from("profiles")
      .select("id");

    if (profErr) throw profErr;
    if (!allProfiles?.length) {
      return new Response(
        JSON.stringify({ processed: 0, skipped: 0, errors: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Find profiles that already have handicap_history (skip them)
    const { data: existingHistory } = await supabase
      .from("handicap_history")
      .select("profile_id");

    const profilesWithHistory = new Set(
      (existingHistory || []).map((h: any) => h.profile_id)
    );

    const profilesToProcess = allProfiles.filter(
      (p) => !profilesWithHistory.has(p.id)
    );

    console.log(
      `[Backfill] ${profilesToProcess.length} profiles to process, ${profilesWithHistory.size} already have history`
    );

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const details: { profileId: string; index: number | null; error?: string }[] = [];

    for (const profile of profilesToProcess) {
      try {
        // 3. Get completed rounds for this profile
        const { data: roundPlayers, error: rpErr } = await supabase
          .from("round_players")
          .select(
            `
            id,
            round_id,
            tee_color,
            handicap_for_round,
            rounds!inner (
              id, date, status, course_id, tee_color
            )
          `
          )
          .eq("profile_id", profile.id)
          .eq("rounds.status", "completed")
          .order("rounds(date)", { ascending: false });

        if (rpErr) throw rpErr;
        if (!roundPlayers?.length) {
          skipped++;
          continue;
        }

        const differentials: number[] = [];

        for (const rp of roundPlayers.slice(0, 20)) {
          const round = (rp as any).rounds;
          const playerTeeColor = (rp as any).tee_color || round.tee_color || "white";
          const handicapUsed = Number((rp as any).handicap_for_round) || 0;

          // Get hole scores
          const { data: holeScores } = await supabase
            .from("hole_scores")
            .select("hole_number, strokes")
            .eq("round_player_id", rp.id)
            .eq("confirmed", true)
            .not("strokes", "is", null)
            .order("hole_number");

          if (!holeScores || holeScores.length < 18) continue;

          // Get course holes
          const { data: courseHoles } = await supabase
            .from("course_holes")
            .select("hole_number, par, stroke_index")
            .eq("course_id", round.course_id)
            .order("hole_number");

          if (!courseHoles || courseHoles.length < 18) continue;

          // Get tee ratings
          const { data: teeData } = await supabase
            .from("course_tees")
            .select("course_rating, slope_rating")
            .eq("course_id", round.course_id)
            .eq("tee_color", playerTeeColor)
            .maybeSingle();

          const courseRating = teeData?.course_rating || 72;
          const slopeRating = teeData?.slope_rating || 113;

          // Build arrays
          const holePars = courseHoles.map((h: any) => h.par);
          const strokeIndices = courseHoles.map((h: any) => h.stroke_index);
          const holeStrokesArr: (number | null)[] = new Array(18).fill(null);
          for (const hs of holeScores) {
            if (hs.hole_number >= 1 && hs.hole_number <= 18) {
              holeStrokesArr[hs.hole_number - 1] = hs.strokes;
            }
          }

          const strokesPerHole = calculateStrokesPerHole(handicapUsed, strokeIndices);
          const adjustedGross = calculateAdjustedGrossScore(
            holeStrokesArr,
            holePars,
            strokesPerHole
          );
          const differential = calculateDifferential(
            adjustedGross,
            courseRating,
            slopeRating
          );
          differentials.push(differential);
        }

        const handicapIndex = calculateHandicapIndex(differentials);

        if (handicapIndex === null) {
          skipped++;
          details.push({ profileId: profile.id, index: null });
          continue;
        }

        // 4. Persist
        await supabase
          .from("profiles")
          .update({
            current_handicap: handicapIndex,
            updated_at: new Date().toISOString(),
          })
          .eq("id", profile.id);

        await supabase.from("handicap_history").insert({
          profile_id: profile.id,
          handicap: handicapIndex,
          round_id: null, // backfill entry, not tied to a specific round
        });

        processed++;
        details.push({ profileId: profile.id, index: handicapIndex });
        console.log(`[Backfill] Profile ${profile.id}: Index = ${handicapIndex}`);
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        details.push({ profileId: profile.id, index: null, error: msg });
        console.error(`[Backfill] Error for ${profile.id}:`, msg);
      }
    }

    return new Response(
      JSON.stringify({
        processed,
        skipped,
        errors,
        already_had_history: profilesWithHistory.size,
        details,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Backfill] Fatal error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
