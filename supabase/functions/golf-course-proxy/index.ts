import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.golfcourseapi.com/v1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getUser(token);
    if (claimsErr || !claimsData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const golfApiKey = Deno.env.get("GOLF_COURSE_API_KEY");
    if (!golfApiKey) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ─── SEARCH ───
    if (action === "search") {
      const query = url.searchParams.get("q")?.trim();
      if (!query || query.length < 2) {
        return new Response(JSON.stringify({ courses: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const apiRes = await fetch(
        `${API_BASE}/search?search_query=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Key ${golfApiKey}` } }
      );

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        console.error("GolfCourseAPI search error:", apiRes.status, errText);
        return new Response(
          JSON.stringify({ error: "API search failed", status: apiRes.status }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const apiData = await apiRes.json();
      // Normalize results
      const courses = (apiData.courses || []).map((c: any) => ({
        apiId: c.id,
        clubName: c.club_name || "",
        courseName: c.course_name || "",
        location: c.location?.address || "",
        city: c.location?.city || "",
        state: c.location?.state || "",
        country: c.location?.country || "",
      }));

      return new Response(JSON.stringify({ courses }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── IMPORT ───
    if (action === "import") {
      const apiIdStr = url.searchParams.get("id");
      const apiId = apiIdStr ? parseInt(apiIdStr, 10) : null;
      if (!apiId) {
        return new Response(JSON.stringify({ error: "Missing course id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if already imported
      const { data: existing } = await supabase
        .from("golf_courses")
        .select("id")
        .eq("source_course_id", apiId)
        .eq("source", "golfcourseapi")
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ courseId: existing.id, cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch full course details from API
      const apiRes = await fetch(`${API_BASE}/courses/${apiId}`, {
        headers: { Authorization: `Key ${golfApiKey}` },
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        console.error("GolfCourseAPI course detail error:", apiRes.status, errText);
        return new Response(
          JSON.stringify({ error: "API detail failed", status: apiRes.status }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const courseData = await apiRes.json();

      // Determine name and location
      const courseName = courseData.course_name || courseData.club_name || "Unknown";
      const city = courseData.location?.city || "";
      const state = courseData.location?.state || "";
      const country = courseData.location?.country || "";
      const locationStr = [city, state].filter(Boolean).join(", ");

      // Get male tees (primary for our app)
      const maleTees: any[] = courseData.tees?.male || [];
      const femaleTees: any[] = courseData.tees?.female || [];
      const allTees = [...maleTees, ...femaleTees];

      if (allTees.length === 0) {
        return new Response(
          JSON.stringify({ error: "No tee data available for this course" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Use first tee to get hole pars (they should be same across tees)
      const referenceTee = allTees[0];
      const numberOfHoles = referenceTee.number_of_holes || referenceTee.holes?.length || 18;

      if (numberOfHoles !== 18 && numberOfHoles !== 9) {
        return new Response(
          JSON.stringify({ error: `Unsupported hole count: ${numberOfHoles}` }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert course using service role through RPC or direct insert
      // We use the admin-style approach: the edge function inserts with source='golfcourseapi'
      // Since RLS only allows is_manual=true inserts from client, we use service role
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);

      const { data: courseRow, error: courseErr } = await adminClient
        .from("golf_courses")
        .insert({
          name: courseName,
          location: locationStr || country,
          country: country || "Unknown",
          is_manual: false,
          source: "golfcourseapi",
          source_course_id: apiId,
          last_synced_at: new Date().toISOString(),
          course_rating: referenceTee.course_rating || null,
          slope_rating: referenceTee.slope_rating || null,
        })
        .select("id")
        .single();

      if (courseErr || !courseRow) {
        console.error("Insert course error:", courseErr);
        return new Response(
          JSON.stringify({ error: "Failed to save course", detail: courseErr?.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const courseId = courseRow.id;

      // Map tee names to our color system
      const teeColorMap: Record<string, string> = {
        blue: "blue", blues: "blue",
        white: "white", whites: "white",
        yellow: "yellow", yellows: "yellow", gold: "yellow",
        red: "red", reds: "red",
      };

      // Insert tees
      const teesPayload: any[] = [];
      const holesPerTee: Map<string, any[]> = new Map();

      for (const tee of allTees) {
        const rawName = (tee.tee_name || "white").toLowerCase().trim();
        const teeColor = teeColorMap[rawName] || rawName;

        // Avoid duplicate tee colors
        if (teesPayload.some((t) => t.tee_color === teeColor)) continue;

        teesPayload.push({
          course_id: courseId,
          tee_color: teeColor,
          course_rating: tee.course_rating || 72,
          slope_rating: tee.slope_rating || 113,
        });

        holesPerTee.set(teeColor, tee.holes || []);
      }

      if (teesPayload.length > 0) {
        await adminClient.from("course_tees").insert(teesPayload);
      }

      // Insert holes - build one row per hole with yards from each tee color
      const holesPayload: any[] = [];
      for (let i = 0; i < numberOfHoles; i++) {
        const hole: any = {
          course_id: courseId,
          hole_number: i + 1,
          par: referenceTee.holes?.[i]?.par || 4,
          stroke_index: referenceTee.holes?.[i]?.handicap || (i + 1),
        };

        // Add yards from each tee
        for (const [teeColor, holes] of holesPerTee) {
          const yardKey = `yards_${teeColor}`;
          if (["yards_blue", "yards_white", "yards_yellow", "yards_red"].includes(yardKey)) {
            hole[yardKey] = holes[i]?.yardage || null;
          }
        }

        holesPayload.push(hole);
      }

      const { error: holesErr } = await adminClient
        .from("course_holes")
        .insert(holesPayload);

      if (holesErr) {
        console.error("Insert holes error:", holesErr);
      }

      // Auto-add to favorites for the importing user
      const { data: profileData } = await supabase.rpc("get_my_profile_id");
      if (profileData) {
        await supabase.from("course_favorites").upsert(
          { profile_id: profileData, course_id: courseId },
          { onConflict: "profile_id,course_id" }
        );
      }

      return new Response(
        JSON.stringify({
          courseId,
          cached: false,
          tees: teesPayload.map((t) => ({
            color: t.tee_color,
            rating: t.course_rating,
            slope: t.slope_rating,
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use ?action=search or ?action=import" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("golf-course-proxy error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
