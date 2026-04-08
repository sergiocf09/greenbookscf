import React, { useMemo, useState } from 'react';
import { Player, PlayerScore, GolfCourse, WolfConfig, WolfHoleState } from '@/types/golf';
import { calculateWolfBets, buildWolfHoleDetails } from '@/lib/bets/wolf';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, AlertTriangle } from 'lucide-react';

interface WolfResultsCardProps {
  players: Player[];
  wolfConfig: WolfConfig;
  holeStates: WolfHoleState[];
  scores: Map<string, PlayerScore[]>;
  course: GolfCourse;
  basePlayerId: string;
}

export const WolfResultsCard: React.FC<WolfResultsCardProps> = ({
  players, wolfConfig, holeStates, scores, course, basePlayerId,
}) => {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [paymentsOpen, setPaymentsOpen] = useState(false);

  const missingPlayerIds = useMemo(() => {
    const referencedIds = new Set<string>();
    for (const hs of holeStates) {
      referencedIds.add(hs.wolfPlayerId);
      hs.partnerIds.forEach(id => referencedIds.add(id));
    }
    return [...referencedIds].filter(id => !players.find(p => p.id === id));
  }, [players, holeStates]);

  if (missingPlayerIds.length > 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">🐺 La Loba</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-700 space-y-1">
              <p className="font-medium">Participación incompleta</p>
              <p>Un jugador fue eliminado de la ronda. Agrega un reemplazo o desactiva esta apuesta.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const bets = useMemo(() => calculateWolfBets(players, wolfConfig, holeStates), [players, wolfConfig, holeStates]);
  const details = useMemo(() => buildWolfHoleDetails(players, scores, wolfConfig, holeStates, course), [players, scores, wolfConfig, holeStates, course]);

  const totalBalance = bets.filter(b => b.playerId === basePlayerId).reduce((s, b) => s + b.amount, 0);
  const f9Balance = bets.filter(b => b.playerId === basePlayerId && (b.holeNumber ?? 0) <= 9).reduce((s, b) => s + b.amount, 0);
  const b9Balance = bets.filter(b => b.playerId === basePlayerId && (b.holeNumber ?? 0) > 9).reduce((s, b) => s + b.amount, 0);

  const getName = (id: string) => players.find(p => p.id === id)?.name?.split(' ')[0] ?? '?';

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
            'flex flex-col items-center justify-center rounded-lg p-1 min-w-[2.2rem] h-12 text-xs border transition-colors',
            playerWon && 'bg-green-500/15 border-green-500/30 text-green-700',
            playerLost && 'bg-red-500/15 border-red-500/30 text-red-700',
            result === 'tied' && 'bg-muted border-border text-muted-foreground',
            !result && 'bg-muted/50 border-border/50 text-muted-foreground',
          )}>
            <span className="font-semibold">{hole}</span>
            <span className="text-[9px]">
              {playerWon ? '✅' : playerLost ? '❌' : result === 'tied' ? '↔' : '–'}
            </span>
            {result && state?.effectiveAmount && (
              <span className="text-[8px] font-mono">{fmtMoney(state.effectiveAmount)}</span>
            )}
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
                    <span className="ml-auto font-mono">{s.gross}{s.strokes > 0 && <span className="text-muted-foreground"> •{s.strokes}</span>} → {s.net}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Rivales</p>
                {detail.scoresByPlayer.filter(s => s.teamSide === 'rival').map(s => (
                  <div key={s.playerId} className="flex items-center gap-1">
                    <span>{s.playerName.split(' ')[0]}</span>
                    <span className="ml-auto font-mono">{s.gross}{s.strokes > 0 && <span className="text-muted-foreground"> •{s.strokes}</span>} → {s.net}</span>
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

  const positivePayments = bets.filter(b => b.amount > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">🐺 La Loba</CardTitle>
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
        {/* F9 */}
        <Collapsible open={openSection === 'f9'} onOpenChange={o => setOpenSection(o ? 'f9' : null)}>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-medium py-1">
            <span>Front 9 · {f9Balance >= 0 ? '+' : ''}${fmtMoney(Math.abs(f9Balance))}</span>
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
            <span>Back 9 · {b9Balance >= 0 ? '+' : ''}${fmtMoney(Math.abs(b9Balance))}</span>
            <ChevronDown className={cn('h-3 w-3 transition-transform', openSection === 'b9' && 'rotate-180')} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid grid-cols-9 gap-1 mt-1">
              {Array.from({ length: 9 }, (_, i) => renderPill(i + 10))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Pagos */}
        {positivePayments.length > 0 && (
          <Collapsible open={paymentsOpen} onOpenChange={setPaymentsOpen}>
            <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-medium py-1 text-muted-foreground">
              <span>Pagos</span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', paymentsOpen && 'rotate-180')} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-0.5 mt-1">
                {positivePayments.map((b, i) => (
                  <p key={i} className="text-[11px]">
                    {getName(b.playerId)} cobra ${fmtMoney(b.amount)} de {getName(b.vsPlayer!)}
                  </p>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
};
