import React from 'react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { HandicapRankingEntry } from '@/hooks/useHandicapRanking';
import { useHandicapTrendSeries } from '@/hooks/useHandicapTrendSeries';
import { computeHandicapTrend, formatHandicapTrendDelta, handicapTrendColorClass, HANDICAP_TREND_WINDOW_DAYS } from '@/lib/handicapTrend';

const toTitleCase = (name: string) =>
  name.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

interface Props {
  entries: HandicapRankingEntry[];
  currentProfileId?: string | null;
}


export const HandicapRankingRows: React.FC<Props> = ({ entries, currentProfileId }) => {
  const { series } = useHandicapTrendSeries(entries.map(e => e.profile_id), HANDICAP_TREND_WINDOW_DAYS);


  return (
  <>
    {entries.map((entry, idx) => {
      const trendInfo = computeHandicapTrend(series[entry.profile_id], entry.current_handicap);
      return (
      <React.Fragment key={entry.profile_id}>
        {idx > 0 && <Separator className="my-0.5" />}
        <div className="flex items-center gap-1 py-0.5">
          <span className="text-[11px] font-bold text-muted-foreground w-5 text-center shrink-0">
            {entry.rank ?? idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium truncate leading-tight">
              {toTitleCase(entry.display_name)}
              {entry.profile_id === currentProfileId && (
                <span className="text-[10px] text-muted-foreground ml-1">(tú)</span>
              )}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              {entry.rounds_played} {entry.rounds_played === 1 ? 'ronda' : 'rondas'}
            </p>
          </div>
          <div className="flex items-center shrink-0">
            <span
              className={cn(
                'w-[40px] text-center text-[10px] font-semibold tabular-nums leading-tight',
                handicapTrendColorClass(trendInfo.status),
              )}
              title={trendInfo.referenceHandicap === null
                ? 'Sin referencia 30d'
                : `Δ30d: ${trendInfo.referenceHandicap.toFixed(1)} → ${entry.current_handicap.toFixed(1)}`}
            >
              {formatHandicapTrendDelta(trendInfo.trend)}
            </span>
            <span className={cn('text-xs font-semibold w-[44px] text-center', handicapTrendColorClass(trendInfo.status))}>
              {entry.current_handicap.toFixed(1)}
            </span>

            <span className="text-[11px] font-bold text-green-700 dark:text-green-400 w-[40px] text-center">
              {entry.avg_gross_score ?? '—'}
            </span>
            <span className="text-[11px] font-bold text-green-700 dark:text-green-400 w-[40px] text-center">
              {entry.best_gross_score ?? '—'}
            </span>
          </div>
        </div>
      </React.Fragment>
      );
    })}

  </>
  );
};
