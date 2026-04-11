import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { NinesConfig, Player } from '@/types/golf';

export const useNines = (roundId: string | null, _players: Player[]) => {
  const [ninesConfig, setNinesConfig] = useState<NinesConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!roundId) return;
    setLoading(true);
    try {
      const { data } = await supabase.from('nines_config').select('*').eq('round_id', roundId).maybeSingle();
      if (data) {
        const ph = (data as any).player_handicaps;
        setNinesConfig({
          roundId: data.round_id,
          valuePerPoint: data.value_per_point,
          playerIds: data.player_ids ?? [],
          playerHandicaps: ph && typeof ph === 'object' && !Array.isArray(ph) ? ph as Record<string, number> : undefined,
        });
      } else {
        setNinesConfig(null);
      }
    } finally {
      setLoading(false);
    }
  }, [roundId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveConfig = useCallback(async (cfg: Omit<NinesConfig, 'roundId'>) => {
    if (!roundId) return;
    await supabase.from('nines_config').upsert({
      round_id: roundId,
      value_per_point: cfg.valuePerPoint,
      player_ids: cfg.playerIds,
      player_handicaps: cfg.playerHandicaps ?? {},
    } as any, { onConflict: 'round_id' });
    await fetchData();
  }, [roundId, fetchData]);

  return { ninesConfig, loading, isActive: !!ninesConfig, saveConfig };
};
