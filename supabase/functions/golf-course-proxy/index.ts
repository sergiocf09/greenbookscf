import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const API_BASE = "https://api.golfcourseapi.com/v1";

// Campos de la API externa con datos incorrectos (rating/slope) que ya existen
// correctamente cargados en la base local. La búsqueda los oculta y el import
// redirige al campo canónico.
const BLOCKED_API_COURSE_IDS: Record<string, string> = {
  // "Golf Juriquilla" (rating/slope incorrectos) -> Club de Golf Juriquilla
  "15335": "252ee05a-50e6-4404-a08c-0150b7f3e155",
};
const BLOCKED_NAME_PATTERNS: { pattern: RegExp; canonicalId: string }[] = [
  { pattern: /juriquilla/i, canonicalId: "252ee05a-50e6-4404-a08c-0150b7f3e155" },
];

const findCanonicalOverride = (name: string): string | null => {
  const match = BLOCKED_NAME_PATTERNS.find((b) => b.pattern.test(name));
  return match ? match.canonicalId : null;
};

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
      // Normalize results (ocultando campos bloqueados por datos incorrectos)
      const courses = (apiData.courses || [])
        .filter((c: any) => {
          if (BLOCKED_API_COURSE_IDS[String(c.id)]) return false;
          const label = `${c.club_name || ""} ${c.course_name || ""}`;
          return !findCanonicalOverride(label);
        })
        .map((c: any) => ({
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
      const apiId = (url.searchParams.get("id") || "").trim();
      if (!apiId) {
        return new Response(JSON.stringify({ error: "Missing course id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Redirige al campo canónico si el id externo está bloqueado
      const blockedCanonical = BLOCKED_API_COURSE_IDS[apiId];
      if (blockedCanonical) {
        return new Response(
          JSON.stringify({ courseId: blockedCanonical, cached: true, redirected: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const numericApiId = /^\d+$/.test(apiId) ? parseInt(apiId, 10) : null;

      // Check if already imported
      const { data: existing } = await supabase
        .from("golf_courses")
        .select("id")
        .eq("source_course_key", apiId)
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

      const apiRaw = await apiRes.json();
      // API wraps course details inside a "course" key
      const courseData = apiRaw.course || apiRaw;

      console.log("API response keys:", JSON.stringify(Object.keys(apiRaw)));
      console.log("Using courseData keys:", JSON.stringify(Object.keys(courseData)));
      console.log("tees:", JSON.stringify(courseData.tees ? {
        male: (courseData.tees.male || []).length,
        female: (courseData.tees.female || []).length,
        keys: Object.keys(courseData.tees),
      } : "null"));

      // Determine name and location
      const courseName = courseData.course_name || courseData.club_name || "Unknown";

      // Si el nombre coincide con un campo ya cargado correctamente, no duplicar
      const nameCanonical = findCanonicalOverride(
        `${courseData.club_name || ""} ${courseData.course_name || ""}`
      );
      if (nameCanonical) {
        return new Response(
          JSON.stringify({ courseId: nameCanonical, cached: true, redirected: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const city = courseData.location?.city || "";
      const state = courseData.location?.state || "";
      const country = courseData.location?.country || "";
      const locationStr = [city, state].filter(Boolean).join(", ");

      // Get tees - try male first, then female
      const maleTees: any[] = courseData.tees?.male || [];
      const femaleTees: any[] = courseData.tees?.female || [];
      const allTees = [...maleTees, ...femaleTees];

      if (allTees.length === 0) {
        // Import course anyway with default 18-hole par 72 layout
        console.log("No tee data, importing with defaults for course:", apiId);
      }

      // Use first tee to get hole pars, or generate defaults
      const referenceTee = allTees[0] || null;
      const numberOfHoles = referenceTee?.number_of_holes || referenceTee?.holes?.length || 18;

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
          source_course_id: numericApiId,
          source_course_key: apiId,

          last_synced_at: new Date().toISOString(),
          course_rating: referenceTee?.course_rating || null,
          slope_rating: referenceTee?.slope_rating || null,
        })
        .select("id")
        .single();

      if (courseErr || !courseRow) {
        console.error("Insert course error:", courseErr);
        return new Response(
          JSON.stringify({ error: "Failed to save course" }),
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

      // If no tees from API, insert a default white tee
      if (teesPayload.length === 0) {
        teesPayload.push({
          course_id: courseId,
          tee_color: "white",
          course_rating: 72,
          slope_rating: 113,
        });
      }

      await adminClient.from("course_tees").insert(teesPayload);

      // Insert holes - build one row per hole with yards from each tee color
      // Default par sequence for 18 holes if no data
      const defaultPars = [4,4,4,3,5,4,4,3,5, 4,4,4,3,5,4,4,3,5];
      const holesPayload: any[] = [];
      for (let i = 0; i < numberOfHoles; i++) {
        const hole: any = {
          course_id: courseId,
          hole_number: i + 1,
          par: referenceTee?.holes?.[i]?.par || defaultPars[i] || 4,
          stroke_index: referenceTee?.holes?.[i]?.handicap || (i + 1),
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
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

});
