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

  const missingPlayerIds = useMemo(() => {
    const referencedIds = new Set<string>();
    for (const hs of holeStates) {
      referencedIds.add(hs.wolfPlayerId);
      hs.partnerIds.forEach(id => referencedIds.add(id));
    }
    return [...referencedIds].filter(id => !players.find(p => p.id === id));
  }, [players, holeStates]);

  const bets = useMemo(() => missingPlayerIds.length > 0 ? [] : calculateWolfBets(players, wolfConfig, holeStates), [players, wolfConfig, holeStates, missingPlayerIds]);
  const details = useMemo(() => missingPlayerIds.length > 0 ? [] : buildWolfHoleDetails(players, scores, wolfConfig, holeStates, course), [players, scores, wolfConfig, holeStates, course, missingPlayerIds]);

  const totalBalance = bets.filter(b => b.playerId === basePlayerId).reduce((s, b) => s + b.amount, 0);

  const getName = (id: string) => players.find(p => p.id === id)?.name?.split(' ')[0] ?? '?';
  const getFullName = (id: string) => formatPlayerName(players.find(p => p.id === id)?.name ?? '?');
  const disambiguated = useMemo(() => disambiguateInitials(players), [players]);

  // Only include participating players (referenced in hole states)
  const participantIds = useMemo(() => {
    const ids = new Set<string>();
    for (const hs of holeStates) {
      ids.add(hs.wolfPlayerId);
      hs.partnerIds.forEach(id => ids.add(id));
    }
    // Also add all players who appear in bets
    bets.forEach(b => ids.add(b.playerId));
    // Fallback: if no states yet, include all players
    if (ids.size === 0) players.forEach(p => ids.add(p.id));
    return ids;
  }, [holeStates, bets, players]);

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

  if (missingPlayerIds.length > 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">🐺 Loba</CardTitle>
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

  const renderPill = (hole: number) => {
    const state = holeStates.find(s => s.holeNumber === hole);
    const detail = details.find(d => d.holeNumber === hole);
    const result = state?.result;
    const isWolfTeam = state ? [state.wolfPlayerId, ...state.partnerIds].includes(basePlayerId) : false;
    const playerWon = result === 'won' ? isWolfTeam : result === 'lost' ? !isWolfTeam : false;
    const playerLost = result === 'won' ? !isWolfTeam : result === 'lost' ? isWolfTeam : false;

    return (
      <Popover key={hole}>
        <PopoverTrigger asChild>
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
        </PopoverTrigger>
        <PopoverContent side="top" className="w-[95vw] max-w-sm p-3 text-xs">
          {!detail ? <p className="text-muted-foreground">Sin datos</p> : (
            <div className="space-y-2">
              <p className="font-semibold">Hoyo {hole} · {detail.result === 'won' ? 'Loba ganó' : detail.result === 'lost' ? 'Loba perdió' : detail.result === 'tied' ? 'Empate' : 'En juego'}</p>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Equipo Loba</p>
                {detail.scoresByPlayer.filter(s => s.teamSide === 'wolf').map(s => (
                  <div key={s.playerId} className="flex items-center gap-1">
                    <span>{s.playerName.split(' ')[0]}</span>
                    {s.strokes > 0 && s.net !== s.gross && <span className="text-[9px]">●</span>}
                    <span className="ml-auto font-mono">{s.net}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Rivales</p>
                {detail.scoresByPlayer.filter(s => s.teamSide === 'rival').map(s => (
                  <div key={s.playerId} className="flex items-center gap-1">
                    <span>{s.playerName.split(' ')[0]}</span>
                    {s.strokes > 0 && s.net !== s.gross && <span className="text-[9px]">●</span>}
                    <span className="ml-auto font-mono">{s.net}</span>
                  </div>
                ))}
              </div>
              {wolfConfig.scoringMode === 'lowHighBall' && (
                <div className="text-[10px] space-y-0.5">
                  <p>Bola Baja: {detail.lowBallWinner === 'wolf' ? 'Loba' : detail.lowBallWinner === 'rival' ? 'Rival' : 'Empate'}</p>
                  <p>Bola Alta: {detail.highBallWinner === 'wolf' ? 'Loba' : detail.highBallWinner === 'rival' ? 'Rival' : 'Empate'}</p>
                  <p>Puntos: {detail.pointsWolf}–{detail.pointsRival}</p>
                </div>
              )}
              <p className="text-[10px]">
                Decisión: {detail.wentSolo ? '🐺 Sola ×2' : `Con ${detail.partnerNames.join(', ')}`}
              </p>
              {(detail.carryoverHoles ?? 0) > 0 && (
                <p className="text-[10px]">↑ Carryover: +{detail.carryoverHoles} hoyo(s)</p>
              )}
              <p className="text-[10px] font-medium">Monto efectivo: ${fmtMoney(detail.effectiveAmount)} por rival</p>
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  };

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
          {playerRanking.map(pr => (
            <div key={pr.id} className="flex items-center justify-between text-xs">
              <span className={cn('truncate', pr.id === basePlayerId && 'font-semibold')}>{pr.name}</span>
              <span className={cn('font-bold tabular-nums', getNetTone(pr.balance))}>
                {pr.balance >= 0 ? '+$' : '-$'}{fmtMoney(Math.abs(pr.balance))}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
