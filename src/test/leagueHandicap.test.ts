import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

// Opt-in integration fixture: run after creating the isolated QA league,
// using a signed-in creator session supplied only through environment variables.
// Never run these mutations against a real competition.
const leagueId = '60c1f4f7-91a8-46af-8304-2da0ce8ff291';
const sergioId = '5cae8054-903c-4075-a2ba-efc213fe5ef2';
const carlosId = 'b6cde8b6-df63-4dbe-b53b-1000c2ae7226';
const roundId = '366776a9-c6c3-4855-8806-af339c196310';

describe.skipIf(!process.env.LEAGUE_TEST_ACCESS_TOKEN)('League handicap integration', () => {
  let client: SupabaseClient;
  beforeAll(async () => {
    client = createClient(process.env.LEAGUE_TEST_URL ?? '', process.env.LEAGUE_TEST_ANON_KEY ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${process.env.LEAGUE_TEST_ACCESS_TOKEN}` } },
    });
    const { data, error } = await client.from('leaderboard_events').select('name').eq('id', leagueId).single();
    expect(error).toBeNull();
    expect(data?.name).toBe('QA HCP por ronda');
  });

  async function setMode(mode: 'fixed' | 'per_round' | null) {
    const { data, error } = await client.from('leaderboard_events').select('rules_json').eq('id', leagueId).single();
    expect(error).toBeNull();
    const rules = { ...data?.rules_json };
    if (mode === null) delete rules.handicap_mode;
    else rules.handicap_mode = mode;
    const res = await client.from('leaderboard_events').update({ rules_json: rules }).eq('id', leagueId).select('id');
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(1);
  }

  async function scores() {
    const { data, error } = await client.from('leaderboard_scores')
      .select('gross_total,net_total,stableford_total,points_earned,leaderboard_participants!inner(profile_id)')
      .eq('leaderboard_id', leagueId).eq('round_id', roundId);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    return new Map((data ?? []).map(row => [
      (row.leaderboard_participants as unknown as { profile_id: string }).profile_id, row,
    ]));
  }

  it('keeps a legacy league fixed instead of taking the round handicap', async () => {
    await setMode(null);
    const rows = await scores();
    expect(rows.get(sergioId)?.net_total).toBe(41); // 77 minus fixed 36, not round 8
    expect(rows.get(carlosId)?.net_total).toBe(77); // 77 minus fixed 0, not round 6
  });

  it('uses the saved handicap for each round without overwriting fixed handicaps', async () => {
    await setMode('per_round');
    const rows = await scores();
    expect(rows.get(sergioId)?.gross_total).toBe(77);
    expect(rows.get(sergioId)?.net_total).toBe(69); // saved round HCP 8
    expect(rows.get(carlosId)?.net_total).toBe(71); // saved round HCP 6
    expect(rows.get(sergioId)?.stableford_total).toBe(39);
    expect(rows.get(carlosId)?.stableford_total).toBe(37);
    const preview = await client.rpc('get_league_round_handicaps', { p_leaderboard_id: leagueId, p_round_id: roundId });
    expect(preview.error).toBeNull();
    expect(preview.data?.find((p: { profile_id: string }) => p.profile_id === sergioId)?.effective_handicap).toBe(8);
    expect(preview.data?.find((p: { profile_id: string }) => p.profile_id === sergioId)?.fixed_handicap).toBe(36);
    const secondPreview = await client.rpc('get_league_round_handicaps', {
      p_leaderboard_id: leagueId, p_round_id: '22835f45-51f9-4aca-b57d-9fdb7291309a',
    });
    expect(secondPreview.error).toBeNull();
    expect(secondPreview.data?.find((p: { profile_id: string }) => p.profile_id === sergioId)?.effective_handicap).toBe(9);
  });

  it('changes the jornada points when variable handicaps reverse the net ranking', async () => {
    for (const [id, hcp] of [[sergioId, 0], [carlosId, 36]] as const) {
      const res = await client.from('leaderboard_participants').update({ handicap_for_leaderboard: hcp })
        .eq('leaderboard_id', leagueId).eq('profile_id', id);
      expect(res.error).toBeNull();
    }
    await setMode('fixed');
    let rows = await scores();
    expect(rows.get(carlosId)?.points_earned).toBe(10);
    expect(rows.get(sergioId)?.points_earned).toBe(7);
    await setMode('per_round');
    rows = await scores();
    expect(rows.get(sergioId)?.points_earned).toBe(10);
    expect(rows.get(carlosId)?.points_earned).toBe(7);
  });

  it('restores fixed results when the creator switches back', async () => {
    for (const [id, hcp] of [[sergioId, 36], [carlosId, 0]] as const) {
      const res = await client.from('leaderboard_participants').update({ handicap_for_leaderboard: hcp })
        .eq('leaderboard_id', leagueId).eq('profile_id', id);
      expect(res.error).toBeNull();
    }
    await setMode('fixed');
    const rows = await scores();
    expect(rows.get(sergioId)?.net_total).toBe(41);
    expect(rows.get(carlosId)?.net_total).toBe(77);
  });

  it('denies the preview to an unauthenticated reader', async () => {
    const anon = createClient(process.env.LEAGUE_TEST_URL ?? '', process.env.LEAGUE_TEST_ANON_KEY ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await anon.rpc('get_league_round_handicaps', { p_leaderboard_id: leagueId, p_round_id: roundId });
    expect(result.error).not.toBeNull();
    expect(result.data).toBeNull();
  });
});