import React, { useMemo, useState } from 'react';
import { Player, PlayerScore, GolfCourse, VegasConfig } from '@/types/golf';
import { buildVegasSetResults, calculateVegasBets, formVegasNumber } from '@/lib/bets/vegas';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  players, vegasConfig, scores, course, basePlayerId, onConfigurePlayers,
}) => {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [paymentsOpen, setPaymentsOpen] = useState(false);

  const needsConfig = !vegasConfig.playerAId;

  const missingPlayerIds = useMemo(() => {
    const ids = [vegasConfig.playerAId, vegasConfig.playerBId, vegasConfig.playerCId, vegasConfig.playerDId].filter(Boolean) as string[];
    return ids.filter(id => !players.find(p => p.id === id));
  }, [players, vegasConfig]);

  const setResults = useMemo(() => missingPlayerIds.length > 0 ? [] : buildVegasSetResults(players, scores, vegasConfig, course), [players, scores, vegasConfig, course, missingPlayerIds]);
  const bets = useMemo(() => missingPlayerIds.length > 0 ? [] : calculateVegasBets(players, scores, vegasConfig, course), [players, scores, vegasConfig, course, missingPlayerIds]);

  const totalBalance = bets.filter(b => b.playerId === basePlayerId).reduce((s, b) => s + b.amount, 0);
  const getName = (id: string) => players.find(p => p.id === id)?.name?.split(' ')[0] ?? '?';

  const isTeam1 = (sr: typeof setResults[0]) => sr.team1.includes(basePlayerId);

  if (missingPlayerIds.length > 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">🎲 Las Vegas</CardTitle>
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">🎲 Las Vegas</CardTitle>
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
        {needsConfig && onConfigurePlayers && (
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 flex-1">Jugadores A/B/C/D no asignados</p>
            <Button size="sm" variant="outline" className="text-xs h-7" onClick={onConfigurePlayers}>
              Asignar
            </Button>
          </div>
        )}

        {setResults.map((sr, idx) => {
          const key = sr.setNumber ? `set${sr.setNumber}` : 'all';
          const label = sr.setNumber ? `Set ${sr.setNumber} (H${sr.startHole}–${sr.endHole})` : `H${sr.startHole}–${sr.endHole}`;
          const myTeam1 = isTeam1(sr);
          const holesCount = sr.endHole - sr.startHole + 1;

          return (
            <Collapsible key={key} open={openSection === key} onOpenChange={o => setOpenSection(o ? key : null)}>
              <CollapsibleTrigger className="flex items-center justify-between w-full text-xs font-medium py-1">
                <span>{label} · {getName(sr.team1[0])}+{getName(sr.team1[1])} vs {getName(sr.team2[0])}+{getName(sr.team2[1])}</span>
                <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', openSection === key && 'rotate-180')} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className={cn('grid gap-1 mt-1', holesCount <= 6 ? 'grid-cols-6' : 'grid-cols-9')}>
                  {sr.holeDetails.map(hd => {
                    const myDiff = myTeam1 ? hd.diff : -hd.diff;
                    return (
                      <Popover key={hd.holeNumber}>
                        <PopoverTrigger asChild>
                          <button className={cn(
                            'flex flex-col items-center justify-center rounded-lg p-1 h-12 text-xs border',
                            myDiff > 0 && 'bg-green-500/15 border-green-500/30 text-green-700',
                            myDiff < 0 && 'bg-red-500/15 border-red-500/30 text-red-700',
                            myDiff === 0 && 'bg-muted border-border text-muted-foreground',
                          )}>
                            <span className="font-semibold">{hd.holeNumber}</span>
                            <span className="text-[8px] font-mono">{myDiff > 0 ? '+' : ''}{myDiff}</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="top" className="w-[95vw] max-w-sm p-3 text-xs">
                          <div className="space-y-1.5">
                            <p className="font-semibold">Hoyo {hd.holeNumber}</p>
                            <p>{getName(hd.team1[0])}+{getName(hd.team1[1])}: {hd.netA}+{hd.netB} → <span className="font-mono font-semibold">{hd.numberTeam1}</span></p>
                            <p>{getName(hd.team2[0])}+{getName(hd.team2[1])}: {hd.netC}+{hd.netD} → <span className="font-mono font-semibold">{hd.numberTeam2}</span></p>
                            {hd.multiplierApplied !== 'none' && (
                              <p className="text-amber-600">🐦 Birdie → ×2 aplicado al {hd.multiplierApplied === 'team1' ? 'Equipo 1' : 'Equipo 2'}: {hd.multiplierApplied === 'team1' ? hd.numberTeam1Effective : hd.numberTeam2Effective}</p>
                            )}
                            <p>Diferencia: {hd.diff > 0 ? `+${hd.diff}` : hd.diff} → ${fmtMoney(hd.amountThisHole)}</p>
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
