import React from 'react';
import { BetConfig, Player, OyesesPlayerConfig, OyesModality, RayasSkinVariant } from '@/types/golf';
import { BetSection } from './BetSection';
import { AmountInput } from './AmountInput';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface IndividualBetsProps {
  config: BetConfig;
  players: Player[];
  expandedSections: string[];
  onToggleSection: (section: string, open: boolean) => void;
  onUpdateBet: <K extends keyof BetConfig>(betType: K, updates: Partial<BetConfig[K]>) => void;
}

export const IndividualBets: React.FC<IndividualBetsProps> = ({
  config,
  players,
  expandedSections,
  onToggleSection,
  onUpdateBet,
}) => {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground mb-2">
        Apuestas jugador vs jugador. Usan la Matriz de Hándicaps Bilaterales.
      </p>

      {/* Medal */}
      <BetSection
        id="medal"
        title="Medal"
        description="Score total por segmento"
        enabled={config.medal.enabled}
        onToggle={(enabled) => onUpdateBet('medal', { enabled })}
        isExpanded={expandedSections.includes('medal')}
        onExpandChange={(open) => onToggleSection('medal', open)}
      >
        <AmountInput label="Front 9" value={config.medal.frontAmount} onChange={(v) => onUpdateBet('medal', { frontAmount: v })} />
        <AmountInput label="Back 9" value={config.medal.backAmount} onChange={(v) => onUpdateBet('medal', { backAmount: v })} />
        <AmountInput label="Total 18" value={config.medal.totalAmount} onChange={(v) => onUpdateBet('medal', { totalAmount: v })} />
      </BetSection>

      {/* Pressures */}
      <BetSection
        id="pressures"
        title="Presiones"
        description="Match play, se abre cuando vas 2 abajo"
        enabled={config.pressures.enabled}
        onToggle={(enabled) => onUpdateBet('pressures', { enabled })}
        isExpanded={expandedSections.includes('pressures')}
        onExpandChange={(open) => onToggleSection('pressures', open)}
      >
        <AmountInput label="Front 9" value={config.pressures.frontAmount} onChange={(v) => onUpdateBet('pressures', { frontAmount: v })} />
        <AmountInput label="Back 9" value={config.pressures.backAmount} onChange={(v) => onUpdateBet('pressures', { backAmount: v })} />
        <AmountInput label="Match 18" value={config.pressures.totalAmount} onChange={(v) => onUpdateBet('pressures', { totalAmount: v })} />
      </BetSection>

      {/* Skins */}
      <BetSection
        id="skins"
        title="Skins"
        description="Mejor score neto por hoyo"
        enabled={config.skins.enabled}
        onToggle={(enabled) => onUpdateBet('skins', { enabled })}
        isExpanded={expandedSections.includes('skins')}
        onExpandChange={(open) => onToggleSection('skins', open)}
      >
        <AmountInput label="Front 9 (por skin)" value={config.skins.frontValue} onChange={(v) => onUpdateBet('skins', { frontValue: v })} />
        <AmountInput label="Back 9 (por skin)" value={config.skins.backValue} onChange={(v) => onUpdateBet('skins', { backValue: v })} />

        <div className="flex items-center justify-between mt-2" onClick={(e) => e.stopPropagation()}>
          <Label className="text-xs text-muted-foreground">Modalidad</Label>
          <div className="flex gap-1" onMouseDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onUpdateBet('skins', { modality: 'acumulados' });
              }}
              className={cn(
                'px-2 py-1 text-[10px] rounded transition-colors',
                (config.skins.modality ?? 'acumulados') === 'acumulados'
                  ? 'bg-golf-gold text-golf-dark font-medium'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              Acum
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onUpdateBet('skins', { modality: 'sinAcumular' });
              }}
              className={cn(
                'px-2 py-1 text-[10px] rounded transition-colors',
                (config.skins.modality ?? 'acumulados') === 'sinAcumular'
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              Sin Acum
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Arrastrar del 9 al 10</Label>
          <Switch
            checked={config.skins.carryOver}
            onCheckedChange={(v) => onUpdateBet('skins', { carryOver: v })}
          />
        </div>
      </BetSection>

      {/* Caros */}
      <BetSection
        id="caros"
        title="Caros"
        description="Hoyos 15-18 (ganador único)"
        enabled={config.caros.enabled}
        onToggle={(enabled) => onUpdateBet('caros', { enabled })}
        isExpanded={expandedSections.includes('caros')}
        onExpandChange={(open) => onToggleSection('caros', open)}
      >
        <AmountInput label="Importe total" value={config.caros.amount} onChange={(v) => onUpdateBet('caros', { amount: v })} />
      </BetSection>

      {/* Oyeses */}
      <BetSection
        id="oyeses"
        title="Oyeses (Closest to the Pin)"
        description="Par 3 - cercanía a la bandera"
        enabled={config.oyeses.enabled}
        onToggle={(enabled) => {
          if (enabled && config.oyeses.playerConfigs.length === 0) {
            const playerConfigs: OyesesPlayerConfig[] = players.map(p => ({
              playerId: p.id,
              modality: 'acumulados' as OyesModality,
              enabled: true,
            }));
            onUpdateBet('oyeses', { enabled, playerConfigs });
          } else {
            onUpdateBet('oyeses', { enabled });
          }
        }}
        isExpanded={expandedSections.includes('oyeses')}
        onExpandChange={(open) => onToggleSection('oyeses', open)}
        color="gold"
      >
        <AmountInput 
          label="Importe por Oyes" 
          value={config.oyeses.amount} 
          onChange={(v) => onUpdateBet('oyeses', { amount: v })} 
        />
        
        <div className="space-y-2 mt-3">
          <Label className="text-xs font-medium">Modalidad por jugador</Label>
          <p className="text-[10px] text-muted-foreground mb-2">
            Acumulados: debe llegar al green en 1 golpe. Sangrón: todos compiten sin acumular.
          </p>
          
          {players.map(player => {
            const playerConfig = config.oyeses.playerConfigs.find(pc => pc.playerId === player.id);
            const isEnabled = playerConfig?.enabled ?? true;
            const modality = playerConfig?.modality ?? 'acumulados';
            
            const updatePlayerOyes = (updates: Partial<OyesesPlayerConfig>) => {
              const existingConfigs = [...config.oyeses.playerConfigs];
              const idx = existingConfigs.findIndex(pc => pc.playerId === player.id);
              if (idx >= 0) {
                existingConfigs[idx] = { ...existingConfigs[idx], ...updates };
              } else {
                existingConfigs.push({
                  playerId: player.id,
                  modality: 'acumulados',
                  enabled: true,
                  ...updates,
                });
              }
              onUpdateBet('oyeses', { playerConfigs: existingConfigs });
            };
            
            return (
              <div 
                key={player.id} 
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg transition-colors",
                  isEnabled ? "bg-muted/50" : "bg-muted/20 opacity-60"
                )}
              >
                <div className="flex items-center gap-2">
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(v) => updatePlayerOyes({ enabled: v })}
                    className="scale-75"
                  />
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold"
                    style={{ backgroundColor: player.color }}
                  >
                    {player.initials}
                  </div>
                  <span className="text-xs">{player.name}</span>
                </div>
                
                {isEnabled && (
                  <div 
                    className="flex gap-1"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updatePlayerOyes({ modality: 'acumulados' });
                      }}
                      className={cn(
                        "px-2 py-1 text-[10px] rounded transition-colors",
                        modality === 'acumulados' 
                          ? "bg-golf-gold text-golf-dark font-medium" 
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      Acum
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updatePlayerOyes({ modality: 'sangron' });
                      }}
                      className={cn(
                        "px-2 py-1 text-[10px] rounded transition-colors",
                        modality === 'sangron' 
                          ? "bg-destructive text-destructive-foreground font-medium" 
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                    >
                      Sang
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </BetSection>

      {/* Units */}
      <BetSection
        id="units"
        title="Unidades"
        description="Birdie, Águila, Sandy Par, etc."
        enabled={config.units.enabled}
        onToggle={(enabled) => onUpdateBet('units', { enabled })}
        isExpanded={expandedSections.includes('units')}
        onExpandChange={(open) => onToggleSection('units', open)}
        color="gold"
      >
        <AmountInput label="Valor por punto" value={config.units.valuePerPoint} onChange={(v) => onUpdateBet('units', { valuePerPoint: v })} />
      </BetSection>

      {/* Manchas */}
      <BetSection
        id="manchas"
        title="Manchas"
        description="Pinkie, Paloma, Trampa, Cuatriput, etc."
        enabled={config.manchas.enabled}
        onToggle={(enabled) => onUpdateBet('manchas', { enabled })}
        isExpanded={expandedSections.includes('manchas')}
        onExpandChange={(open) => onToggleSection('manchas', open)}
        color="red"
      >
        <AmountInput label="Valor por mancha" value={config.manchas.valuePerPoint} onChange={(v) => onUpdateBet('manchas', { valuePerPoint: v })} />
      </BetSection>

      {/* Putts - NEW */}
      <BetSection
        id="putts"
        title="Putts ⛳"
        description="Comparación directa de putts (sin hándicap)"
        enabled={config.putts.enabled}
        onToggle={(enabled) => onUpdateBet('putts', { enabled })}
        isExpanded={expandedSections.includes('putts')}
        onExpandChange={(open) => onToggleSection('putts', open)}
      >
        <AmountInput label="Front 9" value={config.putts.frontAmount} onChange={(v) => onUpdateBet('putts', { frontAmount: v })} />
        <AmountInput label="Back 9" value={config.putts.backAmount} onChange={(v) => onUpdateBet('putts', { backAmount: v })} />
        <AmountInput label="Total 18" value={config.putts.totalAmount} onChange={(v) => onUpdateBet('putts', { totalAmount: v })} />
        <p className="text-[9px] text-muted-foreground mt-2">
          ⚠️ Esta apuesta NO utiliza hándicaps. Gana quien tenga menos putts totales.
        </p>
      </BetSection>

      {/* Rayas - Aggregator */}
      <BetSection
        id="rayas"
        title="Rayas"
        description="Agregador: Skins + Unidades + Oyes + Medal"
        enabled={config.rayas.enabled}
        onToggle={(enabled) => onUpdateBet('rayas', { enabled })}
        isExpanded={expandedSections.includes('rayas')}
        onExpandChange={(open) => onToggleSection('rayas', open)}
        color="gold"
      >
        <AmountInput label="Front 9 (por raya)" value={config.rayas.frontValue} onChange={(v) => onUpdateBet('rayas', { frontValue: v })} />
        <AmountInput label="Back 9 (por raya)" value={config.rayas.backValue} onChange={(v) => onUpdateBet('rayas', { backValue: v })} />
        <AmountInput label="Medal Total (raya extra)" value={config.rayas.medalTotalValue} onChange={(v) => onUpdateBet('rayas', { medalTotalValue: v })} />
        
        <div className="flex items-center justify-between mt-2" onClick={(e) => e.stopPropagation()}>
          <Label className="text-xs text-muted-foreground">Variante Skins</Label>
          <div 
            className="flex gap-1"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onUpdateBet('rayas', { skinVariant: 'acumulados' as RayasSkinVariant });
              }}
              className={cn(
                "px-2 py-1 text-[10px] rounded transition-colors",
                config.rayas.skinVariant === 'acumulados' 
                  ? "bg-golf-gold text-golf-dark font-medium" 
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              Acum
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onUpdateBet('rayas', { skinVariant: 'sinAcumulacion' as RayasSkinVariant });
              }}
              className={cn(
                "px-2 py-1 text-[10px] rounded transition-colors",
                config.rayas.skinVariant === 'sinAcumulacion' 
                  ? "bg-primary text-primary-foreground font-medium" 
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              Sin Acum
            </button>
          </div>
        </div>
        
        <p className="text-[9px] text-muted-foreground mt-2">
          Rayas = Skins ganados + Unidades (+) + Oyes (el más cercano gana a todos) + Medal por segmento
        </p>
      </BetSection>
    </div>
  );
};
