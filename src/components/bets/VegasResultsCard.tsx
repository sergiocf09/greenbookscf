import React, { useMemo, useState } from 'react';
import { Player, PlayerScore, GolfCourse, VegasConfig } from '@/types/golf';
import { buildVegasSetResults, calculateVegasBets, formVegasNumber } from '@/lib/bets/vegas';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, AlertTriangle } from 'lucide-react';

interface VegasResultsCardProps {
  players: Player[];
  vegasConfig: VegasConfig;
  scores: Map<string, PlayerScore[]>;
  course: GolfCourse;
  basePlayerId: string;
  onConfigurePlayers?: () => void;
}

export const VegasResultsCard: React.FC<VegasResultsCardProps> = ({
  players, vegasConfig, scores, course, basePlayerId,
}) => {
  const [openSection, setOpenSection] = useState<string | null>(null);

  const needsConfig = !vegasConfig.playerAId;

  const hasEmptyPlayerIds = useMemo(() => {
    const ids = [vegasConfig.playerAId, vegasConfig.playerBId, vegasConfig.playerCId, vegasConfig.playerDId];
    return ids.some(id => !id || id === '');
  }, [vegasConfig]);

  const missingPlayerIds = useMemo(() => {
    const ids = [vegasConfig.playerAId, vegasConfig.playerBId, vegasConfig.playerCId, vegasConfig.playerDId].filter(Boolean) as string[];
    return ids.filter(id => !players.find(p => p.id === id));
  }, [players, vegasConfig]);

  const setResults = useMemo(() => missingPlayerIds.length > 0 ? [] : buildVegasSetResults(players, scores, vegasConfig, course), [players, scores, vegasConfig, course, missingPlayerIds]);
  const bets = useMemo(() => missingPlayerIds.length > 0 ? [] : calculateVegasBets(players, scores, vegasConfig, course), [players, scores, vegasConfig, course, missingPlayerIds]);

  const totalBalance = bets.filter(b => b.playerId === basePlayerId).reduce((s, b) => s + b.amount, 0);
  const getName = (id: string) => players.find(p => p.id === id)?.name?.split(' ')[0] ?? '?';

  const isTeam1 = (sr: typeof setResults[0]) => sr.team1.includes(basePlayerId);

  if (missingPlayerIds.length > 0 || hasEmptyPlayerIds) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Las Vegas</CardTitle>
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

  // Accumulate front/back/total diffs per set
  const getSetAccum = (sr: typeof setResults[0]) => {
    const myTeam1 = isTeam1(sr);
    let front = 0, back = 0;
    sr.holeDetails.forEach(hd => {
      const d = myTeam1 ? hd.diff : -hd.diff;
      if (hd.holeNumber <= 9) front += d;
      else back += d;
    });
    return { front, back, total: front + back };
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Las Vegas</CardTitle>
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
        {needsConfig && (
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 flex-1">Jugadores A/B/C/D no asignados</p>
          </div>
        )}

        {setResults.map((sr, idx) => {
          const key = sr.setNumber ? `set${sr.setNumber}` : 'all';
          const myTeam1 = isTeam1(sr);
          const myTeam = myTeam1 ? sr.team1 : sr.team2;
          const rivalTeam = myTeam1 ? sr.team2 : sr.team1;
          const accum = getSetAccum(sr);
          const holesCount = sr.endHole - sr.startHole + 1;

          return (
            <Collapsible key={key} open={openSection === key} onOpenChange={o => setOpenSection(o ? key : null)}>
              <CollapsibleTrigger className="flex items-center justify-between w-full py-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {sr.setNumber && <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">H{sr.startHole}–{sr.endHole}</Badge>}
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
                    accum.total > 0 ? 'text-green-600' :
                    accum.total < 0 ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {accum.total > 0 ? '+' : ''}{accum.total}
                  </span>
                  <ChevronDown className={cn('h-3 w-3 transition-transform', openSection === key && 'rotate-180')} />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {/* Front / Back / Total summary */}
                {holesCount > 9 && (
                  <div className="grid grid-cols-3 gap-1 text-center text-[10px] tabular-nums mb-1">
                    <span className={cn('font-semibold', accum.front > 0 ? 'text-green-600' : accum.front < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      F9 {accum.front > 0 ? '+' : ''}{accum.front}
                    </span>
                    <span className={cn('font-semibold', accum.back > 0 ? 'text-green-600' : accum.back < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      B9 {accum.back > 0 ? '+' : ''}{accum.back}
                    </span>
                    <span className={cn('font-bold', accum.total > 0 ? 'text-green-600' : accum.total < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      T {accum.total > 0 ? '+' : ''}{accum.total}
                    </span>
                  </div>
                )}
                <div className={cn('grid gap-1 mt-1', holesCount <= 6 ? 'grid-cols-6' : 'grid-cols-9')}>
                  {sr.holeDetails.map(hd => {
                    const myDiff = myTeam1 ? hd.diff : -hd.diff;
                    const pill = (
                      <div className={cn(
                        'flex flex-col items-center justify-center rounded-lg p-1 h-12 text-xs border cursor-pointer',
                        myDiff > 0 && 'bg-green-500/15 border-green-500/30 text-green-700',
                        myDiff < 0 && 'bg-red-500/15 border-red-500/30 text-red-700',
                        myDiff === 0 && 'bg-muted border-border text-muted-foreground',
                      )}>
                        <span className="font-semibold">{hd.holeNumber}</span>
                        <span className="text-[8px] font-mono">{myDiff > 0 ? '+' : ''}{myDiff}</span>
                      </div>
                    );

                    // Side-by-side popover
                    const myNum = myTeam1 ? hd.numberTeam1 : hd.numberTeam2;
                    const rvNum = myTeam1 ? hd.numberTeam2 : hd.numberTeam1;
                    const myNumEff = myTeam1
                      ? (hd.multiplierApplied === 'team1' ? hd.numberTeam1Effective : hd.numberTeam1)
                      : (hd.multiplierApplied === 'team2' ? hd.numberTeam2Effective : hd.numberTeam2);
                    const rvNumEff = myTeam1
                      ? (hd.multiplierApplied === 'team2' ? hd.numberTeam2Effective : hd.numberTeam2)
                      : (hd.multiplierApplied === 'team1' ? hd.numberTeam1Effective : hd.numberTeam1);

                    return (
                      <Popover key={hd.holeNumber}>
                        <PopoverTrigger asChild>{pill}</PopoverTrigger>
                        <PopoverContent side="top" className="w-[95vw] max-w-sm p-3 text-xs">
                          <p className="font-semibold mb-2">Hoyo {hd.holeNumber}</p>
                          <div className="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-1 items-center">
                            <span className="text-[10px] text-muted-foreground font-medium">Tu equipo</span>
                            <span></span>
                            <span className="text-[10px] text-muted-foreground font-medium text-right">Rival</span>
                            {/* Player scores */}
                            {[0, 1].map(i => {
                              const myPid = myTeam[i];
                              const rvPid = rivalTeam[i];
                              const myS = hd.netA !== undefined && i === 0 ? (myTeam1 ? hd.netA : hd.netC) : (myTeam1 ? hd.netB : hd.netD);
                              const rvS = i === 0 ? (myTeam1 ? hd.netC : hd.netA) : (myTeam1 ? hd.netD : hd.netB);
                              return (
                                <React.Fragment key={i}>
                                  <div className="flex items-center gap-1">
                                    <span className="truncate">{getName(myPid)}</span>
                                  </div>
                                  <div className="flex items-center gap-1 justify-center">
                                    <span className="font-mono font-bold tabular-nums text-[11px]">{myS}</span>
                                    <span className="text-muted-foreground">–</span>
                                    <span className="font-mono font-bold tabular-nums text-[11px]">{rvS}</span>
                                  </div>
                                  <div className="flex items-center gap-1 justify-end">
                                    <span className="truncate text-right">{getName(rvPid)}</span>
                                  </div>
                                </React.Fragment>
                              );
                            })}
                          </div>
                          {/* Vegas numbers */}
                          <div className="mt-2 pt-1 border-t border-border/50 space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] text-muted-foreground">Número</span>
                              <div className="flex items-center gap-2">
                                <span className={cn('font-mono font-bold tabular-nums px-1.5 py-0.5 rounded text-[11px]', myDiff > 0 && 'bg-foreground text-background')}>
                                  {myNumEff}
                                </span>
                                <span className="text-muted-foreground">vs</span>
                                <span className={cn('font-mono font-bold tabular-nums px-1.5 py-0.5 rounded text-[11px]', myDiff < 0 && 'bg-foreground text-background')}>
                                  {rvNumEff}
                                </span>
                              </div>
                            </div>
                            {hd.multiplierApplied !== 'none' && (
                              <p className="text-[10px] text-amber-600">🐦 Birdie → ×2 ({hd.multiplierApplied === (myTeam1 ? 'team1' : 'team2') ? 'Tu equipo' : 'Rival'})</p>
                            )}
                            <div className="flex justify-between text-[10px]">
                              <span>Diferencia</span>
                              <span className={cn('font-bold', myDiff > 0 ? 'text-green-600' : myDiff < 0 ? 'text-destructive' : '')}>
                                {myDiff > 0 ? '+' : ''}{myDiff} → ${fmtMoney(hd.amountThisHole)}
                              </span>
                            </div>
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
