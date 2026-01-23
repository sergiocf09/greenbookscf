import React, { useMemo, useRef, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronUp, DollarSign, Plus, Trash2, Minus } from 'lucide-react';
import { BetConfig, Player, CarritosTeamBet, OyesesPlayerConfig, OyesModality, RayasSkinVariant } from '@/types/golf';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface BetSetupProps {
  config: BetConfig;
  onChange: (config: BetConfig) => void;
  players: Player[];
}

export const BetSetup: React.FC<BetSetupProps> = ({
  config,
  onChange,
  players,
}) => {
  const [expandedSections, setExpandedSections] = useState<string[]>(['medal']);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => 
      prev.includes(section) 
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const setSectionOpen = (section: string, open: boolean) => {
    setExpandedSections((prev) => {
      const isOpen = prev.includes(section);
      if (open === isOpen) return prev;
      return open ? [...prev, section] : prev.filter((s) => s !== section);
    });
  };

  const updateBet = <K extends keyof BetConfig>(
    betType: K,
    updates: Partial<BetConfig[K]>
  ) => {
    onChange({
      ...config,
      [betType]: { ...config[betType], ...updates },
    });
  };

  const BetSection: React.FC<{
    id: string;
    title: string;
    description: string;
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    children: React.ReactNode;
    color?: 'gold' | 'green' | 'red';
  }> = ({ id, title, description, enabled, onToggle, children, color = 'green' }) => (
    <Collapsible 
      open={expandedSections.includes(id)} 
      onOpenChange={(open) => setSectionOpen(id, open)}
    >
      <div className={cn(
        'border rounded-lg overflow-hidden transition-colors',
        enabled ? 'border-border bg-card' : 'border-border/50 bg-muted/30'
      )}>
        <div className="flex items-center justify-between p-3">
          <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
            <div className={cn(
              'w-2 h-2 rounded-full',
              enabled 
                ? color === 'gold' ? 'bg-golf-gold' : color === 'red' ? 'bg-destructive' : 'bg-golf-green'
                : 'bg-muted-foreground/30'
            )} />
            <div className="flex-1">
              <p className={cn('font-medium text-sm', !enabled && 'text-muted-foreground')}>
                {title}
              </p>
              <p className="text-[10px] text-muted-foreground">{description}</p>
            </div>
            {expandedSections.includes(id) ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </CollapsibleTrigger>
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            className="ml-2"
          />
        </div>
        <CollapsibleContent>
          <div className={cn(
            'p-3 pt-0 space-y-3',
            !enabled && 'opacity-50 pointer-events-none'
          )}>
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );

  const AmountInput: React.FC<{
    label: string;
    value: number;
    onChange: (value: number) => void;
    step?: number;
  }> = ({ label, value, onChange, step = 25 }) => {
    const handleIncrement = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onChange(value + step);
    };
    const handleDecrement = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onChange(Math.max(0, value - step));
    };
    
    return (
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={handleDecrement}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={value <= 0}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <div className="flex items-center gap-0.5">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <Input
              type="number"
              value={value}
              onChange={(e) => onChange(parseInt(e.target.value) || 0)}
              onFocus={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="h-7 w-16 text-sm text-center px-1"
              min={0}
              step={step}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={handleIncrement}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  };

  // Multiple carritos teams management
  const addCarritosTeam = () => {
    const teams = config.carritosTeams || [];
    const newTeam: CarritosTeamBet = {
      id: `carritos-${Date.now()}`,
      teamA: ['', ''],
      teamB: ['', ''],
      frontAmount: 100,
      backAmount: 100,
      totalAmount: 100,
      scoringType: 'all',
      teamHandicaps: {},
      enabled: true,
    };
    onChange({
      ...config,
      carritosTeams: [...teams, newTeam],
    });
  };

  const updateCarritosTeam = (teamId: string, updates: Partial<CarritosTeamBet>) => {
    const teams = config.carritosTeams || [];
    onChange({
      ...config,
      carritosTeams: teams.map(t => t.id === teamId ? { ...t, ...updates } : t),
    });
  };

  const removeCarritosTeam = (teamId: string) => {
    const teams = config.carritosTeams || [];
    onChange({
      ...config,
      carritosTeams: teams.filter(t => t.id !== teamId),
    });
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Configuración de Apuestas</Label>

      {/* Medal */}
      <BetSection
        id="medal"
        title="Medal"
        description="Score total por segmento"
        enabled={config.medal.enabled}
        onToggle={(enabled) => updateBet('medal', { enabled })}
      >
        <AmountInput label="Front 9" value={config.medal.frontAmount} onChange={(v) => updateBet('medal', { frontAmount: v })} />
        <AmountInput label="Back 9" value={config.medal.backAmount} onChange={(v) => updateBet('medal', { backAmount: v })} />
        <AmountInput label="Total 18" value={config.medal.totalAmount} onChange={(v) => updateBet('medal', { totalAmount: v })} />
      </BetSection>

      {/* Pressures */}
      <BetSection
        id="pressures"
        title="Presiones"
        description="Match play, se abre cuando vas 2 abajo"
        enabled={config.pressures.enabled}
        onToggle={(enabled) => updateBet('pressures', { enabled })}
      >
        <AmountInput label="Front 9" value={config.pressures.frontAmount} onChange={(v) => updateBet('pressures', { frontAmount: v })} />
        <AmountInput label="Back 9" value={config.pressures.backAmount} onChange={(v) => updateBet('pressures', { backAmount: v })} />
        <AmountInput label="Match 18" value={config.pressures.totalAmount} onChange={(v) => updateBet('pressures', { totalAmount: v })} />
      </BetSection>

      {/* Skins */}
      <BetSection
        id="skins"
        title="Skins"
        description="Mejor score neto por hoyo"
        enabled={config.skins.enabled}
        onToggle={(enabled) => updateBet('skins', { enabled })}
      >
        <AmountInput label="Front 9 (por skin)" value={config.skins.frontValue} onChange={(v) => updateBet('skins', { frontValue: v })} />
        <AmountInput label="Back 9 (por skin)" value={config.skins.backValue} onChange={(v) => updateBet('skins', { backValue: v })} />
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Arrastrar del 9 al 10</Label>
          <Switch
            checked={config.skins.carryOver}
            onCheckedChange={(v) => updateBet('skins', { carryOver: v })}
          />
        </div>
      </BetSection>

      {/* Caros */}
      <BetSection
        id="caros"
        title="Caros"
        description="Hoyos 15-18 (ganador único)"
        enabled={config.caros.enabled}
        onToggle={(enabled) => updateBet('caros', { enabled })}
      >
        <AmountInput label="Importe total" value={config.caros.amount} onChange={(v) => updateBet('caros', { amount: v })} />
      </BetSection>

      {/* Oyeses (Closest to the Pin) - BEFORE Units */}
      <BetSection
        id="oyeses"
        title="Oyeses (Closest to the Pin)"
        description="Par 3 - cercanía a la bandera"
        enabled={config.oyeses.enabled}
        onToggle={(enabled) => {
          // Initialize player configs when enabling
          if (enabled && config.oyeses.playerConfigs.length === 0) {
            const playerConfigs: OyesesPlayerConfig[] = players.map(p => ({
              playerId: p.id,
              modality: 'acumulados' as OyesModality,
              enabled: true,
            }));
            updateBet('oyeses', { enabled, playerConfigs });
          } else {
            updateBet('oyeses', { enabled });
          }
        }}
        color="gold"
      >
        <AmountInput 
          label="Importe por Oyes" 
          value={config.oyeses.amount} 
          onChange={(v) => updateBet('oyeses', { amount: v })} 
        />
        
        {/* Player modality configuration */}
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
              updateBet('oyeses', { playerConfigs: existingConfigs });
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
        onToggle={(enabled) => updateBet('units', { enabled })}
        color="gold"
      >
        <AmountInput label="Valor por punto" value={config.units.valuePerPoint} onChange={(v) => updateBet('units', { valuePerPoint: v })} />
      </BetSection>

      {/* Manchas */}
      <BetSection
        id="manchas"
        title="Manchas"
        description="Pinkie, Paloma, Trampa, Cuatriput, etc."
        enabled={config.manchas.enabled}
        onToggle={(enabled) => updateBet('manchas', { enabled })}
        color="red"
      >
        <AmountInput label="Valor por mancha" value={config.manchas.valuePerPoint} onChange={(v) => updateBet('manchas', { valuePerPoint: v })} />
      </BetSection>

      {/* Culebras */}
      <BetSection
        id="culebras"
        title="Culebras"
        description="3+ putts, el último paga todas"
        enabled={config.culebras.enabled}
        onToggle={(enabled) => updateBet('culebras', { enabled })}
        color="red"
      >
        <AmountInput label="Valor por culebra" value={config.culebras.valuePerOccurrence} onChange={(v) => updateBet('culebras', { valuePerOccurrence: v })} />
      </BetSection>

      {/* Pinguinos */}
      <BetSection
        id="pinguinos"
        title="Pingüinos"
        description="Triple bogey o peor, el último paga todas"
        enabled={config.pinguinos.enabled}
        onToggle={(enabled) => updateBet('pinguinos', { enabled })}
        color="red"
      >
        <AmountInput label="Valor por pingüino" value={config.pinguinos.valuePerOccurrence} onChange={(v) => updateBet('pinguinos', { valuePerOccurrence: v })} />
      </BetSection>

      {/* Medal General - Group bet */}
      <BetSection
        id="medalGeneral"
        title="Medal General"
        description="Grupal: menor score neto total gana"
        enabled={config.medalGeneral?.enabled ?? false}
        onToggle={(enabled) => {
          // Initialize player handicaps when enabling
          const currentHandicaps = config.medalGeneral?.playerHandicaps || [];
          if (enabled && currentHandicaps.length === 0) {
            const initialHandicaps = players.map(p => ({
              playerId: p.id,
              handicap: p.handicap,
            }));
            updateBet('medalGeneral', { enabled, playerHandicaps: initialHandicaps });
          } else {
            updateBet('medalGeneral', { enabled });
          }
        }}
        color="gold"
      >
        <AmountInput 
          label="Cantidad por jugador" 
          value={config.medalGeneral?.amount ?? 100} 
          onChange={(v) => updateBet('medalGeneral', { amount: v })} 
        />
        
        {/* Player handicaps for Medal General */}
        <div className="mt-3 space-y-2">
          <Label className="text-xs text-muted-foreground">Handicaps para Medal General</Label>
          {players.map(player => {
            const playerHandicaps = config.medalGeneral?.playerHandicaps || [];
            const playerConfig = playerHandicaps.find(
              pc => pc.playerId === player.id
            );
            const currentHcp = playerConfig?.handicap ?? player.handicap;
            
            return (
              <div key={player.id} className="flex items-center justify-between gap-2 p-2 bg-muted/30 rounded">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ backgroundColor: player.color }}
                  >
                    {player.initials}
                  </div>
                  <span className="text-xs font-medium">{player.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      const existingHandicaps = config.medalGeneral?.playerHandicaps || [];
                      const newHandicaps = existingHandicaps.map(pc =>
                        pc.playerId === player.id ? { ...pc, handicap: Math.max(0, pc.handicap - 1) } : pc
                      );
                      // If player not in list, add them
                      if (!newHandicaps.some(pc => pc.playerId === player.id)) {
                        newHandicaps.push({ playerId: player.id, handicap: Math.max(0, player.handicap - 1) });
                      }
                      updateBet('medalGeneral', { playerHandicaps: newHandicaps });
                    }}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Input
                    type="number"
                    value={currentHcp}
                    onChange={(e) => {
                      const newValue = parseInt(e.target.value) || 0;
                      const existingHandicaps = config.medalGeneral?.playerHandicaps || [];
                      const newHandicaps = existingHandicaps.map(pc =>
                        pc.playerId === player.id ? { ...pc, handicap: newValue } : pc
                      );
                      if (!newHandicaps.some(pc => pc.playerId === player.id)) {
                        newHandicaps.push({ playerId: player.id, handicap: newValue });
                      }
                      updateBet('medalGeneral', { playerHandicaps: newHandicaps });
                    }}
                    className="w-14 h-6 text-center text-xs p-1"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      const existingHandicaps = config.medalGeneral?.playerHandicaps || [];
                      const newHandicaps = existingHandicaps.map(pc =>
                        pc.playerId === player.id ? { ...pc, handicap: pc.handicap + 1 } : pc
                      );
                      if (!newHandicaps.some(pc => pc.playerId === player.id)) {
                        newHandicaps.push({ playerId: player.id, handicap: player.handicap + 1 });
                      }
                      updateBet('medalGeneral', { playerHandicaps: newHandicaps });
                    }}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        
        <p className="text-[9px] text-muted-foreground mt-2">
          El ganador (o ganadores en empate) cobra la cantidad a cada perdedor. 
          Los empates dividen el total entre los ganadores.
        </p>
      </BetSection>

      {/* Rayas - Aggregator bet */}
      <BetSection
        id="rayas"
        title="Rayas"
        description="Agregador: Skins + Unidades + Oyes + Medal"
        enabled={config.rayas.enabled}
        onToggle={(enabled) => updateBet('rayas', { enabled })}
        color="gold"
      >
        <AmountInput label="Front 9 (por raya)" value={config.rayas.frontValue} onChange={(v) => updateBet('rayas', { frontValue: v })} />
        <AmountInput label="Back 9 (por raya)" value={config.rayas.backValue} onChange={(v) => updateBet('rayas', { backValue: v })} />
        <AmountInput label="Medal Total (raya extra)" value={config.rayas.medalTotalValue} onChange={(v) => updateBet('rayas', { medalTotalValue: v })} />
        
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
                updateBet('rayas', { skinVariant: 'acumulados' as RayasSkinVariant });
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
                updateBet('rayas', { skinVariant: 'sinAcumulacion' as RayasSkinVariant });
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

      {/* Carritos (Teams) - Now supports 4+ players and multiple team bets */}
      {players.length >= 4 && (
        <BetSection
          id="carritos"
          title="Carritos (Parejas)"
          description="Apuestas por equipos de 2"
          enabled={config.carritos.enabled}
          onToggle={(enabled) => updateBet('carritos', { enabled })}
        >
          {/* Primary team setup */}
          <CarritosTeamConfig
            teamA={config.carritos.teamA}
            teamB={config.carritos.teamB}
            frontAmount={config.carritos.frontAmount}
            backAmount={config.carritos.backAmount}
            totalAmount={config.carritos.totalAmount}
            scoringType={config.carritos.scoringType}
            teamHandicaps={config.carritos.teamHandicaps || {}}
            players={players}
            onUpdate={(updates) => updateBet('carritos', updates)}
            isPrimary
          />

          {/* Additional team bets */}
          {config.carritosTeams?.map((team, idx) => (
            <div key={team.id} className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-medium">Carritos {idx + 2}</Label>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={() => removeCarritosTeam(team.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
              <CarritosTeamConfig
                teamA={team.teamA}
                teamB={team.teamB}
                frontAmount={team.frontAmount}
                backAmount={team.backAmount}
                totalAmount={team.totalAmount}
                scoringType={team.scoringType}
                teamHandicaps={team.teamHandicaps || {}}
                players={players}
                onUpdate={(updates) => updateCarritosTeam(team.id, updates)}
              />
            </div>
          ))}

          {/* Add more teams button */}
          {players.length >= 5 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={addCarritosTeam}
              className="w-full mt-3 gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar otra apuesta de Carritos
            </Button>
          )}
        </BetSection>
      )}
    </div>
  );
};

// Separate component for Carritos team configuration
interface CarritosTeamConfigProps {
  teamA: [string, string];
  teamB: [string, string];
  frontAmount: number;
  backAmount: number;
  totalAmount: number;
  scoringType: 'lowBall' | 'highBall' | 'combined' | 'all';
  teamHandicaps: Record<string, number>;
  players: Player[];
  onUpdate: (updates: Partial<CarritosTeamBet>) => void;
  isPrimary?: boolean;
}

type CarritosSelectOption = { value: string; label: string };

const StableSelect: React.FC<{
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  options: CarritosSelectOption[];
  triggerClassName?: string;
}> = ({ value, onValueChange, placeholder, options, triggerClassName }) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      onOpenChange={(open) => {
        // Debug: el usuario reporta que el menú se cierra instantáneamente.
        // Esto nos permitirá ver si abre y se cierra por algún evento externo.
        console.log('[Carritos][Select]', placeholder, open ? 'open' : 'closed');
      }}
    >
      <SelectTrigger
        ref={triggerRef}
        className={cn('h-8 text-xs', triggerClassName)}
        // IMPORTANTE: Radix usa pointer events; stopPropagation en mouse no siempre alcanza.
        onPointerDown={(e) => e.stopPropagation()}
        onPointerDownCapture={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        onCloseAutoFocus={(e) => {
          // Evita que Radix enfoque el trigger con scroll automático (causa "salto" al inicio)
          e.preventDefault();
          triggerRef.current?.focus({ preventScroll: true });
        }}
      >
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const CarritosTeamConfig: React.FC<CarritosTeamConfigProps> = ({
  teamA,
  teamB,
  frontAmount,
  backAmount,
  totalAmount,
  scoringType,
  teamHandicaps,
  players,
  onUpdate,
  isPrimary = false,
}) => {
  const playerOptions = useMemo(
    () => players.map((p) => ({ value: p.id, label: p.name })),
    [players]
  );

  return (
    <div
      className="space-y-3"
      // Protege toda la sección de Carritos de listeners externos que puedan
      // interpretar el pointerdown como “click fuera” y cerrar el Select.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerDownCapture={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Equipo A</Label>
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <StableSelect
            value={teamA[0]}
            onValueChange={(v) => onUpdate({ teamA: [v, teamA[1]] })}
            placeholder="Jugador 1"
            options={playerOptions}
          />
          <StableSelect
            value={teamA[1]}
            onValueChange={(v) => onUpdate({ teamA: [teamA[0], v] })}
            placeholder="Jugador 2"
            options={playerOptions}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Equipo B</Label>
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <StableSelect
            value={teamB[0]}
            onValueChange={(v) => onUpdate({ teamB: [v, teamB[1]] })}
            placeholder="Jugador 1"
            options={playerOptions}
          />
          <StableSelect
            value={teamB[1]}
            onValueChange={(v) => onUpdate({ teamB: [teamB[0], v] })}
            placeholder="Jugador 2"
            options={playerOptions}
          />
        </div>
      </div>

      {/* Handicaps individuales para Carritos */}
      <div className="p-3 bg-muted/50 rounded-lg space-y-3">
        <Label className="text-xs font-medium flex items-center gap-1">
          <span>Handicaps para Carritos</span>
          <span className="text-muted-foreground">(por jugador)</span>
        </Label>
        
        <div className="grid grid-cols-2 gap-3">
          {/* Team A players */}
          {teamA.map((playerId, idx) => {
            const player = players.find(p => p.id === playerId);
            if (!player) return null;
            return (
              <div key={`teamA-${idx}`} className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                  style={{ backgroundColor: player.color }}
                >
                  {player.initials}
                </div>
                <Input
                  type="number"
                  value={teamHandicaps[playerId] ?? player.handicap}
                  onChange={(e) => {
                    const newVal = parseInt(e.target.value) || 0;
                    onUpdate({ 
                      teamHandicaps: { ...teamHandicaps, [playerId]: newVal }
                    });
                  }}
                  className="h-7 w-16 text-xs text-center"
                  min={0}
                />
              </div>
            );
          })}
          
          {/* Team B players */}
          {teamB.map((playerId, idx) => {
            const player = players.find(p => p.id === playerId);
            if (!player) return null;
            return (
              <div key={`teamB-${idx}`} className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
                  style={{ backgroundColor: player.color }}
                >
                  {player.initials}
                </div>
                <Input
                  type="number"
                  value={teamHandicaps[playerId] ?? player.handicap}
                  onChange={(e) => {
                    const newVal = parseInt(e.target.value) || 0;
                    onUpdate({ 
                      teamHandicaps: { ...teamHandicaps, [playerId]: newVal }
                    });
                  }}
                  className="h-7 w-16 text-xs text-center"
                  min={0}
                />
              </div>
            );
          })}
        </div>
        
        <p className="text-[10px] text-muted-foreground">
          Handicap base de ronda vs handicap para Carritos
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Front 9</Label>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdate({ frontAmount: Math.max(0, frontAmount - 25) }); }} onMouseDown={(e) => e.stopPropagation()}><Minus className="h-3 w-3" /></Button>
          <div className="flex items-center gap-0.5">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <Input type="number" value={frontAmount} onChange={(e) => onUpdate({ frontAmount: parseInt(e.target.value) || 0 })} onClick={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()} className="h-7 w-16 text-sm text-center px-1" min={0} step={25} />
          </div>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdate({ frontAmount: frontAmount + 25 }); }} onMouseDown={(e) => e.stopPropagation()}><Plus className="h-3 w-3" /></Button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Back 9</Label>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdate({ backAmount: Math.max(0, backAmount - 25) }); }} onMouseDown={(e) => e.stopPropagation()}><Minus className="h-3 w-3" /></Button>
          <div className="flex items-center gap-0.5">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <Input type="number" value={backAmount} onChange={(e) => onUpdate({ backAmount: parseInt(e.target.value) || 0 })} onClick={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()} className="h-7 w-16 text-sm text-center px-1" min={0} step={25} />
          </div>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdate({ backAmount: backAmount + 25 }); }} onMouseDown={(e) => e.stopPropagation()}><Plus className="h-3 w-3" /></Button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Total 18</Label>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdate({ totalAmount: Math.max(0, totalAmount - 25) }); }} onMouseDown={(e) => e.stopPropagation()}><Minus className="h-3 w-3" /></Button>
          <div className="flex items-center gap-0.5">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <Input type="number" value={totalAmount} onChange={(e) => onUpdate({ totalAmount: parseInt(e.target.value) || 0 })} onClick={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()} className="h-7 w-16 text-sm text-center px-1" min={0} step={25} />
          </div>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUpdate({ totalAmount: totalAmount + 25 }); }} onMouseDown={(e) => e.stopPropagation()}><Plus className="h-3 w-3" /></Button>
        </div>
      </div>

      <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
        <Label className="text-xs text-muted-foreground">Tipo de puntuación</Label>
        <Select
          value={scoringType}
          onValueChange={(v: 'lowBall' | 'highBall' | 'combined' | 'all') => onUpdate({ scoringType: v })}
        >
          <SelectTrigger
            className="h-7 w-28 text-xs"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent onCloseAutoFocus={(e) => e.preventDefault()}>
            <SelectItem value="lowBall">Low Ball</SelectItem>
            <SelectItem value="highBall">High Ball</SelectItem>
            <SelectItem value="combined">Combinado</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export const defaultBetConfig: BetConfig = {
  medal: { enabled: true, frontAmount: 50, backAmount: 100, totalAmount: 100 },
  pressures: { enabled: true, frontAmount: 50, backAmount: 100, totalAmount: 50 },
  skins: { enabled: true, frontValue: 25, backValue: 50, carryOver: false },
  caros: { enabled: true, amount: 200 },
  oyeses: { enabled: false, amount: 25, playerConfigs: [] },
  units: { enabled: true, valuePerPoint: 25 },
  manchas: { enabled: true, valuePerPoint: 25 },
  culebras: { enabled: true, valuePerOccurrence: 25 },
  pinguinos: { enabled: false, valuePerOccurrence: 25 },
  rayas: { enabled: false, frontValue: 25, backValue: 50, medalTotalValue: 25, skinVariant: 'acumulados' },
  carritos: { 
    enabled: false, 
    teamA: ['', ''], 
    teamB: ['', ''], 
    frontAmount: 100, 
    backAmount: 100, 
    totalAmount: 100,
    useTeamHandicaps: false,
    scoringType: 'all',
    teamHandicaps: {},
  },
  medalGeneral: { enabled: false, amount: 100, playerHandicaps: [] },
  carritosTeams: [],
  betOverrides: [],
};