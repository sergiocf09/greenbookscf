import React, { useMemo, useState } from 'react';
import { Player, PlayerScore, GolfCourse, WolfConfig, WolfHoleState } from '@/types/golf';
import { disambiguateInitials, formatPlayerName } from '@/lib/playerInput';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { calculateWolfBets, buildWolfHoleDetails } from '@/lib/bets/wolf';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ChevronDown, XCircle, CheckCircle } from 'lucide-react';

interface WolfResultsCardProps {
  players: Player[];
  wolfConfig: WolfConfig;
  holeStates: WolfHoleState[];
  scores: Map<string, PlayerScore[]>;
  course: GolfCourse;
  basePlayerId: string;
  isDisabled?: boolean;
  onToggleDisabled?: () => void;
}

export const WolfResultsCard: React.FC<WolfResultsCardProps> = ({
  players, wolfConfig, holeStates, scores, course, basePlayerId, isDisabled, onToggleDisabled,
}) => {
  const [openSection, setOpenSection] = useState<string | null>(null);

  // Filter out contaminated hole states (players not in current participantIds)
  const validHoleStates = useMemo(() => {
    const validIds = new Set(wolfConfig.participantIds ?? []);
    if (validIds.size === 0) return holeStates;
    return holeStates.filter(hs => {
      if (!validIds.has(hs.wolfPlayerId)) return false;
      for (const pid of hs.partnerIds) {
        if (!validIds.has(pid)) return false;
      }
      return true;
    });
  }, [holeStates, wolfConfig.participantIds]);

  const bets = useMemo(() => calculateWolfBets(players, wolfConfig, validHoleStates), [players, wolfConfig, validHoleStates]);
  const details = useMemo(() => buildWolfHoleDetails(players, scores, wolfConfig, validHoleStates, course), [players, scores, wolfConfig, validHoleStates, course]);

  const totalBalance = bets.filter(b => b.playerId === basePlayerId).reduce((s, b) => s + b.amount, 0);

  const getName = (id: string) => players.find(p => p.id === id)?.name?.split(' ')[0] ?? '?';
  const getFullName = (id: string) => formatPlayerName(players.find(p => p.id === id)?.name ?? '?');
  const disambiguated = useMemo(() => disambiguateInitials(players), [players]);

  const participantIds = useMemo(() => {
    // Fuente de verdad: participantIds del config (ya filtrado en BetDashboard)
    if (wolfConfig.participantIds && wolfConfig.participantIds.length > 0) {
      return new Set<string>(wolfConfig.participantIds);
    }
    // Fallback
    const ids = new Set<string>();
    for (const hs of holeStates) {
      ids.add(hs.wolfPlayerId);
      hs.partnerIds.forEach(id => ids.add(id));
    }
    bets.forEach(b => ids.add(b.playerId));
    if (ids.size === 0) players.forEach(p => ids.add(p.id));
    return ids;
  }, [wolfConfig.participantIds, holeStates, bets, players]);

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

  const getNetTone = (n: number) => (n > 0 ? 'text-green-600' : n < 0 ? 'text-destructive' : 'text-muted-foreground');

  if (validHoleStates.length === 0 && holeStates.length > 0) {
    // All hole states were filtered out as invalid
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">🐺 Loba</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 space-y-1">
              <p className="font-medium">Datos de Loba inconsistentes</p>
              <p>Las decisiones guardadas contienen jugadores fuera del match actual. Se limpiarán automáticamente.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderPill = (hole: number) => {
    const state = holeStates.find(s => s.holeNumber === hole);
    const detail = details.find(d => d.holeNumber === hole);
    const result = state?.result;
    const isWolfTeam = state ? [state.wolfPlayerId, ...state.partnerIds].includes(basePlayerId) : false;
    const playerWon = result === 'won' ? isWolfTeam : result === 'lost' ? !isWolfTeam : false;
    const playerLost = result === 'won' ? !isWolfTeam : result === 'lost' ? isWolfTeam : false;

    const pill = (
      <button className={cn(
        'flex flex-col items-center justify-center rounded-lg p-0.5 min-w-[2.2rem] h-10 text-xs border transition-colors',
        playerWon && 'bg-green-500/15 border-green-500/30 text-green-700',
        playerLost && 'bg-red-500/15 border-red-500/30 text-red-700',
        result === 'tied' && 'bg-muted border-border text-muted-foreground',
        !result && 'bg-muted/50 border-border/50 text-muted-foreground',
      )}>
        <span className="text-[8px] text-muted-foreground">{hole}</span>
        <span className="text-[10px] font-bold">
          {playerWon ? '✅' : playerLost ? '❌' : result === 'tied' ? '↔' : '–'}
        </span>
      </button>
    );

    if (!detail) {
      return <div key={hole}>{pill}</div>;
    }

    // Build wolf team and rival team arrays
    const wolfTeamIds = [state!.wolfPlayerId, ...state!.partnerIds];
    const allPlayerIds = [...new Set([...wolfTeamIds, ...players.map(p => p.id)])];
    const rivalIds = allPlayerIds.filter(id => !wolfTeamIds.includes(id) && detail.scoresByPlayer.some(s => s.playerId === id));

    const isBaseWolfTeam = wolfTeamIds.includes(basePlayerId);
    const myTeamIds = isBaseWolfTeam ? wolfTeamIds : rivalIds;
    const theirTeamIds = isBaseWolfTeam ? rivalIds : wolfTeamIds;
    const myTeamScores = detail.scoresByPlayer.filter(s => myTeamIds.includes(s.playerId));
    const theirTeamScores = detail.scoresByPlayer.filter(s => theirTeamIds.includes(s.playerId));

    return (
      <Popover key={hole}>
        <PopoverTrigger asChild>{pill}</PopoverTrigger>
        <PopoverContent side="top" className="w-[95vw] max-w-sm p-3">
          <div className="space-y-1">
           <p className="text-xs font-medium">
              Hoyo {hole} · {detail.result === 'won' ? 'Loba ganó' : detail.result === 'lost' ? 'Loba perdió' : detail.result === 'tied' ? 'Empate' : 'En juego'}
            </p>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{isBaseWolfTeam ? 'Tu equipo (Loba)' : 'Tu equipo'}</span>
              <span>{isBaseWolfTeam ? 'Rivales' : 'Equipo Loba'}</span>
            </div>
            {/* Render rows for max of both sides */}
            {Array.from({ length: Math.max(myTeamScores.length, theirTeamScores.length) }, (_, i) => {
              const my = myTeamScores[i];
              const rv = theirTeamScores[i];
              const myHasStroke = my && my.strokes > 0 && my.net !== my.gross;
              const rvHasStroke = rv && rv.strokes > 0 && rv.net !== rv.gross;
              return (
                <div key={i} className="grid text-sm tabular-nums" style={{ gridTemplateColumns: '1fr auto auto 12px auto auto 1fr' }}>
                  <span className="truncate text-left">{my ? my.playerName.split(' ')[0] : ''}</span>
                  <span className="font-medium text-right px-1">{my ? (my.gross > 0 ? my.net : '–') : ''}</span>
                  <span className="flex items-center justify-center w-3">{myHasStroke && <span className="h-2 w-2 rounded-full bg-foreground" />}</span>
                  <span />
                  <span className="flex items-center justify-center w-3">{rvHasStroke && <span className="h-2 w-2 rounded-full bg-foreground" />}</span>
                  <span className="font-medium text-left px-1">{rv ? (rv.gross > 0 ? rv.net : '–') : ''}</span>
                  <span className="truncate text-right">{rv ? rv.playerName.split(' ')[0] : ''}</span>
                </div>
              );
            })}
            <div className="pt-1 border-t border-border/50 text-xs space-y-0.5">
              {wolfConfig.scoringMode === 'lowHighBall' && (
                <>
                  <p className="flex justify-between"><span>Bola Baja</span><span>{detail.lowBallWinner === 'wolf' ? 'Loba' : detail.lowBallWinner === 'rival' ? 'Rival' : 'Empate'}</span></p>
                  <p className="flex justify-between"><span>Bola Alta</span><span>{detail.highBallWinner === 'wolf' ? 'Loba' : detail.highBallWinner === 'rival' ? 'Rival' : 'Empate'}</span></p>
                  <p className="flex justify-between"><span>Puntos</span><span>{detail.pointsWolf}–{detail.pointsRival}</span></p>
                </>
              )}
              <p className="flex justify-between">
                <span>Decisión</span>
                <span>{detail.wentSolo ? '🐺 Sola ×2' : `Con ${detail.partnerNames.join(', ')}`}</span>
              </p>
              {(detail.carryoverHoles ?? 0) > 0 && (
                <p className="flex justify-between"><span>Carryover</span><span>+{detail.carryoverHoles} hoyo(s)</span></p>
              )}
              <p className="flex justify-between font-medium"><span>Monto</span><span>${fmtMoney(detail.effectiveAmount)} por rival</span></p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const scoringLabel = wolfConfig.scoringMode === 'lowBall' ? 'Bola Baja' : wolfConfig.scoringMode === 'lowHighBall' ? 'BB + BA' : 'Score Neto';
  const configSummary = [
    scoringLabel,
    wolfConfig.useHandicap ? 'Con Hándicap' : 'Sin Hándicap',
    wolfConfig.carryover ? 'Carryover' : null,
    `$${fmtMoney(wolfConfig.amountPerHole)}/hoyo`,
  ].filter(Boolean).join(' · ');

  return (
    <Card className={cn('border-accent/50', isDisabled && 'opacity-50')}>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>🐺 Loba</span>
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
                title={isDisabled ? 'Reactivar Loba' : 'No considerar Loba'}
              >
                {isDisabled ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">{configSummary}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* F9 */}
        <Collapsible open={openSection === 'f9'} onOpenChange={o => setOpenSection(o ? 'f9' : null)}>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-medium py-1">
            <span>Front 9</span>
            <ChevronDown className={cn('h-3 w-3 transition-transform', openSection === 'f9' && 'rotate-180')} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-9 gap-1 mt-1">
              {Array.from({ length: 9 }, (_, i) => renderPill(i + 1))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* B9 */}
        <Collapsible open={openSection === 'b9'} onOpenChange={o => setOpenSection(o ? 'b9' : null)}>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-medium py-1">
            <span>Back 9</span>
            <ChevronDown className={cn('h-3 w-3 transition-transform', openSection === 'b9' && 'rotate-180')} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-9 gap-1 mt-1">
              {Array.from({ length: 9 }, (_, i) => renderPill(i + 10))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Per-player ranking */}
        <div className="border-t border-border/50 pt-2 space-y-0.5">
          {playerRanking.map(pr => {
            const p = players.find(x => x.id === pr.id);
            const rotationPos = (wolfConfig.playerOrder ?? []).indexOf(pr.id);
            return (
              <div key={pr.id} className="flex items-center gap-2 justify-between text-xs">
                <div className="flex items-center gap-1.5 min-w-0">
                  {rotationPos >= 0 && (
                    <span className="text-[9px] font-bold text-muted-foreground w-3 text-center shrink-0">{rotationPos + 1}</span>
                  )}
                  {p && <PlayerAvatar initials={disambiguated.get(pr.id) || p.initials} background={p.color} size="xs" isLoggedInUser={p.profileId === basePlayerId} />}
                  <span className={cn('truncate', pr.id === basePlayerId && 'font-semibold')}>{pr.name}</span>
                </div>
                <span className={cn('font-bold tabular-nums shrink-0', getNetTone(pr.balance))}>
                  {pr.balance >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(pr.balance))}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
