import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SixesConfig, SixesSetAssignment, Player } from '@/types/golf';

export const useSixes = (roundId: string | null, _players: Player[]) => {
  const [sixesConfig, setSixesConfig] = useState<SixesConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!roundId) return;
    setLoading(true);
    try {
      const [{ data: cfg }, { data: sets }] = await Promise.all([
        supabase.from('sixes_config').select('*').eq('round_id', roundId).maybeSingle(),
        supabase.from('sixes_sets').select('*').eq('round_id', roundId).order('set_number'),
      ]);
      if (cfg) {
        setSixesConfig({
          roundId: cfg.round_id,
          scoringMode: cfg.scoring_mode as SixesConfig['scoringMode'],
          cobro: cfg.cobro as SixesConfig['cobro'],
          amount: cfg.amount,
          useHandicap: cfg.use_handicap,
          usePerSetAmounts: (cfg as any).use_per_set_amounts ?? false,
          set1Amount: (cfg as any).set1_amount ?? undefined,
          set2Amount: (cfg as any).set2_amount ?? undefined,
          set3Amount: (cfg as any).set3_amount ?? undefined,
          sets: (sets ?? []).map(s => ({
            setNumber: s.set_number as 1|2|3,
            team1: [s.team1_player1_id, s.team1_player2_id] as [string,string],
            team2: [s.team2_player1_id, s.team2_player2_id] as [string,string],
          })),
        });
      } else {
        setSixesConfig(null);
      }
    } finally {
      setLoading(false);
    }
  }, [roundId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveConfig = useCallback(async (cfg: Omit<SixesConfig, 'roundId' | 'sets'>) => {
    if (!roundId) return;
    await supabase.from('sixes_config').upsert({
      round_id:            roundId,
      scoring_mode:        cfg.scoringMode,
      cobro:               cfg.cobro,
      amount:              cfg.amount,
      use_handicap:        cfg.useHandicap,
      use_per_set_amounts: (cfg as any).usePerSetAmounts ?? false,
      set1_amount:         (cfg as any).set1Amount ?? null,
      set2_amount:         (cfg as any).set2Amount ?? null,
      set3_amount:         (cfg as any).set3Amount ?? null,
    } as any, { onConflict: 'round_id' });
    await fetchData();
  }, [roundId, fetchData]);

  const saveSets = useCallback(async (sets: SixesSetAssignment[]) => {
    if (!roundId) return;
    await Promise.all(sets.map(s => supabase.from('sixes_sets').upsert({
      round_id: roundId,
      set_number: s.setNumber,
      team1_player1_id: s.team1[0],
      team1_player2_id: s.team1[1],
      team2_player1_id: s.team2[0],
      team2_player2_id: s.team2[1],
    }, { onConflict: 'round_id,set_number' })));
    await fetchData();
  }, [roundId, fetchData]);

  return { sixesConfig, loading, isActive: !!sixesConfig, saveConfig, saveSets };
};
