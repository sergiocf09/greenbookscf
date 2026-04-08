import React, { useMemo, useState } from 'react';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { Player, PlayerScore, GolfCourse, SixesConfig, SixesSetResult } from '@/types/golf';
import { buildSixesSetResults } from '@/lib/bets/sixes';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Users } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { formatPlayerNameShort } from '@/lib/playerInput';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';

interface SixesResultsCardProps {
  players: Player[];
  scores: Map<string, PlayerScore[]>;
  config: SixesConfig;
  course: GolfCourse;
}

const modeLabel = (m: string) => m === 'lowBall' ? 'Mejor Bola' : m === 'lowHighBall' ? 'Mejor+Peor' : 'Stroke';
const cobroLabel = (c: string) => c === 'per_set' ? 'Por Set' : 'Por Hoyo';

export const SixesResultsCard: React.FC<SixesResultsCardProps> = ({ players, scores, config, course }) => {
  const [expandedSets, setExpandedSets] = useState<number[]>([]);

  const results = useMemo(() => buildSixesSetResults(players, scores, config, course), [players, scores, config, course]);

  if (!results.length) return null;

  const getName = (id: string) => {
    const p = players.find(pl => pl.id === id);
    return p ? formatPlayerNameShort(p.name) : '?';
  };
  const getPlayer = (id: string) => players.find(p => p.id === id);

  // Compute per-player totals across all sets
  const playerTotals = useMemo(() => {
    const totals = new Map<string, number>();
    results.forEach(sr => {
      const t1Ids = sr.team1;
      const t2Ids = sr.team2;
      t1Ids.forEach(id => totals.set(id, (totals.get(id) ?? 0) + sr.amountTeam1 / 2));
      t2Ids.forEach(id => totals.set(id, (totals.get(id) ?? 0) + sr.amountTeam2 / 2));
    });
    return totals;
  }, [results]);

  const toggleSet = (n: number) => setExpandedSets(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);

  return (
    <Card className="border-border">
      <CardHeader className="pb-2 px-3 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Sixes / Round Robin
          <Badge variant="secondary" className="text-[9px] ml-auto">{modeLabel(config.scoringMode)} · {cobroLabel(config.cobro)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        {results.map(sr => {
          const isExpanded = expandedSets.includes(sr.setNumber);
          const winnerLabel = sr.setWinner === 'team1' ? 'Eq.1' : sr.setWinner === 'team2' ? 'Eq.2' : 'Empate';
          return (
            <Collapsible key={sr.setNumber} open={isExpanded} onOpenChange={() => toggleSet(sr.setNumber)}>
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold">Set {sr.setNumber}</span>
                    <span className="text-[10px] text-muted-foreground">H{sr.startHole}–{sr.endHole}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px]">
                      {getName(sr.team1[0])}+{getName(sr.team1[1])} <span className="font-bold">{sr.pointsTeam1}</span>
                      {' vs '}
                      <span className="font-bold">{sr.pointsTeam2}</span> {getName(sr.team2[0])}+{getName(sr.team2[1])}
                    </span>
                    <Badge variant={sr.setWinner === 'tied' ? 'outline' : 'default'} className="text-[9px]">
                      {winnerLabel}
                    </Badge>
                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 border rounded-lg overflow-hidden">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="px-2 py-1 text-left">Hoyo</th>
                        <th className="px-2 py-1 text-center">Eq.1</th>
                        <th className="px-2 py-1 text-center">vs</th>
                        <th className="px-2 py-1 text-center">Eq.2</th>
                        <th className="px-2 py-1 text-right">Ganador</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sr.holeDetails.map(hd => (
                        <tr key={hd.holeNumber} className="border-t border-border/50">
                          <td className="px-2 py-1 font-medium">{hd.holeNumber}</td>
                          <td className={cn('px-2 py-1 text-center tabular-nums', hd.holeWinner === 'team1' && 'text-green-600 font-bold')}>
                            {hd.team1Score ?? '-'}
                          </td>
                          <td className="px-2 py-1 text-center text-muted-foreground">·</td>
                          <td className={cn('px-2 py-1 text-center tabular-nums', hd.holeWinner === 'team2' && 'text-green-600 font-bold')}>
                            {hd.team2Score ?? '-'}
                          </td>
                          <td className="px-2 py-1 text-right">
                            {hd.holeWinner === 'team1' ? '◀' : hd.holeWinner === 'team2' ? '▶' : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}

        {/* Per-player totals */}
        <div className="border-t border-border pt-2 mt-2 space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground">Saldo por jugador</p>
          <div className="grid grid-cols-2 gap-1">
            {Array.from(playerTotals.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([id, total]) => {
                const p = getPlayer(id);
                if (!p) return null;
                return (
                  <div key={id} className="flex items-center gap-1.5 p-1.5 bg-muted/20 rounded">
                    <PlayerAvatar name={p.name} initials={p.initials} background={p.color} size="xs" />
                    <span className="text-[10px] truncate flex-1">{formatPlayerNameShort(p.name)}</span>
                    <span className={cn('text-[10px] font-bold tabular-nums', total > 0 ? 'text-green-600' : total < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      {total > 0 ? '+' : ''}{total !== 0 ? `$${fmtMoney(Math.abs(total))}` : '$0'}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
