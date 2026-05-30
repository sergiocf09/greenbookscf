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

    // ── Authentication required ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { roundId } = await req.json();
    if (!roundId) {
      return new Response(JSON.stringify({ error: 'roundId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Authorization: caller must be round organizer ──
    const { data: isOrganizer, error: orgErr } = await userClient.rpc('is_round_organizer', {
      p_round_id: roundId,
    });
    if (orgErr || !isOrganizer) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // 1. Fix bet_config: cascade global rayas values to segments
    const { data: round, error: fetchErr } = await adminClient
      .from('rounds')
      .select('bet_config')
      .eq('id', roundId)
      .single();

    if (fetchErr || !round) {
      console.error('fix-round-rayas-segments fetch error:', fetchErr);
      return new Response(JSON.stringify({ error: 'Round not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const betConfig = round.bet_config as any;
    const rayas = betConfig?.rayas;

    if (rayas?.segments) {
      const globalFront = rayas.frontValue;
      const globalBack = rayas.backValue;
      for (const key of Object.keys(rayas.segments)) {
        rayas.segments[key].frontValue = globalFront;
        rayas.segments[key].backValue = globalBack;
      }
    }

    const { error: updateErr } = await adminClient
      .from('rounds')
      .update({ bet_config: betConfig })
      .eq('id', roundId);

    if (updateErr) {
      console.error('fix-round-rayas-segments update error:', updateErr);
      return new Response(JSON.stringify({ error: 'Failed to update bet_config' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: resetErr } = await userClient.rpc('reset_round_for_reclose', {
      p_round_id: roundId,
    });

    if (resetErr) {
      console.error('fix-round-rayas-segments reset error:', resetErr);
      return new Response(JSON.stringify({ error: 'Failed to reset round' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Bet config fixed and round reset for re-close',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('fix-round-rayas-segments error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
