import React from 'react';
import { Separator } from '@/components/ui/separator';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { HandicapRankingEntry } from '@/hooks/useHandicapRanking';

const toTitleCase = (name: string) =>
  name.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

const TrendIcon = ({ trend }: { trend: number | null }) => {
  if (trend === null) return <Minus className="h-2.5 w-2.5 text-muted-foreground" />;
  if (trend < -0.4) return <TrendingDown className="h-2.5 w-2.5 text-green-500" />;
  if (trend > 0.4) return <TrendingUp className="h-2.5 w-2.5 text-red-500" />;
  return <Minus className="h-2.5 w-2.5 text-muted-foreground" />;
};

interface Props {
  entries: HandicapRankingEntry[];
  currentProfileId?: string | null;
}

export const HandicapRankingRows: React.FC<Props> = ({ entries, currentProfileId }) => (
  <>
    {entries.map((entry, idx) => (
      <React.Fragment key={entry.profile_id}>
        {idx > 0 && <Separator className="my-0.5" />}
        <div className="flex items-center gap-1 py-0.5">
          <span className="text-[11px] font-bold text-muted-foreground w-5 text-center shrink-0">
            {entry.rank ?? idx + 1}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate leading-tight">
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
            <div className="flex items-center gap-0.5 w-[52px] justify-end">
              <TrendIcon trend={entry.handicap_trend} />
              <span className="text-xs font-semibold">{entry.current_handicap.toFixed(1)}</span>
            </div>
            <span className="text-[11px] text-muted-foreground w-[36px] text-center">
              {entry.avg_gross_score ?? '—'}
            </span>
            <span className="text-[11px] text-muted-foreground w-[36px] text-center">
              {entry.best_gross_score ?? '—'}
            </span>
          </div>
        </div>
      </React.Fragment>
    ))}
  </>
);
