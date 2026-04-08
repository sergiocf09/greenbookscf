import React, { useMemo, useState } from 'react';
import { Player, PlayerScore, GolfCourse, NinesConfig } from '@/types/golf';
import { buildNinesHoleDetails, calculateNinesPlayerSummaries, calculateNinesBets, distributeNinesPoints } from '@/lib/bets/nines';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { ChevronDown, AlertTriangle } from 'lucide-react';

interface NinesResultsCardProps {
  players: Player[];
  ninesConfig: NinesConfig;
  scores: Map<string, PlayerScore[]>;
  course: GolfCourse;
  basePlayerId: string;
}

interface PlayerPointsSummary {
  playerId: string; playerName: string; playerInitials: string;
  playerColor: string; totalPoints: number; holesRested?: number;
}

export const NinesResultsCard: React.FC<NinesResultsCardProps> = ({
  players, ninesConfig, scores, course, basePlayerId,
}) => {
  const [detailOpen, setDetailOpen] = useState(false);

  const activePlayers = useMemo(() =>
    players.filter(p => ninesConfig.playerIds.includes(p.id)),
    [players, ninesConfig.playerIds]
  );

  const missingIds = useMemo(() =>
    ninesConfig.playerIds.filter(id => !players.find(p => p.id === id)),
    [players, ninesConfig.playerIds]
  );

  const is4Player = activePlayers.length === 4;

  const { summaries, holeData } = useMemo(() => {
    if (missingIds.length > 0 || activePlayers.length < 3) {
      return { summaries: [] as PlayerPointsSummary[], holeData: [] };
    }
    if (activePlayers.length === 3) {
      const details = buildNinesHoleDetails(activePlayers, scores, ninesConfig, course);
      const sums = calculateNinesPlayerSummaries(activePlayers, details, ninesConfig)
        .sort((a, b) => b.totalPoints - a.totalPoints);
      const hd = details.map(d => ({
        holeNumber: d.holeNumber,
        playerPoints: d.playerScores.map(ps => ({
          playerId: ps.playerId, points: ps.points, resting: false,
        })),
      }));
      return { summaries: sums as PlayerPointsSummary[], holeData: hd };
    }

    // 4-player rotation
    const pointsAccum = new Map<string, number>();
    const restCount = new Map<string, number>();
    activePlayers.forEach(p => { pointsAccum.set(p.id, 0); restCount.set(p.id, 0); });
    const hd: { holeNumber: number; playerPoints: { playerId: string; points: number; resting: boolean }[] }[] = [];

    for (let h = 1; h <= 18; h++) {
      const restingPlayer = activePlayers[(h - 1) % 4];
      const activeThree = activePlayers.filter(p => p.id !== restingPlayer.id);

      // Get net scores for active three
      const netScores = activeThree.map(p => {
        const sp = calculateStrokesPerHole(p.handicap, course);
        const hs = (scores.get(p.id) ?? []).find(s => s.confirmed && s.holeNumber === h);
        if (!hs?.strokes) return null;
        return { id: p.id, net: hs.strokes - (sp[h - 1] ?? 0) };
      }).filter((x): x is { id: string; net: number } => x !== null);

      if (netScores.length !== 3) continue;

      const pointsMap = distributeNinesPoints(netScores);
      const holePoints: { playerId: string; points: number; resting: boolean }[] = [];

      activePlayers.forEach(p => {
        if (p.id === restingPlayer.id) {
          pointsAccum.set(p.id, (pointsAccum.get(p.id) ?? 0) + 3);
          restCount.set(p.id, (restCount.get(p.id) ?? 0) + 1);
          holePoints.push({ playerId: p.id, points: 3, resting: true });
        } else {
          const pts = pointsMap.get(p.id) ?? 3;
          pointsAccum.set(p.id, (pointsAccum.get(p.id) ?? 0) + pts);
          holePoints.push({ playerId: p.id, points: pts, resting: false });
        }
      });
      hd.push({ holeNumber: h, playerPoints: holePoints });
    }

    const sums: PlayerPointsSummary[] = activePlayers.map(p => ({
      playerId: p.id,
      playerName: p.name,
      playerInitials: p.initials,
      playerColor: p.color,
      totalPoints: pointsAccum.get(p.id) ?? 0,
      holesRested: restCount.get(p.id) ?? 0,
    })).sort((a, b) => b.totalPoints - a.totalPoints);

    return { summaries: sums, holeData: hd };
  }, [activePlayers, scores, ninesConfig, course]);

  const bets = useMemo(() => {
    if (activePlayers.length === 3) {
      return calculateNinesBets(activePlayers, scores, ninesConfig, course);
    }
    // For 4 players, calculate bilateral from summaries
    const betSummaries: { playerId: string; vsPlayer: string; amount: number; description: string }[] = [];
    for (let i = 0; i < summaries.length; i++) {
      for (let j = i + 1; j < summaries.length; j++) {
        const A = summaries[i], B = summaries[j];
        const diff = A.totalPoints - B.totalPoints;
        if (diff === 0) continue;
        const amount = Math.abs(diff) * ninesConfig.valuePerPoint;
        const [wId, lId] = diff > 0 ? [A.playerId, B.playerId] : [B.playerId, A.playerId];
        betSummaries.push({ playerId: wId, vsPlayer: lId, amount, description: `${Math.max(A.totalPoints, B.totalPoints)} vs ${Math.min(A.totalPoints, B.totalPoints)} pts` });
      }
    }
    return betSummaries;
  }, [activePlayers, scores, ninesConfig, course, summaries]);

  const totalBalance = useMemo(() => {
    if (activePlayers.length === 3) {
      const fullBets = calculateNinesBets(activePlayers, scores, ninesConfig, course);
      return fullBets.filter(b => b.playerId === basePlayerId).reduce((s, b) => s + b.amount, 0);
    }
    return bets.reduce((s, b) => {
      if (b.playerId === basePlayerId) return s + b.amount;
      if (b.vsPlayer === basePlayerId) return s - b.amount;
      return s;
    }, 0);
  }, [bets, basePlayerId, activePlayers, scores, ninesConfig, course]);

  const getName = (id: string) => players.find(p => p.id === id)?.name?.split(' ')[0] ?? '?';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">🎯 5-3-1</CardTitle>
          <Badge className={cn(
            'text-xs',
            totalBalance > 0 && 'bg-green-500/15 text-green-700 border-green-500/30',
            totalBalance < 0 && 'bg-red-500/15 text-red-700 border-red-500/30',
            totalBalance === 0 && 'bg-muted text-muted-foreground',
          )}>
            {totalBalance > 0 ? '+' : ''}{totalBalance !== 0 ? `$${fmtMoney(Math.abs(totalBalance))}` : '$0'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Rankings */}
        <div className="space-y-1">
          {summaries.map((s, i) => {
            const player = players.find(p => p.id === s.playerId);
            if (!player) return null;
            const isLeader = i === 0 && s.totalPoints > 0;
            return (
              <div key={s.playerId} className="flex items-center gap-2 text-sm">
                <PlayerAvatar initials={s.playerInitials} background={s.playerColor} size="sm" />
                <span className={isLeader ? 'font-semibold text-primary' : 'text-foreground'}>
                  {isLeader && '★ '}{player.name.split(' ')[0]}
                </span>
                <span className="ml-auto font-mono text-xs font-semibold">{s.totalPoints} pts</span>
                {is4Player && s.holesRested !== undefined && (
                  <span className="text-[9px] text-muted-foreground">({s.holesRested} desc)</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Saldos */}
        {bets.length > 0 && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium text-muted-foreground">Saldos</p>
            {bets.filter(b => b.amount > 0).map((b, i) => (
              <p key={i} className="text-[11px]">
                {getName(b.playerId)} cobra ${fmtMoney(b.amount)} de {getName(b.vsPlayer)}
              </p>
            ))}
          </div>
        )}

        {/* Detalle por hoyo */}
        {holeData.length > 0 && (
          <Collapsible open={detailOpen} onOpenChange={setDetailOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-medium py-1 text-muted-foreground">
              <span>Detalle por hoyo</span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', detailOpen && 'rotate-180')} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="overflow-x-auto mt-1">
                <table className="text-[10px] w-full">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left px-1">H</th>
                      {activePlayers.map(p => (
                        <th key={p.id} className="text-center px-1">{p.initials}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {holeData.map(hd => (
                      <Popover key={hd.holeNumber}>
                        <PopoverTrigger asChild>
                          <tr className="cursor-pointer hover:bg-muted/50">
                            <td className="font-semibold px-1">{hd.holeNumber}</td>
                            {activePlayers.map(p => {
                              const pp = hd.playerPoints.find(x => x.playerId === p.id);
                              return (
                                <td key={p.id} className={cn(
                                  'text-center px-1 font-mono',
                                  pp?.resting && 'text-muted-foreground bg-muted/30',
                                )}>
                                  {pp?.resting ? `·${pp.points}` : pp?.points ?? ''}
                                </td>
                              );
                            })}
                          </tr>
                        </PopoverTrigger>
                        <PopoverContent side="top" className="w-[95vw] max-w-xs p-3 text-xs">
                          <p className="font-semibold mb-1">Hoyo {hd.holeNumber}</p>
                          {hd.playerPoints.map(pp => {
                            const player = players.find(x => x.id === pp.playerId);
                            if (!player) return null;
                            return (
                              <div key={pp.playerId} className={cn('flex items-center gap-1', pp.resting && 'text-muted-foreground')}>
                                <PlayerAvatar initials={player.initials} background={player.color} size="xs" />
                                <span>{player.name.split(' ')[0]}</span>
                                <span className="ml-auto font-mono">{pp.points} pts</span>
                                {pp.resting && <span className="text-[9px]">(descansa)</span>}
                              </div>
                            );
                          })}
                        </PopoverContent>
                      </Popover>
                    ))}
                  </tbody>
                </table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
};
