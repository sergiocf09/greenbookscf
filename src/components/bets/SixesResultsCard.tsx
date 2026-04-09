import React, { useMemo, useState } from 'react';
import { Player, PlayerScore, GolfCourse, SixesConfig } from '@/types/golf';
import { buildSixesSetResults, calculateSixesBets } from '@/lib/bets/sixes';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, AlertTriangle } from 'lucide-react';

interface SixesResultsCardProps {
  players: Player[];
  sixesConfig: SixesConfig;
  scores: Map<string, PlayerScore[]>;
  course: GolfCourse;
  basePlayerId: string;
  onConfigureSets?: () => void;
}

export const SixesResultsCard: React.FC<SixesResultsCardProps> = ({
  players, sixesConfig, scores, course, basePlayerId,
}) => {
  const [openSection, setOpenSection] = useState<string | null>(null);

  const needsConfig = !sixesConfig.sets || sixesConfig.sets.length < 3;

  const hasEmptyPlayerIds = useMemo(() => {
    if (!sixesConfig.sets) return true;
    return sixesConfig.sets.some(s =>
      [...s.team1, ...s.team2].some(id => !id || id === '')
    );
  }, [sixesConfig.sets]);

  const missingPlayerIds = useMemo(() => {
    if (!sixesConfig.sets) return [];
    const referencedIds = new Set<string>();
    for (const s of sixesConfig.sets) {
      [...s.team1, ...s.team2].forEach(id => { if (id) referencedIds.add(id); });
    }
    return [...referencedIds].filter(id => !players.find(p => p.id === id));
  }, [players, sixesConfig.sets]);

  const setResults = useMemo(() => missingPlayerIds.length > 0 ? [] : buildSixesSetResults(players, scores, sixesConfig, course), [players, scores, sixesConfig, course, missingPlayerIds]);
  const bets = useMemo(() => missingPlayerIds.length > 0 ? [] : calculateSixesBets(players, scores, sixesConfig, course), [players, scores, sixesConfig, course, missingPlayerIds]);

  const totalBalance = bets.filter(b => b.playerId === basePlayerId).reduce((s, b) => s + b.amount, 0);
  const getName = (id: string) => players.find(p => p.id === id)?.name?.split(' ')[0] ?? '?';

  const getTeamSide = (setResult: typeof setResults[0]) => {
    if (setResult.team1.includes(basePlayerId)) return 'team1';
    if (setResult.team2.includes(basePlayerId)) return 'team2';
    return null;
  };

  if (missingPlayerIds.length > 0 || hasEmptyPlayerIds || needsConfig) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sixes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 space-y-1">
               <p className="font-medium">Agregar jugadores faltantes</p>
               <p>Revisa la configuración en la sección de Apuestas.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const SET_LABELS: Record<number, string> = { 1: '1–6', 2: '7–12', 3: '13–18' };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Sixes</CardTitle>
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
      <CardContent className="space-y-2">
        {setResults.map(sr => {
          const side = getTeamSide(sr);
          const key = `set${sr.setNumber}`;
          const myTeam = side === 'team1' ? sr.team1 : sr.team2;
          const rivalTeam = side === 'team1' ? sr.team2 : sr.team1;
          const myPoints = sr.holeDetails.reduce((s, h) => s + (side === 'team1' ? h.pointsTeam1 : h.pointsTeam2), 0);
          const rivalPoints = sr.holeDetails.reduce((s, h) => s + (side === 'team1' ? h.pointsTeam2 : h.pointsTeam1), 0);

          return (
            <Collapsible key={key} open={openSection === key} onOpenChange={o => setOpenSection(o ? key : null)}>
              <CollapsibleTrigger className="flex items-center justify-between w-full py-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{SET_LABELS[sr.setNumber] ?? sr.setNumber}</Badge>
                  <span className="text-xs font-medium truncate">
                    {getName(myTeam[0])} / {getName(myTeam[1])}
                  </span>
                  <span className="text-[10px] text-muted-foreground">vs</span>
                  <span className="text-xs font-medium truncate">
                    {getName(rivalTeam[0])} / {getName(rivalTeam[1])}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  <span className={cn('text-xs font-bold tabular-nums',
                    myPoints > rivalPoints ? 'text-green-600' :
                    myPoints < rivalPoints ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {myPoints}–{rivalPoints}
                  </span>
                  <ChevronDown className={cn('h-3 w-3 transition-transform', openSection === key && 'rotate-180')} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-6 gap-1 mt-1">
                  {sr.holeDetails.map(hd => {
                    const myTeamWon = side && hd.holeWinner === side;
                    const myTeamLost = side && hd.holeWinner && hd.holeWinner !== 'tied' && hd.holeWinner !== side;

                    const pill = (
                      <div className={cn(
                        'flex flex-col items-center justify-center rounded-lg p-1 h-10 text-xs border cursor-pointer',
                        myTeamWon && 'bg-green-500/15 border-green-500/30 text-green-700',
                        myTeamLost && 'bg-red-500/15 border-red-500/30 text-red-700',
                        hd.holeWinner === 'tied' && 'bg-muted border-border text-muted-foreground',
                        !hd.holeWinner && 'bg-muted/50 border-border/50 text-muted-foreground',
                      )}>
                        <span className="font-semibold">{hd.holeNumber}</span>
                        <span className="text-[9px]">{myTeamWon ? '✅' : myTeamLost ? '❌' : '='}</span>
                      </div>
                    );

                    if (!hd.holeWinner) return <div key={hd.holeNumber}>{pill}</div>;

                    // Side-by-side popover like Carritos
                    const myScores = hd.scoresByPlayer.filter(s => myTeam.includes(s.playerId));
                    const rivalScores = hd.scoresByPlayer.filter(s => rivalTeam.includes(s.playerId));

                    return (
                      <Popover key={hd.holeNumber}>
                        <PopoverTrigger asChild>{pill}</PopoverTrigger>
                        <PopoverContent side="top" className="w-[95vw] max-w-sm p-3 text-xs">
                          <p className="font-semibold mb-2">Hoyo {hd.holeNumber}</p>
                          <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-1 items-center">
                            {/* Header */}
                            <span className="text-[10px] text-muted-foreground font-medium">Tu equipo</span>
                            <span></span>
                            <span className="text-[10px] text-muted-foreground font-medium text-right">Rival</span>
                            {/* Players */}
                            {[0, 1].map(i => {
                              const my = myScores[i];
                              const rv = rivalScores[i];
                              if (!my || !rv) return null;
                              const myDisplay = my.gross > 0 ? my.net : '–';
                              const rvDisplay = rv.gross > 0 ? rv.net : '–';
                              const myWins = typeof myDisplay === 'number' && typeof rvDisplay === 'number' && myDisplay < rvDisplay;
                              const rvWins = typeof myDisplay === 'number' && typeof rvDisplay === 'number' && rvDisplay < myDisplay;
                              return (
                                <React.Fragment key={i}>
                                  <div className="flex items-center gap-1">
                                    <span className="truncate">{my.playerName.split(' ')[0]}</span>
                                    {my.strokes > 0 && <span className="text-[9px] text-muted-foreground">({my.gross})</span>}
                                  </div>
                                  <div className="flex items-center gap-1 justify-center">
                                    <span className={cn('font-mono font-bold tabular-nums px-1.5 py-0.5 rounded text-[11px]', myWins && 'bg-foreground text-background')}>
                                      {myDisplay}
                                    </span>
                                    <span className="text-muted-foreground">–</span>
                                    <span className={cn('font-mono font-bold tabular-nums px-1.5 py-0.5 rounded text-[11px]', rvWins && 'bg-foreground text-background')}>
                                      {rvDisplay}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 justify-end">
                                    {rv.strokes > 0 && <span className="text-[9px] text-muted-foreground">({rv.gross})</span>}
                                    <span className="truncate text-right">{rv.playerName.split(' ')[0]}</span>
                                  </div>
                                </React.Fragment>
                              );
                            })}
                          </div>
                          <div className="mt-2 pt-1 border-t border-border/50 flex justify-between text-[10px]">
                            {hd.lowBallWinner && <span>BB: {hd.lowBallWinner === side ? 'Tu equipo' : hd.lowBallWinner === 'tied' ? 'Empate' : 'Rival'}</span>}
                            {hd.highBallWinner && <span>BA: {hd.highBallWinner === side ? 'Tu equipo' : hd.highBallWinner === 'tied' ? 'Empate' : 'Rival'}</span>}
                            <span className="font-medium">Pts: {side === 'team1' ? hd.pointsTeam1 : hd.pointsTeam2}–{side === 'team1' ? hd.pointsTeam2 : hd.pointsTeam1}</span>
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
};
