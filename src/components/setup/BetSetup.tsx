import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronUp, DollarSign, Plus, Trash2, Minus } from 'lucide-react';
import { BetConfig, Player, CarritosTeamBet } from '@/types/golf';
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
      onOpenChange={() => toggleSection(id)}
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
    const handleIncrement = () => onChange(value + step);
    const handleDecrement = () => onChange(Math.max(0, value - step));
    
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
              onBlur={(e) => {
                // Round to nearest step on blur
                const rounded = Math.round((parseInt(e.target.value) || 0) / step) * step;
                onChange(rounded);
              }}
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
      frontAmount: 25,
      backAmount: 25,
      totalAmount: 25,
      scoringType: 'lowBall',
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
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Equipo A</Label>
        <div className="flex gap-2">
          <Select
            value={teamA[0]}
            onValueChange={(v) => onUpdate({ teamA: [v, teamA[1]] })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Jugador 1" />
            </SelectTrigger>
            <SelectContent>
              {players.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={teamA[1]}
            onValueChange={(v) => onUpdate({ teamA: [teamA[0], v] })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Jugador 2" />
            </SelectTrigger>
            <SelectContent>
              {players.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Equipo B</Label>
        <div className="flex gap-2">
          <Select
            value={teamB[0]}
            onValueChange={(v) => onUpdate({ teamB: [v, teamB[1]] })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Jugador 1" />
            </SelectTrigger>
            <SelectContent>
              {players.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={teamB[1]}
            onValueChange={(v) => onUpdate({ teamB: [teamB[0], v] })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Jugador 2" />
            </SelectTrigger>
            <SelectContent>
              {players.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => onUpdate({ frontAmount: Math.max(0, frontAmount - 25) })}><Minus className="h-3 w-3" /></Button>
          <div className="flex items-center gap-0.5">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <Input type="number" value={frontAmount} onChange={(e) => onUpdate({ frontAmount: parseInt(e.target.value) || 0 })} className="h-7 w-16 text-sm text-center px-1" min={0} step={25} />
          </div>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => onUpdate({ frontAmount: frontAmount + 25 })}><Plus className="h-3 w-3" /></Button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Back 9</Label>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => onUpdate({ backAmount: Math.max(0, backAmount - 25) })}><Minus className="h-3 w-3" /></Button>
          <div className="flex items-center gap-0.5">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <Input type="number" value={backAmount} onChange={(e) => onUpdate({ backAmount: parseInt(e.target.value) || 0 })} className="h-7 w-16 text-sm text-center px-1" min={0} step={25} />
          </div>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => onUpdate({ backAmount: backAmount + 25 })}><Plus className="h-3 w-3" /></Button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Total 18</Label>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => onUpdate({ totalAmount: Math.max(0, totalAmount - 25) })}><Minus className="h-3 w-3" /></Button>
          <div className="flex items-center gap-0.5">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <Input type="number" value={totalAmount} onChange={(e) => onUpdate({ totalAmount: parseInt(e.target.value) || 0 })} className="h-7 w-16 text-sm text-center px-1" min={0} step={25} />
          </div>
          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => onUpdate({ totalAmount: totalAmount + 25 })}><Plus className="h-3 w-3" /></Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Tipo de puntuación</Label>
        <Select
          value={scoringType}
          onValueChange={(v: 'lowBall' | 'highBall' | 'combined' | 'all') => onUpdate({ scoringType: v })}
        >
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
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
  medal: { enabled: true, frontAmount: 25, backAmount: 25, totalAmount: 50 },
  pressures: { enabled: true, frontAmount: 25, backAmount: 25 },
  skins: { enabled: true, frontValue: 25, backValue: 25, carryOver: false },
  caros: { enabled: true, amount: 25 },
  units: { enabled: true, valuePerPoint: 25 },
  manchas: { enabled: true, valuePerPoint: 25 },
  culebras: { enabled: true, valuePerOccurrence: 25 },
  pinguinos: { enabled: false, valuePerOccurrence: 25 },
  carritos: { 
    enabled: false, 
    teamA: ['', ''], 
    teamB: ['', ''], 
    frontAmount: 25, 
    backAmount: 25, 
    totalAmount: 50,
    useTeamHandicaps: false,
    scoringType: 'lowBall',
    teamHandicaps: {},
  },
  carritosTeams: [],
  betOverrides: [],
};