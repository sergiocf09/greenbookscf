import React from 'react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { HandicapRankingEntry } from '@/hooks/useHandicapRanking';
import { useHandicapTrendSeries } from '@/hooks/useHandicapTrendSeries';
import { HandicapSparkline } from '@/components/handicap/HandicapSparkline';

const toTitleCase = (name: string) =>
  name.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

const getHcpColor = (trend: number | null) => {
  if (trend === null) return 'text-foreground';
  if (trend < -0.4) return 'text-green-600 dark:text-green-400';
  if (trend > 0.4) return 'text-red-600 dark:text-red-400';
  return 'text-foreground';
};

interface Props {
  entries: HandicapRankingEntry[];
  currentProfileId?: string | null;
}


export const HandicapRankingRows: React.FC<Props> = ({ entries, currentProfileId }) => {
  const { series } = useHandicapTrendSeries(entries.map(e => e.profile_id), 30);

  return (
  <>
    {entries.map((entry, idx) => (
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
            <span className="w-[34px] flex justify-center">
              <HandicapSparkline
                points={series[entry.profile_id] ?? []}
                trend={entry.handicap_trend}
              />
            </span>
            <span className={cn('text-xs font-semibold w-[44px] text-center', getHcpColor(entry.handicap_trend))}>
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
    ))}
  </>
  );
};

      </React.Fragment>
    ))}
  </>
);
