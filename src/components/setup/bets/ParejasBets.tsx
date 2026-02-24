import React, { useMemo } from 'react';
import { BetConfig, Player, CarritosTeamBet, TeamPressuresBet, markerInfo, MarkerState, TeamPressureUnitsConfig, TeamPressureOyesesConfig } from '@/types/golf';
import { BetSection } from './BetSection';
import { AmountInput } from './AmountInput';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
        enabled: true,
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

  // For carritos primary - just delegate to addCarritosTeam
  const addCarritosPrimary = () => {
    addCarritosTeam();
  };

  // Check if primary carritos has any players set
  const hasPrimaryCarritos = config.carritos.enabled && (
    config.carritos.teamA[0] || config.carritos.teamA[1] ||
    config.carritos.teamB[0] || config.carritos.teamB[1]
  );

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

      {/* Team Pressures */}
      <BetSection
        id="teamPressures"
         title="Foursomes"
         description="Match play por equipos, apertura automática"
        enabled={config.teamPressures.enabled}
        onToggle={(enabled) => {
          onUpdateBet('teamPressures', { enabled });
          if (enabled) onToggleSection('teamPressures', true);
        }}
        isExpanded={expandedSections.includes('teamPressures')}
        onExpandChange={(open) => onToggleSection('teamPressures', open)}
      >
        {config.teamPressures.bets.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground mb-2">No hay foursomes configurados</p>
            <Button variant="outline" size="sm" onClick={addTeamPressure} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              Agregar Foursome
            </Button>
          </div>
        ) : (
          <>
            {config.teamPressures.bets.map((bet, idx) => (
              <TeamPressureCard
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
              Agregar otro Foursome
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
        onToggle={(enabled) => {
          onUpdateBet('carritos', { enabled });
          // Auto-open section when enabling so user sees configuration
          if (enabled) onToggleSection('carritos', true);
        }}
        isExpanded={expandedSections.includes('carritos')}
        onExpandChange={(open) => onToggleSection('carritos', open)}
      >
        {/* Show add button if no carritos configured yet */}
        {!hasPrimaryCarritos && (config.carritosTeams || []).length === 0 ? (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground mb-2">No hay apuestas de carritos configuradas</p>
            <Button variant="outline" size="sm" onClick={addCarritosPrimary} className="gap-1">
              <Plus className="h-3.5 w-3.5" />
              Agregar apuesta de Carritos
            </Button>
          </div>
        ) : (
          <>
            {/* Primary carritos */}
            {hasPrimaryCarritos && (
              <CarritosCard
                label="Carritos 1"
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
              />
            )}

            {/* Additional carritos */}
            {config.carritosTeams?.map((team, idx) => (
              <CarritosCard
                key={team.id}
                label={`Carritos ${hasPrimaryCarritos ? idx + 2 : idx + 1}`}
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
                onRemove={() => removeCarritosTeam(team.id)}
              />
            ))}

            <Button
              variant="outline"
              size="sm"
              onClick={addCarritosTeam}
              className="w-full mt-3 gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar otra apuesta de Carritos
            </Button>
          </>
        )}
      </BetSection>
    </div>
  );
};

/* ─── Shared compact team row: player select + handicap inline ─── */
interface PlayerWithHcpProps {
  playerId: string;
  players: Player[];
  playerOptions: { value: string; label: string }[];
  handicap: number;
  onChangePlayer: (id: string) => void;
  onChangeHandicap: (v: number) => void;
  align?: 'left' | 'right';
}

const PlayerWithHcp: React.FC<PlayerWithHcpProps> = ({
  playerId,
  players,
  playerOptions,
  handicap,
  onChangePlayer,
  onChangeHandicap,
  align = 'left',
}) => {
  const row = align === 'right' ? 'flex-row-reverse' : 'flex-row';
  return (
    <div className={cn('flex items-center gap-1', row)}>
      <Select value={playerId} onValueChange={onChangePlayer}>
        <SelectTrigger className="h-7 text-[11px] flex-1 min-w-0 px-1.5">
          <SelectValue placeholder="Jugador" />
        </SelectTrigger>
        <SelectContent>
          {playerOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="number"
        value={handicap}
        onChange={(e) => onChangeHandicap(parseInt(e.target.value) || 0)}
        className="h-7 w-10 text-[11px] text-center px-0.5 shrink-0"
        min={0}
      />
    </div>
  );
};

/* ─── Compact two-column team layout ─── */
interface TeamColumnsProps {
  teamA: [string, string];
  teamB: [string, string];
  teamHandicaps: Record<string, number>;
  players: Player[];
  playerOptions: { value: string; label: string }[];
  onUpdateTeamA: (team: [string, string]) => void;
  onUpdateTeamB: (team: [string, string]) => void;
  onUpdateHandicaps: (hcps: Record<string, number>) => void;
}

const TeamColumns: React.FC<TeamColumnsProps> = ({
  teamA,
  teamB,
  teamHandicaps,
  players,
  playerOptions,
  onUpdateTeamA,
  onUpdateTeamB,
  onUpdateHandicaps,
}) => {
  const getHcp = (pid: string) => {
    if (teamHandicaps[pid] !== undefined) return teamHandicaps[pid];
    const p = players.find(pl => pl.id === pid);
    return p?.handicap ?? 0;
  };

  const setHcp = (pid: string, val: number) => {
    onUpdateHandicaps({ ...teamHandicaps, [pid]: val });
  };

  return (
    <div className="space-y-1">
      {/* Header row */}
      <div className="grid grid-cols-2 gap-2">
        <Label className="text-[10px] text-muted-foreground font-medium leading-none">Equipo A</Label>
        <Label className="text-[10px] text-muted-foreground font-medium text-right leading-none">Equipo B</Label>
      </div>
      {/* Player row 1 */}
      <div className="grid grid-cols-2 gap-2">
        <PlayerWithHcp
          playerId={teamA[0]}
          players={players}
          playerOptions={playerOptions}
          handicap={getHcp(teamA[0])}
          onChangePlayer={(v) => onUpdateTeamA([v, teamA[1]])}
          onChangeHandicap={(v) => setHcp(teamA[0], v)}
          align="left"
        />
        <PlayerWithHcp
          playerId={teamB[0]}
          players={players}
          playerOptions={playerOptions}
          handicap={getHcp(teamB[0])}
          onChangePlayer={(v) => onUpdateTeamB([v, teamB[1]])}
          onChangeHandicap={(v) => setHcp(teamB[0], v)}
          align="right"
        />
      </div>
      {/* Player row 2 */}
      <div className="grid grid-cols-2 gap-2">
        <PlayerWithHcp
          playerId={teamA[1]}
          players={players}
          playerOptions={playerOptions}
          handicap={getHcp(teamA[1])}
          onChangePlayer={(v) => onUpdateTeamA([teamA[0], v])}
          onChangeHandicap={(v) => setHcp(teamA[1], v)}
          align="left"
        />
        <PlayerWithHcp
          playerId={teamB[1]}
          players={players}
          playerOptions={playerOptions}
          handicap={getHcp(teamB[1])}
          onChangePlayer={(v) => onUpdateTeamB([teamB[0], v])}
          onChangeHandicap={(v) => setHcp(teamB[1], v)}
          align="right"
        />
      </div>
    </div>
  );
};

/* ─── Team Pressure Card ─── */
interface TeamPressureCardProps {
  bet: TeamPressuresBet;
  index: number;
  players: Player[];
  playerOptions: { value: string; label: string }[];
  onUpdate: (updates: Partial<TeamPressuresBet>) => void;
  onRemove: () => void;
}

const TeamPressureCard: React.FC<TeamPressureCardProps> = ({
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
        <Label className="text-xs font-medium">Foursome {index + 1}</Label>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar Foursome {index + 1}?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción eliminará permanentemente esta apuesta. No se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={onRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Compact team columns */}
      <TeamColumns
        teamA={bet.teamA}
        teamB={bet.teamB}
        teamHandicaps={bet.teamHandicaps}
        players={players}
        playerOptions={playerOptions}
        onUpdateTeamA={(t) => onUpdate({ teamA: t })}
        onUpdateTeamB={(t) => onUpdate({ teamB: t })}
        onUpdateHandicaps={(h) => onUpdate({ teamHandicaps: h })}
      />

      {/* Scoring type */}
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-semibold text-primary">Modalidad</Label>
        <Select
          value={bet.scoringType}
          onValueChange={(v: 'lowBall' | 'highBall' | 'combined') => onUpdate({ scoringType: v })}
        >
          <SelectTrigger className="h-7 w-28 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lowBall">Bola Baja</SelectItem>
            <SelectItem value="highBall">Bola Alta</SelectItem>
            <SelectItem value="combined">Combinado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Amounts - 3 columns */}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground text-center block">Front 9</Label>
          <AmountInput label="" value={bet.frontAmount} onChange={(v) => onUpdate({ frontAmount: v })} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground text-center block">Back 9</Label>
          <AmountInput label="" value={bet.backAmount} onChange={(v) => onUpdate({ backAmount: v })} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground text-center block">Total 18</Label>
          <AmountInput label="" value={bet.totalAmount} onChange={(v) => onUpdate({ totalAmount: v })} />
        </div>
      </div>

      {/* Modalidades Adicionales */}
      <div className="space-y-2 pt-2 border-t border-border/30">
        <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Modalidades Adicionales</Label>
        
        {/* Units Toggle & Config */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Unidades</Label>
            <Switch
              checked={bet.unitsConfig?.enabled ?? false}
              onCheckedChange={(enabled) => onUpdate({
                unitsConfig: {
                  ...(bet.unitsConfig ?? { enabled: false, valuePerUnit: 25, enabledMarkers: ['birdie', 'eagle', 'albatross', 'sandyPar', 'aquaPar', 'holeOut'] }),
                  enabled,
                },
              })}
            />
          </div>
          {bet.unitsConfig?.enabled && (
            <div className="space-y-2 pl-2 border-l-2 border-primary/20">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-muted-foreground">Valor por Unidad</Label>
                <AmountInput label="" value={bet.unitsConfig.valuePerUnit} onChange={(v) => onUpdate({
                  unitsConfig: { ...bet.unitsConfig!, valuePerUnit: v },
                })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Qué cuenta como unidad</Label>
              <div className="grid grid-cols-2 gap-1">
                  {(['birdie', 'sandyPar', 'eagle', 'holeOut', 'albatross', 'aquaPar'] as (keyof MarkerState)[]).map(marker => {
                    const info = markerInfo[marker];
                    const isChecked = bet.unitsConfig?.enabledMarkers?.includes(marker) ?? false;
                    return (
                      <label key={marker} className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            const current = bet.unitsConfig?.enabledMarkers ?? [];
                            const next = checked ? [...current, marker] : current.filter(m => m !== marker);
                            onUpdate({
                              unitsConfig: { ...bet.unitsConfig!, enabledMarkers: next as (keyof MarkerState)[] },
                            });
                          }}
                          className="h-3.5 w-3.5"
                        />
                        <span>{info.emoji} {info.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Oyeses Toggle & Config */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Oyeses</Label>
            <Switch
              checked={bet.oyesesConfig?.enabled ?? false}
              onCheckedChange={(enabled) => onUpdate({
                oyesesConfig: {
                  ...(bet.oyesesConfig ?? { enabled: false, modality: 'acumulados', valuePerOyes: 25 }),
                  enabled,
                },
              })}
            />
          </div>
          {bet.oyesesConfig?.enabled && (
            <div className="space-y-2 pl-2 border-l-2 border-primary/20">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-muted-foreground">Valor por Oyes</Label>
                <AmountInput label="" value={bet.oyesesConfig.valuePerOyes} onChange={(v) => onUpdate({
                  oyesesConfig: { ...bet.oyesesConfig!, valuePerOyes: v },
                })} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Modalidad</Label>
                <RadioGroup
                  value={bet.oyesesConfig.modality}
                  onValueChange={(v) => onUpdate({
                    oyesesConfig: { ...bet.oyesesConfig!, modality: v as 'acumulados' | 'sangron' },
                  })}
                  className="flex gap-3"
                >
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                    <RadioGroupItem value="acumulados" className="h-3.5 w-3.5" />
                    Acumulado
                  </label>
                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                    <RadioGroupItem value="sangron" className="h-3.5 w-3.5" />
                    Sangrón
                  </label>
                </RadioGroup>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info note */}
      <div className="text-[10px] text-muted-foreground bg-muted/50 rounded p-1.5">
        {bet.scoringType === 'combined'
          ? '💡 Combinado: nuevas apuestas cuando diferencia > 2'
          : '💡 Individual: nuevas apuestas cuando diferencia = 2'}
      </div>
    </div>
  );
};

/* ─── Carritos Card ─── */
interface CarritosCardProps {
  label: string;
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
  onRemove?: () => void;
}

const CarritosCard: React.FC<CarritosCardProps> = ({
  label,
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
  onRemove,
}) => {
  return (
    <div className="space-y-3 p-3 rounded-lg bg-muted/30 mb-3" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        {onRemove && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Eliminar {label}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción eliminará permanentemente esta apuesta de carritos. No se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Compact team columns */}
      <TeamColumns
        teamA={teamA}
        teamB={teamB}
        teamHandicaps={teamHandicaps}
        players={players}
        playerOptions={playerOptions}
        onUpdateTeamA={(t) => onUpdate({ teamA: t })}
        onUpdateTeamB={(t) => onUpdate({ teamB: t })}
        onUpdateHandicaps={(h) => onUpdate({ teamHandicaps: h })}
      />

      {/* Scoring Type - after players, consistent with Presiones */}
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-semibold text-primary">Modalidad</Label>
        <Select
          value={scoringType}
          onValueChange={(v: 'lowBall' | 'highBall' | 'combined' | 'all') => onUpdate({ scoringType: v })}
        >
          <SelectTrigger className="h-7 w-28 text-[11px]">
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

      {/* Amounts - 3 columns */}
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground text-center block">Front 9</Label>
          <AmountInput label="" value={frontAmount} onChange={(v) => onUpdate({ frontAmount: v })} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground text-center block">Back 9</Label>
          <AmountInput label="" value={backAmount} onChange={(v) => onUpdate({ backAmount: v })} />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground text-center block">Total 18</Label>
          <AmountInput label="" value={totalAmount} onChange={(v) => onUpdate({ totalAmount: v })} />
        </div>
      </div>
    </div>
  );
};
