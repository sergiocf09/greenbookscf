import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import { corsHeaders } from "../_shared/cors.ts";

// This edge function handles guest-to-user conversion with admin privileges.
// It verifies that the user's email is confirmed before proceeding,
// ensuring the same security standard as regular signups.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { session_id } = await req.json();

    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "Missing session_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the user from the auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Require confirmed email before conversion
    if (!user.email_confirmed_at) {
      return new Response(
        JSON.stringify({ error: "Email must be confirmed before conversion" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for the conversion
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Convert ghost profile to real profile
    const { error: convertError } = await supabaseAdmin.rpc("convert_ghost_to_profile", {
      p_session_id: session_id,
      p_auth_uid: user.id,
    });

    if (convertError) {
      console.error("Error converting ghost profile:", convertError);
      return new Response(
        JSON.stringify({ error: "Error vinculando perfil" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    return new Response(
      JSON.stringify({ success: true, user_id: user.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
