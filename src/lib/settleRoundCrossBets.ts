import { supabase } from '@/integrations/supabase/client';
import { computeCrossBet } from '@/lib/bets/crossBets';
import type { GolfCourse } from '@/types/golf';

/** Always use the origin course/order, even when the receiving round closes. */
export async function settleRoundCrossBets(roundId: string): Promise<void> {
  const { data: bets, error: betError } = await supabase.rpc('get_cross_bets_for_round', { p_round_id: roundId });
  if (betError) throw betError;
  if (!bets?.length) return;
  const { data: scores, error: scoreError } = await supabase.rpc('get_cross_bet_scores', { p_round_id: roundId });
  if (scoreError) throw scoreError;
  for (const bet of bets) {
    const { data: origin, error: originError } = await supabase.from('rounds').select('course_id, starting_hole').eq('id', bet.origin_round_id).single();
    if (originError) throw originError;
    const { data: holes, error: holeError } = await supabase.from('course_holes').select('hole_number,par,stroke_index').eq('course_id', origin.course_id).order('hole_number');
    if (holeError) throw holeError;
    const { data: profiles, error: profileError } = await supabase.from('profiles').select('id,current_handicap').in('id', [bet.initiator_profile_id, bet.target_profile_id]);
    if (profileError) throw profileError;
    const course: GolfCourse = { id: origin.course_id, name: '', location: '', holes: (holes ?? []).map(h => ({ number: h.hole_number, par: h.par, handicapIndex: h.stroke_index })) };
    const pick = (id: string) => (scores ?? []).filter(s => s.cross_bet_id === bet.cross_bet_id && s.profile_id === id).map(s => ({ holeNumber: s.hole_number, strokes: s.strokes, net: s.net_score ?? s.strokes, putts: s.putts, oyesProximity: s.oyes_proximity, oyesProximitySangron: s.oyes_proximity_sangron, markers: s.markers as { t: string; n: number }[] }));
    const hcp = (id: string) => Number(profiles?.find(p => p.id === id)?.current_handicap ?? 0);
    const lines = computeCrossBet(bet.bet_config as Record<string, unknown>,
      { profileId: bet.initiator_profile_id, name: bet.initiator_name, handicap: hcp(bet.initiator_profile_id), scores: pick(bet.initiator_profile_id) },
      { profileId: bet.target_profile_id, name: bet.target_name, handicap: hcp(bet.target_profile_id), scores: pick(bet.target_profile_id) }, course, origin.starting_hole === 10 ? 10 : 1);
    const payload = lines.filter(l => l.amount !== 0).map(l => {
      const seg = l.segment === 'back' ? 'back' : l.segment === 'front' ? 'front' : 'total';
      const types: Record<string, string> = { medal: `medal_${seg}`, pressures: seg === 'back' ? 'pressure_back' : 'pressure_front', skins: seg === 'back' || (l.holeNumber ?? 0) > 9 ? 'skins_back' : 'skins_front', caros: 'caros', units: 'units', manchas: 'manchas', culebras: 'culebras', rayas: seg === 'back' ? 'rayas_back' : seg === 'front' ? 'rayas_front' : 'rayas_medal_total' };
      return { from_profile_id: l.amount > 0 ? bet.target_profile_id : bet.initiator_profile_id, to_profile_id: l.amount > 0 ? bet.initiator_profile_id : bet.target_profile_id, amount: Math.abs(l.amount), bet_type: types[l.key] ?? 'medal_total', segment: l.segment, hole_number: l.holeNumber ?? null, label: l.label };
    });
    const { error } = await supabase.rpc('settle_cross_bet', { p_cross_bet_id: bet.cross_bet_id, p_lines: payload });
    if (error) throw error;
  }
}