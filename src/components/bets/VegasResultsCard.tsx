import React, { useMemo, useState } from 'react';
import { Player, PlayerScore, GolfCourse, VegasConfig } from '@/types/golf';
import { disambiguateInitials, disambiguateShortNames, formatPlayerName } from '@/lib/playerInput';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { buildVegasSetResults, calculateVegasBets, formVegasNumber } from '@/lib/bets/vegas';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Users, XCircle, CheckCircle, ChevronDown, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TeamBetHandicapInfo } from './TeamBetHandicapInfo';


interface VegasResultsCardProps {
  players: Player[];
  vegasConfig: VegasConfig;
  scores: Map<string, PlayerScore[]>;
  course: GolfCourse;
  basePlayerId: string;
  isDisabled?: boolean;
  onToggleDisabled?: () => void;
  onConfigurePlayers?: () => void;
  startingHole?: 1 | 10;
}

export const VegasResultsCard: React.FC<VegasResultsCardProps> = ({
  players, vegasConfig, scores, course, basePlayerId, isDisabled, onToggleDisabled, startingHole = 1,
}) => {
  const [detailOpen, setDetailOpen] = useState(false);
  const [expandedSet, setExpandedSet] = useState<number | null>(null);

  const needsConfig = !vegasConfig.playerAId;

  const hasEmptyPlayerIds = useMemo(() => {
    const ids = [vegasConfig.playerAId, vegasConfig.playerBId, vegasConfig.playerCId, vegasConfig.playerDId];
    return ids.some(id => !id || id === '');
  }, [vegasConfig]);

  const missingPlayerIds = useMemo(() => {
    const ids = [vegasConfig.playerAId, vegasConfig.playerBId, vegasConfig.playerCId, vegasConfig.playerDId].filter(Boolean) as string[];
    return ids.filter(id => !players.find(p => p.id === id));
  }, [players, vegasConfig]);

  const setResults = useMemo(() => missingPlayerIds.length > 0 ? [] : buildVegasSetResults(players, scores, vegasConfig, course, vegasConfig.teamHandicaps, startingHole), [players, scores, vegasConfig, course, missingPlayerIds, startingHole]);
  const bets = useMemo(() => missingPlayerIds.length > 0 ? [] : calculateVegasBets(players, scores, vegasConfig, course, vegasConfig.teamHandicaps, startingHole), [players, scores, vegasConfig, course, missingPlayerIds, startingHole]);

  const totalBalance = bets.filter(b => b.playerId === basePlayerId).reduce((s, b) => s + b.amount, 0);
  const shortNames = useMemo(() => disambiguateShortNames(players), [players]);
  const getShortName = (id: string) => shortNames.get(id) ?? players.find(p => p.id === id)?.name?.split(' ')[0] ?? '?';
  const getFullName = (id: string) => formatPlayerName(players.find(p => p.id === id)?.name ?? '?');
  const disambiguated = useMemo(() => disambiguateInitials(players), [players]);

  const isTeam1 = (sr: typeof setResults[0]) => sr.team1.includes(basePlayerId);

  const hcpSegments = useMemo(() => {
    const pick = (ids: string[]) => ids.map(id => players.find(p => p.id === id)).filter((p): p is typeof players[number] => !!p);
    const order = startingHole === 10
      ? [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    const ids = [vegasConfig.playerAId, vegasConfig.playerBId, vegasConfig.playerCId, vegasConfig.playerDId];
    if (ids.some(id => !id)) return [];
    if (vegasConfig.variant === 'fixed') {
      const teamA = pick([ids[0]!, ids[1]!]);
      const teamB = pick([ids[2]!, ids[3]!]);
      if (!teamA.length || !teamB.length) return [];
      return [
        { label: 'Primera vuelta', holes: order.slice(0, 9), teamA, teamB, teamALabel: 'Equipo 1', teamBLabel: 'Equipo 2' },
        { label: 'Segunda vuelta', holes: order.slice(9, 18), teamA, teamB, teamALabel: 'Equipo 1', teamBLabel: 'Equipo 2' },
      ];
    }
    const rotation: Array<[[number, number], [number, number]]> = [
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
      [[0, 3], [1, 2]],
    ];
    return rotation
      .map(([a, b], i) => {
        const teamA = pick([ids[a[0]]!, ids[a[1]]!]);
        const teamB = pick([ids[b[0]]!, ids[b[1]]!]);
        if (!teamA.length || !teamB.length) return null;
        return {
          label: `Tramo ${i + 1}`,
          holes: order.slice(i * 6, i * 6 + 6),
          teamA,
          teamB,
          teamALabel: 'Equipo 1',
          teamBLabel: 'Equipo 2',
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [players, vegasConfig, startingHole]);


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

  const sr0 = setResults[0];
  if (!sr0) return null;
  const isRotating = vegasConfig.variant === 'rotating' && setResults.length === 3;
  const myTeam1Fixed = isTeam1(sr0);
  const myTeam = myTeam1Fixed ? sr0.team1 : sr0.team2;
  const rivalTeam = myTeam1Fixed ? sr0.team2 : sr0.team1;
  const accum = getSetAccum(sr0);

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

  const SET_LABELS: Record<number, string> = { 1: '1–6', 2: '7–12', 3: '13–18' };

  const vegasVariantLabel = vegasConfig.variant === 'fixed' ? 'Parejas Fijas' : 'Rotatoria';
  const vegasSummary = [
    vegasVariantLabel,
    vegasConfig.useHandicap ? 'Con Hándicap' : 'Sin Hándicap',
    vegasConfig.birdieMultiplier ? 'Birdie ×2' : null,
    `$${fmtMoney(vegasConfig.valuePerPoint)}/pto`,
  ].filter(Boolean).join(' · ');

  return (
    <Card className={cn('border-accent/50', isDisabled && 'opacity-50')}>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            Las Vegas
            <TeamBetHandicapInfo
              players={players.filter(p => [vegasConfig.playerAId, vegasConfig.playerBId, vegasConfig.playerCId, vegasConfig.playerDId].includes(p.id))}
              effectiveHandicaps={vegasConfig.teamHandicaps}
              handicapConfig={vegasConfig.handicapConfig}
              useHandicap={vegasConfig.useHandicap}
              title="Las Vegas — Hándicaps"
              modalityLine={vegasSummary}
              course={course}
              segments={hcpSegments}
              note={vegasConfig.variant === 'fixed'
                ? 'Las parejas son fijas las 18 hoyos; los golpes caen según el índice del campo, por eso cada vuelta puede tener ventajas distintas.'
                : 'Las parejas rotan por tramo de 6 hoyos. El total de golpes de cada jugador no cambia, pero los golpes caen según el índice del campo, por lo que cada tramo puede tener ventajas distintas.'}
            />

          </div>

          <div className="flex items-center gap-2">
          {isDisabled ? (
              <div className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Cancelada</div>
            ) : (
              <span className={cn('text-base font-bold tabular-nums', getNetTone(totalBalance))}>
                {totalBalance >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(totalBalance))}
              </span>
            )}
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
        <p className="text-[10px] text-muted-foreground">{vegasSummary}</p>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {isRotating ? (
          /* ── Rotating variant: 3 clickable blocks (like Sixes) ── */
          <>
            <div className="grid grid-cols-3 gap-1.5 -mx-1">
              {setResults.map(sr => {
                const myT1 = isTeam1(sr);
                const srMyTeam = myT1 ? sr.team1 : sr.team2;
                const srRivalTeam = myT1 ? sr.team2 : sr.team1;
                const acc = getSetAccum(sr);
                const isExpanded = expandedSet === sr.setNumber;

                return (
                  <button
                    key={sr.setNumber}
                    className={cn(
                      'rounded-lg border px-1.5 py-2 text-left transition-colors w-full',
                      isExpanded ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/30',
                    )}
                    onClick={() => setExpandedSet(isExpanded ? null : sr.setNumber)}
                  >
                     <div className="text-[11px] text-muted-foreground font-medium text-center mb-1">
                       H{SET_LABELS[sr.setNumber]}
                     </div>
                     <div className="flex items-center justify-center gap-1">
                       <div className="flex flex-col items-start">
                         <span className="text-xs font-bold">{disambiguated.get(srMyTeam[0]) ?? '?'}</span>
                         <span className="text-xs font-bold">{disambiguated.get(srMyTeam[1]) ?? '?'}</span>
                       </div>
                       <span className="text-[9px] text-muted-foreground">vs</span>
                       <div className="flex flex-col items-end">
                         <span className="text-xs font-bold">{disambiguated.get(srRivalTeam[0]) ?? '?'}</span>
                         <span className="text-xs font-bold">{disambiguated.get(srRivalTeam[1]) ?? '?'}</span>
                       </div>
                     </div>
                     <div className={cn('text-center font-extrabold text-base tabular-nums mt-1', getNetTone(acc.total))}>
                       {acc.total > 0 ? '+' : ''}{acc.total}
                     </div>
                  </button>
                );
              })}
            </div>

            {/* Expanded set detail */}
            {expandedSet !== null && (() => {
              const sr = setResults.find(s => s.setNumber === expandedSet);
              if (!sr) return null;
              const myT1 = isTeam1(sr);
              const srMyTeam = myT1 ? sr.team1 : sr.team2;
              const srRivalTeam = myT1 ? sr.team2 : sr.team1;

              return (
                <div className="bg-muted/30 rounded-lg p-2 space-y-1">
                  <div className="text-[10px] text-muted-foreground text-center mb-1">
                    Set H{SET_LABELS[sr.setNumber]} · Toca en un hoyo para ver detalle
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {sr.holeDetails.map(hd => {
                      const myDiff = myT1 ? hd.diff : -hd.diff;
                      return renderHolePill(hd, myDiff, myT1, srMyTeam, srRivalTeam, getShortName, vegasConfig);
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Per-player ranking for rotating variant */}
            <div className="border-t border-border/50 pt-2 space-y-0.5">
              {playerRanking.map(pr => {
                const p = players.find(x => x.id === pr.id);
                return (
                  <div key={pr.id} className="flex items-center gap-2 justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {p && <PlayerAvatar initials={disambiguated.get(pr.id) || p.initials} background={p.color} size="xs" isLoggedInUser={pr.id === basePlayerId} />}
                      <span className={cn('truncate', pr.id === basePlayerId && 'font-semibold')}>{pr.name}</span>
                    </div>
                    <span className={cn('font-bold tabular-nums shrink-0 text-sm', getNetTone(pr.balance))}>
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
                {getShortName(myTeam[0])} / {getShortName(myTeam[1])}
              </span>
              <span className="text-muted-foreground text-xs mx-2">vs</span>
              <span className="font-medium truncate text-right">
                {getShortName(rivalTeam[0])} / {getShortName(rivalTeam[1])}
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
                          return renderHolePill(hd, myDiff, myT1, myTeam, rivalTeam, getShortName, vegasConfig);
                        })}
                      </div>
                      {sr.holeDetails.some(hd => hd.holeNumber > 9) && (
                        <div className="grid grid-cols-9 gap-1 mt-1">
                          {sr.holeDetails.filter(hd => hd.holeNumber > 9).map(hd => {
                            const myDiff = myT1 ? hd.diff : -hd.diff;
                            return renderHolePill(hd, myDiff, myT1, myTeam, rivalTeam, getShortName, vegasConfig);
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
  getShortName: (id: string) => string,
  vegasConfig: VegasConfig,
) {
  const pill = (
    <div className={cn(
      'flex flex-col items-center justify-center rounded-lg p-0.5 h-10 text-xs border cursor-pointer',
      myDiff > 0 && 'bg-green-500/15 border-green-500/30 text-green-700',
      myDiff < 0 && 'bg-red-500/15 border-red-500/30 text-red-700',
      myDiff === 0 && 'bg-muted border-border text-muted-foreground',
    )}>
       <span className="text-[10px] text-muted-foreground">{hd.holeNumber}</span>
       <span className="text-xs font-bold tabular-nums">{myDiff > 0 ? '+' : ''}{myDiff}</span>
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

  // Build per-player data for the 7-col grid
  const myPids = myTeam;
  const rvPids = rivalTeam;
  const getNet = (idx: number, isMy: boolean) => {
    if (isMy) {
      return idx === 0
        ? (myTeam1 ? hd.netA : hd.netC)
        : (myTeam1 ? hd.netB : hd.netD);
    }
    return idx === 0
      ? (myTeam1 ? hd.netC : hd.netA)
      : (myTeam1 ? hd.netD : hd.netB);
  };
  const getStrokes = (idx: number, isMy: boolean) => {
    if (isMy) {
      return idx === 0
        ? (myTeam1 ? hd.strokesA : hd.strokesC)
        : (myTeam1 ? hd.strokesB : hd.strokesD);
    }
    return idx === 0
      ? (myTeam1 ? hd.strokesC : hd.strokesA)
      : (myTeam1 ? hd.strokesD : hd.strokesB);
  };

  return (
    <Popover key={hd.holeNumber}>
      <PopoverTrigger asChild>{pill}</PopoverTrigger>
      <PopoverContent side="top" className="w-[95vw] max-w-sm p-3">
        <div className="space-y-1">
          <p className="text-xs font-medium">Hoyo {hd.holeNumber}</p>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Tu equipo</span>
            <span>Rival</span>
          </div>
          {[0, 1].map(i => {
            const myS = getNet(i, true);
            const rvS = getNet(i, false);
            const myHasStroke = (getStrokes(i, true) || 0) > 0;
            const rvHasStroke = (getStrokes(i, false) || 0) > 0;
            return (
              <div key={i} className="grid text-[15px] tabular-nums" style={{ gridTemplateColumns: '1fr auto auto 12px auto auto 1fr' }}>
                <span className="truncate text-left">{getShortName(myPids[i])}</span>
                <span className="font-medium text-right px-1">{myS}</span>
                <span className="flex items-center justify-center w-3">{myHasStroke && <span className={cn("h-2 w-2 rounded-full", (getStrokes(i, true) || 0) === 0.5 ? "bg-green-600" : "bg-foreground")} />}</span>
                <span />
                <span className="flex items-center justify-center w-3">{rvHasStroke && <span className={cn("h-2 w-2 rounded-full", (getStrokes(i, false) || 0) === 0.5 ? "bg-green-600" : "bg-foreground")} />}</span>
                <span className="font-medium text-left px-1">{rvS}</span>
                <span className="truncate text-right">{getShortName(rvPids[i])}</span>
              </div>
            );
          })}
          <div className="pt-1 border-t border-border/50 space-y-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Número</span>
              <div className="flex items-center gap-2">
                <span className={cn('font-mono font-bold tabular-nums px-1.5 py-0.5 rounded', myDiff > 0 && 'bg-foreground text-background')}>
                  {myNumEff}
                </span>
                <span className="text-muted-foreground">vs</span>
                <span className={cn('font-mono font-bold tabular-nums px-1.5 py-0.5 rounded', myDiff < 0 && 'bg-foreground text-background')}>
                  {rvNumEff}
                </span>
              </div>
            </div>
            {hd.multiplierApplied !== 'none' && (
              <p className="text-[10px] text-amber-600">🐦 Birdie → ×2 ({hd.multiplierApplied === (myTeam1 ? 'team1' : 'team2') ? 'Tu equipo' : 'Rival'})</p>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Diferencia</span>
              <span className={cn('font-bold', myDiff > 0 ? 'text-green-600' : myDiff < 0 ? 'text-destructive' : '')}>
                {myDiff > 0 ? '+' : ''}{myDiff} → ${fmtMoney(hd.amountThisHole)}
              </span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
