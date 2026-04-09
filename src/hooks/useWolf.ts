import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { WolfConfig, WolfHoleState, Player } from '@/types/golf';
import { getWolfPlayerId, computeEffectiveAmount } from '@/lib/bets/wolf';

export const useWolf = (roundId: string | null, players: Player[]) => {
  const [wolfConfig, setWolfConfig] = useState<WolfConfig | null>(null);
  const [holeStates, setHoleStates] = useState<WolfHoleState[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!roundId) return;
    setLoading(true);
    try {
      const [{ data: cfg }, { data: states }] = await Promise.all([
        supabase.from('wolf_config').select('*').eq('round_id', roundId).maybeSingle(),
        supabase.from('wolf_hole_state').select('*').eq('round_id', roundId).order('hole_number'),
      ]);
      if (cfg) {
        setWolfConfig({
          roundId:        cfg.round_id,
          amountPerHole:  cfg.amount_per_hole,
          scoringMode:    cfg.scoring_mode as WolfConfig['scoringMode'],
          useHandicap:    cfg.use_handicap,
          timing:         cfg.timing as WolfConfig['timing'],
          carryover:      cfg.carryover,
          playerOrder:    (cfg as any).player_order ?? [],
          participantIds: (cfg as any).participant_ids ?? [],
        });
      } else {
        setWolfConfig(null);
      }
      setHoleStates((states ?? []).map(s => ({
        roundId: s.round_id,
        holeNumber: s.hole_number,
        wolfPlayerId: s.wolf_player_id,
        partnerIds: s.partner_ids ?? [],
        wentSolo: s.went_solo,
        result: (s.result as WolfHoleState['result']) ?? null,
        effectiveAmount: s.effective_amount ?? null,
        carryoverHoles: s.carryover_holes ?? 0,
      })));
    } finally {
      setLoading(false);
    }
  }, [roundId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveConfig = useCallback(async (cfg: Omit<WolfConfig, 'roundId'>) => {
    if (!roundId) return;
    await supabase.from('wolf_config').upsert({
      round_id: roundId,
      amount_per_hole: cfg.amountPerHole,
      scoring_mode: cfg.scoringMode,
      use_handicap: cfg.useHandicap,
      timing: cfg.timing,
      carryover: cfg.carryover,
    }, { onConflict: 'round_id' });
    await fetchData();
  }, [roundId, fetchData]);

  const saveDecision = useCallback(async (holeNumber: number, wolfPlayerId: string, partnerIds: string[], wentSolo: boolean) => {
    if (!roundId || !wolfConfig) return;
    const carryoverHoles = holeStates.filter(s =>
      s.holeNumber < holeNumber && s.result === 'tied' && wolfConfig.carryover
    ).length;
    const effectiveAmount = computeEffectiveAmount(wolfConfig, carryoverHoles, wentSolo);
    await supabase.from('wolf_hole_state').upsert({
      round_id: roundId,
      hole_number: holeNumber,
      wolf_player_id: wolfPlayerId,
      partner_ids: partnerIds,
      went_solo: wentSolo,
      result: null,
      effective_amount: effectiveAmount,
      carryover_holes: carryoverHoles,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'round_id,hole_number' });
    await fetchData();
  }, [roundId, wolfConfig, holeStates, fetchData]);

  const resolveHole = useCallback(async (holeNumber: number, result: 'won' | 'lost' | 'tied') => {
    if (!roundId) return;
    await supabase.from('wolf_hole_state').update({
      result,
      updated_at: new Date().toISOString(),
    }).eq('round_id', roundId).eq('hole_number', holeNumber);
    await fetchData();
  }, [roundId, fetchData]);

  const getCurrentWolfId = useCallback((holeNumber: number) => {
    if (!wolfConfig || players.length < 4) return null;
    return getWolfPlayerId(holeNumber, players);
  }, [wolfConfig, players]);

  const getHoleState = useCallback((holeNumber: number) =>
    holeStates.find(s => s.holeNumber === holeNumber) ?? null, [holeStates]);

  return { wolfConfig, holeStates, loading, isActive: !!wolfConfig, saveConfig, saveDecision, resolveHole, getCurrentWolfId, getHoleState };
};
