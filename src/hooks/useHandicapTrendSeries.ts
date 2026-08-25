import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface HandicapTrendPoint {
  recordedAt: string;
  handicap: number;
}

export type HandicapTrendSeriesMap = Record<string, HandicapTrendPoint[]>;

/**
 * Serie del Handicap Index de los últimos N días (por defecto 30) para los
 * perfiles indicados. Incluye un punto ancla al inicio de la ventana para que
 * la mini gráfica siempre tenga una línea comparable con el color de tendencia.
 */
export function useHandicapTrendSeries(profileIds: string[], days = 30) {
  const sortedIds = [...new Set(profileIds)].sort();

  const { data = {}, isLoading } = useQuery<HandicapTrendSeriesMap>({
    queryKey: ['handicap_trend_series', days, sortedIds.join(',')],
    staleTime: 5 * 60_000,
    enabled: sortedIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_handicap_trend_series' as any, {
        p_profile_ids: sortedIds,
        p_days: days,
      } as any);
      if (error) throw error;

      const map: HandicapTrendSeriesMap = {};
      for (const row of (data as any[]) ?? []) {
        const pid = row.profile_id as string;
        if (!map[pid]) map[pid] = [];
        map[pid].push({ recordedAt: row.recorded_at, handicap: Number(row.handicap) });
      }
      return map;
    },
  });

  return { series: data, loading: isLoading };
}
