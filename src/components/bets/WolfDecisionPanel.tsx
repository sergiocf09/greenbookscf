import React, { useState } from 'react';
import { Player, WolfConfig, WolfHoleState } from '@/types/golf';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fmtMoney } from '@/lib/formatMoney';
import { cn } from '@/lib/utils';

interface WolfDecisionPanelProps {
  holeNumber: number;
  players: Player[];
  wolfPlayerId: string;
  holeState: WolfHoleState | null;
  wolfConfig: WolfConfig;
  isOrganizer: boolean;
  currentUserId: string | null;
  onDecision: (partnerIds: string[], wentSolo: boolean) => Promise<void>;
  isRedemption?: boolean;
}

const timingLabels: Record<string, string> = {
  A: 'Antes del driver',
  B: 'Al pegar el driver',
  C: 'Antes del 2° golpe',
};

export const WolfDecisionPanel: React.FC<WolfDecisionPanelProps> = ({
  holeNumber,
  players,
  wolfPlayerId,
  holeState,
  wolfConfig,
  isOrganizer,
  currentUserId,
  onDecision,
  isRedemption,
}) => {
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);

  const wolfPlayer = players.find(p => p.id === wolfPlayerId);
  if (!wolfPlayer) return null;

  const canDecide =
    isOrganizer || wolfPlayer.profileId === currentUserId;

  const maxPartners = players.length >= 6 ? 2 : 1;

  const togglePartner = (id: string) => {
    setSelectedPartners(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= maxPartners) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const otherPlayers = players.filter(p => p.id !== wolfPlayerId);

  // Decide which state to show
  const showSelectionUI = !holeState || editing;
  const showInPlay = holeState && holeState.result === null && !editing;
  const showResolved = holeState && holeState.result !== null;

  return (
    <div className="rounded-lg border border-border overflow-hidden mb-3">
      {/* Header */}
      <div className="bg-[hsl(155,100%,15%)] text-[hsl(50,95%,55%)] px-3 py-2 flex items-center gap-2">
        <span>🐺</span>
        <PlayerAvatar
          initials={wolfPlayer.initials}
          background={wolfPlayer.color}
          size="sm"
        />
        <span className="font-semibold text-sm">{wolfPlayer.name.split(' ')[0]}</span>
        <span className="text-xs opacity-80">— La Loba</span>
        {isRedemption && (
          <Badge variant="destructive" className="ml-auto text-[9px]">
            Recuperación ×3
          </Badge>
        )}
      </div>
      <div className="px-3 pb-1 bg-[hsl(155,100%,15%)]">
        <p className="text-[10px] text-[hsl(50,95%,55%)]/70">
          {isRedemption
            ? `$${fmtMoney(wolfConfig.amountPerHole * 3)} (×3) · Solo obligatorio`
            : `$${fmtMoney(wolfConfig.amountPerHole)} por hoyo · ${timingLabels[wolfConfig.timing] ?? wolfConfig.timing}`}
        </p>
      </div>

      <div className="p-3 bg-card">
        {/* STATE 1: Selection */}
        {showSelectionUI && (
          canDecide ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Elige pareja{maxPartners > 1 ? 's' : ''}:</p>
              <div className="flex flex-wrap gap-2">
                {otherPlayers.map(p => {
                  const selected = selectedPartners.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePartner(p.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                        selected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted text-muted-foreground border-transparent hover:bg-muted/80'
                      )}
                    >
                      <PlayerAvatar initials={p.initials} background={p.color} size="xs" />
                      {p.name.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={selectedPartners.length === 0}
                  onClick={() => {
                    onDecision(selectedPartners, false);
                    setSelectedPartners([]);
                    setEditing(false);
                  }}
                  className="flex-1"
                >
                  Confirmar pareja
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500 text-amber-600 hover:bg-amber-50"
                  onClick={() => {
                    onDecision([], true);
                    setSelectedPartners([]);
                    setEditing(false);
                  }}
                >
                  🐺 Ir Sola ×2
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Esperando decisión de La Loba…</p>
          )
        )}

        {/* STATE 2: Decision made, hole in play */}
        {showInPlay && holeState && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {holeState.wentSolo ? (
                <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/40">
                  🐺 Sola ×2
                </Badge>
              ) : (
                holeState.partnerIds.map(id => {
                  const p = players.find(pl => pl.id === id);
                  if (!p) return null;
                  return (
                    <Badge key={id} variant="secondary" className="flex items-center gap-1">
                      <PlayerAvatar initials={p.initials} background={p.color} size="xs" />
                      {p.name.split(' ')[0]}
                    </Badge>
                  );
                })
              )}
              {(holeState.carryoverHoles ?? 0) > 0 && (
                <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/40 text-[10px]">
                  ↑ Carry +{holeState.carryoverHoles}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Monto efectivo: <span className="font-semibold text-foreground">${fmtMoney(holeState.effectiveAmount ?? wolfConfig.amountPerHole)}</span> por rival
            </p>
            {canDecide && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7"
                onClick={() => {
                  setEditing(true);
                  setSelectedPartners([]);
                }}
              >
                Cambiar
              </Button>
            )}
          </div>
        )}

        {/* STATE 3: Resolved */}
        {showResolved && holeState && (
          <div
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium',
              holeState.result === 'won' && 'bg-green-500/10 text-green-700',
              holeState.result === 'lost' && 'bg-red-500/10 text-red-700',
              holeState.result === 'tied' && 'bg-muted text-muted-foreground'
            )}
          >
            {holeState.result === 'won' && (
              <>✅ La Loba ganó · +${fmtMoney(holeState.effectiveAmount ?? wolfConfig.amountPerHole)} por rival</>
            )}
            {holeState.result === 'lost' && (
              <>❌ La Loba perdió · -${fmtMoney(holeState.effectiveAmount ?? wolfConfig.amountPerHole)} por rival</>
            )}
            {holeState.result === 'tied' && (
              <span className="flex items-center gap-2">
                ↔ Empate
                {wolfConfig.carryover && (
                  <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/40 text-[10px]">
                    ↑ Carry
                  </Badge>
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
