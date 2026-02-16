import React from 'react';
import { BetConfig, Player, OyesesPlayerConfig, OyesModality } from '@/types/golf';
import { BetSection } from './BetSection';
import { AmountInput } from './AmountInput';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { RayasConfig } from './RayasConfig';
import { CollapsibleSubSection } from './CollapsibleSubSection';
import { formatPlayerName } from '@/lib/playerInput';
import { ParticipationMatrix, betHasParticipants } from './ParticipationMatrix';

interface IndividualBetsProps {
  config: BetConfig;
  players: Player[];
  expandedSections: string[];
  onToggleSection: (section: string, open: boolean) => void;
  onUpdateBet: <K extends keyof BetConfig>(betType: K, updates: Partial<BetConfig[K]>) => void;
  basePlayerId?: string;
}

export const IndividualBets: React.FC<IndividualBetsProps> = ({
  config,
  players,
  expandedSections,
  onToggleSection,
  onUpdateBet,
  basePlayerId,
}) => {
  /** Only show bet detail if at least 1 player participates */
  const show = (betKey: string) => betHasParticipants(config, betKey, players);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground mb-2">
        Apuestas jugador vs jugador. Usan la Matriz de Hándicaps Bilaterales.
      </p>

      {/* Participation Matrix */}
      <ParticipationMatrix
        config={config}
        players={players}
        onUpdateBet={onUpdateBet}
      />

      {/* Medal */}
      {show('medal') && (
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
      )}

      {/* Pressures */}
      {show('pressures') && (
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
      )}

      {/* Skins */}
      {show('skins') && (
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

          <CollapsibleSubSection
            label="Configuración"
            summary={`${(config.skins.modality ?? 'acumulados') === 'acumulados' ? 'Acumulados' : 'Sin Acumular'}${config.skins.carryOver ? ' · Arrastre' : ''}`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                <Label className="text-xs text-muted-foreground">Modalidad global</Label>
                <div className="flex gap-1" onMouseDown={(e) => e.stopPropagation()}>
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateBet('skins', { modality: 'acumulados' }); }}
                    className={cn('px-2 py-1 text-[10px] rounded transition-colors', (config.skins.modality ?? 'acumulados') === 'acumulados' ? 'bg-golf-gold text-golf-dark font-medium' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>Acum</button>
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateBet('skins', { modality: 'sinAcumular' }); }}
                    className={cn('px-2 py-1 text-[10px] rounded transition-colors', (config.skins.modality ?? 'acumulados') === 'sinAcumular' ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>Sin Acum</button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Arrastrar del 9 al 10</Label>
                <Switch checked={config.skins.carryOver} onCheckedChange={(v) => onUpdateBet('skins', { carryOver: v })} />
              </div>

              <CollapsibleSubSection
                label="Modalidad por jugador"
                summary={(() => {
                  const variants = config.skins.playerSkinVariants;
                  if (!variants || Object.keys(variants).length === 0) return 'Todos usan global';
                  const customCount = Object.values(variants).filter(v => v !== (config.skins.modality ?? 'acumulados')).length;
                  return customCount > 0 ? `${customCount} personalizado${customCount > 1 ? 's' : ''}` : 'Todos usan global';
                })()}
              >
                <div className="space-y-1.5">
                  {players.map(player => {
                    const globalModality = config.skins.modality ?? 'acumulados';
                    const playerVariant = config.skins.playerSkinVariants?.[player.id] ?? globalModality;
                    return (
                      <div key={player.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: player.color }}>{player.initials}</div>
                          <span className="text-xs">{formatPlayerName(player.name)}</span>
                        </div>
                        <div className="flex gap-1" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); const updated = { ...config.skins.playerSkinVariants }; if ('acumulados' === globalModality) { delete updated[player.id]; } else { updated[player.id] = 'acumulados'; } onUpdateBet('skins', { playerSkinVariants: updated }); }}
                            className={cn('px-2 py-1 text-[10px] rounded transition-colors', playerVariant === 'acumulados' ? 'bg-golf-gold text-golf-dark font-medium' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>Acum</button>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); const updated = { ...config.skins.playerSkinVariants }; if ('sinAcumular' === globalModality) { delete updated[player.id]; } else { updated[player.id] = 'sinAcumular'; } onUpdateBet('skins', { playerSkinVariants: updated }); }}
                            className={cn('px-2 py-1 text-[10px] rounded transition-colors', playerVariant === 'sinAcumular' ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>Sin Acum</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CollapsibleSubSection>
            </div>
          </CollapsibleSubSection>
        </BetSection>
      )}

      {/* Caros */}
      {show('caros') && (
        <BetSection
          id="caros"
          title="Caros"
          description={`Hoyos ${config.caros.startHole ?? 15}-${config.caros.endHole ?? 18} (ganador único)`}
          enabled={config.caros.enabled}
          onToggle={(enabled) => onUpdateBet('caros', { enabled })}
          isExpanded={expandedSections.includes('caros')}
          onExpandChange={(open) => onToggleSection('caros', open)}
        >
          <AmountInput label="Importe total" value={config.caros.amount} onChange={(v) => onUpdateBet('caros', { amount: v })} />
          <CollapsibleSubSection label="Configuración" summary={`Hoyos ${config.caros.startHole ?? 15} a ${config.caros.endHole ?? 18}`}>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Rango:</Label>
              <div className="flex items-center gap-1">
                <input type="number" min={1} max={17} value={config.caros.startHole ?? 15}
                  onChange={(e) => { const start = Math.max(1, Math.min(17, parseInt(e.target.value) || 15)); onUpdateBet('caros', { startHole: start }); }}
                  onClick={(e) => e.stopPropagation()} className="w-12 h-6 text-center text-xs p-1 border rounded bg-background" />
                <span className="text-xs text-muted-foreground">a</span>
                <input type="number" min={2} max={18} value={config.caros.endHole ?? 18}
                  onChange={(e) => { const end = Math.max(2, Math.min(18, parseInt(e.target.value) || 18)); onUpdateBet('caros', { endHole: end }); }}
                  onClick={(e) => e.stopPropagation()} className="w-12 h-6 text-center text-xs p-1 border rounded bg-background" />
              </div>
            </div>
          </CollapsibleSubSection>
        </BetSection>
      )}

      {/* Oyeses */}
      {show('oyeses') && (
        <BetSection
          id="oyeses"
          title="Oyeses (Closest to the Pin)"
          description="Par 3 - cercanía a la bandera"
          enabled={config.oyeses.enabled}
          onToggle={(enabled) => {
            if (enabled && config.oyeses.playerConfigs.length === 0) {
              const playerConfigs: OyesesPlayerConfig[] = players.map(p => ({ playerId: p.id, modality: 'acumulados' as OyesModality, enabled: true }));
              onUpdateBet('oyeses', { enabled, playerConfigs });
            } else {
              onUpdateBet('oyeses', { enabled });
            }
          }}
          isExpanded={expandedSections.includes('oyeses')}
          onExpandChange={(open) => onToggleSection('oyeses', open)}
          color="gold"
        >
          <AmountInput label="Importe por Oyes" value={config.oyeses.amount} onChange={(v) => onUpdateBet('oyeses', { amount: v })} />
          <CollapsibleSubSection label="Configuración" summary="Modalidad por jugador">
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground mb-2">Acumulados: debe llegar al green en 1 golpe. Sangrón: todos compiten sin acumular.</p>
              {players.map(player => {
                const playerConfig = config.oyeses.playerConfigs.find(pc => pc.playerId === player.id);
                const isEnabled = playerConfig?.enabled ?? true;
                const modality = playerConfig?.modality ?? 'acumulados';
                const updatePlayerOyes = (updates: Partial<OyesesPlayerConfig>) => {
                  const existingConfigs = [...config.oyeses.playerConfigs];
                  const idx = existingConfigs.findIndex(pc => pc.playerId === player.id);
                  if (idx >= 0) { existingConfigs[idx] = { ...existingConfigs[idx], ...updates }; }
                  else { existingConfigs.push({ playerId: player.id, modality: 'acumulados', enabled: true, ...updates }); }
                  onUpdateBet('oyeses', { playerConfigs: existingConfigs });
                };
                return (
                  <div key={player.id} className={cn("flex items-center justify-between p-2 rounded-lg transition-colors", isEnabled ? "bg-muted/50" : "bg-muted/20 opacity-60")}>
                    <div className="flex items-center gap-2">
                      <Switch checked={isEnabled} onCheckedChange={(v) => updatePlayerOyes({ enabled: v })} className="scale-75" />
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: player.color }}>{player.initials}</div>
                      <span className="text-xs">{formatPlayerName(player.name)}</span>
                    </div>
                    {isEnabled && (
                      <div className="flex gap-1" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); updatePlayerOyes({ modality: 'acumulados' }); }}
                          className={cn("px-2 py-1 text-[10px] rounded transition-colors", modality === 'acumulados' ? "bg-golf-gold text-golf-dark font-medium" : "bg-muted text-muted-foreground hover:bg-muted/80")}>Acum</button>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); updatePlayerOyes({ modality: 'sangron' }); }}
                          className={cn("px-2 py-1 text-[10px] rounded transition-colors", modality === 'sangron' ? "bg-destructive text-destructive-foreground font-medium" : "bg-muted text-muted-foreground hover:bg-muted/80")}>Sang</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleSubSection>
        </BetSection>
      )}

      {/* Units */}
      {show('units') && (
        <BetSection
          id="units" title="Unidades" description="Birdie, Águila, Sandy Par, etc."
          enabled={config.units.enabled} onToggle={(enabled) => onUpdateBet('units', { enabled })}
          isExpanded={expandedSections.includes('units')} onExpandChange={(open) => onToggleSection('units', open)} color="gold"
        >
          <AmountInput label="Valor por punto" value={config.units.valuePerPoint} onChange={(v) => onUpdateBet('units', { valuePerPoint: v })} />
        </BetSection>
      )}

      {/* Manchas */}
      {show('manchas') && (
        <BetSection
          id="manchas" title="Manchas" description="Pinkie, Paloma, Trampa, Cuatriput, etc."
          enabled={config.manchas.enabled} onToggle={(enabled) => onUpdateBet('manchas', { enabled })}
          isExpanded={expandedSections.includes('manchas')} onExpandChange={(open) => onToggleSection('manchas', open)} color="red"
        >
          <AmountInput label="Valor por mancha" value={config.manchas.valuePerPoint} onChange={(v) => onUpdateBet('manchas', { valuePerPoint: v })} />
        </BetSection>
      )}

      {/* Putts */}
      {show('putts') && (
        <BetSection
          id="putts" title="Putts ⛳" description="Comparación directa de putts (sin hándicap)"
          enabled={config.putts?.enabled ?? false} onToggle={(enabled) => onUpdateBet('putts', { enabled })}
          isExpanded={expandedSections.includes('putts')} onExpandChange={(open) => onToggleSection('putts', open)}
        >
          <AmountInput label="Front 9" value={config.putts?.frontAmount ?? 50} onChange={(v) => onUpdateBet('putts', { frontAmount: v })} />
          <AmountInput label="Back 9" value={config.putts?.backAmount ?? 50} onChange={(v) => onUpdateBet('putts', { backAmount: v })} />
          <AmountInput label="Total 18" value={config.putts?.totalAmount ?? 100} onChange={(v) => onUpdateBet('putts', { totalAmount: v })} />
          <p className="text-[9px] text-muted-foreground mt-2">⚠️ Esta apuesta NO utiliza hándicaps. Gana quien tenga menos putts totales.</p>
        </BetSection>
      )}

      {/* Rayas */}
      {show('rayas') && (
        <BetSection
          id="rayas" title="Rayas" description="Agregador: Skins + Unidades + Oyes + Medal"
          enabled={config.rayas?.enabled ?? false} onToggle={(enabled) => onUpdateBet('rayas', { enabled })}
          isExpanded={expandedSections.includes('rayas')} onExpandChange={(open) => onToggleSection('rayas', open)} color="gold"
        >
          <RayasConfig config={config} players={players} basePlayerId={basePlayerId} onUpdateRayas={(updates) => onUpdateBet('rayas', updates)} />
        </BetSection>
      )}
    </div>
  );
};
