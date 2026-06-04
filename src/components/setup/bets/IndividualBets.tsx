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
  onUpdateConfig?: (config: BetConfig) => void;
  basePlayerId?: string;
}

export const IndividualBets: React.FC<IndividualBetsProps> = ({
  config,
  players,
  expandedSections,
  onToggleSection,
  onUpdateBet,
  onUpdateConfig,
  basePlayerId,
}) => {
  /** Only show bet detail if at least 1 player participates */
  const show = (betKey: string) => betHasParticipants(config, betKey, players);
  const isNineHole = (config.roundHoles ?? 18) === 9;

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
        onUpdateConfig={onUpdateConfig}
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
          helpText="El jugador con menor score neto gana cada segmento. Se paga por Front 9, Back 9 y Total 18 por separado. En caso de empate no hay pago."
        >
          <AmountInput label="Front 9" value={config.medal.frontAmount} onChange={(v) => onUpdateBet('medal', { frontAmount: v })} />
          {!isNineHole && <AmountInput label="Back 9" value={config.medal.backAmount} onChange={(v) => onUpdateBet('medal', { backAmount: v })} />}
          {!isNineHole && <AmountInput label="Total 18" value={config.medal.totalAmount} onChange={(v) => onUpdateBet('medal', { totalAmount: v })} />}
        </BetSection>
      )}

      {/* Pressures */}
      {show('pressures') && (
        <BetSection
          id="pressures"
          title="Presiones"
          description={config.pressures.onlyMatch ? undefined : 'Se abre con diferencia de 2'}
          enabled={config.pressures.enabled}
          onToggle={(enabled) => onUpdateBet('pressures', { enabled })}
          isExpanded={expandedSections.includes('pressures')}
          onExpandChange={(open) => onToggleSection('pressures', open)}
          helpText="Match play hoyo a hoyo. Se abre una nueva apuesta cada vez que un jugador va arriba por 2 hoyos. Al final del Front y del Back se suma la apuesta principal más todas las secundarias que se abrieron."
        >
          {!(config.pressures.onlyMatch && config.pressures.continua) && (
            <>
              <AmountInput label="Front 9" value={config.pressures.frontAmount} onChange={(v) => onUpdateBet('pressures', { frontAmount: v })} />
              {!isNineHole && <AmountInput label="Back 9" value={config.pressures.backAmount} onChange={(v) => onUpdateBet('pressures', { backAmount: v })} />}
            </>
          )}
          {!isNineHole && <AmountInput label={config.pressures.continua ? "Match 18 (único)" : "Match 18"} value={config.pressures.totalAmount} onChange={(v) => onUpdateBet('pressures', { totalAmount: v })} />}

          <div className="flex items-center justify-between pt-1">
            <Label className="text-xs text-muted-foreground">Sin presiones</Label>
            <Switch checked={config.pressures.onlyMatch ?? false} onCheckedChange={(v) => onUpdateBet('pressures', { onlyMatch: v, ...(v ? {} : { continua: false }) })} />
          </div>
          {config.pressures.onlyMatch && (
            <>
              <div className="flex items-center justify-between pt-1">
                <Label className="text-xs text-muted-foreground">Match Play por 18 hoyos</Label>
                <Switch checked={config.pressures.continua ?? false} onCheckedChange={(v) => onUpdateBet('pressures', { continua: v })} />
              </div>
              {config.pressures.continua ? (
                <p className="text-[9px] text-muted-foreground">Match continuo del 1 al 18 sin corte. Se define cuando un jugador lleva más hoyos de ventaja que hoyos restantes (ej: 4&3).</p>
              ) : (
                <p className="text-[9px] text-muted-foreground">Solo se calcula la apuesta principal. No se abren secundarias.</p>
              )}
            </>
          )}
        </BetSection>
      )}

      {show('skins') && (
        <BetSection
          id="skins"
          title="Skins"
          description="Mejor score neto por hoyo"
          enabled={config.skins.enabled}
          onToggle={(enabled) => onUpdateBet('skins', { enabled })}
          isExpanded={expandedSections.includes('skins')}
          onExpandChange={(open) => onToggleSection('skins', open)}
          helpText="Gana el hoyo quien hace menos golpes netos. Si hay empate, el valor se acumula al siguiente hoyo. Modalidad Acumulados: el valor crece con los empates. Sin Acumular: se cuenta el número de hoyos ganados. Ganar todos los hoyos da un bonus 2x (zapato)."
        >
          <AmountInput label="Front 9 (por skin)" value={config.skins.frontValue} onChange={(v) => onUpdateBet('skins', { frontValue: v })} />
          {!isNineHole && <AmountInput label="Back 9 (por skin)" value={config.skins.backValue} onChange={(v) => onUpdateBet('skins', { backValue: v })} />}

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
              <p className="text-[9px] text-muted-foreground">La modalidad por par de jugadores se puede ajustar en el Dashboard de Apuestas.</p>
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
          helpText="Match de score neto en los últimos hoyos de la ronda (por defecto hoyos 15 al 18, configurable). El jugador con menor total neto en esos hoyos gana la apuesta."
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
          helpText="En hoyos par 3, gana quien queda más cerca al pin. Se registra el orden de proximidad al terminar el hoyo. Si hay acumulación activa, los hoyos empatados suman al siguiente. Ganar todos los oyeses del 9 da un bonus 2x (zapato)."
        >
          <AmountInput label="Importe por Oyes" value={config.oyeses.amount} onChange={(v) => onUpdateBet('oyeses', { amount: v })} />

          {/* Global toggles: Un solo ganador + Zapato */}
          <div className="space-y-2 mt-2">
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
              <div className="flex flex-col">
                <Label className="text-xs font-medium">Un solo ganador</Label>
                <span className="text-[10px] text-muted-foreground">
                  Solo el #1 cobra a TODOS los demás. Si está activo Acumulados, gana el pote acumulado.
                </span>
              </div>
              <Switch
                checked={config.oyeses.singleWinner ?? false}
                onCheckedChange={(v) => onUpdateBet('oyeses', { singleWinner: v })}
              />
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
              <div className="flex flex-col">
                <Label className="text-xs font-medium">Zapato (default)</Label>
                <span className="text-[10px] text-muted-foreground">
                  Activa zapato (x2 al 100%) por default en todas las bilateralidades. Se puede cambiar en cada bilateralidad.
                </span>
              </div>
              <Switch
                checked={config.oyeses.zapatoEnabled !== false}
                onCheckedChange={(v) => onUpdateBet('oyeses', { zapatoEnabled: v })}
              />
            </div>
          </div>

          <CollapsibleSubSection label="Configuración" summary="Modalidad por jugador">
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground mb-2">Acumulados: debe llegar al green en 1 golpe. Sangrón: todos compiten sin acumular.</p>
              {(() => {
                const participantIds = (config.oyeses as any).participantIds as string[] | undefined;
                const filteredPlayers = participantIds && participantIds.length > 0
                  ? players.filter(p => participantIds.includes(p.id))
                  : players;
                return filteredPlayers.map(player => {
                  const playerConfig = config.oyeses.playerConfigs.find(pc => pc.playerId === player.id);
                  const modality = playerConfig?.modality ?? 'acumulados';
                  const updatePlayerOyes = (updates: Partial<OyesesPlayerConfig>) => {
                    const existingConfigs = [...config.oyeses.playerConfigs];
                    const idx = existingConfigs.findIndex(pc => pc.playerId === player.id);
                    if (idx >= 0) { existingConfigs[idx] = { ...existingConfigs[idx], ...updates }; }
                    else { existingConfigs.push({ playerId: player.id, modality: 'acumulados', enabled: true, ...updates }); }
                    onUpdateBet('oyeses', { playerConfigs: existingConfigs });
                  };
                  return (
                    <div key={player.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: player.color }}>{player.initials}</div>
                        <span className="text-xs">{formatPlayerName(player.name)}</span>
                      </div>
                      <div className="flex gap-1" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); updatePlayerOyes({ modality: 'acumulados' }); }}
                          className={cn("px-2 py-1 text-[10px] rounded transition-colors", modality === 'acumulados' ? "bg-golf-gold text-golf-dark font-medium" : "bg-muted text-muted-foreground hover:bg-muted/80")}>Acum</button>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); updatePlayerOyes({ modality: 'sangron' }); }}
                          className={cn("px-2 py-1 text-[10px] rounded transition-colors", modality === 'sangron' ? "bg-destructive text-destructive-foreground font-medium" : "bg-muted text-muted-foreground hover:bg-muted/80")}>Sang</button>
                      </div>
                    </div>
                  );
                });
              })()}
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
          helpText="Se gana 1 unidad por birdie, 2 por águila, 3 por albatros. También suman 1 unidad los marcadores manuales: Sandy Par (par desde bunker), Aqua Par (par tras caer al agua) y Hole Out (embocada desde fuera del green)."
        >
          <AmountInput label="Valor por punto" value={config.units.valuePerPoint} onChange={(v) => onUpdateBet('units', { valuePerPoint: v })} />
          <AmountInput
            label="Valor por Unidad genérica"
            value={config.units.valuePerGenericUnit ?? config.units.valuePerPoint}
            onChange={(v) => onUpdateBet('units', { valuePerGenericUnit: v })}
          />
          <p className="text-[10px] text-muted-foreground">
            Para cualquier unidad no contemplada en el set estándar
          </p>
        </BetSection>
      )}

      {/* Manchas */}
      {show('manchas') && (
        <BetSection
          id="manchas" title="Manchas" description="Pinkie, Paloma, Trampa, Cuatriput, etc."
          enabled={config.manchas.enabled} onToggle={(enabled) => onUpdateBet('manchas', { enabled })}
          isExpanded={expandedSections.includes('manchas')} onExpandChange={(open) => onToggleSection('manchas', open)} color="red"
          helpText="Se cobra por errores durante el hoyo. Son manchas: Doble OB, Trampa (bunker a bunker), Pinkies (tiro de damas), Retruje (golpe para atrás), Doble Agua, Paloma (swing en blanco), Par 3 GIR>3, Moreliana (salirse del green poteando) y Doble Dígito (10+ golpes). El cuatriput (4+ putts) también suma como mancha. Paga el diferencial: quien tiene más manchas paga la diferencia."
        >
          <AmountInput label="Valor por mancha" value={config.manchas.valuePerPoint} onChange={(v) => onUpdateBet('manchas', { valuePerPoint: v })} />
          <AmountInput
            label="Valor por Mancha genérica"
            value={config.manchas.valuePerGenericMancha ?? config.manchas.valuePerPoint}
            onChange={(v) => onUpdateBet('manchas', { valuePerGenericMancha: v })}
          />
          <p className="text-[10px] text-muted-foreground">
            Para cualquier mancha no contemplada en el set estándar
          </p>
        </BetSection>
      )}

      {/* Putts */}
      {show('putts') && (
        <BetSection
          id="putts" title="Putts ⛳" description="Comparación directa de putts (sin hándicap)"
          enabled={config.putts?.enabled ?? false} onToggle={(enabled) => onUpdateBet('putts', { enabled })}
          isExpanded={expandedSections.includes('putts')} onExpandChange={(open) => onToggleSection('putts', open)}
          helpText="Comparación directa del total de putts entre cada par de jugadores, sin aplicar hándicap. Se paga por Front 9, Back 9 y Total 18 por separado. Quien tenga menos putts en cada segmento gana la apuesta. En empate no hay pago."
        >
          <AmountInput label="Front 9" value={config.putts?.frontAmount ?? 50} onChange={(v) => onUpdateBet('putts', { frontAmount: v })} />
          {!isNineHole && <AmountInput label="Back 9" value={config.putts?.backAmount ?? 50} onChange={(v) => onUpdateBet('putts', { backAmount: v })} />}
          {!isNineHole && <AmountInput label="Total 18" value={config.putts?.totalAmount ?? 100} onChange={(v) => onUpdateBet('putts', { totalAmount: v })} />}
          <p className="text-[9px] text-muted-foreground mt-2">⚠️ Esta apuesta NO utiliza hándicaps. Gana quien tenga menos putts en cada segmento.</p>
        </BetSection>
      )}

      {/* Match Play - independiente de Presiones */}
      {show('matchPlay') && (
        <BetSection
          id="matchPlay"
          title="Match Play"
          description="Match play bilateral 18 hoyos (independiente)"
          enabled={config.matchPlay?.enabled ?? false}
          onToggle={(enabled) => onUpdateBet('matchPlay' as any, { enabled })}
          isExpanded={expandedSections.includes('matchPlay')}
          onExpandChange={(open) => onToggleSection('matchPlay', open)}
          helpText="Match play individual a 18 hoyos. Se lleva el acumulado de hoyos ganados hoyo a hoyo. El resultado se expresa como 3&2 (ganó con 3 de ventaja y 2 por jugar), 1 UP (ganó al 18) o AS (empate). Se juega con el handicap bilateral configurado en la pantalla de hándicaps."
        >
          <AmountInput
            label="Monto por match"
            value={config.matchPlay?.amount ?? 50}
            onChange={(v) => onUpdateBet('matchPlay' as any, { amount: v })}
          />
          <p className="text-[9px] text-muted-foreground mt-2">
            Match continuo del hoyo 1 al 18. Se define cuando la ventaja
            supera los hoyos restantes (ej: 3&2) o al terminar el hoyo 18.
            Corre independiente de Presiones — se pueden activar ambas.
          </p>
        </BetSection>
      )}

      {/* Bloques */}
      {show('bloques') && (
        <BetSection
          id="bloques"
          title="Bloques"
          description={`Mini-medal por ${config.bloques?.holesPerBlock ?? 3} hoyos · ${(isNineHole ? 9 : 18) / (config.bloques?.holesPerBlock ?? 3)} bloques`}
          enabled={config.bloques?.enabled ?? false}
          onToggle={(enabled) => onUpdateBet('bloques' as any, { enabled })}
          isExpanded={expandedSections.includes('bloques')}
          onExpandChange={(open) => onToggleSection('bloques', open)}
          helpText="Mini-medal por bloques. La suma neta de los hoyos del bloque define al ganador. Bloques de 3 hoyos por defecto (6 bloques). Configurable a 2 o 6 hoyos. Si un bloque queda empatado puede acumular su valor al siguiente."
        >
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Hoyos por bloque</Label>
              <div className="flex gap-1">
                {([2, 3, 6] as const).map((n) => {
                  const disabled = isNineHole && n === 6;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={disabled}
                      title={disabled ? 'No aplica en ronda de 9 hoyos' : undefined}
                      onClick={() => { if (disabled) return; onUpdateBet('bloques' as any, { holesPerBlock: n }); }}
                      className={cn(
                        'flex-1 px-2 py-1.5 text-xs rounded transition-colors',
                        (config.bloques?.holesPerBlock ?? 3) === n
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80',
                        disabled && 'opacity-40 cursor-not-allowed'
                      )}
                    >
                      {n} hoyos
                      <span className="block text-[9px] opacity-70">({(isNineHole ? 9 : 18) / n} bloques)</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <AmountInput
              label="Importe por bloque"
              value={config.bloques?.amountPerBlock ?? 100}
              onChange={(v) => onUpdateBet('bloques' as any, { amountPerBlock: v })}
            />

            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Acumula en empate</Label>
              <Switch
                checked={config.bloques?.carryOverOnTie ?? true}
                onCheckedChange={(checked) => onUpdateBet('bloques' as any, { carryOverOnTie: checked })}
              />
            </div>
            <p className="text-[9px] text-muted-foreground">
              Si está activo, el bloque empatado suma su importe al siguiente. Puede encadenarse.
            </p>
          </div>
        </BetSection>
      )}
      {show('rayas') && (
        <BetSection
          id="rayas" title="Rayas" description="Agregador: Skins + Unidades + Oyes + Medal"
          enabled={config.rayas?.enabled ?? false} onToggle={(enabled) => onUpdateBet('rayas', { enabled })}
          isExpanded={expandedSections.includes('rayas')} onExpandChange={(open) => onToggleSection('rayas', open)} color="gold"
          helpText="Contador acumulado de eventos ganados a lo largo de la ronda. Suma rayas por: Skins ganados, Oyeses ganados, Unidades ganadas y Medal ganado. El valor por raya se configura por segmento Front y Back."
        >
          <RayasConfig config={config} players={players} basePlayerId={basePlayerId} onUpdateRayas={(updates) => onUpdateBet('rayas', updates)} />
        </BetSection>
      )}
    </div>
  );
};
