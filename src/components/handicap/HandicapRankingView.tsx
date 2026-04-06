import React, { useMemo, useState } from 'react';
import { useHandicapRanking } from '@/hooks/useHandicapRanking';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveHandicap } from '@/hooks/useLiveHandicap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { HandicapRankingHeader } from '@/components/handicap/HandicapRankingHeader';
import { sortHandicapRankingEntries, withLiveHandicapOverride, type HandicapRankingSortKey } from '@/lib/handicapRankingUtils';

interface Props {
  roundId: string | null;
}

const toTitleCase = (name: string) =>
  name.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

const TrendIcon = ({ trend }: { trend: number | null }) => {
  if (trend === null) return <Minus className="h-3 w-3 text-muted-foreground" />;
  if (trend < -0.4) return <TrendingDown className="h-3 w-3 text-green-500" />;
  if (trend > 0.4) return <TrendingUp className="h-3 w-3 text-red-500" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
};

const PositionBadge = ({ rank }: { rank: number }) => (
  <span className="text-xs font-bold text-muted-foreground w-6 text-center">{rank}</span>
);

export const HandicapRankingView: React.FC<Props> = ({ roundId }) => {
  const { profile } = useAuth();
  const [sortKey, setSortKey] = useState<HandicapRankingSortKey>('handicap');
  const { entries, loading } = useHandicapRanking(roundId, 'group');
  const { liveHandicapIndex } = useLiveHandicap(profile?.id ?? null, profile?.current_handicap ?? null);

  const displayEntries = useMemo(
    () => sortHandicapRankingEntries(
      withLiveHandicapOverride(entries, profile?.id ?? null, liveHandicapIndex),
      sortKey,
    ),
    [entries, liveHandicapIndex, profile?.id, sortKey],
  );

  if (!roundId) {
    return (
      <div className="space-y-4 mt-6">
        <p className="text-xs text-muted-foreground text-center py-2">
          Inicia una ronda para ver el ranking de hándicap del grupo
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-6">
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : displayEntries.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-6">Sin datos de hándicap disponibles</p>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              <HandicapRankingHeader title="Ranking de Hándicap" sortKey={sortKey} onSortChange={setSortKey} />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {displayEntries.map((entry, idx) => (
              <React.Fragment key={entry.profile_id}>
                {idx > 0 && <Separator className="my-1" />}
                <div className="flex items-center gap-2 py-1">
                  <PositionBadge rank={entry.rank ?? idx + 1} />
                  <PlayerAvatar initials={entry.initials} background={entry.avatar_color} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate leading-tight">
                      {toTitleCase(entry.display_name)}
                      {entry.profile_id === profile?.id && (
                        <span className="text-xs text-muted-foreground ml-1">(tú)</span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-tight">{entry.rounds_played} rondas</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 w-12 justify-center">
                      <TrendIcon trend={entry.handicap_trend} />
                      <span className="text-sm font-semibold">{entry.current_handicap.toFixed(1)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-center">
                      {entry.avg_gross_score ?? '—'}
                    </span>
                    <span className="text-xs text-muted-foreground w-10 text-center">
                      {entry.best_gross_score ?? '—'}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
