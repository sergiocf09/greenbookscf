import React, { useMemo, useState } from 'react';
import { Player, PlayerScore, GolfCourse, SixesConfig } from '@/types/golf';
import { buildSixesSetResults, calculateSixesBets } from '@/lib/bets/sixes';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  players, sixesConfig, scores, course, basePlayerId, onConfigureSets,
}) => {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [paymentsOpen, setPaymentsOpen] = useState(false);

  const needsConfig = !sixesConfig.sets || sixesConfig.sets.length < 3;

  // Check for empty player IDs (not yet assigned)
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
          <CardTitle className="text-sm">⛳ Sixes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 space-y-1">
              <p className="font-medium">Falta configurar jugadores</p>
              <p>Revisa la configuración de esta apuesta en la sección de Apuestas.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">⛳ Sixes</CardTitle>
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
        {needsConfig && onConfigureSets && (
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 flex-1">Las parejas no están configuradas</p>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={onConfigureSets}>
              Configurar
            </Button>
          </div>
        )}

        {setResults.map(sr => {
          const side = getTeamSide(sr);
          const key = `set${sr.setNumber}`;
          const winnerLabel = sr.setWinner === 'team1' ? `${getName(sr.team1[0])}+${getName(sr.team1[1])} ganó`
            : sr.setWinner === 'team2' ? `${getName(sr.team2[0])}+${getName(sr.team2[1])} ganó`
            : sr.setWinner === 'tied' ? 'Empate' : 'En juego';

          return (
            <Collapsible key={key} open={openSection === key} onOpenChange={o => setOpenSection(o ? key : null)}>
              <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-medium py-1">
                <span className="truncate">
                  Set {sr.setNumber} · {getName(sr.team1[0])}+{getName(sr.team1[1])} vs {getName(sr.team2[0])}+{getName(sr.team2[1])} · {winnerLabel}
                </span>
                <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', openSection === key && 'rotate-180')} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-6 gap-1 mt-1">
                  {sr.holeDetails.map(hd => {
                    const myTeamWon = side && hd.holeWinner === side;
                    const myTeamLost = side && hd.holeWinner && hd.holeWinner !== 'tied' && hd.holeWinner !== side;
                    return (
                      <Popover key={hd.holeNumber}>
                        <PopoverTrigger asChild>
                          <button className={cn(
                            'flex flex-col items-center justify-center rounded-lg p-1 h-10 text-xs border',
                            myTeamWon && 'bg-green-500/15 border-green-500/30 text-green-700',
                            myTeamLost && 'bg-red-500/15 border-red-500/30 text-red-700',
                            hd.holeWinner === 'tied' && 'bg-muted border-border text-muted-foreground',
                            !hd.holeWinner && 'bg-muted/50 border-border/50 text-muted-foreground',
                          )}>
                            <span className="font-semibold">{hd.holeNumber}</span>
                            <span className="text-[9px]">{myTeamWon ? '✅' : myTeamLost ? '❌' : '='}</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="top" className="w-[95vw] max-w-sm p-3 text-xs">
                          <div className="space-y-1.5">
                            <p className="font-semibold">Hoyo {hd.holeNumber}</p>
                            {hd.scoresByPlayer.map(s => (
                              <div key={s.playerId} className="flex items-center gap-1">
                                <Badge variant="outline" className="text-[9px] px-1">{s.teamSide === 'team1' ? 'E1' : 'E2'}</Badge>
                                <span>{s.playerName.split(' ')[0]}</span>
                                <span className="ml-auto font-mono">{s.gross}{s.strokes > 0 && ` •${s.strokes}`} → {s.net}</span>
                              </div>
                            ))}
                            {hd.lowBallWinner && <p className="text-[10px]">BB: {hd.lowBallWinner === 'team1' ? 'Equipo 1' : hd.lowBallWinner === 'team2' ? 'Equipo 2' : 'Empate'}</p>}
                            {hd.highBallWinner && <p className="text-[10px]">BA: {hd.highBallWinner === 'team1' ? 'Equipo 1' : hd.highBallWinner === 'team2' ? 'Equipo 2' : 'Empate'}</p>}
                            <p className="text-[10px]">Pts: {hd.pointsTeam1}–{hd.pointsTeam2}</p>
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

        {/* Pagos */}
        {bets.filter(b => b.amount > 0).length > 0 && (
          <Collapsible open={paymentsOpen} onOpenChange={setPaymentsOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-medium py-1 text-muted-foreground">
              <span>Pagos</span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', paymentsOpen && 'rotate-180')} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-0.5 mt-1">
                {bets.filter(b => b.amount > 0).map((b, i) => (
                  <p key={i} className="text-[11px]">{getName(b.playerId)} cobra ${fmtMoney(b.amount)} de {getName(b.vsPlayer!)}</p>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
};
