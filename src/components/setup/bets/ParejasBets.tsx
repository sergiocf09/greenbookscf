import React, { useMemo } from 'react';
import { BetConfig, Player, CarritosTeamBet, TeamPressuresBet } from '@/types/golf';
import { BetSection } from './BetSection';
import { AmountInput } from './AmountInput';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, DollarSign, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ParejasBetsProps {
  config: BetConfig;
  players: Player[];
  expandedSections: string[];
  onToggleSection: (section: string, open: boolean) => void;
  onUpdateBet: <K extends keyof BetConfig>(betType: K, updates: Partial<BetConfig[K]>) => void;
  onUpdateConfig: (config: BetConfig) => void;
}

export const ParejasBets: React.FC<ParejasBetsProps> = ({
  config,
  players,
  expandedSections,
  onToggleSection,
  onUpdateBet,
  onUpdateConfig,
}) => {
  const playerOptions = useMemo(
    () => players.map((p) => ({ value: p.id, label: p.name })),
    [players]
  );

  // Team Pressures management
  const addTeamPressure = () => {
    const newBet: TeamPressuresBet = {
      id: `team-pressure-${Date.now()}`,
      teamA: ['', ''],
      teamB: ['', ''],
      frontAmount: 100,
      backAmount: 100,
      totalAmount: 100,
      openingThreshold: 3,
      teamHandicaps: {},
      scoringType: 'lowBall',
      enabled: true,
    };
    onUpdateConfig({
      ...config,
      teamPressures: {
        ...config.teamPressures,
        bets: [...config.teamPressures.bets, newBet],
      },
    });
  };

  const updateTeamPressure = (id: string, updates: Partial<TeamPressuresBet>) => {
    onUpdateConfig({
      ...config,
      teamPressures: {
        ...config.teamPressures,
        bets: config.teamPressures.bets.map(b => 
          b.id === id ? { ...b, ...updates } : b
        ),
      },
    });
  };

  const removeTeamPressure = (id: string) => {
    onUpdateConfig({
      ...config,
      teamPressures: {
        ...config.teamPressures,
        bets: config.teamPressures.bets.filter(b => b.id !== id),
      },
    });
  };

  // Carritos management
  const addCarritosTeam = () => {
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
    onUpdateConfig({
      ...config,
      carritosTeams: [...(config.carritosTeams || []), newTeam],
    });
  };

  const updateCarritosTeam = (teamId: string, updates: Partial<CarritosTeamBet>) => {
    const teams = config.carritosTeams || [];
    onUpdateConfig({
      ...config,
      carritosTeams: teams.map(t => t.id === teamId ? { ...t, ...updates } : t),
    });
  };

  const removeCarritosTeam = (teamId: string) => {
    const teams = config.carritosTeams || [];
    onUpdateConfig({
      ...config,
      carritosTeams: teams.filter(t => t.id !== teamId),
    });
  };

  if (players.length < 4) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">Se necesitan al menos 4 jugadores para apuestas de parejas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground mb-2">
        Apuestas pareja vs pareja. Definen su hándicap propio en esta pantalla.
      </p>

      {/* Team Pressures - NEW */}
      <BetSection
        id="teamPressures"
        title="Presiones por Parejas 🆕"
        description="Match play por equipos, apertura automática"
        enabled={config.teamPressures.enabled}
        onToggle={(enabled) => onUpdateBet('teamPressures', { enabled })}
        isExpanded={expandedSections.includes('teamPressures')}
        onExpandChange={(open) => onToggleSection('teamPressures', open)}
      >
        {config.teamPressures.bets.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground mb-2">No hay presiones por parejas configuradas</p>
            <Button variant="outline" size="sm" onClick={addTeamPressure} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              Agregar Presión por Parejas
            </Button>
          </div>
        ) : (
          <>
            {config.teamPressures.bets.map((bet, idx) => (
              <TeamPressureConfig
                key={bet.id}
                bet={bet}
                index={idx}
                players={players}
                playerOptions={playerOptions}
                onUpdate={(updates) => updateTeamPressure(bet.id, updates)}
                onRemove={() => removeTeamPressure(bet.id)}
              />
            ))}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={addTeamPressure}
              className="w-full mt-3 gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar otra Presión por Parejas
            </Button>
          </>
        )}
      </BetSection>

      {/* Carritos */}
      <BetSection
        id="carritos"
        title="Carritos (Medal Parejas)"
        description="Medal por equipos de 2"
        enabled={config.carritos.enabled}
        onToggle={(enabled) => onUpdateBet('carritos', { enabled })}
        isExpanded={expandedSections.includes('carritos')}
        onExpandChange={(open) => onToggleSection('carritos', open)}
      >
        <CarritosTeamConfig
          teamA={config.carritos.teamA}
          teamB={config.carritos.teamB}
          frontAmount={config.carritos.frontAmount}
          backAmount={config.carritos.backAmount}
          totalAmount={config.carritos.totalAmount}
          scoringType={config.carritos.scoringType}
          teamHandicaps={config.carritos.teamHandicaps || {}}
          players={players}
          playerOptions={playerOptions}
          onUpdate={(updates) => onUpdateBet('carritos', updates)}
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
              playerOptions={playerOptions}
              onUpdate={(updates) => updateCarritosTeam(team.id, updates)}
            />
          </div>
        ))}

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
    </div>
  );
};

// Team Pressure Configuration Component
interface TeamPressureConfigProps {
  bet: TeamPressuresBet;
  index: number;
  players: Player[];
  playerOptions: { value: string; label: string }[];
  onUpdate: (updates: Partial<TeamPressuresBet>) => void;
  onRemove: () => void;
}

const TeamPressureConfig: React.FC<TeamPressureConfigProps> = ({
  bet,
  index,
  players,
  playerOptions,
  onUpdate,
  onRemove,
}) => {
  return (
    <div className={cn(
      'space-y-3 p-3 rounded-lg',
      index > 0 ? 'border-t border-border mt-4 pt-4' : 'bg-muted/30'
    )}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Presión {index + 1}</Label>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>

      {/* Teams */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Equipo A</Label>
        <div className="flex gap-2">
          <Select value={bet.teamA[0]} onValueChange={(v) => onUpdate({ teamA: [v, bet.teamA[1]] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Jugador 1" /></SelectTrigger>
            <SelectContent>
              {playerOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={bet.teamA[1]} onValueChange={(v) => onUpdate({ teamA: [bet.teamA[0], v] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Jugador 2" /></SelectTrigger>
            <SelectContent>
              {playerOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Equipo B</Label>
        <div className="flex gap-2">
          <Select value={bet.teamB[0]} onValueChange={(v) => onUpdate({ teamB: [v, bet.teamB[1]] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Jugador 1" /></SelectTrigger>
            <SelectContent>
              {playerOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={bet.teamB[1]} onValueChange={(v) => onUpdate({ teamB: [bet.teamB[0], v] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Jugador 2" /></SelectTrigger>
            <SelectContent>
              {playerOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Handicaps for this bet */}
      <div className="p-2 bg-muted/50 rounded-lg space-y-2">
        <Label className="text-[10px] font-medium">Handicaps para esta apuesta</Label>
        <div className="grid grid-cols-2 gap-2">
          {[...bet.teamA, ...bet.teamB].filter(Boolean).map((playerId) => {
            const player = players.find(p => p.id === playerId);
            if (!player) return null;
            return (
              <div key={playerId} className="flex items-center gap-2">
                <div 
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold shrink-0"
                  style={{ backgroundColor: player.color }}
                >
                  {player.initials}
                </div>
                <Input
                  type="number"
                  value={bet.teamHandicaps[playerId] ?? player.handicap}
                  onChange={(e) => {
                    onUpdate({ 
                      teamHandicaps: { ...bet.teamHandicaps, [playerId]: parseInt(e.target.value) || 0 }
                    });
                  }}
                  className="h-6 w-14 text-xs text-center"
                  min={0}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Opening threshold */}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Abre cuando diferencia =</Label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onUpdate({ openingThreshold: 3 })}
            className={cn(
              'px-3 py-1 text-xs rounded transition-colors',
              bet.openingThreshold === 3 
                ? 'bg-primary text-primary-foreground font-medium' 
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            3 hoyos
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ openingThreshold: 4 })}
            className={cn(
              'px-3 py-1 text-xs rounded transition-colors',
              bet.openingThreshold === 4 
                ? 'bg-primary text-primary-foreground font-medium' 
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            4 hoyos
          </button>
        </div>
      </div>

      {/* Scoring type */}
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">Comparación</Label>
        <Select
          value={bet.scoringType}
          onValueChange={(v: 'lowBall' | 'highBall' | 'combined') => onUpdate({ scoringType: v })}
        >
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lowBall">Bola Baja</SelectItem>
            <SelectItem value="highBall">Bola Alta</SelectItem>
            <SelectItem value="combined">Combinado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Amounts */}
      <AmountInput label="Front 9" value={bet.frontAmount} onChange={(v) => onUpdate({ frontAmount: v })} />
      <AmountInput label="Back 9" value={bet.backAmount} onChange={(v) => onUpdate({ backAmount: v })} />
      <AmountInput label="Match 18" value={bet.totalAmount} onChange={(v) => onUpdate({ totalAmount: v })} />
    </div>
  );
};

// Carritos Team Configuration Component
interface CarritosTeamConfigProps {
  teamA: [string, string];
  teamB: [string, string];
  frontAmount: number;
  backAmount: number;
  totalAmount: number;
  scoringType: 'lowBall' | 'highBall' | 'combined' | 'all';
  teamHandicaps: Record<string, number>;
  players: Player[];
  playerOptions: { value: string; label: string }[];
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
  playerOptions,
  onUpdate,
  isPrimary = false,
}) => {
  return (
    <div className="space-y-3" onPointerDown={(e) => e.stopPropagation()}>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Equipo A</Label>
        <div className="flex gap-2">
          <Select value={teamA[0]} onValueChange={(v) => onUpdate({ teamA: [v, teamA[1]] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Jugador 1" /></SelectTrigger>
            <SelectContent>
              {playerOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={teamA[1]} onValueChange={(v) => onUpdate({ teamA: [teamA[0], v] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Jugador 2" /></SelectTrigger>
            <SelectContent>
              {playerOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Equipo B</Label>
        <div className="flex gap-2">
          <Select value={teamB[0]} onValueChange={(v) => onUpdate({ teamB: [v, teamB[1]] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Jugador 1" /></SelectTrigger>
            <SelectContent>
              {playerOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={teamB[1]} onValueChange={(v) => onUpdate({ teamB: [teamB[0], v] })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Jugador 2" /></SelectTrigger>
            <SelectContent>
              {playerOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Handicaps */}
      <div className="p-3 bg-muted/50 rounded-lg space-y-3">
        <Label className="text-xs font-medium">Handicaps para Carritos</Label>
        <div className="grid grid-cols-2 gap-3">
          {[...teamA, ...teamB].map((playerId, idx) => {
            const player = players.find(p => p.id === playerId);
            if (!player) return null;
            return (
              <div key={`${playerId}-${idx}`} className="flex items-center gap-2">
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
                    onUpdate({ 
                      teamHandicaps: { ...teamHandicaps, [playerId]: parseInt(e.target.value) || 0 }
                    });
                  }}
                  className="h-7 w-16 text-xs text-center"
                  min={0}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Amounts */}
      <AmountInput label="Front 9" value={frontAmount} onChange={(v) => onUpdate({ frontAmount: v })} />
      <AmountInput label="Back 9" value={backAmount} onChange={(v) => onUpdate({ backAmount: v })} />
      <AmountInput label="Total 18" value={totalAmount} onChange={(v) => onUpdate({ totalAmount: v })} />

      {/* Scoring Type */}
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
