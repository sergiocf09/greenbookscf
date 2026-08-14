import React from 'react';
import { BetConfig, Player, ConejaHandicapMode, StablefordPlayerConfig, DEFAULT_STABLEFORD_POINTS, ZooAnimalType, ZOO_ANIMALS, GroupBetScope, SkinsGrupalBetConfig, NinesBetInstance } from '@/types/golf';
import { BetSection } from './BetSection';
import { AmountInput, PointInput } from './AmountInput';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Minus, Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { CollapsibleSubSection } from './CollapsibleSubSection';
import { formatPlayerName } from '@/lib/playerInput';
import { GrupalParticipationMatrix, grupalBetHasParticipants } from './GrupalParticipationMatrix';
import { BetScopeSelector } from './BetScopeSelector';

interface GrupalBetsProps {
  config: BetConfig;
  players: Player[];
  expandedSections: string[];
  onToggleSection: (section: string, open: boolean) => void;
  onUpdateBet: <K extends keyof BetConfig>(betType: K, updates: Partial<BetConfig[K]>) => void;
  onUpdateConfig?: (config: BetConfig) => void;
  hasMultipleGroups?: boolean;
}

export const GrupalBets: React.FC<GrupalBetsProps> = ({
  config,
  players,
  expandedSections,
  onToggleSection,
  onUpdateBet,
  onUpdateConfig,
  hasMultipleGroups = false,
}) => {

  const show = (betKey: string) => grupalBetHasParticipants(config, betKey, players);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground mb-2">
        Apuestas donde todos participan en un pool. Definen su hándicap propio (excepto Coneja).
      </p>

      {/* Grupal Participation Matrix */}
      <GrupalParticipationMatrix
        config={config}
        players={players}
        onUpdateBet={onUpdateBet}
        onUpdateConfig={onUpdateConfig}
      />

      {/* Coneja */}
      {show('coneja') && (
        <BetSection
          id="coneja" title="Coneja 🐰"
          description="Grupal: patas por hoyo en sets de 6 (usa Matriz Bilateral)"
          enabled={config.coneja?.enabled ?? false}
          onToggle={(enabled) => onUpdateBet('coneja', { enabled })}
          isExpanded={expandedSections.includes('coneja')}
          onExpandChange={(open) => onToggleSection('coneja', open)}
          color="gold"
          helpText="Juego grupal dividido en 3 sets de 6 hoyos. Ganar un hoyo da una pata; perder un hoyo quita una pata. Al cierre del set, quien tenga al menos 1 pata cobra a todos. Si nadie tiene pata, la coneja se acumula al siguiente set."
        >
          <AmountInput label="Cantidad por coneja" value={config.coneja?.amount ?? 50} onChange={(v) => onUpdateBet('coneja', { amount: v })} />
          <CollapsibleSubSection label="Configuración" summary={`Handicap: ${(config.coneja?.handicapMode ?? 'individual') === 'individual' ? 'USGA' : 'Sliding'}`}>
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Modo de Handicap</Label>
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateBet('coneja', { handicapMode: 'individual' as ConejaHandicapMode }); }}
                  className={cn("flex-1 px-3 py-2 text-xs rounded transition-colors border", (config.coneja?.handicapMode ?? 'individual') === 'individual' ? "bg-golf-gold text-golf-dark font-medium border-golf-gold" : "bg-muted text-muted-foreground hover:bg-muted/80 border-border")}>
                  <div className="font-medium">Handicap USGA</div>
                  <div className="text-[9px] opacity-80">Hcp único por jugador</div>
                </button>
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateBet('coneja', { handicapMode: 'bilateral' as ConejaHandicapMode }); }}
                  className={cn("flex-1 px-3 py-2 text-xs rounded transition-colors border", config.coneja?.handicapMode === 'bilateral' ? "bg-primary text-primary-foreground font-medium border-primary" : "bg-muted text-muted-foreground hover:bg-muted/80 border-border")}>
                  <div className="font-medium">Sliding</div>
                  <div className="text-[9px] opacity-80">Usa Matriz Bilateral</div>
                </button>
              </div>
              {config.coneja?.handicapMode === 'bilateral' && (
                <p className="text-[9px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded mt-2">
                  ⚠️ Coneja es GRUPAL pero usa la Matriz de Hándicaps Bilaterales (igual que apuestas individuales).
                </p>
              )}
            </div>
          </CollapsibleSubSection>
          <div className="text-[9px] text-muted-foreground mt-3 space-y-1">
            <p><strong>Estructura:</strong> 3 sets de 6 hoyos (1-6, 7-12, 13-18)</p>
            <p><strong>Pata:</strong> Ganador absoluto del hoyo gana pata; quien pierde un hoyo, pierde una pata</p>
            <p><strong>Coneja:</strong> Al cierre del set, quien tenga ≥1 pata cobra a todos los demás</p>
            <p><strong>Acumulación:</strong> Si nadie tiene pata al cierre, la coneja se acumula al siguiente set</p>
          </div>
        </BetSection>
      )}

      {/* Culebras */}
      {show('culebras') && (
        <BetSection
          id="culebras" title="Culebras 🐍" description="3+ putts, el último paga todas"
          enabled={config.culebras.enabled} onToggle={(enabled) => onUpdateBet('culebras', { enabled })}
          isExpanded={expandedSections.includes('culebras')} onExpandChange={(open) => onToggleSection('culebras', open)} color="red"
          helpText="Cada vez que un jugador tiene 3 o más putts en un hoyo, se marca una culebra. Al final de la ronda, el último jugador en haber tenido una culebra paga el valor a todos los demás participantes."
        >
          <AmountInput label="Valor por culebra" value={config.culebras.valuePerOccurrence} onChange={(v) => onUpdateBet('culebras', { valuePerOccurrence: v })} />
        </BetSection>
      )}

      {/* Pinguinos */}
      {show('pinguinos') && (
        <BetSection
          id="pinguinos" title="Pingüinos 🐧" description="Triple bogey o peor (bruto vs par), el último paga todas"
          enabled={config.pinguinos.enabled} onToggle={(enabled) => onUpdateBet('pinguinos', { enabled })}
          isExpanded={expandedSections.includes('pinguinos')} onExpandChange={(open) => onToggleSection('pinguinos', open)} color="red"
          helpText="Si un jugador hace triple bogey o peor (score bruto vs par del hoyo), se marca un pingüino. Al final de la ronda, el último jugador en haber tenido un pingüino paga el valor a todos los demás."
        >
          <AmountInput label="Valor por pingüino" value={config.pinguinos.valuePerOccurrence} onChange={(v) => onUpdateBet('pinguinos', { valuePerOccurrence: v })} />
        </BetSection>
      )}

      {/* Zoológico */}
      {show('zoologico') && (
        <BetSection
          id="zoologico" title="Zoológico 🐾"
          description="Camello (bunker), Pez (agua), Gorila (OB) - último paga"
          enabled={config.zoologico?.enabled ?? false}
          onToggle={(enabled) => onUpdateBet('zoologico', { enabled })}
          isExpanded={expandedSections.includes('zoologico')}
          onExpandChange={(open) => onToggleSection('zoologico', open)} color="red"
          helpText="Tres animales: Camello (caer en bunker), Pez (caer en agua), Gorila (salir OB). Cada incidencia se registra al capturar el hoyo. Al final, el último jugador en cometer cada tipo de incidencia paga a todos los demás."
        >
          <AmountInput label="Valor por incidencia" value={config.zoologico?.valuePerOccurrence ?? 10} onChange={(v) => onUpdateBet('zoologico', { valuePerOccurrence: v })} />
          <CollapsibleSubSection label="Configuración" summary={`${(config.zoologico?.enabledAnimals ?? ['camello', 'pez', 'gorila']).length} animales`}>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Animales habilitados</Label>
              <div className="flex flex-wrap gap-2">
                {(['camello', 'pez', 'gorila'] as ZooAnimalType[]).map(animal => {
                  const info = ZOO_ANIMALS[animal];
                  const enabledAnimals = config.zoologico?.enabledAnimals ?? ['camello', 'pez', 'gorila'];
                  const isEnabled = enabledAnimals.includes(animal);
                  return (
                    <button key={animal} type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); const current = config.zoologico?.enabledAnimals ?? ['camello', 'pez', 'gorila']; const newAnimals = isEnabled ? current.filter(a => a !== animal) : [...current, animal]; onUpdateBet('zoologico', { enabledAnimals: newAnimals }); }}
                      className={cn("flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all border", isEnabled ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:bg-muted/80")}>
                      <span className="text-base">{info.emoji}</span>{info.label}{isEnabled && <Check className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </CollapsibleSubSection>
          <p className="text-[9px] text-muted-foreground mt-2">El último jugador en cometer cada tipo de incidencia paga a todos los demás.</p>
        </BetSection>
      )}

      {/* Skins Grupal */}
      {show('skinsGrupal') && (
        <BetSection
          id="skinsGrupal" title="Skins Grupal 🏅"
          description="Grupal: skins netos por hoyo, cada perdedor paga al ganador"
          enabled={config.skinsGrupal?.enabled ?? false}
          onToggle={(enabled) => {
            const currentHandicaps = config.skinsGrupal?.playerHandicaps || [];
            if (enabled && currentHandicaps.length === 0) {
              const initialHandicaps = players.map(p => ({ playerId: p.id, handicap: p.handicap }));
              onUpdateBet('skinsGrupal', { enabled, playerHandicaps: initialHandicaps } as any);
            } else { onUpdateBet('skinsGrupal', { enabled } as any); }
          }}
          isExpanded={expandedSections.includes('skinsGrupal')}
          onExpandChange={(open) => onToggleSection('skinsGrupal', open)} color="gold"
          helpText="Skins grupal: en cada hoyo, el jugador con el menor score neto gana un skin. En 'Acumulados', los empates acumulan al siguiente hoyo. En 'Sin Acumular', los empates se pierden. Cada perdedor paga al ganador del skin."
        >
          <AmountInput label="Front 9" value={config.skinsGrupal?.frontAmount ?? 50} onChange={(v) => onUpdateBet('skinsGrupal', { frontAmount: v } as any)} />
          <AmountInput label="Back 9" value={config.skinsGrupal?.backAmount ?? 100} onChange={(v) => onUpdateBet('skinsGrupal', { backAmount: v } as any)} />
          <CollapsibleSubSection label="Configuración" summary={`${(config.skinsGrupal?.modality ?? 'acumulados') === 'acumulados' ? 'Acumulados' : 'Sin Acumular'} · Handicaps`}>
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">Modalidad</Label>
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateBet('skinsGrupal', { modality: 'acumulados' } as any); }}
                  className={cn("flex-1 px-3 py-2 text-xs rounded transition-colors border", (config.skinsGrupal?.modality ?? 'acumulados') === 'acumulados' ? "bg-primary text-primary-foreground font-medium border-primary" : "bg-muted text-muted-foreground hover:bg-muted/80 border-border")}>
                  <div className="font-medium">Acumulados</div>
                  <div className="text-[9px] opacity-80">Empates se acumulan</div>
                </button>
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateBet('skinsGrupal', { modality: 'sinAcumular' } as any); }}
                  className={cn("flex-1 px-3 py-2 text-xs rounded transition-colors border", config.skinsGrupal?.modality === 'sinAcumular' ? "bg-primary text-primary-foreground font-medium border-primary" : "bg-muted text-muted-foreground hover:bg-muted/80 border-border")}>
                  <div className="font-medium">Sin Acumular</div>
                  <div className="text-[9px] opacity-80">Solo gana hoyo limpio</div>
                </button>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Handicaps para Skins Grupal</Label>
                {players.map(player => {
                  const playerHandicaps = config.skinsGrupal?.playerHandicaps || [];
                  const playerConfig = playerHandicaps.find(pc => pc.playerId === player.id);
                  const currentHcp = playerConfig?.handicap ?? player.handicap;
                  return (
                    <div key={player.id} className="flex items-center justify-between gap-2 p-2 bg-muted/30 rounded">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: player.color }}>{player.initials}</div>
                        <span className="text-xs font-medium">{formatPlayerName(player.name)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="outline" size="icon" className="h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); const eh = config.skinsGrupal?.playerHandicaps || []; const nh = eh.map(pc => pc.playerId === player.id ? { ...pc, handicap: Math.max(0, pc.handicap - 1) } : pc); if (!nh.some(pc => pc.playerId === player.id)) nh.push({ playerId: player.id, handicap: Math.max(0, player.handicap - 1) }); onUpdateBet('skinsGrupal', { playerHandicaps: nh } as any); }}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input type="number" value={currentHcp}
                          onChange={(e) => { const nv = parseInt(e.target.value) || 0; const eh = config.skinsGrupal?.playerHandicaps || []; const nh = eh.map(pc => pc.playerId === player.id ? { ...pc, handicap: nv } : pc); if (!nh.some(pc => pc.playerId === player.id)) nh.push({ playerId: player.id, handicap: nv }); onUpdateBet('skinsGrupal', { playerHandicaps: nh } as any); }}
                          className="w-14 h-6 text-center text-xs p-1" onClick={(e) => e.stopPropagation()} />
                        <Button type="button" variant="outline" size="icon" className="h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); const eh = config.skinsGrupal?.playerHandicaps || []; const nh = eh.map(pc => pc.playerId === player.id ? { ...pc, handicap: pc.handicap + 1 } : pc); if (!nh.some(pc => pc.playerId === player.id)) nh.push({ playerId: player.id, handicap: player.handicap + 1 }); onUpdateBet('skinsGrupal', { playerHandicaps: nh } as any); }}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CollapsibleSubSection>
          <p className="text-[9px] text-muted-foreground mt-2">El ganador de cada skin cobra a todos los demás participantes.</p>
        </BetSection>
      )}

      {/* Medal General */}
      {show('medalGeneral') && (
        <BetSection
          id="medalGeneral" title="Medal General 🏆" description="Grupal: menor score neto total gana"
          enabled={config.medalGeneral?.enabled ?? false}
          onToggle={(enabled) => {
            const currentHandicaps = config.medalGeneral?.playerHandicaps || [];
            if (enabled && currentHandicaps.length === 0) {
              const initialHandicaps = players.map(p => ({ playerId: p.id, handicap: p.handicap }));
              onUpdateBet('medalGeneral', { enabled, playerHandicaps: initialHandicaps });
            } else { onUpdateBet('medalGeneral', { enabled }); }
          }}
          isExpanded={expandedSections.includes('medalGeneral')}
          onExpandChange={(open) => onToggleSection('medalGeneral', open)} color="gold"
          helpText="El jugador con el menor score neto total de los 18 hoyos gana y cobra la cantidad configurada a cada perdedor. En caso de empate, se divide. Cada jugador puede tener un handicap independiente para esta apuesta."
        >
          {/* Segment mode toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-semibold text-primary">Modo</Label>
            <div className="flex gap-1">
              <button type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateBet('medalGeneral', { segmentMode: 'total' }); }}
                className={cn("px-2.5 py-1 text-[10px] rounded transition-colors border",
                  (config.medalGeneral?.segmentMode ?? 'total') === 'total'
                    ? "bg-primary text-primary-foreground font-medium border-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 border-border"
                )}>
                Solo Total 18
              </button>
              <button type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateBet('medalGeneral', { segmentMode: 'segments', frontAmount: config.medalGeneral?.frontAmount ?? 50, backAmount: config.medalGeneral?.backAmount ?? 100 }); }}
                className={cn("px-2.5 py-1 text-[10px] rounded transition-colors border",
                  config.medalGeneral?.segmentMode === 'segments'
                    ? "bg-primary text-primary-foreground font-medium border-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 border-border"
                )}>
                F9 + B9 + Total
              </button>
            </div>
          </div>

          {/* Amounts based on segment mode */}
          {config.medalGeneral?.segmentMode === 'segments' ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground text-center block">Front 9</Label>
                <AmountInput label="" value={config.medalGeneral?.frontAmount ?? 50} onChange={(v) => onUpdateBet('medalGeneral', { frontAmount: v })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground text-center block">Back 9</Label>
                <AmountInput label="" value={config.medalGeneral?.backAmount ?? 100} onChange={(v) => onUpdateBet('medalGeneral', { backAmount: v })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground text-center block">Total 18</Label>
                <AmountInput label="" value={config.medalGeneral?.amount ?? 100} onChange={(v) => onUpdateBet('medalGeneral', { amount: v })} />
              </div>
            </div>
          ) : (
            <AmountInput label="Cantidad por jugador" value={config.medalGeneral?.amount ?? 100} onChange={(v) => onUpdateBet('medalGeneral', { amount: v })} />
          )}

          {hasMultipleGroups && (
            <BetScopeSelector
              scope={config.medalGeneral?.scope ?? 'global'}
              onChange={(scope) => onUpdateBet('medalGeneral', { scope })}
            />
          )}

          {/* Handicap mode: USGA (individual) vs Sliding (bilateral matrix) */}
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold text-primary">Modalidad Hándicap</Label>
            <div className="flex gap-2">
              <button type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateBet('medalGeneral', { handicapMode: 'individual' }); }}
                className={cn("flex-1 px-3 py-2 text-xs rounded transition-colors border",
                  (config.medalGeneral?.handicapMode ?? 'individual') === 'individual'
                    ? "bg-golf-gold text-golf-dark font-medium border-golf-gold"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 border-border"
                )}>
                USGA Hándicap
              </button>
              <button type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateBet('medalGeneral', { handicapMode: 'bilateral' }); }}
                className={cn("flex-1 px-3 py-2 text-xs rounded transition-colors border",
                  config.medalGeneral?.handicapMode === 'bilateral'
                    ? "bg-primary text-primary-foreground font-medium border-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 border-border"
                )}>
                Sliding (Bilateral)
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground">
              {config.medalGeneral?.handicapMode === 'bilateral'
                ? 'Se usan las ventajas par por par de la matriz de hándicaps. Para ganar, un jugador debe vencer a TODOS sus rivales en su comparación bilateral; si no, el tramo no paga.'
                : 'Cada jugador recibe golpes según su propio hándicap y se compara un solo neto contra el grupo (empates se dividen).'}
            </p>
          </div>

          <CollapsibleSubSection label="Configuración" summary="Handicaps por jugador">

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Handicaps para Medal General</Label>
              {players.map(player => {
                const playerHandicaps = config.medalGeneral?.playerHandicaps || [];
                const playerConfig = playerHandicaps.find(pc => pc.playerId === player.id);
                const currentHcp = playerConfig?.handicap ?? player.handicap;
                return (
                  <div key={player.id} className="flex items-center justify-between gap-2 p-2 bg-muted/30 rounded">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: player.color }}>{player.initials}</div>
                      <span className="text-xs font-medium">{formatPlayerName(player.name)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="outline" size="icon" className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); const eh = config.medalGeneral?.playerHandicaps || []; const nh = eh.map(pc => pc.playerId === player.id ? { ...pc, handicap: Math.max(0, pc.handicap - 1) } : pc); if (!nh.some(pc => pc.playerId === player.id)) nh.push({ playerId: player.id, handicap: Math.max(0, player.handicap - 1) }); onUpdateBet('medalGeneral', { playerHandicaps: nh }); }}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input type="number" value={currentHcp}
                        onChange={(e) => { const nv = parseInt(e.target.value) || 0; const eh = config.medalGeneral?.playerHandicaps || []; const nh = eh.map(pc => pc.playerId === player.id ? { ...pc, handicap: nv } : pc); if (!nh.some(pc => pc.playerId === player.id)) nh.push({ playerId: player.id, handicap: nv }); onUpdateBet('medalGeneral', { playerHandicaps: nh }); }}
                        className="w-14 h-6 text-center text-xs p-1" onClick={(e) => e.stopPropagation()} />
                      <Button type="button" variant="outline" size="icon" className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); const eh = config.medalGeneral?.playerHandicaps || []; const nh = eh.map(pc => pc.playerId === player.id ? { ...pc, handicap: pc.handicap + 1 } : pc); if (!nh.some(pc => pc.playerId === player.id)) nh.push({ playerId: player.id, handicap: player.handicap + 1 }); onUpdateBet('medalGeneral', { playerHandicaps: nh }); }}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CollapsibleSubSection>
          <p className="text-[9px] text-muted-foreground mt-2">El ganador (o ganadores en empate) cobra la cantidad a cada perdedor.</p>
        </BetSection>
      )}

      {/* Putts General */}
      {show('puttsGeneral') && (
        <BetSection
          id="puttsGeneral" title="Putts General ⛳" description="Grupal: menor total de putts gana"
          enabled={(config as any).puttsGeneral?.enabled ?? false}
          onToggle={(enabled) => onUpdateConfig?.({ ...config, puttsGeneral: { ...(config as any).puttsGeneral, enabled } } as any)}
          isExpanded={expandedSections.includes('puttsGeneral')}
          onExpandChange={(open) => onToggleSection('puttsGeneral', open)} color="gold"
          helpText="El jugador con el menor total de putts gana y cobra a cada perdedor. No usa hándicaps. Se puede configurar por Front 9, Back 9 y Total 18."
        >
          {/* Segment mode toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-semibold text-primary">Modo</Label>
            <div className="flex gap-1">
              <button type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateConfig?.({ ...config, puttsGeneral: { ...(config as any).puttsGeneral, segmentMode: 'total' } } as any); }}
                className={cn("px-2.5 py-1 text-[10px] rounded transition-colors border",
                  ((config as any).puttsGeneral?.segmentMode ?? 'total') === 'total'
                    ? "bg-primary text-primary-foreground font-medium border-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 border-border"
                )}>
                Solo Total 18
              </button>
              <button type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateConfig?.({ ...config, puttsGeneral: { ...(config as any).puttsGeneral, segmentMode: 'segments', frontAmount: (config as any).puttsGeneral?.frontAmount ?? 50, backAmount: (config as any).puttsGeneral?.backAmount ?? 100 } } as any); }}
                className={cn("px-2.5 py-1 text-[10px] rounded transition-colors border",
                  (config as any).puttsGeneral?.segmentMode === 'segments'
                    ? "bg-primary text-primary-foreground font-medium border-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 border-border"
                )}>
                F9 + B9 + Total
              </button>
            </div>
          </div>

          {/* Amounts based on segment mode */}
          {(config as any).puttsGeneral?.segmentMode === 'segments' ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground text-center block">Front 9</Label>
                <AmountInput label="" value={(config as any).puttsGeneral?.frontAmount ?? 50} onChange={(v) => onUpdateConfig?.({ ...config, puttsGeneral: { ...(config as any).puttsGeneral, frontAmount: v } } as any)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground text-center block">Back 9</Label>
                <AmountInput label="" value={(config as any).puttsGeneral?.backAmount ?? 100} onChange={(v) => onUpdateConfig?.({ ...config, puttsGeneral: { ...(config as any).puttsGeneral, backAmount: v } } as any)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground text-center block">Total 18</Label>
                <AmountInput label="" value={(config as any).puttsGeneral?.amount ?? 100} onChange={(v) => onUpdateConfig?.({ ...config, puttsGeneral: { ...(config as any).puttsGeneral, amount: v } } as any)} />
              </div>
            </div>
          ) : (
            <AmountInput label="Cantidad por jugador" value={(config as any).puttsGeneral?.amount ?? 100} onChange={(v) => onUpdateConfig?.({ ...config, puttsGeneral: { ...(config as any).puttsGeneral, amount: v } } as any)} />
          )}

          <p className="text-[9px] text-muted-foreground mt-2">El ganador con menos putts totales cobra a cada perdedor. No aplica hándicap.</p>
        </BetSection>
      )}

      {/* GIR General */}
      {show('girGeneral') && (
        <BetSection
          id="girGeneral" title="GIR General 🎯" description="Grupal: más Greens In Regulation gana"
          enabled={(config as any).girGeneral?.enabled ?? false}
          onToggle={(enabled) => onUpdateConfig?.({ ...config, girGeneral: { ...(config as any).girGeneral, enabled } } as any)}
          isExpanded={expandedSections.includes('girGeneral')}
          onExpandChange={(open) => onToggleSection('girGeneral', open)} color="gold"
          helpText="El jugador con más GIRs (greens alcanzados en regulación = strokes sin putts ≤ par-2) gana y cobra a cada perdedor. No aplica hándicap. Requiere putts capturados por hoyo."
        >
          {/* Segment mode toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-semibold text-primary">Modo</Label>
            <div className="flex gap-1">
              <button type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateConfig?.({ ...config, girGeneral: { ...(config as any).girGeneral, segmentMode: 'total' } } as any); }}
                className={cn("px-2.5 py-1 text-[10px] rounded transition-colors border",
                  ((config as any).girGeneral?.segmentMode ?? 'total') === 'total'
                    ? "bg-primary text-primary-foreground font-medium border-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 border-border"
                )}>
                Solo Total 18
              </button>
              <button type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdateConfig?.({ ...config, girGeneral: { ...(config as any).girGeneral, segmentMode: 'segments', frontAmount: (config as any).girGeneral?.frontAmount ?? 50, backAmount: (config as any).girGeneral?.backAmount ?? 100 } } as any); }}
                className={cn("px-2.5 py-1 text-[10px] rounded transition-colors border",
                  (config as any).girGeneral?.segmentMode === 'segments'
                    ? "bg-primary text-primary-foreground font-medium border-primary"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 border-border"
                )}>
                F9 + B9 + Total
              </button>
            </div>
          </div>

          {(config as any).girGeneral?.segmentMode === 'segments' ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground text-center block">Front 9</Label>
                <AmountInput label="" value={(config as any).girGeneral?.frontAmount ?? 50} onChange={(v) => onUpdateConfig?.({ ...config, girGeneral: { ...(config as any).girGeneral, frontAmount: v } } as any)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground text-center block">Back 9</Label>
                <AmountInput label="" value={(config as any).girGeneral?.backAmount ?? 100} onChange={(v) => onUpdateConfig?.({ ...config, girGeneral: { ...(config as any).girGeneral, backAmount: v } } as any)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground text-center block">Total 18</Label>
                <AmountInput label="" value={(config as any).girGeneral?.amount ?? 100} onChange={(v) => onUpdateConfig?.({ ...config, girGeneral: { ...(config as any).girGeneral, amount: v } } as any)} />
              </div>
            </div>
          ) : (
            <AmountInput label="Cantidad por jugador" value={(config as any).girGeneral?.amount ?? 100} onChange={(v) => onUpdateConfig?.({ ...config, girGeneral: { ...(config as any).girGeneral, amount: v } } as any)} />
          )}

          <p className="text-[9px] text-muted-foreground mt-2">El ganador con más GIRs cobra a cada perdedor. No aplica hándicap.</p>
        </BetSection>
      )}

      {/* Stableford */}
      {show('stableford') && (
        <BetSection
          id="stableford" title="Stableford 📊" description="Grupal: puntos por score relativo al par"
          enabled={config.stableford?.enabled ?? false}
          onToggle={(enabled) => {
            if (enabled && config.stableford.playerHandicaps.length === 0) {
              const initialHandicaps: StablefordPlayerConfig[] = players.map(p => ({ playerId: p.id, handicap: p.handicap }));
              onUpdateBet('stableford', { enabled, playerHandicaps: initialHandicaps, points: config.stableford.points || DEFAULT_STABLEFORD_POINTS });
            } else { onUpdateBet('stableford', { enabled }); }
          }}
          isExpanded={expandedSections.includes('stableford')}
          onExpandChange={(open) => onToggleSection('stableford', open)} color="gold"
          helpText="Sistema de puntos por score neto relativo al par de cada hoyo. Birdie = 3 pts, Par = 2 pts, Bogey = 1 pt (configurable). El jugador con más puntos totales gana y cobra a cada perdedor."
        >
          <AmountInput label="Cantidad por jugador" value={config.stableford?.amount ?? 100} onChange={(v) => onUpdateBet('stableford', { amount: v })} />
          {hasMultipleGroups && (
            <BetScopeSelector
              scope={config.stableford?.scope ?? 'global'}
              onChange={(scope) => onUpdateBet('stableford', { scope })}
            />
          )}
          <CollapsibleSubSection label="Configuración" summary="Puntos y Handicaps">
            <div className="space-y-3">
              <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                <Label className="text-xs font-medium">Puntos por resultado</Label>
                <div className="space-y-1.5">
                  <PointInput label="Albatros" value={config.stableford?.points?.albatross ?? 5} onChange={(v) => onUpdateBet('stableford', { points: { ...config.stableford.points, albatross: v } })} />
                  <PointInput label="Águila" value={config.stableford?.points?.eagle ?? 4} onChange={(v) => onUpdateBet('stableford', { points: { ...config.stableford.points, eagle: v } })} />
                  <PointInput label="Birdie" value={config.stableford?.points?.birdie ?? 3} onChange={(v) => onUpdateBet('stableford', { points: { ...config.stableford.points, birdie: v } })} />
                  <PointInput label="Par" value={config.stableford?.points?.par ?? 2} onChange={(v) => onUpdateBet('stableford', { points: { ...config.stableford.points, par: v } })} />
                  <PointInput label="Bogey" value={config.stableford?.points?.bogey ?? 1} onChange={(v) => onUpdateBet('stableford', { points: { ...config.stableford.points, bogey: v } })} />
                  <PointInput label="Doble Bogey" value={config.stableford?.points?.doubleBogey ?? 0} onChange={(v) => onUpdateBet('stableford', { points: { ...config.stableford.points, doubleBogey: v } })} />
                  <PointInput label="Triple Bogey" value={config.stableford?.points?.tripleBogey ?? -1} onChange={(v) => onUpdateBet('stableford', { points: { ...config.stableford.points, tripleBogey: v } })} />
                  <PointInput label="Cuádruple+" value={config.stableford?.points?.quadrupleOrWorse ?? -2} onChange={(v) => onUpdateBet('stableford', { points: { ...config.stableford.points, quadrupleOrWorse: v } })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Handicaps para Stableford</Label>
                {players.map(player => {
                  const playerHandicaps = config.stableford?.playerHandicaps || [];
                  const playerConfig = playerHandicaps.find(pc => pc.playerId === player.id);
                  const currentHcp = playerConfig?.handicap ?? player.handicap;
                  return (
                    <div key={player.id} className="flex items-center justify-between gap-2 p-2 bg-muted/30 rounded">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: player.color }}>{player.initials}</div>
                        <span className="text-xs font-medium">{formatPlayerName(player.name)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="outline" size="icon" className="h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); const eh = config.stableford?.playerHandicaps || []; const nh = eh.map(pc => pc.playerId === player.id ? { ...pc, handicap: Math.max(0, pc.handicap - 1) } : pc); if (!nh.some(pc => pc.playerId === player.id)) nh.push({ playerId: player.id, handicap: Math.max(0, player.handicap - 1) }); onUpdateBet('stableford', { playerHandicaps: nh }); }}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input type="number" value={currentHcp}
                          onChange={(e) => { const nv = parseInt(e.target.value) || 0; const eh = config.stableford?.playerHandicaps || []; const nh = eh.map(pc => pc.playerId === player.id ? { ...pc, handicap: nv } : pc); if (!nh.some(pc => pc.playerId === player.id)) nh.push({ playerId: player.id, handicap: nv }); onUpdateBet('stableford', { playerHandicaps: nh }); }}
                          className="w-14 h-6 text-center text-xs p-1" onClick={(e) => e.stopPropagation()} />
                        <Button type="button" variant="outline" size="icon" className="h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); const eh = config.stableford?.playerHandicaps || []; const nh = eh.map(pc => pc.playerId === player.id ? { ...pc, handicap: pc.handicap + 1 } : pc); if (!nh.some(pc => pc.playerId === player.id)) nh.push({ playerId: player.id, handicap: player.handicap + 1 }); onUpdateBet('stableford', { playerHandicaps: nh }); }}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CollapsibleSubSection>
          <p className="text-[9px] text-muted-foreground mt-2">El ganador con más puntos Stableford cobra a los demás.</p>
        </BetSection>
      )}

      {/* Nines — multi-instance */}
      {show('nines') && (
        <BetSection
          id="nines" title="Nines (5-3-1)"
          description="Distribución de 9 puntos por hoyo entre 3 jugadores"
          enabled={(config.ninesBets?.length ?? 0) > 0}
          onToggle={(enabled) => {
            if (!onUpdateConfig) return;
            if (enabled) {
              const primera: NinesBetInstance = { id: `nines-${Date.now()}`, valuePerPoint: 10, playerIds: [], playerHandicaps: {} };
              onUpdateConfig({ ...config, ninesBets: [primera] });
            } else {
              onUpdateConfig({ ...config, ninesBets: [] });
            }
            onToggleSection('nines', enabled);
          }}
          isExpanded={expandedSections.includes('nines')}
          onExpandChange={(open) => onToggleSection('nines', open)}
          helpText="Cada hoyo se reparten 9 puntos: 5 al mejor, 3 al segundo, 1 al tercero. Con 4 jugadores, el descansante rota y recibe 3 pts. Múltiples instancias permiten diferentes tríos."
        >
          {(config.ninesBets?.length ?? 0) === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground mb-2">No hay apuestas de Nines configuradas</p>
              <Button variant="outline" size="sm" onClick={() => {
                if (!onUpdateConfig) return;
                 const nueva: NinesBetInstance = { id: `nines-${Date.now()}`, valuePerPoint: 10, playerIds: [], playerHandicaps: {} };
                onUpdateConfig({ ...config, ninesBets: [nueva] });
              }} className="gap-1">
                <Plus className="h-3.5 w-3.5" /> Agregar apuesta Nines
              </Button>
            </div>
          ) : (
            <>
              {config.ninesBets!.map((bet, idx) => (
                <NinesBetCard key={bet.id} index={idx} bet={bet} players={players}
                  onUpdate={(updates) => {
                    if (!onUpdateConfig) return;
                    const next = config.ninesBets!.map(b => b.id === bet.id ? { ...b, ...updates } : b);
                    onUpdateConfig({ ...config, ninesBets: next });
                  }}
                  onRemove={() => {
                    if (!onUpdateConfig) return;
                    onUpdateConfig({ ...config, ninesBets: config.ninesBets!.filter(b => b.id !== bet.id) });
                  }}
                />
              ))}
              <Button variant="outline" size="sm" className="w-full mt-3 gap-1" onClick={() => {
                if (!onUpdateConfig) return;
                const nueva: NinesBetInstance = { id: `nines-${Date.now()}`, valuePerPoint: 10, playerIds: [], playerHandicaps: {} };
                onUpdateConfig({ ...config, ninesBets: [...(config.ninesBets ?? []), nueva] });
              }}>
                <Plus className="h-3.5 w-3.5" /> Agregar otra apuesta Nines
              </Button>
            </>
          )}
        </BetSection>
      )}
    </div>
  );
};

/* ─── Nines Bet Card ─── */
const NinesBetCard: React.FC<{
  index: number;
  bet: NinesBetInstance;
  players: Player[];
  onUpdate: (updates: Partial<NinesBetInstance>) => void;
  onRemove: () => void;
}> = ({ index, bet, players, onUpdate, onRemove }) => {
  const selectedIds = bet.playerIds ?? [];
  const maxPlayers = 3;
  const minPlayers = 3;

  const toggle = (playerId: string) => {
    if (selectedIds.includes(playerId)) {
      if (selectedIds.length <= minPlayers) return;
      const newHandicaps = { ...bet.playerHandicaps };
      delete newHandicaps[playerId];
      onUpdate({ playerIds: selectedIds.filter(id => id !== playerId), playerHandicaps: newHandicaps });
    } else {
      if (selectedIds.length >= maxPlayers) return;
      const p = players.find(pl => pl.id === playerId);
      const newHandicaps = { ...bet.playerHandicaps, [playerId]: p?.handicap ?? 0 };
      onUpdate({ playerIds: [...selectedIds, playerId], playerHandicaps: newHandicaps });
    }
  };

  return (
    <div className={cn('space-y-3 p-3 rounded-lg', index > 0 ? 'border-t border-border mt-4 pt-4' : 'bg-muted/30')}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">5-3-1 · Grupo {index + 1}</Label>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>

      <AmountInput label="Valor por punto" value={bet.valuePerPoint} onChange={(v) => onUpdate({ valuePerPoint: v })} />

      <div className="space-y-2">
        <Label className="text-[10px] font-semibold text-primary">Jugadores (selecciona 3)</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {players.map(p => {
            const isSelected = selectedIds.includes(p.id);
            const isDisabled = !isSelected && selectedIds.length >= maxPlayers;
            return (
              <button key={p.id} type="button" onClick={() => !isDisabled && toggle(p.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-left transition-colors border',
                  isSelected ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                    : isDisabled ? 'opacity-40 bg-muted/20 border-transparent cursor-not-allowed'
                    : 'bg-muted/40 border-transparent text-muted-foreground hover:bg-muted'
                )}>
                <span className="w-4 h-4 rounded-full border flex items-center justify-center shrink-0">
                  {isSelected && <Check className="h-3 w-3" />}
                </span>
                {p.name}
              </button>
            );
          })}
        </div>
        {selectedIds.length < minPlayers && (
          <p className="text-[9px] text-amber-600">Selecciona al menos 3 jugadores ({selectedIds.length}/{minPlayers})</p>
        )}
        {selectedIds.length === 3 && (
          <>
            <p className="text-[9px] text-muted-foreground">Distribución: 5 primero · 3 segundo · 1 tercero</p>
            <div className="space-y-1.5 mt-2">
              <Label className="text-[10px] font-semibold text-primary">Handicaps</Label>
              {selectedIds.map(pid => {
                const p = players.find(pl => pl.id === pid);
                if (!p) return null;
                const currentHcp = bet.playerHandicaps?.[pid] ?? p.handicap;
                return (
                  <div key={pid} className="flex items-center justify-between gap-2 p-2 bg-muted/30 rounded">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: p.color }}>{p.initials}</div>
                      <span className="text-xs font-medium">{formatPlayerName(p.name)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="outline" size="icon" className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); const nh = { ...bet.playerHandicaps, [pid]: Math.max(0, currentHcp - 1) }; onUpdate({ playerHandicaps: nh }); }}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input type="number" value={currentHcp}
                        onChange={(e) => { const nv = parseInt(e.target.value) || 0; const nh = { ...bet.playerHandicaps, [pid]: nv }; onUpdate({ playerHandicaps: nh }); }}
                        className="w-14 h-6 text-center text-xs p-1" onClick={(e) => e.stopPropagation()} />
                      <Button type="button" variant="outline" size="icon" className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); const nh = { ...bet.playerHandicaps, [pid]: currentHcp + 1 }; onUpdate({ playerHandicaps: nh }); }}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
