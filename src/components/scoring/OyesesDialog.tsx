import React, { useMemo, useState } from 'react';
import { Player, BetConfig, OyesModality } from '@/types/golf';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Target, Zap, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getOyesModalityForPair, hasAnySangronPairs } from '@/lib/rayasCalculations';
import { formatPlayerNameShort } from '@/lib/playerInput';

interface OyesesDialogProps {
  players: Player[];
  betConfig: BetConfig;
  basePlayerId?: string;
  currentHole: number;
  isPar3: boolean;
  // Proximities for Acumulado modality
  proximitiesAcumulado: Map<string, number | null>;
  onProximityAcumuladoChange: (playerId: string, proximity: number | null) => void;
  // Proximities for Sangrón modality
  proximitiesSangron: Map<string, number | null>;
  onProximitySangronChange: (playerId: string, proximity: number | null) => void;
  trigger?: React.ReactNode;
}

/**
 * Check if Oyeses is enabled (either as standalone bet or as Rayas segment)
 */
const isOyesesEnabled = (config: BetConfig): boolean => {
  // Check standalone Oyeses bet
  if (config.oyeses?.enabled) return true;
  
  // Check Rayas Oyes segment
  if (config.rayas?.enabled) {
    const oyesSegment = config.rayas.segments?.oyes;
    return oyesSegment?.enabled ?? true; // Default to enabled if not specified
  }
  
  return false;
};

/**
 * Analyze which Oyeses modalities are active across all bets and pairs
 * Returns whether Acumulado-only, Sangrón-only, or both are active
 */
const analyzeActiveModalities = (
  config: BetConfig,
  players: Player[]
): { hasAcumulado: boolean; hasSangron: boolean; showTabs: boolean } => {
  let hasAcumulado = false;
  let hasSangron = false;
  
  // Check standalone Oyeses bet
  if (config.oyeses?.enabled && config.oyeses.playerConfigs) {
    for (const pc of config.oyeses.playerConfigs) {
      if (pc.enabled) {
        if (pc.modality === 'sangron') hasSangron = true;
        else hasAcumulado = true;
      }
    }
  }
  
  // Check Rayas Oyes segment - iterate all pairs
  if (config.rayas?.enabled && (config.rayas.segments?.oyes?.enabled ?? true)) {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const modality = getOyesModalityForPair(config, players[i].id, players[j].id);
        if (modality === 'sangron') hasSangron = true;
        else hasAcumulado = true;
      }
    }
  }
  
  // If no specific config found but Oyeses is enabled, default to Acumulado
  if (!hasAcumulado && !hasSangron && isOyesesEnabled(config)) {
    hasAcumulado = true;
  }
  
  // Show tabs only when BOTH modalities coexist
  const showTabs = hasAcumulado && hasSangron;
  
  return { hasAcumulado, hasSangron, showTabs };
};

type ActiveTab = 'acumulado' | 'sangron';

export const OyesesDialog: React.FC<OyesesDialogProps> = ({
  players,
  betConfig,
  basePlayerId,
  currentHole,
  isPar3,
  proximitiesAcumulado,
  onProximityAcumuladoChange,
  proximitiesSangron,
  onProximitySangronChange,
  trigger,
}) => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('acumulado');

  // Check if Oyeses is enabled at all
  const oyesesEnabled = useMemo(() => isOyesesEnabled(betConfig), [betConfig]);
  
  // Analyze active modalities
  const { hasAcumulado, hasSangron, showTabs } = useMemo(
    () => analyzeActiveModalities(betConfig, players),
    [betConfig, players]
  );
  
  // Determine effective tab (when no tabs, use the only active modality)
  const effectiveTab: ActiveTab = useMemo(() => {
    if (showTabs) return activeTab;
    if (hasSangron && !hasAcumulado) return 'sangron';
    return 'acumulado';
  }, [showTabs, activeTab, hasAcumulado, hasSangron]);

  // Don't render if not a Par 3 or Oyeses not enabled
  if (!isPar3 || !oyesesEnabled) {
    return null;
  }

  // Dynamic proximity options based on player count
  const proximityOptions = Array.from({ length: players.length }, (_, i) => i + 1);

  // Get current proximities based on active tab
  const currentProximities = effectiveTab === 'acumulado' ? proximitiesAcumulado : proximitiesSangron;
  const onProximityChange = effectiveTab === 'acumulado' ? onProximityAcumuladoChange : onProximitySangronChange;
  
  // Count how many proximities are set
  const setCount = Array.from(currentProximities.values()).filter(v => v !== null).length;
  const acumuladoSetCount = Array.from(proximitiesAcumulado.values()).filter(v => v !== null).length;
  const sangronSetCount = Array.from(proximitiesSangron.values()).filter(v => v !== null).length;
  
  // Check if all positions are filled (required for Sangrón)
  const allPositionsFilled = setCount === players.length;
  const sangronComplete = sangronSetCount === players.length;
  
  // Check for duplicate proximities
  const proximityValues = Array.from(currentProximities.values()).filter(v => v !== null);
  const hasDuplicates = proximityValues.length !== new Set(proximityValues).size;
  
  // For Sangrón tab: positions already set in Acumulado are "inherited" and locked
  const getInheritedPosition = (playerId: string): number | null => {
    if (effectiveTab !== 'sangron') return null;
    return proximitiesAcumulado.get(playerId) ?? null;
  };

  // Button badge logic
  const badgeCount = hasAcumulado && hasSangron 
    ? Math.max(acumuladoSetCount, sangronSetCount)
    : hasAcumulado 
      ? acumuladoSetCount 
      : sangronSetCount;
  
  const needsAttention = hasSangron && !sangronComplete && (acumuladoSetCount > 0 || sangronSetCount > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button 
            variant="outline" 
            size="icon" 
            className={cn(
              "shrink-0 relative",
              badgeCount > 0 && "border-primary",
              needsAttention && "border-destructive"
            )}
          >
            <Target className="h-4 w-4" />
            {hasSangron && (
              <Zap className="h-2.5 w-2.5 absolute -top-0.5 -right-0.5 text-golf-gold fill-golf-gold" />
            )}
            {badgeCount > 0 && (
              <span className={cn(
                "absolute -bottom-1 -right-1 text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold",
                needsAttention 
                  ? "bg-destructive text-destructive-foreground" 
                  : "bg-primary text-primary-foreground"
              )}>
                {badgeCount}
              </span>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Oyes - Hoyo {currentHole}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-2">
          {/* Tabs - only show when both modalities coexist */}
          {showTabs && (
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setActiveTab('acumulado')}
                className={cn(
                  "flex-1 py-1.5 px-3 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-1.5",
                  activeTab === 'acumulado' 
                    ? "bg-background shadow text-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Acumulado
                {acumuladoSetCount > 0 && (
                  <span className="text-[10px] bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center">
                    {acumuladoSetCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('sangron')}
                className={cn(
                  "flex-1 py-1.5 px-3 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-1.5",
                  activeTab === 'sangron' 
                    ? "bg-background shadow text-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Zap className="h-3.5 w-3.5 text-golf-gold fill-golf-gold" />
                Sangrón
                {sangronSetCount > 0 && (
                  <span className={cn(
                    "text-[10px] rounded-full w-4 h-4 flex items-center justify-center",
                    sangronComplete 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-destructive text-destructive-foreground"
                  )}>
                    {sangronSetCount}
                  </span>
                )}
              </button>
            </div>
          )}
          
          {/* Mode indicator when no tabs */}
          {!showTabs && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {effectiveTab === 'sangron' ? (
                <>
                  <Zap className="h-4 w-4 text-golf-gold fill-golf-gold" />
                  <span>Modalidad Sangrón</span>
                </>
              ) : (
                <span>Modalidad Acumulado</span>
              )}
            </div>
          )}
          
          <p className="text-sm text-muted-foreground">
            Selecciona el orden de proximidad al hoyo (1 = más cerca)
          </p>
          
          {/* Info for Sangrón - positions not filled = tie */}
          {effectiveTab === 'sangron' && !allPositionsFilled && (
            <p className="text-xs text-muted-foreground">
              {setCount}/{players.length} posiciones
            </p>
          )}
          
          {/* Warning for duplicate positions */}
          {hasDuplicates && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Hay posiciones duplicadas</span>
            </div>
          )}
          
          {players.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay jugadores
            </p>
          ) : (
            <div className="space-y-3">
              {players.map((player) => {
                const currentProximity = currentProximities.get(player.id);
                const inheritedPosition = getInheritedPosition(player.id);
                const isInherited = inheritedPosition !== null && effectiveTab === 'sangron';
                const displayProximity = isInherited ? inheritedPosition : currentProximity;
                const isLoggedInUser = player.id === basePlayerId || player.profileId === basePlayerId;
                const shortName = formatPlayerNameShort(player.name);
                
                return (
                  <div key={player.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-shrink">
                      <PlayerAvatar 
                        initials={player.initials} 
                        background={player.color} 
                        size="sm" 
                        isLoggedInUser={isLoggedInUser}
                      />
                      <span className="font-medium text-sm truncate max-w-[80px]">{shortName}</span>
                    </div>
                    
                    <div className="flex gap-1 shrink-0">
                      {proximityOptions.map((pos) => {
                        const isSelected = displayProximity === pos;
                        // Check if this position is taken by another player
                        const isTakenByOther = !isSelected && Array.from(currentProximities.entries()).some(
                          ([pid, prox]) => pid !== player.id && prox === pos
                        );
                        // Also check inherited positions for Sangrón
                        const isInheritedByOther = effectiveTab === 'sangron' && !isSelected && 
                          Array.from(proximitiesAcumulado.entries()).some(
                            ([pid, prox]) => pid !== player.id && prox === pos
                          );
                        const isDisabled = isTakenByOther || isInheritedByOther || isInherited;
                        
                        return (
                          <button
                            key={pos}
                            onClick={() => {
                              if (isInherited) return; // Can't change inherited positions
                              onProximityChange(player.id, isSelected ? null : pos);
                            }}
                            className={cn(
                              "w-7 h-7 rounded-full text-xs font-bold transition-all",
                              isSelected 
                                ? isInherited
                                  ? "bg-muted text-muted-foreground ring-2 ring-golf-gold"
                                  : "bg-golf-gold text-golf-dark" 
                                : isDisabled
                                  ? "bg-muted/50 text-muted-foreground/50 cursor-not-allowed"
                                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                            disabled={isDisabled}
                          >
                            {pos}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Help text */}
          <div className="text-[10px] text-muted-foreground space-y-1 pt-2 border-t">
            {effectiveTab === 'acumulado' && (
              <p>• Sin selección = no subió al green (acumula para el siguiente par 3)</p>
            )}
            <p>• El número más bajo gana el hoyo</p>
            {effectiveTab === 'sangron' && (
              <p className="text-golf-gold">• Sangrón: todas las posiciones deben asignarse para resolver en este hoyo</p>
            )}
          </div>
        </div>
        
        <div className="flex justify-end pt-2">
          <Button onClick={() => setOpen(false)}>
            Listo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
