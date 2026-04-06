import React, { useMemo, useState } from 'react';
import { useHandicapRanking } from '@/hooks/useHandicapRanking';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveHandicap } from '@/hooks/useLiveHandicap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { HandicapRankingHeader } from '@/components/handicap/HandicapRankingHeader';
import { HandicapRankingRows } from '@/components/handicap/HandicapRankingRows';
import { sortHandicapRankingEntries, withLiveHandicapOverride, type HandicapRankingSortKey, type HandicapRankingSortDirection } from '@/lib/handicapRankingUtils';

interface Props {
  roundId: string | null;
}

export const HandicapRankingView: React.FC<Props> = ({ roundId }) => {
  const { profile } = useAuth();
  const [sortKey, setSortKey] = useState<HandicapRankingSortKey>('handicap');
  const [sortDir, setSortDir] = useState<HandicapRankingSortDirection>('asc');
  const { entries, loading } = useHandicapRanking(roundId, 'group');
  const { liveHandicapIndex } = useLiveHandicap(profile?.id ?? null, profile?.current_handicap ?? null);

  const handleSortChange = (key: HandicapRankingSortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const displayEntries = useMemo(
    () => sortHandicapRankingEntries(
      withLiveHandicapOverride(entries, profile?.id ?? null, liveHandicapIndex),
      sortKey, sortDir,
    ),
    [entries, liveHandicapIndex, profile?.id, sortKey, sortDir],
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
          <CardHeader className="pb-1 px-3">
            <CardTitle className="text-sm">
              <HandicapRankingHeader title="Ranking de Hándicap" sortKey={sortKey} sortDirection={sortDir} onSortChange={handleSortChange} />
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-3">
            <HandicapRankingRows entries={displayEntries} currentProfileId={profile?.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};
