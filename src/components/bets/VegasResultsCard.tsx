import React, { useMemo, useState } from 'react';
import { Player, PlayerScore, GolfCourse, VegasConfig } from '@/types/golf';
import { disambiguateInitials, formatPlayerName } from '@/lib/playerInput';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { buildVegasSetResults, calculateVegasBets, formVegasNumber } from '@/lib/bets/vegas';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Users, XCircle, CheckCircle, ChevronDown, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VegasResultsCardProps {
  players: Player[];
  vegasConfig: VegasConfig;
  scores: Map<string, PlayerScore[]>;
  course: GolfCourse;
  basePlayerId: string;
  isDisabled?: boolean;
  onToggleDisabled?: () => void;
  onConfigurePlayers?: () => void;
}

export const VegasResultsCard: React.FC<VegasResultsCardProps> = ({
  players, vegasConfig, scores, course, basePlayerId, isDisabled, onToggleDisabled,
}) => {
  const [detailOpen, setDetailOpen] = useState(false);

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
  const getFullName = (id: string) => formatPlayerName(players.find(p => p.id === id)?.name ?? '?');
  const disambiguated = useMemo(() => disambiguateInitials(players), [players]);

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

  const getNetTone = (n: number) => (n > 0 ? 'text-green-600' : n < 0 ? 'text-destructive' : 'text-muted-foreground');

  // Use first set for team names (fixed variant)
  const sr0 = setResults[0];
  if (!sr0) return null;
  const isRotating = vegasConfig.variant === 'rotating' && setResults.length === 3;
  const myTeam1 = isTeam1(sr0);
  const myTeam = myTeam1 ? sr0.team1 : sr0.team2;
  const rivalTeam = myTeam1 ? sr0.team2 : sr0.team1;
  const accum = getSetAccum(sr0);

  // Participating player IDs and ranking
  const participantIds = useMemo(() => {
    const ids = new Set<string>();
    [vegasConfig.playerAId, vegasConfig.playerBId, vegasConfig.playerCId, vegasConfig.playerDId]
      .filter(Boolean).forEach(id => ids.add(id!));
    return ids;
  }, [vegasConfig]);

  const playerRanking = useMemo(() => {
    const balances = new Map<string, number>();
    participantIds.forEach(id => balances.set(id, 0));
    bets.forEach(b => {
      if (participantIds.has(b.playerId)) {
        balances.set(b.playerId, (balances.get(b.playerId) || 0) + b.amount);
      }
    });
    return [...balances.entries()]
      .map(([id, bal]) => ({ id, name: getFullName(id), balance: bal }))
      .sort((a, b) => b.balance - a.balance);
  }, [bets, participantIds]);

  return (
    <Card className={cn('border-accent/50', isDisabled && 'opacity-50')}>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Las Vegas
          </div>
          <div className="flex items-center gap-2">
            {isDisabled ? (
              <div className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Cancelada</div>
            ) : !isRotating ? (
              <span className={cn('text-base font-bold tabular-nums', getNetTone(totalBalance))}>
                {totalBalance >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(totalBalance))}
              </span>
            ) : null}
            {onToggleDisabled && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-6 w-6', isDisabled ? 'text-green-600 hover:text-green-700' : 'text-muted-foreground hover:text-destructive')}
                onClick={onToggleDisabled}
                title={isDisabled ? 'Reactivar Vegas' : 'No considerar Vegas'}
              >
                {isDisabled ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {isRotating ? (
          /* ── Rotating variant: 3-column Sixes-style layout ── */
          <>
            <Collapsible open={detailOpen} onOpenChange={setDetailOpen}>
              <div className="flex items-center justify-between">
                <div className="grid grid-cols-3 gap-1 flex-1 text-center">
                  {setResults.map(sr => {
                    const myT1 = isTeam1(sr);
                    const acc = getSetAccum(sr);
                    return (
                      <div key={sr.setNumber} className="text-[10px]">
                        <div className="font-semibold text-primary">H{sr.startHole}–{sr.endHole}</div>
                        <div className="text-[9px] text-muted-foreground truncate">
                          {getName(sr.team1[0])}/{getName(sr.team1[1])}
                        </div>
                        <div className="text-[9px] text-muted-foreground truncate">
                          vs {getName(sr.team2[0])}/{getName(sr.team2[1])}
                        </div>
                        <span className={cn('font-bold tabular-nums text-xs', getNetTone(acc.total))}>
                          {acc.total > 0 ? '+' : ''}{acc.total}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                    <ChevronDown className={cn('h-4 w-4 transition-transform', detailOpen && 'rotate-180')} />
                    <span className="sr-only">Ver detalle</span>
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent className="mt-2 space-y-2">
                {setResults.map((sr) => {
                  const myT1 = isTeam1(sr);
                  const srMyTeam = myT1 ? sr.team1 : sr.team2;
                  const srRivalTeam = myT1 ? sr.team2 : sr.team1;
                  return (
                    <div key={sr.setNumber} className="bg-muted/30 rounded-lg p-2 space-y-1">
                      <div className="text-[10px] font-semibold text-primary text-center">
                        Set {sr.setNumber} · H{sr.startHole}–{sr.endHole}: {getName(sr.team1[0])}/{getName(sr.team1[1])} vs {getName(sr.team2[0])}/{getName(sr.team2[1])}
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {sr.holeDetails.map(hd => {
                          const myDiff = myT1 ? hd.diff : -hd.diff;
                          return renderHolePill(hd, myDiff, myT1, srMyTeam, srRivalTeam, getName, vegasConfig);
                        })}
                      </div>
                    </div>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>

            {/* Per-player ranking for rotating variant */}
            <div className="border-t border-border/50 pt-2 space-y-0.5">
              {playerRanking.map(pr => {
                const p = players.find(x => x.id === pr.id);
                return (
                  <div key={pr.id} className="flex items-center gap-2 justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {p && <PlayerAvatar initials={disambiguated.get(pr.id) || p.initials} background={p.color} size="xs" />}
                      <span className={cn('truncate', pr.id === basePlayerId && 'font-semibold')}>{pr.name}</span>
                    </div>
                    <span className={cn('font-bold tabular-nums shrink-0', getNetTone(pr.balance))}>
                      {pr.balance >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(pr.balance))}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* ── Fixed variant: original single-pair layout ── */
          <>
            {/* Team names row */}
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium truncate">
                {getName(myTeam[0])} / {getName(myTeam[1])}
              </span>
              <span className="text-muted-foreground text-xs mx-2">vs</span>
              <span className="font-medium truncate text-right">
                {getName(rivalTeam[0])} / {getName(rivalTeam[1])}
              </span>
            </div>

            {/* Collapsible detail */}
            <Collapsible open={detailOpen} onOpenChange={setDetailOpen}>
              <div className="flex items-center gap-2">
                <div className="flex-1 grid grid-cols-3 gap-1 text-center text-sm tabular-nums">
                  <span className={cn('font-semibold', getNetTone(accum.front))}>
                    F9 {accum.front > 0 ? '+' : ''}{accum.front}
                  </span>
                  <span className={cn('font-semibold', getNetTone(accum.back))}>
                    B9 {accum.back > 0 ? '+' : ''}{accum.back}
                  </span>
                  <span className={cn('font-bold', getNetTone(accum.total))}>
                    T {accum.total > 0 ? '+' : ''}{accum.total}
                  </span>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                    <ChevronDown className={cn('h-4 w-4 transition-transform', detailOpen && 'rotate-180')} />
                    <span className="sr-only">Ver detalle</span>
                  </Button>
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent className="mt-2">
                {setResults.map((sr) => {
                  const myT1 = isTeam1(sr);
                  
                  return (
                    <div key={sr.setNumber || 'all'} className="bg-muted/30 rounded-lg p-2 space-y-1">
                      <div className="text-[10px] text-muted-foreground text-center">
                        Toca en un hoyo para ver el desglose
                      </div>
                      <div className={cn('grid gap-1', 'grid-cols-9')}>
                        {/* Front 9 */}
                        {sr.holeDetails.filter(hd => hd.holeNumber <= 9).map(hd => {
                          const myDiff = myT1 ? hd.diff : -hd.diff;
                          return renderHolePill(hd, myDiff, myT1, myTeam, rivalTeam, getName, vegasConfig);
                        })}
                      </div>
                      {sr.holeDetails.some(hd => hd.holeNumber > 9) && (
                        <div className="grid grid-cols-9 gap-1 mt-1">
                          {sr.holeDetails.filter(hd => hd.holeNumber > 9).map(hd => {
                            const myDiff = myT1 ? hd.diff : -hd.diff;
                            return renderHolePill(hd, myDiff, myT1, myTeam, rivalTeam, getName, vegasConfig);
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  );
};

function renderHolePill(
  hd: any,
  myDiff: number,
  myTeam1: boolean,
  myTeam: string[],
  rivalTeam: string[],
  getName: (id: string) => string,
  vegasConfig: VegasConfig,
) {
  const pill = (
    <div className={cn(
      'flex flex-col items-center justify-center rounded-lg p-0.5 h-10 text-xs border cursor-pointer',
      myDiff > 0 && 'bg-green-500/15 border-green-500/30 text-green-700',
      myDiff < 0 && 'bg-red-500/15 border-red-500/30 text-red-700',
      myDiff === 0 && 'bg-muted border-border text-muted-foreground',
    )}>
      <span className="text-[8px] text-muted-foreground">{hd.holeNumber}</span>
      <span className="text-[10px] font-bold tabular-nums">{myDiff > 0 ? '+' : ''}{myDiff}</span>
    </div>
  );

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
          {[0, 1].map(i => {
            const myPid = myTeam[i];
            const rvPid = rivalTeam[i];
            const myS = hd.netA !== undefined && i === 0 ? (myTeam1 ? hd.netA : hd.netC) : (myTeam1 ? hd.netB : hd.netD);
            const rvS = i === 0 ? (myTeam1 ? hd.netC : hd.netA) : (myTeam1 ? hd.netD : hd.netB);
            const myStrokes = i === 0 ? (myTeam1 ? hd.strokesA : hd.strokesC) : (myTeam1 ? hd.strokesB : hd.strokesD);
            const rvStrokes = i === 0 ? (myTeam1 ? hd.strokesC : hd.strokesA) : (myTeam1 ? hd.strokesD : hd.strokesB);
            return (
              <React.Fragment key={i}>
                <div className="flex items-center gap-1">
                  <span className="truncate">{getName(myPid)}</span>
                  {myStrokes > 0 && <span className="text-[9px]">●</span>}
                </div>
                <div className="flex items-center gap-1 justify-center">
                  <span className="font-mono font-bold tabular-nums text-[11px]">{myS}</span>
                  <span className="text-muted-foreground">–</span>
                  <span className="font-mono font-bold tabular-nums text-[11px]">{rvS}</span>
                </div>
                <div className="flex items-center gap-1 justify-end">
                  {rvStrokes > 0 && <span className="text-[9px]">●</span>}
                  <span className="truncate text-right">{getName(rvPid)}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
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
}
