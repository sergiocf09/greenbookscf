import React, { useMemo, useState } from 'react';
import { Share2, Trophy } from 'lucide-react';
import { trs } from '@/i18n/tr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLeaderboardPrizes } from '@/hooks/useLeaderboardPrizes';
import { sharePayoutsFromSnapshot } from '@/lib/prizesShareData';
import { PrizePlayerCard } from './PrizePlayerCard';
import { PrizesShareImage } from './PrizesShareImage';
import { formatFrozenAt } from './PrizesPanel';

interface Props {
  leaderboardId: string;
  /** Leaderboard name (share image title). */
  title: string;
  /** Participant id of the signed-in user in this leaderboard, to highlight "Tu premio". */
  myParticipantId?: string | null;
}

/**
 * Read-only frozen prizes for the round history. Renders ONLY when the
 * leaderboard's prizes are 'final' and readable; otherwise null, no error.
 * Reads the stored snapshot only — never recalculates.
 */
export const HistoricalPrizesCard: React.FC<Props> = ({ leaderboardId, title, myParticipantId }) => {
  const { prizes, loading, loadError } = useLeaderboardPrizes(leaderboardId);
  const [shareOpen, setShareOpen] = useState(false);
  const snapshot = prizes?.status === 'final' ? prizes.finalPayouts : null;
  const payouts = useMemo(
    () => (snapshot ? sharePayoutsFromSnapshot(snapshot, trs('Jugador')) : null),
    [snapshot],
  );

  if (loading || loadError || !prizes?.exists || !snapshot || !payouts) return null;

  const frozen = formatFrozenAt(snapshot.frozenAt ?? prizes.finalizedAt);
  const modes = (snapshot.pools || []) as unknown as { mode?: string }[];
  const modeLabels = [...new Set(modes.map(m => m.mode).filter(Boolean))].map(m =>
    trs(m === 'gross' ? 'Gross' : m === 'stableford' ? 'Stableford' : 'Neto'));

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-amber-500 shrink-0" />{trs('Premios · Final')}
            </CardTitle>
            {frozen && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{trs('Congelado el')} {frozen}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={trs('Compartir premios')}
            title={trs('Compartir premios')} onClick={() => setShareOpen(true)}>
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-1.5">
        {payouts.byParticipant.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">{trs('Aún no hay premios asignados')}</p>
        ) : payouts.byParticipant.map(p => (
          <PrizePlayerCard
            key={p.participantId}
            name={p.name}
            initials={p.initials}
            color={p.color}
            total={p.total}
            items={p.items}
            isMe={!!myParticipantId && p.participantId === myParticipantId}
          />
        ))}
        <p className="text-[10px] text-muted-foreground leading-snug text-center px-2 pt-1">
          {trs('GreenBook solo calcula el reparto. El cobro y el pago de premios es un acuerdo entre los participantes.')}
        </p>
      </CardContent>
      <PrizesShareImage
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={title}
        dateLabel={frozen.split(' · ')[0]}
        modeLabelPairs={modeLabels}
        payouts={payouts}
        status="final"
      />
    </Card>
  );
};

export default HistoricalPrizesCard;
