import React from 'react';
import { BetConfig, Player, ConejaHandicapMode, StablefordPlayerConfig, DEFAULT_STABLEFORD_POINTS, ZooAnimalType, ZOO_ANIMALS } from '@/types/golf';
import { BetSection } from './BetSection';
import { AmountInput, PointInput } from './AmountInput';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Minus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CollapsibleSubSection } from './CollapsibleSubSection';
import { formatPlayerName } from '@/lib/playerInput';
import { GrupalParticipationMatrix, grupalBetHasParticipants } from './GrupalParticipationMatrix';

interface GrupalBetsProps {
  config: BetConfig;
  players: Player[];
  expandedSections: string[];
  onToggleSection: (section: string, open: boolean) => void;
  onUpdateBet: <K extends keyof BetConfig>(betType: K, updates: Partial<BetConfig[K]>) => void;
  onUpdateConfig?: (config: BetConfig) => void;
}

export const GrupalBets: React.FC<GrupalBetsProps> = ({
  config,
  players,
  expandedSections,
  onToggleSection,
  onUpdateBet,
  onUpdateConfig,
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
        >
          <AmountInput label="Cantidad por jugador" value={config.medalGeneral?.amount ?? 100} onChange={(v) => onUpdateBet('medalGeneral', { amount: v })} />
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
        >
          <AmountInput label="Cantidad por jugador" value={config.stableford?.amount ?? 100} onChange={(v) => onUpdateBet('stableford', { amount: v })} />
          <CollapsibleSubSection label="Configuración" summary="Puntos y Handicaps">
            <div className="space-y-3">
              <div className="p-3 bg-muted/30 rounded-lg space-y-2">
                <Label className="text-xs font-medium">Puntos por resultado</Label>
                <div className="grid grid-cols-2 gap-2">
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
    </div>
  );
};
