import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronUp, DollarSign } from 'lucide-react';
import { BetConfig, Player } from '@/types/golf';
import { cn } from '@/lib/utils';
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
  }> = ({ label, value, onChange }) => (
    <div className="flex items-center justify-between">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">
        <DollarSign className="h-3 w-3 text-muted-foreground" />
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          className="h-7 w-20 text-sm text-right"
          min={0}
        />
      </div>
    </div>
  );

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
        description="Hoyos 15-18"
        enabled={config.caros.enabled}
        onToggle={(enabled) => updateBet('caros', { enabled })}
      >
        <AmountInput label="Por hoyo" value={config.caros.amount} onChange={(v) => updateBet('caros', { amount: v })} />
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
        description="Pinkie, Paloma, Trampa, etc."
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

      {/* Carritos (Teams) */}
      {players.length === 4 && (
        <BetSection
          id="carritos"
          title="Carritos (Parejas)"
          description="Apuesta por equipos de 2"
          enabled={config.carritos.enabled}
          onToggle={(enabled) => updateBet('carritos', { enabled })}
        >
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Equipo A</Label>
            <div className="flex gap-2">
              <Select
                value={config.carritos.teamA[0]}
                onValueChange={(v) => updateBet('carritos', { teamA: [v, config.carritos.teamA[1]] })}
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
                value={config.carritos.teamA[1]}
                onValueChange={(v) => updateBet('carritos', { teamA: [config.carritos.teamA[0], v] })}
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
                value={config.carritos.teamB[0]}
                onValueChange={(v) => updateBet('carritos', { teamB: [v, config.carritos.teamB[1]] })}
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
                value={config.carritos.teamB[1]}
                onValueChange={(v) => updateBet('carritos', { teamB: [config.carritos.teamB[0], v] })}
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
          <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-3">
            <Label className="text-xs font-medium flex items-center gap-1">
              <span>Handicaps para Carritos</span>
              <span className="text-muted-foreground">(por jugador)</span>
            </Label>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Team A players */}
              {config.carritos.teamA.map((playerId, idx) => {
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
                      value={config.carritos.teamHandicaps?.[playerId] ?? player.handicap}
                      onChange={(e) => {
                        const newVal = parseInt(e.target.value) || 0;
                        const handicaps = config.carritos.teamHandicaps || {};
                        updateBet('carritos', { 
                          teamHandicaps: { ...handicaps, [playerId]: newVal }
                        });
                      }}
                      className="h-7 w-16 text-xs text-center"
                      min={0}
                    />
                  </div>
                );
              })}
              
              {/* Team B players */}
              {config.carritos.teamB.map((playerId, idx) => {
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
                      value={config.carritos.teamHandicaps?.[playerId] ?? player.handicap}
                      onChange={(e) => {
                        const newVal = parseInt(e.target.value) || 0;
                        const handicaps = config.carritos.teamHandicaps || {};
                        updateBet('carritos', { 
                          teamHandicaps: { ...handicaps, [playerId]: newVal }
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

          <AmountInput label="Front 9" value={config.carritos.frontAmount} onChange={(v) => updateBet('carritos', { frontAmount: v })} />
          <AmountInput label="Back 9" value={config.carritos.backAmount} onChange={(v) => updateBet('carritos', { backAmount: v })} />
          <AmountInput label="Total 18" value={config.carritos.totalAmount} onChange={(v) => updateBet('carritos', { totalAmount: v })} />

          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Tipo de puntuación</Label>
            <Select
              value={config.carritos.scoringType}
              onValueChange={(v: 'lowBall' | 'highBall' | 'combined' | 'all') => updateBet('carritos', { scoringType: v })}
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
        </BetSection>
      )}
    </div>
  );
};

export const defaultBetConfig: BetConfig = {
  medal: { enabled: true, frontAmount: 50, backAmount: 50, totalAmount: 100 },
  pressures: { enabled: true, frontAmount: 25, backAmount: 25 },
  skins: { enabled: true, frontValue: 10, backValue: 20, carryOver: true },
  caros: { enabled: true, amount: 50 },
  units: { enabled: true, valuePerPoint: 25 },
  manchas: { enabled: true, valuePerPoint: 25 },
  culebras: { enabled: true, valuePerOccurrence: 10 },
  pinguinos: { enabled: false, valuePerOccurrence: 10 },
  carritos: { 
    enabled: false, 
    teamA: ['', ''], 
    teamB: ['', ''], 
    frontAmount: 100, 
    backAmount: 100, 
    totalAmount: 200,
    useTeamHandicaps: false,
    scoringType: 'lowBall',
    teamHandicaps: {},
  },
};
