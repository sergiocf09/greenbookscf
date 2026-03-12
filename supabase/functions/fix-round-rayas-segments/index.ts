import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Service role client for direct table updates (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceKey);
    
    // User client for RPC calls that need auth context
    const authHeader = req.headers.get('Authorization');
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || '' } },
    });

    const { roundId } = await req.json();
    if (!roundId) {
      return new Response(JSON.stringify({ error: 'roundId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fix bet_config: cascade global rayas values to segments
    const { data: round, error: fetchErr } = await adminClient
      .from('rounds')
      .select('bet_config')
      .eq('id', roundId)
      .single();

    if (fetchErr || !round) {
      return new Response(JSON.stringify({ error: 'Round not found', detail: fetchErr }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const betConfig = round.bet_config as any;
    const rayas = betConfig?.rayas;
    const oldSegments = rayas?.segments ? JSON.parse(JSON.stringify(rayas.segments)) : null;
    
    if (rayas?.segments) {
      const globalFront = rayas.frontValue;
      const globalBack = rayas.backValue;
      for (const key of Object.keys(rayas.segments)) {
        rayas.segments[key].frontValue = globalFront;
        rayas.segments[key].backValue = globalBack;
      }
    }

    // 2. Update bet_config with service role (bypasses RLS)
    const { error: updateErr } = await adminClient
      .from('rounds')
      .update({ bet_config: betConfig })
      .eq('id', roundId);

    if (updateErr) {
      return new Response(JSON.stringify({ error: 'Failed to update bet_config', detail: updateErr }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Reset round for re-close (needs user auth context for organizer check)
    const { error: resetErr } = await userClient.rpc('reset_round_for_reclose', {
      p_round_id: roundId,
    });

    if (resetErr) {
      return new Response(JSON.stringify({ error: 'Failed to reset round', detail: resetErr }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Bet config fixed and round reset for re-close',
      oldSegments,
      fixedSegments: rayas?.segments,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
