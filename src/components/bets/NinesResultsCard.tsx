import React, { useMemo, useState } from 'react';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { Player, PlayerScore, GolfCourse, NinesConfig, NinesHoleDetail, NinesPlayerSummary } from '@/types/golf';
import { buildNinesHoleDetails, calculateNinesPlayerSummaries, distributeNinesPoints } from '@/lib/bets/nines';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { formatPlayerNameShort } from '@/lib/playerInput';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';

interface NinesResultsCardProps {
  players: Player[];
  scores: Map<string, PlayerScore[]>;
  config: NinesConfig;
  course: GolfCourse;
}

/** For 4 players: rotate who sits out each hole. Sitter gets 3 pts (average). */
const buildNinesFor4Players = (
  players: Player[], scores: Map<string, PlayerScore[]>,
  config: NinesConfig, course: GolfCourse
): { summaries: NinesPlayerSummary[]; details: NinesHoleDetail[]; sitterByHole: Map<number, string> } => {
  const ids = config.playerIds;
  const allPlayers = ids.map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p);
  if (allPlayers.length !== 4) return { summaries: [], details: [], sitterByHole: new Map() };

  const totals = new Map<string, number>(ids.map(id => [id, 0]));
  const details: NinesHoleDetail[] = [];
  const sitterByHole = new Map<number, string>();

  for (let h = 1; h <= 18; h++) {
    const sitterIdx = (h - 1) % 4;
    const sitterId = ids[sitterIdx];
    sitterByHole.set(h, sitterId);
    const activeIds = ids.filter((_, i) => i !== sitterIdx);
    const activePlayers = activeIds.map(id => allPlayers.find(p => p.id === id)!);

    // Get net scores for 3 active
    const netScores = activePlayers.map(p => {
      const sp = calculateStrokesPerHole(p.handicap, course);
      const hs = (scores.get(p.id) ?? []).find(s => s.confirmed && s.holeNumber === h);
      if (!hs?.strokes) return null;
      return { id: p.id, net: hs.strokes - (sp[h - 1] ?? 0) };
    }).filter((x): x is { id: string; net: number } => x !== null);

    if (netScores.length === 3) {
      const pointsMap = distributeNinesPoints(netScores);
      pointsMap.forEach((pts, id) => totals.set(id, (totals.get(id) ?? 0) + pts));
      totals.set(sitterId, (totals.get(sitterId) ?? 0) + 3); // sitter gets average

      const sorted = [...netScores].sort((a, b) => a.net - b.net);
      const playerScores = activePlayers.map(p => {
        const sp = calculateStrokesPerHole(p.handicap, course);
        const hs = (scores.get(p.id) ?? []).find(s => s.holeNumber === h);
        const gross = hs?.strokes ?? 0;
        const strokes = sp[h - 1] ?? 0;
        const net = gross - strokes;
        const pts = (pointsMap.get(p.id) ?? 3) as 1|2|3|4|5;
        const pos = (sorted.findIndex(x => x.id === p.id) + 1) as 1|2|3;
        return { playerId: p.id, playerName: p.name, gross, strokes, net, points: pts, position: pos };
      });
      details.push({ holeNumber: h, playerScores });
    }
  }

  const summaries: NinesPlayerSummary[] = ids.map(id => {
    const p = allPlayers.find(pl => pl.id === id);
    if (!p) return null;
    return { playerId: id, playerName: p.name, playerInitials: p.initials, playerColor: p.color, totalPoints: totals.get(id) ?? 0 };
  }).filter((s): s is NinesPlayerSummary => s !== null);

  return { summaries, details, sitterByHole };
};

export const NinesResultsCard: React.FC<NinesResultsCardProps> = ({ players, scores, config, course }) => {
  const [showDetails, setShowDetails] = useState(false);

  const { summaries, details, balances } = useMemo(() => {
    let sums: NinesPlayerSummary[];
    let dets: NinesHoleDetail[];
    let sitter = new Map<number, string>();

    if (config.playerIds.length === 4) {
      const r = buildNinesFor4Players(players, scores, config, course);
      sums = r.summaries; dets = r.details; sitter = r.sitterByHole;
    } else {
      dets = buildNinesHoleDetails(players, scores, config, course);
      sums = calculateNinesPlayerSummaries(players, dets, config);
    }

    // Calculate balances: each pair settles point difference × valuePerPoint
    const bals = new Map<string, number>();
    sums.forEach(s => bals.set(s.playerId, 0));
    for (let i = 0; i < sums.length; i++) {
      for (let j = i + 1; j < sums.length; j++) {
        const diff = sums[i].totalPoints - sums[j].totalPoints;
        const amount = diff * config.valuePerPoint;
        bals.set(sums[i].playerId, (bals.get(sums[i].playerId) ?? 0) + amount);
        bals.set(sums[j].playerId, (bals.get(sums[j].playerId) ?? 0) - amount);
      }
    }

    return { summaries: sums, details: dets, balances: bals, sitterByHole: sitter };
  }, [players, scores, config, course]);

  if (!summaries.length) return null;

  const sorted = [...summaries].sort((a, b) => b.totalPoints - a.totalPoints);
  const getPlayer = (id: string) => players.find(p => p.id === id);

  return (
    <Card className="border-border">
      <CardHeader className="pb-2 px-3 pt-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          Nines / 5-3-1
          <Badge variant="secondary" className="text-[9px] ml-auto">${fmtMoney(config.valuePerPoint)}/pt</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-2">
        {/* Ranking table */}
        <div className="space-y-1">
          {sorted.map((s, idx) => {
            const p = getPlayer(s.playerId);
            if (!p) return null;
            const bal = balances.get(s.playerId) ?? 0;
            return (
              <div key={s.playerId} className="flex items-center gap-2 p-1.5 bg-muted/20 rounded">
                <span className="text-[10px] font-bold w-4 text-center text-muted-foreground">{idx + 1}</span>
                <PlayerAvatar initials={p.initials} background={p.color} size="xs" />
                <span className="text-[10px] truncate flex-1">{formatPlayerNameShort(p.name)}</span>
                <span className="text-[10px] font-bold tabular-nums w-8 text-center">{s.totalPoints}</span>
                <span className={cn('text-[10px] font-bold tabular-nums min-w-[50px] text-right',
                  bal > 0 ? 'text-green-600' : bal < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                  {bal > 0 ? '+' : ''}{bal !== 0 ? `$${fmtMoney(Math.abs(bal))}` : '$0'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Distribution formula */}
        <p className="text-[9px] text-muted-foreground text-center">
          5 mejor · 3 segundo · 1 peor · Empate top: 4-4-1 · Todos: 3-3-3
        </p>

        {/* Hole details collapsible */}
        {details.length > 0 && (
          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-center gap-1 text-[10px] text-primary hover:underline">
                Ver por hoyo {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1 border rounded-lg overflow-hidden">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="px-1.5 py-1 text-left">H</th>
                      {sorted.map(s => (
                        <th key={s.playerId} className="px-1 py-1 text-center">
                          {s.playerInitials}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {details.map(hd => (
                      <tr key={hd.holeNumber} className="border-t border-border/50">
                        <td className="px-1.5 py-0.5 font-medium">{hd.holeNumber}</td>
                        {sorted.map(s => {
                          const ps = hd.playerScores.find(p => p.playerId === s.playerId);
                          if (!ps) return <td key={s.playerId} className="px-1 py-0.5 text-center text-muted-foreground">—</td>;
                          return (
                            <td key={s.playerId} className={cn('px-1 py-0.5 text-center tabular-nums font-medium',
                              ps.points === 5 ? 'text-green-600' : ps.points === 1 ? 'text-destructive' : '')}>
                              {ps.points}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/30">
                      <td className="px-1.5 py-1 font-bold">Σ</td>
                      {sorted.map(s => (
                        <td key={s.playerId} className="px-1 py-1 text-center font-bold tabular-nums">{s.totalPoints}</td>
                      ))}
                    </tr>
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
