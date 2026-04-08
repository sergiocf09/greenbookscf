import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { VegasConfig } from '@/types/golf';

export const useVegas = (roundId: string | null) => {
  const [vegasConfig, setVegasConfig] = useState<VegasConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!roundId) return;
    setLoading(true);
    try {
      const { data } = await supabase.from('vegas_config').select('*').eq('round_id', roundId).maybeSingle();
      if (data) {
        setVegasConfig({
          roundId: data.round_id,
          valuePerPoint: data.value_per_point,
          useHandicap: data.use_handicap,
          birdieMultiplier: data.birdie_multiplier,
          variant: data.variant as VegasConfig['variant'],
          playerAId: data.player_a_id ?? '',
          playerBId: data.player_b_id ?? '',
          playerCId: data.player_c_id ?? '',
          playerDId: data.player_d_id ?? '',
        });
      } else {
        setVegasConfig(null);
      }
    } finally {
      setLoading(false);
    }
  }, [roundId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveConfig = useCallback(async (cfg: Omit<VegasConfig, 'roundId'>) => {
    if (!roundId) return;
    await supabase.from('vegas_config').upsert({
      round_id: roundId,
      value_per_point: cfg.valuePerPoint,
      use_handicap: cfg.useHandicap,
      birdie_multiplier: cfg.birdieMultiplier,
      variant: cfg.variant,
      player_a_id: cfg.playerAId || null,
      player_b_id: cfg.playerBId || null,
      player_c_id: cfg.playerCId || null,
      player_d_id: cfg.playerDId || null,
    }, { onConflict: 'round_id' });
    await fetchData();
  }, [roundId, fetchData]);

  return { vegasConfig, loading, isActive: !!vegasConfig, saveConfig };
};
