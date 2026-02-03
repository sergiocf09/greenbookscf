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

  // Get current proximities based on active tab
  // For Sangrón: use Sangrón values, but FALL BACK to Acumulado if Sangrón is empty
  // This allows the "mirror" behavior when all players have proximity in Acumulado
  // NOTE: This useMemo MUST be before any early returns to follow React hooks rules
  const currentProximities = useMemo(() => {
    if (effectiveTab === 'acumulado') {
      return proximitiesAcumulado;
    }
    // For Sangrón tab: merge Acumulado as fallback where Sangrón is empty
    const merged = new Map<string, number | null>();
    players.forEach(p => {
      const sangronVal = proximitiesSangron.get(p.id);
      const acumuladoVal = proximitiesAcumulado.get(p.id);
      // Use Sangrón if set, otherwise fall back to Acumulado
      merged.set(p.id, sangronVal ?? acumuladoVal ?? null);
    });
    return merged;
  }, [effectiveTab, proximitiesSangron, proximitiesAcumulado, players]);

  // Helper function to check if a value is inherited from Acumulado
  // NOTE: Defined as a stable callback (no useMemo needed, pure function)
  const isInheritedFromAcumulado = (playerId: string): boolean => {
    if (effectiveTab !== 'sangron') return false;
    const sangronVal = proximitiesSangron.get(playerId);
    const acumuladoVal = proximitiesAcumulado.get(playerId);
    // Inherited = no Sangrón value but has Acumulado value
    return sangronVal === null && acumuladoVal !== null;
  };

  // UX helper: "Aceptar espejos" button ONLY appears when:
  // 1. We're in Sangrón tab
  // 2. 100% of players have Acumulado proximity set (complete mirror available)
  // 3. None of the Sangrón values are explicitly set yet (all would be inherited)
  // This provides a simple one-click confirmation for the common case.
  const canAcceptMirrors = useMemo(() => {
    if (effectiveTab !== 'sangron') return false;
    
    // Check if ALL players have Acumulado proximity (100% complete)
    const acumuladoCount = Array.from(proximitiesAcumulado.values()).filter(v => v !== null).length;
    const acumuladoComplete = acumuladoCount === players.length;
    if (!acumuladoComplete) return false;
    
    // Check if ANY Sangrón value is already explicitly set
    const sangronCount = Array.from(proximitiesSangron.values()).filter(v => v !== null).length;
    // Only show button when NO Sangrón values are set (pure 100% mirror)
    return sangronCount === 0;
  }, [effectiveTab, proximitiesAcumulado, proximitiesSangron, players]);

  // Don't render if not a Par 3 or Oyeses not enabled
  if (!isPar3 || !oyesesEnabled) {
    return null;
  }

  // Dynamic proximity options based on player count
  const proximityOptions = Array.from({ length: players.length }, (_, i) => i + 1);
  
  const onProximityChange = effectiveTab === 'acumulado' ? onProximityAcumuladoChange : onProximitySangronChange;
  
  // Count how many proximities are set
  const setCount = Array.from(currentProximities.values()).filter(v => v !== null).length;
  const acumuladoSetCount = Array.from(proximitiesAcumulado.values()).filter(v => v !== null).length;
  // For Sangrón, count how many have explicit Sangrón values (not inherited)
  const sangronSetCount = Array.from(proximitiesSangron.values()).filter(v => v !== null).length;
  // Effective count for Sangrón = Sangrón + inherited from Acumulado
  const sangronEffectiveCount = Array.from(currentProximities.values()).filter(v => v !== null).length;


  const handleAcceptMirrors = () => {
    if (effectiveTab !== 'sangron') return;
    players.forEach((p) => {
      const sangronVal = proximitiesSangron.get(p.id);
      const acumuladoVal = proximitiesAcumulado.get(p.id);
      if (sangronVal === null && acumuladoVal !== null) {
        onProximitySangronChange(p.id, acumuladoVal);
      }
    });
  };
  
  // Check if all positions are filled (required for Sangrón)
  const allPositionsFilled = setCount === players.length;
  // For Sangrón complete check, use effective count (including inherited)
  const sangronComplete = effectiveTab === 'sangron' ? sangronEffectiveCount === players.length : sangronSetCount === players.length;
  
  // Check for duplicate proximities
  const proximityValues = Array.from(currentProximities.values()).filter(v => v !== null);
  const hasDuplicates = proximityValues.length !== new Set(proximityValues).size;
  

  // Button badge logic
  const badgeCount = hasAcumulado && hasSangron 
    ? Math.max(acumuladoSetCount, sangronEffectiveCount)
    : hasAcumulado 
      ? acumuladoSetCount 
      : sangronEffectiveCount;
  
  // Needs attention only if Sangrón is not complete (considering inherited values)
  const needsAttention = hasSangron && !sangronComplete && sangronEffectiveCount < players.length && (acumuladoSetCount > 0 || sangronSetCount > 0);

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
                // Check if value is inherited from Acumulado (for visual distinction)
                const isInherited = isInheritedFromAcumulado(player.id);
                const displayProximity = currentProximity;
                const isLoggedInUser = player.id === basePlayerId || player.profileId === basePlayerId;
                const shortName = formatPlayerNameShort(player.name);
                
                // Get the actual value in the current tab's field (not fallback)
                const actualTabValue = effectiveTab === 'acumulado' 
                  ? proximitiesAcumulado.get(player.id)
                  : proximitiesSangron.get(player.id);
                
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
                        
                        // For click logic: check if THIS tab actually has the value
                        // If inherited, clicking should WRITE the value (not toggle off)
                        const isActuallySetInThisTab = actualTabValue === pos;
                        
                        // Check if position is taken by another player
                        const isTakenByOther = !isSelected && Array.from(currentProximities.entries()).some(
                          ([pid, prox]) => pid !== player.id && prox === pos
                        );
                        
                        // In Sangrón tab: inherited values are READ-ONLY (cannot be modified)
                        // User must use "Aceptar espejos" button to confirm all at once
                        const isReadOnlyInherited = isInherited && isSelected;
                        const isDisabled = isTakenByOther || isReadOnlyInherited;
                        
                        return (
                          <button
                            key={pos}
                            onClick={() => {
                              // Inherited values are now read-only, no click action
                              if (isReadOnlyInherited) return;
                              // Normal toggle behavior
                              onProximityChange(player.id, isActuallySetInThisTab ? null : pos);
                            }}
                            className={cn(
                              "w-7 h-7 rounded-full text-xs font-bold transition-all",
                              isSelected 
                                ? isInherited
                                  ? "bg-background text-foreground border-2 border-primary cursor-default" // Inherited = read-only, white bg with green border
                                  : "bg-golf-gold text-golf-dark" // Explicitly set = solid gold
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
              <>
                <p className="text-golf-gold">• Sangrón: todas las posiciones deben asignarse para resolver</p>
                <p>• Los valores de Acumulado se muestran como espejo (borde punteado)</p>
                <p>• Click en un espejo lo confirma para Sangrón</p>
              </>
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-between gap-2 pt-2">
          {effectiveTab === 'sangron' && canAcceptMirrors ? (
            <Button variant="outline" onClick={handleAcceptMirrors}>
              Aceptar espejos
            </Button>
          ) : (
            <span />
          )}

          <Button onClick={() => setOpen(false)}>Listo</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
