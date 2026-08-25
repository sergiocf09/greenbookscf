import React, { useMemo } from 'react';
import { Player, TeamHandicapConfig } from '@/types/golf';
import { TeamBetHandicapInfo } from './TeamBetHandicapInfo';

import { fmtMoney } from '@/lib/formatMoney';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { formatPlayerName, disambiguateInitials, disambiguateShortNames } from '@/lib/playerInput';
import { Users, XCircle, CheckCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';


const TeamHoleGrid: React.FC<{
  teamAPlayers: { name: string; id: string }[];
  teamBPlayers: { name: string; id: string }[];
  shortNames: Map<string, string>;
  detail: {
    netA1: number; hcpA1: number;
    netA2: number; hcpA2: number;
    netB1: number; hcpB1: number;
    netB2: number; hcpB2: number;
  };
}> = ({ teamAPlayers, teamBPlayers, shortNames, detail }) => {
  const getName = (p?: { name: string; id: string }) => p ? (shortNames.get(p.id) || p.name.split(' ')[0]) : 'Jugador';
  return (
  <div className="space-y-0.5">
    <div className="flex justify-between text-[10px] text-muted-foreground">
      <span>Tu equipo</span>
      <span>Rival</span>
    </div>
    {/* Player row 1 */}
    <div className="grid text-sm tabular-nums" style={{ gridTemplateColumns: '1fr auto auto 12px auto auto 1fr' }}>
      <span className="truncate text-left">{getName(teamAPlayers[0])}</span>
      <span className="font-medium text-right px-1">{detail.netA1}</span>
      <span className="flex items-center justify-center w-3">{detail.hcpA1 > 0 && <span className={cn("h-2 w-2 rounded-full", detail.hcpA1 === 0.5 ? "bg-green-600" : "bg-foreground")} />}</span>
      <span />
      <span className="flex items-center justify-center w-3">{detail.hcpB1 > 0 && <span className={cn("h-2 w-2 rounded-full", detail.hcpB1 === 0.5 ? "bg-green-600" : "bg-foreground")} />}</span>
      <span className="font-medium text-left px-1">{detail.netB1}</span>
      <span className="truncate text-right">{getName(teamBPlayers[0])}</span>
    </div>
    {/* Player row 2 */}
    <div className="grid text-sm tabular-nums" style={{ gridTemplateColumns: '1fr auto auto 12px auto auto 1fr' }}>
      <span className="truncate text-left">{getName(teamAPlayers[1])}</span>
      <span className="font-medium text-right px-1">{detail.netA2}</span>
      <span className="flex items-center justify-center w-3">{detail.hcpA2 > 0 && <span className={cn("h-2 w-2 rounded-full", detail.hcpA2 === 0.5 ? "bg-green-600" : "bg-foreground")} />}</span>
      <span />
      <span className="flex items-center justify-center w-3">{detail.hcpB2 > 0 && <span className={cn("h-2 w-2 rounded-full", detail.hcpB2 === 0.5 ? "bg-green-600" : "bg-foreground")} />}</span>
      <span className="font-medium text-left px-1">{detail.netB2}</span>
      <span className="truncate text-right">{getName(teamBPlayers[1])}</span>
    </div>
  </div>
  );
};

// Carritos Results Card - Updated for point-based scoring
interface CarritosResultsCardProps {
  results: {
    teamA: [string, string];
    teamB: [string, string];
    scoringType: 'lowBall' | 'highBall' | 'combined' | 'all';
    netByHoleFront: Array<number | null>;
    netByHoleBack: Array<number | null>;
    holeDetailsFront: Array<{
      holeNumber: number;
      grossA1: number;
      hcpA1: number;
      netA1: number;
      grossA2: number;
      hcpA2: number;
      netA2: number;
      grossB1: number;
      hcpB1: number;
      netB1: number;
      grossB2: number;
      hcpB2: number;
      netB2: number;
      lowBallWinner?: 'A' | 'B' | 'tie';
      highBallWinner?: 'A' | 'B' | 'tie';
      combinedWinner?: 'A' | 'B' | 'tie';
      pointsA: number;
      pointsB: number;
    } | null>;
    holeDetailsBack: Array<{
      holeNumber: number;
      grossA1: number;
      hcpA1: number;
      netA1: number;
      grossA2: number;
      hcpA2: number;
      netA2: number;
      grossB1: number;
      hcpB1: number;
      netB1: number;
      grossB2: number;
      hcpB2: number;
      netB2: number;
      lowBallWinner?: 'A' | 'B' | 'tie';
      highBallWinner?: 'A' | 'B' | 'tie';
      combinedWinner?: 'A' | 'B' | 'tie';
      pointsA: number;
      pointsB: number;
    } | null>;
    pointsAFront: number;
    pointsBFront: number;
    pointsABack: number;
    pointsBBack: number;
    pointsATotal: number;
    pointsBTotal: number;
    pointsAAccumulated: number;
    pointsBAccumulated: number;
    moneyA: number;
    moneyB: number;
    amount: number;
    frontAmount?: number;
    backAmount?: number;
    totalAmount?: number;
    id?: string;
  };
  players: Player[];
  basePlayerId?: string;
  title?: string;
  roundHoles?: 9 | 18;
  onCancel?: () => void;
  isDisabled?: boolean;
  onToggleDisabled?: () => void;
  teamHandicaps?: Record<string, number>;
  handicapConfig?: TeamHandicapConfig;
  amountsHidden?: boolean;
}

const CarritosResultsCard: React.FC<CarritosResultsCardProps> = ({ results, players, basePlayerId, title = 'Carritos (Equipos)', roundHoles = 18, onCancel, isDisabled, onToggleDisabled, teamHandicaps, handicapConfig, amountsHidden = false }) => {

  const showAmtSigned = (value: number): string =>
    amountsHidden ? '••••' : `${value >= 0 ? '+$' : '-$'}${fmtMoney(Math.abs(value))}`;

  const isNineHole = roundHoles === 9;

  const getPlayer = (id: string) => players.find(p => p.id === id);
  const disambiguatedAbbrsCarritos = useMemo(() => disambiguateInitials(players), [players]);
  const shortNames = useMemo(() => disambiguateShortNames(players), [players]);
  const getPlayerAbbr = (player: Player) => disambiguatedAbbrsCarritos.get(player.id) || player.initials;
  const getShortName = (p: Player) => shortNames.get(p.id) || formatPlayerName(p.name).split(' ')[0];
  const teamAPlayers = [getPlayer(results.teamA[0]), getPlayer(results.teamA[1])].filter(Boolean) as Player[];
  const teamBPlayers = [getPlayer(results.teamB[0]), getPlayer(results.teamB[1])].filter(Boolean) as Player[];

  type Winner = 'A' | 'B' | 'tie';
  const invertWinner = (w?: Winner): Winner | undefined => {
    if (!w) return undefined;
    if (w === 'tie') return 'tie';
    return w === 'A' ? 'B' : 'A';
  };
  
  const isBaseInTeamA = results.teamA.includes(basePlayerId || '');
  const displayTeamAPlayers = isBaseInTeamA ? teamAPlayers : teamBPlayers;
  const displayTeamBPlayers = isBaseInTeamA ? teamBPlayers : teamAPlayers;

  const baseTeamMoney = isBaseInTeamA ? results.moneyA : results.moneyB;
  const baseTeamNetFront = isBaseInTeamA ? (results.pointsAFront - results.pointsBFront) : (results.pointsBFront - results.pointsAFront);
  const baseTeamNetBack = isBaseInTeamA ? (results.pointsABack - results.pointsBBack) : (results.pointsBBack - results.pointsABack);
  const baseTeamNetTotal = isBaseInTeamA ? (results.pointsATotal - results.pointsBTotal) : (results.pointsBTotal - results.pointsATotal);

  const baseNetByHoleFront = isBaseInTeamA ? results.netByHoleFront : results.netByHoleFront.map(v => (v === null ? null : -v));
  const baseNetByHoleBack = isBaseInTeamA ? results.netByHoleBack : results.netByHoleBack.map(v => (v === null ? null : -v));

  const baseHoleDetailsFront = isBaseInTeamA
    ? results.holeDetailsFront
    : results.holeDetailsFront.map((d) => {
        if (!d) return null;
        return {
          ...d,
          // swap teams for display
          grossA1: d.grossB1,
          hcpA1: d.hcpB1,
          netA1: d.netB1,
          grossA2: d.grossB2,
          hcpA2: d.hcpB2,
          netA2: d.netB2,
          grossB1: d.grossA1,
          hcpB1: d.hcpA1,
          netB1: d.netA1,
          grossB2: d.grossA2,
          hcpB2: d.hcpA2,
          netB2: d.netA2,
          lowBallWinner: invertWinner(d.lowBallWinner as Winner | undefined),
          highBallWinner: invertWinner(d.highBallWinner as Winner | undefined),
          combinedWinner: invertWinner(d.combinedWinner as Winner | undefined),
          pointsA: d.pointsB,
          pointsB: d.pointsA,
        };
      });

  const baseHoleDetailsBack = isBaseInTeamA
    ? results.holeDetailsBack
    : results.holeDetailsBack.map((d) => {
        if (!d) return null;
        return {
          ...d,
          grossA1: d.grossB1,
          hcpA1: d.hcpB1,
          netA1: d.netB1,
          grossA2: d.grossB2,
          hcpA2: d.hcpB2,
          netA2: d.netB2,
          grossB1: d.grossA1,
          hcpB1: d.hcpA1,
          netB1: d.netA1,
          grossB2: d.grossA2,
          hcpB2: d.hcpA2,
          netB2: d.netA2,
          lowBallWinner: invertWinner(d.lowBallWinner as Winner | undefined),
          highBallWinner: invertWinner(d.highBallWinner as Winner | undefined),
          combinedWinner: invertWinner(d.combinedWinner as Winner | undefined),
          pointsA: d.pointsB,
          pointsB: d.pointsA,
        };
      });


  // Unused legacy ScoreLine - replaced by TeamHoleGrid below

  const getNetTone = (n: number) => (n > 0 ? 'text-green-600' : n < 0 ? 'text-destructive' : 'text-muted-foreground');
  const getNetPill = (n: number) => (n > 0 ? 'border-green-600/40 text-green-600' : n < 0 ? 'border-destructive/40 text-destructive' : 'border-border text-muted-foreground');

  const getWinnerText = (w?: Winner) => {
    if (!w) return '—';
    if (w === 'tie') return 'Empate';
    return w === 'A' ? 'Tu equipo' : 'Rival';
  };

  const scoringLabel = results.scoringType === 'all'
    ? 'LowBall + HighBall + Suma'
    : results.scoringType === 'lowBall'
      ? 'LowBall'
      : results.scoringType === 'highBall'
        ? 'HighBall'
        : 'Suma';
  
  // Payment: Each loser pays 50% of their share to EACH winner
  // Total loss is split between 2 losers, then each loser splits their half between 2 winners
  // Example: Team loses $100 total -> each loser pays $50 total -> $25 to each winner
  const getPaymentBreakdown = () => {
    if (results.moneyA === 0) return null;
    
    const winningTeam = results.moneyA > 0 ? teamAPlayers : teamBPlayers;
    const losingTeam = results.moneyA > 0 ? teamBPlayers : teamAPlayers;
    const totalLost = Math.abs(results.moneyA);
    
    // Each loser pays 50% of total to EACH winner
    // Example: Total lost = $100
    // - Loser A pays $50 to Winner C and $50 to Winner D (total $100)
    // - Loser B pays $50 to Winner C and $50 to Winner D (total $100)
    // Each winner receives: $50 from A + $50 from B = $100
    const perLoserPayToEachWinner = totalLost / 2;
    
    return { winningTeam, losingTeam, perLoserPayToEachWinner, totalWon: totalLost };
  };
  
  const payment = getPaymentBreakdown();
  
  return (
    <Card className={cn('border-accent/50', isDisabled && 'opacity-50')}>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {title}
            <TeamBetHandicapInfo
              players={[...displayTeamAPlayers, ...displayTeamBPlayers]}
              teamA={displayTeamAPlayers}
              teamB={displayTeamBPlayers}
              effectiveHandicaps={teamHandicaps}
              handicapConfig={handicapConfig}
              title={`${title} — Hándicaps`}
              modalityLine={scoringLabel}
            />
          </div>

          <div className="flex items-center gap-2">
            {isDisabled ? (
              <div className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Cancelada</div>
            ) : (
              <span className={cn('text-base font-bold tabular-nums', getNetTone(baseTeamMoney))}>
                {showAmtSigned(baseTeamMoney)}
              </span>
            )}
            {onToggleDisabled && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-6 w-6', isDisabled ? 'text-green-600 hover:text-green-700' : 'text-muted-foreground hover:text-destructive')}
                onClick={onToggleDisabled}
                title={isDisabled ? 'Reactivar Carritos' : 'No considerar Carritos'}
              >
                {isDisabled ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              </Button>
            )}
            {onCancel && !onToggleDisabled && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={onCancel}
                title="Cancelar Carritos"
              >
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Collapsible>
          <div className="space-y-1">
            {/* Names row */}
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium truncate">
                {displayTeamAPlayers.map(p => getShortName(p)).join(' / ')}
              </span>
              <span className="text-muted-foreground text-xs mx-2">vs</span>
              <span className="font-medium truncate text-right">
                {displayTeamBPlayers.map(p => getShortName(p)).join(' / ')}
              </span>
            </div>
            {/* Results row */}
            <div className="flex items-center gap-2">
              <div className={cn('flex-1 grid gap-1 text-center text-sm tabular-nums', isNineHole ? 'grid-cols-1' : 'grid-cols-3')}>
                <span className={cn('font-semibold', getNetTone(baseTeamNetFront))}>
                  F9 {baseTeamNetFront >= 0 ? '+' : ''}{baseTeamNetFront}
                </span>
                {!isNineHole && (
                  <>
                    <span className={cn('font-semibold', getNetTone(baseTeamNetBack))}>
                      B9 {baseTeamNetBack >= 0 ? '+' : ''}{baseTeamNetBack}
                    </span>
                    <span className={cn('font-bold', getNetTone(baseTeamNetTotal))}>
                      T {baseTeamNetTotal >= 0 ? '+' : ''}{baseTeamNetTotal}
                    </span>
                  </>
                )}
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                  <ChevronDown className="h-4 w-4" />
                  <span className="sr-only">Ver detalle</span>
                </Button>
              </CollapsibleTrigger>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {scoringLabel}
            </p>
          </div>

          <CollapsibleContent className="mt-3 space-y-3">
            
            {/* Puntos por hoyo */}
            <div className="bg-muted/30 rounded-lg p-2 space-y-2">
              <div className="text-[10px] text-muted-foreground text-center">
                Toca en un hoyo para ver el desglose (• = stroke aplicado).
              </div>

          {/* Front 9 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Front 9</span>
              <div className="flex items-center gap-2">
                <span className={cn('text-xs tabular-nums', getNetTone(baseTeamNetFront))}>
                  {baseTeamNetFront >= 0 ? '+' : ''}{baseTeamNetFront} pts
                </span>
                {(() => {
                  const frontAmt = results.frontAmount ?? 0;
                  const frontMoney = (baseTeamNetFront > 0 ? 1 : baseTeamNetFront < 0 ? -1 : 0) * frontAmt;
                  if (frontMoney === 0) return null;
                  return (
                    <span className={cn('text-xs font-bold tabular-nums',
                      frontMoney > 0 ? 'text-green-600' : 'text-destructive')}>
                      {showAmtSigned(frontMoney)}
                    </span>
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-9 gap-1">
                {baseNetByHoleFront.map((net, idx) => {
                const hole = idx + 1;
                const detail = baseHoleDetailsFront[idx];

                const pill = (
                  <div
                    className={cn(
                      'h-8 rounded border bg-background/60 flex flex-col items-center justify-center cursor-pointer',
                      net === null ? 'border-border text-muted-foreground' : getNetPill(net),
                    )}
                  >
                    <span className={cn('text-[9px] opacity-80', net === null && 'text-muted-foreground')}>{hole}</span>
                    <span className={cn('text-[11px] font-semibold tabular-nums', net === null && 'text-muted-foreground')}>
                      {net === null ? '–' : net > 0 ? `+${net}` : `${net}`}
                    </span>
                  </div>
                );

                if (net === null || !detail) {
                  return <div key={hole}>{pill}</div>;
                }

                return (
                  <Popover key={hole}>
                    <PopoverTrigger asChild>{pill}</PopoverTrigger>
                    <PopoverContent side="top" className="w-[95vw] max-w-sm p-3">
                      <div className="text-xs space-y-1">
                        <p className="font-medium">Hoyo {detail.holeNumber} • {net > 0 ? `+${net}` : `${net}`} pts</p>
                        <TeamHoleGrid
                          teamAPlayers={displayTeamAPlayers}
                          teamBPlayers={displayTeamBPlayers}
                          shortNames={shortNames}
                          detail={detail}
                        />
                        <div className="pt-1 border-t border-border/50">
                          {(results.scoringType === 'lowBall' || results.scoringType === 'all') && (
                            <p className="flex justify-between"><span>Bola Baja</span><span className="tabular-nums">{getWinnerText(detail.lowBallWinner)}</span></p>
                          )}
                          {(results.scoringType === 'highBall' || results.scoringType === 'all') && (
                            <p className="flex justify-between"><span>Bola Alta</span><span className="tabular-nums">{getWinnerText(detail.highBallWinner)}</span></p>
                          )}
                          {(results.scoringType === 'combined' || results.scoringType === 'all') && (
                            <p className="flex justify-between"><span>Suma</span><span className="tabular-nums">{getWinnerText(detail.combinedWinner)}</span></p>
                          )}
                          <p className="flex justify-between font-medium"><span>Puntos</span><span className="tabular-nums">{detail.pointsA} - {detail.pointsB}</span></p>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              })}
              </div>
          </div>

          {!isNineHole && (<>
          {/* Back 9 */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Back 9</span>
              <div className="flex items-center gap-2">
                <span className={cn('text-xs tabular-nums', getNetTone(baseTeamNetBack))}>
                  {baseTeamNetBack >= 0 ? '+' : ''}{baseTeamNetBack} pts
                </span>
                {(() => {
                  const backAmt = results.backAmount ?? 0;
                  const backMoney = (baseTeamNetBack > 0 ? 1 : baseTeamNetBack < 0 ? -1 : 0) * backAmt;
                  if (backMoney === 0) return null;
                  return (
                    <span className={cn('text-xs font-bold tabular-nums',
                      backMoney > 0 ? 'text-green-600' : 'text-destructive')}>
                      {showAmtSigned(backMoney)}
                    </span>
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-9 gap-1">
                {baseNetByHoleBack.map((net, idx) => {
                const hole = idx + 10;
                const detail = baseHoleDetailsBack[idx];

                const pill = (
                  <div
                    className={cn(
                      'h-8 rounded border bg-background/60 flex flex-col items-center justify-center cursor-pointer',
                      net === null ? 'border-border text-muted-foreground' : getNetPill(net),
                    )}
                  >
                    <span className={cn('text-[9px] opacity-80', net === null && 'text-muted-foreground')}>{hole}</span>
                    <span className={cn('text-[11px] font-semibold tabular-nums', net === null && 'text-muted-foreground')}>
                      {net === null ? '–' : net > 0 ? `+${net}` : `${net}`}
                    </span>
                  </div>
                );

                if (net === null || !detail) {
                  return <div key={hole}>{pill}</div>;
                }

                return (
                  <Popover key={hole}>
                    <PopoverTrigger asChild>{pill}</PopoverTrigger>
                    <PopoverContent side="top" className="w-[95vw] max-w-sm p-3">
                      <div className="text-xs space-y-1">
                        <p className="font-medium">Hoyo {detail.holeNumber} • {net > 0 ? `+${net}` : `${net}`} pts</p>
                        <TeamHoleGrid
                          teamAPlayers={displayTeamAPlayers}
                          teamBPlayers={displayTeamBPlayers}
                          shortNames={shortNames}
                          detail={detail}
                        />
                        <div className="pt-1 border-t border-border/50">
                          {(results.scoringType === 'lowBall' || results.scoringType === 'all') && (
                            <p className="flex justify-between"><span>Bola Baja</span><span className="tabular-nums">{getWinnerText(detail.lowBallWinner)}</span></p>
                          )}
                          {(results.scoringType === 'highBall' || results.scoringType === 'all') && (
                            <p className="flex justify-between"><span>Bola Alta</span><span className="tabular-nums">{getWinnerText(detail.highBallWinner)}</span></p>
                          )}
                          {(results.scoringType === 'combined' || results.scoringType === 'all') && (
                            <p className="flex justify-between"><span>Suma</span><span className="tabular-nums">{getWinnerText(detail.combinedWinner)}</span></p>
                          )}
                          <p className="flex justify-between font-medium"><span>Puntos</span><span className="tabular-nums">{detail.pointsA} - {detail.pointsB}</span></p>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                );
              })}
              </div>
          </div>

              {/* Total */}
              <div className="flex items-center justify-between border-t border-border/50 pt-2">
                <span className="text-xs font-medium">Total 18</span>
                <div className="flex items-center gap-2">
                  <span className={cn('text-sm tabular-nums', getNetTone(baseTeamNetTotal))}>
                    {baseTeamNetTotal >= 0 ? '+' : ''}{baseTeamNetTotal} pts
                  </span>
                  {(() => {
                    const totalAmt = results.totalAmount ?? 0;
                    const totalMoney = (baseTeamNetTotal > 0 ? 1 : baseTeamNetTotal < 0 ? -1 : 0) * totalAmt;
                    if (totalMoney === 0) return null;
                    return (
                      <span className={cn('text-sm font-bold tabular-nums',
                        totalMoney > 0 ? 'text-green-600' : 'text-destructive')}>
                        {showAmtSigned(totalMoney)}
                      </span>
                    );
                  })()}
                </div>
              </div>
              </>)}
            </div>


          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};

// ─── Cross-Group Handicap Widget ─────────────────────────────────────────────
// Shown inside BetDashboard when a rival from another group is selected.
// Allows the base player to set strokes (+/-) that are persisted in round_handicaps,
// exactly like the intra-group HandicapMatrix.

export { TeamHoleGrid, CarritosResultsCard };
export type { CarritosResultsCardProps };
