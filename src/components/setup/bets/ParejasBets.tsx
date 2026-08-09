import React, { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { disambiguateInitials } from '@/lib/playerInput';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { BetConfig, Player, CarritosTeamBet, TeamPressuresBet, markerInfo, MarkerState, TeamPressureUnitsConfig, TeamPressureOyesesConfig, WolfScoringMode, WolfTiming, SixesScoringMode, SixesCobro, VegasVariant, SixesSetAssignment, SixesBetInstance, VegasBetInstance, TeamHandicapMode, TeamHandicapConfig } from '@/types/golf';
import { getParejasActivePlayerIds } from './ParejasParticipationMatrix';
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
import { ParejasParticipationMatrix } from './ParejasParticipationMatrix';
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
  getStrokesForLocalPair?: (localIdA: string, localIdB: string) => number;
  getLocalPairStrokeState?: (localIdA: string, localIdB: string) => { strokes: number; hasExplicitOverride: boolean };
}

export const ParejasBets: React.FC<ParejasBetsProps> = ({
  config,
  players,
  expandedSections,
  onToggleSection,
  onUpdateBet,
  onUpdateConfig,
  getStrokesForLocalPair,
  getLocalPairStrokeState,
}) => {
  const { profile } = useAuth();
  const playerOptions = useMemo(
    () => players.map((p) => ({ value: p.id, label: p.name })),
    [players]
  );

  // Filtered player options per bet type (exclude players deselected in matrix)
  const foursomesOptions = useMemo(() => {
    const activeIds = getParejasActivePlayerIds(config, 'teamPressures', players);
    return playerOptions.filter(o => activeIds.includes(o.value));
  }, [config, players, playerOptions]);

  const carritosOptions = useMemo(() => {
    const activeIds = getParejasActivePlayerIds(config, 'carritos', players);
    return playerOptions.filter(o => activeIds.includes(o.value));
  }, [config, players, playerOptions]);

  const sixesOptions = useMemo(() => {
    const activeIds = getParejasActivePlayerIds(config, 'sixes', players);
    return playerOptions.filter(o => activeIds.includes(o.value));
  }, [config, players, playerOptions]);

  const vegasOptions = useMemo(() => {
    const activeIds = getParejasActivePlayerIds(config, 'vegas', players);
    return playerOptions.filter(o => activeIds.includes(o.value));
  }, [config, players, playerOptions]);

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
      carritos: {
        ...config.carritos,
        enabled: true,
      },
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

  // ===== Base pair (5 players) generators =====
  const generateFoursomesFromBase = (
    base: [string, string],
    others: string[],
    mode: 'replace' | 'add'
  ) => {
    const existing = config.teamPressures.bets;
    const template = existing[0];
    let generated = buildBasePairTeamPressures(base, others, template);
    const keptBets = mode === 'replace' ? [] : existing;
    if (mode === 'add') generated = dropExistingMatches(generated, existing);
    onUpdateConfig({
      ...config,
      basePairTeamPressures: base,
      teamPressures: {
        ...config.teamPressures,
        enabled: true,
        bets: [...keptBets, ...generated],
      },
    });
  };

  const generateCarritosFromBase = (
    base: [string, string],
    others: string[],
    mode: 'replace' | 'add'
  ) => {
    const existingTeams = config.carritosTeams || [];
    const primary = hasPrimaryCarritos
      ? [{ teamA: config.carritos.teamA, teamB: config.carritos.teamB }]
      : [];
    const template = existingTeams[0] ?? (hasPrimaryCarritos ? config.carritos : undefined);
    let generated = buildBasePairCarritosTeams(base, others, template as Partial<CarritosTeamBet>);
    if (mode === 'add') {
      generated = dropExistingMatches(generated, [...primary, ...existingTeams]);
    }
    onUpdateConfig({
      ...config,
      basePairCarritos: base,
      carritos: {
        ...config.carritos,
        enabled: true,
        ...(mode === 'replace'
          ? { teamA: ['', ''] as [string, string], teamB: ['', ''] as [string, string] }
          : {}),
      },
      carritosTeams: mode === 'replace' ? generated : [...existingTeams, ...generated],
    });
  };

  const carritosMatchCount =
    (config.carritosTeams || []).length + (hasPrimaryCarritos ? 1 : 0);



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

      {/* Parejas Participation Matrix */}
      <ParejasParticipationMatrix
        config={config}
        players={players}
        onUpdateConfig={onUpdateConfig}
        onUpdateBet={onUpdateBet}
      />

      {/* Team Pressures — only if enabled */}
      {config.teamPressures.enabled && (
      <BetSection
        id="teamPressures"
         title="Foursomes"
         description="Match play por equipos, apertura automática"
        enabled={config.teamPressures.enabled}
        onToggle={(enabled) => {
          onUpdateBet('teamPressures', { enabled });
          if (enabled) {
            if (config.teamPressures.bets.length === 0) addTeamPressure();
            onToggleSection('teamPressures', true);
          } else {
            onToggleSection('teamPressures', false);
          }
        }}
        isExpanded={expandedSections.includes('teamPressures')}
        onExpandChange={(open) => onToggleSection('teamPressures', open)}
        helpText="Match play por equipos de 2 vs 2. Se compara el score neto de cada equipo (según modalidad: Bola Baja, Bola Alta o Combinado). Se abre una nueva presión cuando un equipo va arriba por el umbral configurado."
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
                playerOptions={foursomesOptions}
                onUpdate={(updates) => updateTeamPressure(bet.id, updates)}
                onRemove={() => removeTeamPressure(bet.id)}
                bilateralHandicaps={config.bilateralHandicaps}
                getStrokesForLocalPair={getStrokesForLocalPair}
                getLocalPairStrokeState={getLocalPairStrokeState}
                isNineHole={(config.roundHoles ?? 18) === 9}
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
      )}

      {/* Carritos — only if enabled */}
      {config.carritos.enabled && (
      <BetSection
        id="carritos"
        title="Carritos (Medal Parejas)"
        description="Medal por equipos de 2"
        enabled={config.carritos.enabled}
        onToggle={(enabled) => {
          onUpdateBet('carritos', { enabled });
          if (enabled) {
            if ((config.carritosTeams || []).length === 0 && !hasPrimaryCarritos) addCarritosTeam();
            onToggleSection('carritos', true);
          } else {
            onToggleSection('carritos', false);
          }
        }}
        isExpanded={expandedSections.includes('carritos')}
        onExpandChange={(open) => onToggleSection('carritos', open)}
        helpText="Medal por equipos de 2 vs 2. Se suma el score neto del equipo según la modalidad (Bola Baja, Bola Alta o Combinado) y se compara Front 9, Back 9 y Total 18. El equipo con menor total gana cada segmento."
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
                handicapConfig={config.carritos.handicapConfig}
                players={players}
                playerOptions={carritosOptions}
                onUpdate={(updates) => onUpdateBet('carritos', updates)}
                bilateralHandicaps={config.bilateralHandicaps}
                getStrokesForLocalPair={getStrokesForLocalPair}
                getLocalPairStrokeState={getLocalPairStrokeState}
                isNineHole={(config.roundHoles ?? 18) === 9}
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
                handicapConfig={team.handicapConfig}
                players={players}
                playerOptions={carritosOptions}
                onUpdate={(updates) => updateCarritosTeam(team.id, updates)}
                onRemove={() => removeCarritosTeam(team.id)}
                bilateralHandicaps={config.bilateralHandicaps}
                getStrokesForLocalPair={getStrokesForLocalPair}
                getLocalPairStrokeState={getLocalPairStrokeState}
                isNineHole={(config.roundHoles ?? 18) === 9}
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
      )}

      {/* Sixes — only if enabled */}
      {(config.sixesEnabled ?? ((config.sixesBets?.length ?? 0) > 0)) && (
      <BetSection
        id="sixes" title="Sixes"
        description="3 sets de 6 hoyos con cambio de parejas"
        enabled={config.sixesEnabled ?? ((config.sixesBets?.length ?? 0) > 0)}
        onToggle={(enabled) => {
          if (enabled) {
            const hasBets = (config.sixesBets?.length ?? 0) > 0;
            if (hasBets) {
              onUpdateConfig({ ...config, sixesEnabled: true });
            } else {
              const primera: SixesBetInstance = {
                id: `sixes-${Date.now()}`, scoringMode: 'lowBall', cobro: 'per_hole',
                amount: 100, useHandicap: true, sets: [],
              };
              onUpdateConfig({ ...config, sixesBets: [primera], sixesEnabled: true });
            }
          } else {
            onUpdateConfig({ ...config, sixesEnabled: false });
          }
          onToggleSection('sixes', enabled);
        }}
        isExpanded={expandedSections.includes('sixes')}
        onExpandChange={(open) => onToggleSection('sixes', open)}
        helpText="Se juegan 3 sets de 6 hoyos con parejas distintas. Cada instancia es una apuesta independiente de 4 jugadores."
      >
        {(config.sixesBets?.length ?? 0) === 0 ? (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground mb-2">No hay apuestas de Sixes configuradas</p>
            <Button variant="outline" size="sm" onClick={() => {
              const nueva: SixesBetInstance = {
                id: `sixes-${Date.now()}`, scoringMode: 'lowBall', cobro: 'per_hole',
                amount: 100, useHandicap: true, sets: [],
              };
              onUpdateConfig({ ...config, sixesBets: [nueva] });
            }} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Agregar apuesta de Sixes
            </Button>
          </div>
        ) : (
          <>
            {config.sixesBets!.map((bet, idx) => (
              <SixesBetCard key={bet.id} index={idx} bet={bet} players={players} playerOptions={sixesOptions}
                bilateralHandicaps={config.bilateralHandicaps}
                getStrokesForLocalPair={getStrokesForLocalPair}
                getLocalPairStrokeState={getLocalPairStrokeState}
                onUpdate={(updates) => {
                  const next = config.sixesBets!.map(b => b.id === bet.id ? { ...b, ...updates } : b);
                  onUpdateConfig({ ...config, sixesBets: next });
                }}
                onRemove={() => onUpdateConfig({ ...config, sixesBets: config.sixesBets!.filter(b => b.id !== bet.id) })}
              />
            ))}
            <Button variant="outline" size="sm" className="w-full mt-3 gap-1" onClick={() => {
              const nueva: SixesBetInstance = {
                id: `sixes-${Date.now()}`, scoringMode: 'lowBall', cobro: 'per_hole',
                amount: 100, useHandicap: true, sets: [],
              };
              onUpdateConfig({ ...config, sixesBets: [...(config.sixesBets ?? []), nueva] });
            }}>
              <Plus className="h-3.5 w-3.5" /> Agregar otra apuesta de Sixes
            </Button>
          </>
        )}
      </BetSection>
      )}

      {/* Vegas — only if enabled */}
      {(config.vegasEnabled ?? ((config.vegasBets?.length ?? 0) > 0)) && (
      <BetSection
        id="vegas" title="Las Vegas"
        description="Combina scores en números de 2 dígitos"
        enabled={config.vegasEnabled ?? ((config.vegasBets?.length ?? 0) > 0)}
        onToggle={(enabled) => {
          if (enabled) {
            const hasBets = (config.vegasBets?.length ?? 0) > 0;
            if (hasBets) {
              onUpdateConfig({ ...config, vegasEnabled: true });
            } else {
              const primera: VegasBetInstance = {
                id: `vegas-${Date.now()}`, valuePerPoint: 10, useHandicap: false,
                birdieMultiplier: false, variant: 'fixed',
                playerAId: '', playerBId: '', playerCId: '', playerDId: '',
              };
              onUpdateConfig({ ...config, vegasBets: [primera], vegasEnabled: true });
            }
          } else {
            onUpdateConfig({ ...config, vegasEnabled: false });
          }
          onToggleSection('vegas', enabled);
        }}
        isExpanded={expandedSections.includes('vegas')}
        onExpandChange={(open) => onToggleSection('vegas', open)}
        helpText="Cada equipo forma un número de 2 dígitos con sus scores netos. La diferencia entre los números determina el pago. Múltiples instancias permiten diferentes configuraciones de parejas."
      >
        {(config.vegasBets?.length ?? 0) === 0 ? (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground mb-2">No hay apuestas de Vegas configuradas</p>
            <Button variant="outline" size="sm" onClick={() => {
              const nueva: VegasBetInstance = {
                id: `vegas-${Date.now()}`, valuePerPoint: 10, useHandicap: false,
                birdieMultiplier: false, variant: 'fixed',
                playerAId: '', playerBId: '', playerCId: '', playerDId: '',
              };
              onUpdateConfig({ ...config, vegasBets: [nueva] });
            }} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Agregar apuesta de Vegas
            </Button>
          </div>
        ) : (
          <>
            {config.vegasBets!.map((bet, idx) => (
              <VegasBetCard key={bet.id} index={idx} bet={bet} players={players} playerOptions={vegasOptions}
                bilateralHandicaps={config.bilateralHandicaps}
                getStrokesForLocalPair={getStrokesForLocalPair}
                getLocalPairStrokeState={getLocalPairStrokeState}
                onUpdate={(updates) => {
                  const next = config.vegasBets!.map(b => b.id === bet.id ? { ...b, ...updates } : b);
                  onUpdateConfig({ ...config, vegasBets: next });
                }}
                onRemove={() => onUpdateConfig({ ...config, vegasBets: config.vegasBets!.filter(b => b.id !== bet.id) })}
              />
            ))}
            <Button variant="outline" size="sm" className="w-full mt-3 gap-1" onClick={() => {
              const nueva: VegasBetInstance = {
                id: `vegas-${Date.now()}`, valuePerPoint: 10, useHandicap: false,
                birdieMultiplier: false, variant: 'fixed',
                playerAId: '', playerBId: '', playerCId: '', playerDId: '',
              };
              onUpdateConfig({ ...config, vegasBets: [...(config.vegasBets ?? []), nueva] });
            }}>
              <Plus className="h-3.5 w-3.5" /> Agregar otra apuesta de Vegas
            </Button>
          </>
        )}
      </BetSection>
      )}

      {/* Wolf — 4-6 players, only if enabled, LAST in order */}
      {players.length >= 4 && players.length <= 6 && (
        <BetSection
          id="wolf" title="🐺 Loba"
          description="Cada hoyo un jugador elige pareja o va solo"
          enabled={config.wolfSetup?.enabled ?? false}
          onToggle={(enabled) => {
            onUpdateBet('wolfSetup', { ...config.wolfSetup, enabled } as any);
            if (enabled) {
              onToggleSection('wolf', true);
            } else {
              onToggleSection('wolf', false);
            }
          }}
          isExpanded={expandedSections.includes('wolf')}
          onExpandChange={(open) => onToggleSection('wolf', open)}
          helpText="En cada hoyo un jugador (Loba) elige un compañero o va solo (×2). Los demás son rivales. El equipo con mejor score neto gana."
        >
          <AmountInput label="Monto por hoyo" value={config.wolfSetup?.amountPerHole ?? 10}
            onChange={(v) => onUpdateBet('wolfSetup', { ...config.wolfSetup, enabled: true, amountPerHole: v } as any)} />

          <div className="flex items-center justify-between mt-2">
            <Label className="text-[10px] font-semibold text-primary">Modalidad</Label>
            <Select value={config.wolfSetup?.scoringMode ?? 'lowBall'}
              onValueChange={(v) => onUpdateBet('wolfSetup', { ...config.wolfSetup, enabled: true, scoringMode: v as WolfScoringMode } as any)}>
              <SelectTrigger className="h-7 w-36 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lowBall">Bola Baja</SelectItem>
                <SelectItem value="lowHighBall">Bola Baja + Alta</SelectItem>
                <SelectItem value="stroke">Score Neto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <Switch checked={config.wolfSetup?.useHandicap ?? true}
              onCheckedChange={(v) => {
                onUpdateBet('wolfSetup', { ...config.wolfSetup, enabled: true, useHandicap: v } as any);
              }} />
            <Label className="text-xs">Jugar con hándicap</Label>
          </div>

          {/* Editable handicaps when useHandicap is on */}
          {(config.wolfSetup?.useHandicap ?? true) && (() => {
            const activeIds = getParejasActivePlayerIds(config, 'wolf', players);
            const currentHandicaps = config.wolfSetup?.playerHandicaps ?? [];
            const getHcp = (pid: string) => {
              const found = currentHandicaps.find(h => h.playerId === pid);
              return found ? found.handicap : (players.find(p => p.id === pid)?.handicap ?? 0);
            };
            const updateHcp = (pid: string, newHcp: number) => {
              const existing = [...currentHandicaps.filter(h => h.playerId !== pid), { playerId: pid, handicap: newHcp }];
              onUpdateBet('wolfSetup', { ...config.wolfSetup, enabled: true, playerHandicaps: existing } as any);
            };
            return (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-semibold text-primary">Hándicaps de Loba</Label>
                  <Select
                    value={(() => {
                      const hcps = activeIds.map(pid => getHcp(pid));
                      const fullHcps = activeIds.map(pid => players.find(p => p.id === pid)?.handicap ?? 0);
                      const isBaseCero = hcps.some(h => h === 0) && hcps.some((h, i) => h !== fullHcps[i]);
                      return isBaseCero ? 'baseCero' : 'individual';
                    })()}
                    onValueChange={(v) => {
                      if (v === 'baseCero') {
                        const fullHcps = activeIds.map(pid => players.find(p => p.id === pid)?.handicap ?? 0);
                        const hcps = activeIds.map(pid => getHcp(pid));
                        const minHcp = Math.min(...hcps);
                        const existing = activeIds.map(pid => ({ playerId: pid, handicap: Math.round(getHcp(pid) - minHcp) }));
                        onUpdateBet('wolfSetup', { ...config.wolfSetup, enabled: true, playerHandicaps: existing } as any);
                      } else {
                        const existing = activeIds.map(pid => ({ playerId: pid, handicap: players.find(p => p.id === pid)?.handicap ?? 0 }));
                        onUpdateBet('wolfSetup', { ...config.wolfSetup, enabled: true, playerHandicaps: existing } as any);
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 w-36 text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Full Hándicap</SelectItem>
                      <SelectItem value="baseCero">Base Cero</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="bg-muted/30 rounded-lg p-2 space-y-1">
                  {activeIds.map(pid => {
                    const p = players.find(pl => pl.id === pid);
                    if (!p) return null;
                    const hcp = getHcp(pid);
                    const isLoggedIn = !!(profile && p.profileId === profile.id);
                    const wolfPlayers = activeIds.map(id => players.find(pl => pl.id === id)).filter(Boolean) as Player[];
                    const disambiguatedMap = disambiguateInitials(wolfPlayers);
                    return (
                      <div key={pid} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <PlayerAvatar
                            initials={disambiguatedMap.get(pid) || p.initials}
                            background={p.color}
                            size="xs"
                            isLoggedInUser={isLoggedIn}
                          />
                          <span className="text-xs truncate">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-6 w-6 text-xs"
                            onClick={() => updateHcp(pid, Math.max(0, hcp - 1))}>−</Button>
                          <span className="text-xs font-mono w-6 text-center">{hcp}</span>
                          <Button variant="outline" size="icon" className="h-6 w-6 text-xs"
                            onClick={() => updateHcp(pid, hcp + 1)}>+</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="flex items-center justify-between mt-2">
            <Label className="text-[10px] font-semibold text-primary">Timing de decisión</Label>
            <Select value={config.wolfSetup?.timing ?? 'B'}
              onValueChange={(v) => onUpdateBet('wolfSetup', { ...config.wolfSetup, enabled: true, timing: v as WolfTiming } as any)}>
              <SelectTrigger className="h-7 w-44 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="A">Antes del driver</SelectItem>
                <SelectItem value="B">Al pegar el driver</SelectItem>
                <SelectItem value="C">Antes del 2° golpe</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <Switch checked={config.wolfSetup?.carryover ?? true}
              onCheckedChange={(v) => onUpdateBet('wolfSetup', { ...config.wolfSetup, enabled: true, carryover: v } as any)} />
            <Label className="text-xs">Carryover en empates</Label>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <Switch checked={config.wolfSetup?.hole18Redemption ?? false}
              onCheckedChange={(v) => onUpdateBet('wolfSetup', { ...config.wolfSetup, enabled: true, hole18Redemption: v } as any)} />
            <Label className="text-xs">Recuperación Hoyo 18 (máx. perdedor, solo, ×3)</Label>
          </div>

          {/* Shuffle order button */}
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-semibold text-primary">Orden de rotación</Label>
              <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => {
                const activeIds = getParejasActivePlayerIds(config, 'wolf', players);
                const shuffled = [...activeIds].sort(() => Math.random() - 0.5);
                onUpdateBet('wolfSetup', { ...config.wolfSetup, enabled: true, playerOrder: shuffled } as any);
              }}>
                🎲 Sortear orden
              </Button>
            </div>
            {(() => {
              const order = config.wolfSetup?.playerOrder;
              const activeIds = getParejasActivePlayerIds(config, 'wolf', players);
              const displayOrder = order && order.length > 0 && order.every((id: string) => activeIds.includes(id))
                ? order
                : activeIds;
              return (
                <div className="bg-muted/30 rounded-lg p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {(() => {
                      const wolfPlayers = displayOrder.map((id: string) => players.find(pl => pl.id === id)).filter(Boolean) as Player[];
                      const disambiguated = disambiguateInitials(wolfPlayers);
                      return displayOrder.map((id: string, i: number) => {
                        const p = players.find(pl => pl.id === id);
                        return (
                          <div key={id} className="flex items-center gap-1 text-[11px]">
                            <span className="text-muted-foreground font-semibold">{i + 1}.</span>
                            {p && <PlayerAvatar initials={disambiguated.get(id) || p.initials} background={p.color} size="xs" isLoggedInUser={!!(profile && p.profileId === profile.id)} />}
                            <span>{p?.name ?? '?'}</span>
                            {i < displayOrder.length - 1 && <span className="text-muted-foreground ml-1">·</span>}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              );
            })()}
          </div>
        </BetSection>
      )}
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
  bilateralHandicaps?: BilateralHandicap[];
  getStrokesForLocalPair?: (localIdA: string, localIdB: string) => number;
  getLocalPairStrokeState?: (localIdA: string, localIdB: string) => { strokes: number; hasExplicitOverride: boolean };
  isNineHole?: boolean;
}

const TeamPressureCard: React.FC<TeamPressureCardProps> = ({
  bet,
  index,
  players,
  playerOptions,
  onUpdate,
  onRemove,
  bilateralHandicaps,
  getStrokesForLocalPair,
  getLocalPairStrokeState,
  isNineHole,
}) => {
  return (
    <div className={cn(
      'space-y-3 p-3 rounded-lg',
      index > 0 ? 'border-t border-border mt-4 pt-4' : 'bg-muted/30'
    )}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">Foursome {index + 1}</Label>
        <div className="flex items-center gap-1">
          {(() => {
            const allIds = [...bet.teamA, ...bet.teamB].filter(Boolean);
            if (allIds.length < 2) return null;
            return null; // HandicapModeSelector rendered below
          })()}
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

      {/* Handicap Mode Selector */}
      {(() => {
        const allIds = [...bet.teamA, ...bet.teamB].filter(Boolean);
        if (allIds.length < 4) return null;
        return (
          <HandicapModeSelector
            allIds={allIds}
            players={players}
            teamHandicaps={bet.teamHandicaps}
            handicapConfig={bet.handicapConfig}
            onUpdateHandicaps={(hcps) => onUpdate({ teamHandicaps: hcps })}
            onUpdateHandicapConfig={(cfg) => onUpdate({ handicapConfig: cfg })}
            onUpdateBoth={(hcps, cfg) => onUpdate({ teamHandicaps: hcps, handicapConfig: cfg })}
            teamA={bet.teamA as [string, string]}
            teamB={bet.teamB as [string, string]}
            bilateralHandicaps={bilateralHandicaps}
            getStrokesForLocalPair={getStrokesForLocalPair}
            getLocalPairStrokeState={getLocalPairStrokeState}
          />
        );
      })()}

      {/* Scoring type */}
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-semibold text-primary">Modalidad</Label>
        <Select
          value={bet.scoringType}
          onValueChange={(v: 'lowBall' | 'highBall' | 'combined' | 'matchOnly') => onUpdate({ scoringType: v })}
        >
          <SelectTrigger className="h-7 w-32 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lowBall">Bola Baja</SelectItem>
            <SelectItem value="highBall">Bola Alta</SelectItem>
            <SelectItem value="combined">Combinado</SelectItem>
            <SelectItem value="matchOnly">Sin presiones</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Amounts - conditional on continua */}
      {bet.scoringType === 'matchOnly' && (
        <div className="flex items-center justify-between pt-1">
          <Label className="text-xs text-muted-foreground">Match Play por 18 hoyos</Label>
          <Switch checked={bet.continua ?? false} onCheckedChange={(v) => onUpdate({ continua: v })} />
        </div>
      )}
      {bet.scoringType === 'matchOnly' && bet.continua ? (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground text-center block">Match 18 (único)</Label>
          <AmountInput label="" value={bet.totalAmount} onChange={(v) => onUpdate({ totalAmount: v })} />
        </div>
      ) : isNineHole ? (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground text-center block">Front 9</Label>
          <AmountInput label="" value={bet.frontAmount} onChange={(v) => onUpdate({ frontAmount: v })} />
        </div>
      ) : (
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
      )}

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

              {/* Generic Unit (incremental ⭐) */}
              <div className="space-y-1 pt-2 border-t border-border/30">
                <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                  <Checkbox
                    checked={bet.unitsConfig?.includeGenericUnit ?? false}
                    onCheckedChange={(checked) => onUpdate({
                      unitsConfig: { ...bet.unitsConfig!, includeGenericUnit: !!checked },
                    })}
                    className="h-3.5 w-3.5"
                  />
                  <span>⭐ Incluir Unidad genérica (incremental)</span>
                </label>
                {bet.unitsConfig?.includeGenericUnit && (
                  <div className="flex items-center justify-between pl-5">
                    <Label className="text-[10px] text-muted-foreground">Valor por Unidad genérica</Label>
                    <AmountInput
                      label=""
                      value={bet.unitsConfig?.valuePerGenericUnit ?? bet.unitsConfig!.valuePerUnit}
                      onChange={(v) => onUpdate({
                        unitsConfig: { ...bet.unitsConfig!, valuePerGenericUnit: v },
                      })}
                    />
                  </div>
                )}
              </div>


              {/* Ventaja de Unidades (foursome) */}
              <div className="space-y-1.5 pt-2 border-t border-border/30">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">Ventaja de Unidades</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={bet.unitsConfig?.unitsAdvantageTeam ?? 'none'}
                    onValueChange={(v) => onUpdate({
                      unitsConfig: {
                        ...bet.unitsConfig!,
                        unitsAdvantageTeam: v as 'a' | 'b' | 'none',
                        unitsAdvantage: v === 'none' ? 0 : (bet.unitsConfig?.unitsAdvantage ?? 1),
                      },
                    })}
                  >
                    <SelectTrigger className="h-7 text-[11px] flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sin ventaja —</SelectItem>
                      <SelectItem value="a">Equipo A da ventaja</SelectItem>
                      <SelectItem value="b">Equipo B da ventaja</SelectItem>
                    </SelectContent>
                  </Select>
                  {(bet.unitsConfig?.unitsAdvantageTeam === 'a' || bet.unitsConfig?.unitsAdvantageTeam === 'b') && (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onUpdate({
                          unitsConfig: {
                            ...bet.unitsConfig!,
                            unitsAdvantage: Math.max(1, (bet.unitsConfig?.unitsAdvantage ?? 1) - 1),
                          },
                        })}
                      >
                        −
                      </Button>
                      <span className="min-w-[32px] text-center text-sm font-bold tabular-nums">
                        {bet.unitsConfig?.unitsAdvantage ?? 1}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onUpdate({
                          unitsConfig: {
                            ...bet.unitsConfig!,
                            unitsAdvantage: (bet.unitsConfig?.unitsAdvantage ?? 1) + 1,
                          },
                        })}
                      >
                        +
                      </Button>
                    </div>
                  )}
                </div>
                {(bet.unitsConfig?.unitsAdvantageTeam === 'a' || bet.unitsConfig?.unitsAdvantageTeam === 'b') && (
                  <p className="text-[10px] text-muted-foreground">
                    Equipo {bet.unitsConfig.unitsAdvantageTeam === 'a' ? 'A' : 'B'} empieza con
                    {' '}-{bet.unitsConfig.unitsAdvantage ?? 1} unidades en este foursome.
                  </p>
                )}
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
        {bet.scoringType === 'matchOnly' && bet.continua
          ? '💡 Solo Match Continuo: corre del 1 al 18, se define cuando la ventaja supera los hoyos restantes'
          : bet.scoringType === 'matchOnly'
          ? '💡 Solo Match: sin apertura de presiones'
          : bet.scoringType === 'combined'
          ? '💡 Combinado: abre presión cuando diferencia > 2'
          : `💡 ${bet.scoringType === 'lowBall' ? 'Bola Baja' : 'Bola Alta'}: abre presión cuando diferencia = 2`}
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
  handicapConfig?: TeamHandicapConfig;
  players: Player[];
  playerOptions: { value: string; label: string }[];
  onUpdate: (updates: Partial<CarritosTeamBet>) => void;
  onRemove?: () => void;
  bilateralHandicaps?: BilateralHandicap[];
  getStrokesForLocalPair?: (localIdA: string, localIdB: string) => number;
  getLocalPairStrokeState?: (localIdA: string, localIdB: string) => { strokes: number; hasExplicitOverride: boolean };
  isNineHole?: boolean;
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
  handicapConfig,
  players,
  playerOptions,
  onUpdate,
  onRemove,
  bilateralHandicaps,
  getStrokesForLocalPair,
  getLocalPairStrokeState,
  isNineHole,
}) => {
  return (
    <div className="space-y-3 p-3 rounded-lg bg-muted/30 mb-3" onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        <div className="flex items-center gap-1">
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

      {/* Handicap Mode Selector */}
      {(() => {
        const allIds = [...teamA, ...teamB].filter(Boolean);
        if (allIds.length < 4) return null;
        return (
          <HandicapModeSelector
            allIds={allIds}
            players={players}
            teamHandicaps={teamHandicaps}
            handicapConfig={handicapConfig}
            onUpdateHandicaps={(hcps) => onUpdate({ teamHandicaps: hcps })}
            onUpdateHandicapConfig={(cfg) => onUpdate({ handicapConfig: cfg })}
            onUpdateBoth={(hcps, cfg) => onUpdate({ teamHandicaps: hcps, handicapConfig: cfg })}
            teamA={teamA}
            teamB={teamB}
            bilateralHandicaps={bilateralHandicaps}
            getStrokesForLocalPair={getStrokesForLocalPair}
            getLocalPairStrokeState={getLocalPairStrokeState}
          />
        );
      })()}

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
      {isNineHole ? (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground text-center block">Front 9</Label>
          <AmountInput label="" value={frontAmount} onChange={(v) => onUpdate({ frontAmount: v })} />
        </div>
      ) : (
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
      )}
    </div>
  );
};

/* ─── Shared Handicap Mode Selector ─── */
// Import the team differential and sliding functions
import { BilateralHandicap } from '@/types/golf';
import { calcTeamDifferential as calcTeamDifferentialFn, calcSlidingTeamDifferential as calcSlidingTeamDifferentialFn } from '@/lib/handicapUtils';

const HANDICAP_MODE_LABELS: Record<string, string> = {
  individual: 'Full Hándicap',
  baseCero: 'Base Cero',
  diferencialEquipo: 'Diferencial Equipo',
  slidingEquipo: 'Sliding Equipo',
};

const HandicapModeSelector: React.FC<{
  allIds: string[];
  players: Player[];
  teamHandicaps: Record<string, number>;
  handicapConfig?: TeamHandicapConfig;
  onUpdateHandicaps: (hcps: Record<string, number>) => void;
  onUpdateHandicapConfig: (cfg: TeamHandicapConfig) => void;
  onUpdateBoth?: (hcps: Record<string, number>, cfg: TeamHandicapConfig) => void;
  teamA?: [string, string];
  teamB?: [string, string];
  bilateralHandicaps?: BilateralHandicap[];
  getStrokesForLocalPair?: (localIdA: string, localIdB: string) => number;
  getLocalPairStrokeState?: (localIdA: string, localIdB: string) => { strokes: number; hasExplicitOverride: boolean };
}> = ({ allIds, players, teamHandicaps, handicapConfig, onUpdateHandicaps, onUpdateHandicapConfig, onUpdateBoth, teamA, teamB, bilateralHandicaps, getStrokesForLocalPair, getLocalPairStrokeState }) => {
  const mode = handicapConfig?.mode ?? 'individual';

  // Helper: get strokes A gives to B. Uses matrix values (getStrokesForLocalPair) first,
  // then bilateralHandicaps, then falls back to handicap differences.
  const getBilateralStrokes = (aId: string, bId: string): number => {
    // Priority 1: Matrix strokes (source of truth for sliding)
    if (getStrokesForLocalPair) {
      const pairState = getLocalPairStrokeState?.(aId, bId);
      if (pairState?.hasExplicitOverride) return pairState.strokes;

      const persisted = getStrokesForLocalPair(aId, bId);
      // Consistent with HandicapMatrix display: when persisted is 0, fall back to handicap differential
      // so the calculation matches what the user sees in the matrix
      if (persisted !== 0) return persisted;
      const hcpA = players.find(p => p.id === aId)?.handicap ?? 0;
      const hcpB = players.find(p => p.id === bId)?.handicap ?? 0;
      return Math.round(hcpB - hcpA);
    }
    // Priority 2: bilateralHandicaps from config
    if (bilateralHandicaps && bilateralHandicaps.length > 0) {
      const pair = bilateralHandicaps.find(
        bh => (bh.playerAId === aId && bh.playerBId === bId) || (bh.playerAId === bId && bh.playerBId === aId)
      );
      if (pair) {
        if (pair.playerAId === aId) {
          return pair.playerBHandicap - pair.playerAHandicap;
        }
        return pair.playerAHandicap - pair.playerBHandicap;
      }
    }
    // Fallback: handicap differences
    const hcpA = players.find(p => p.id === aId)?.handicap ?? 0;
    const hcpB = players.find(p => p.id === bId)?.handicap ?? 0;
    return hcpB - hcpA;
  };

  // Single atomic update to avoid race conditions between handicapConfig and teamHandicaps
  const updateBoth = (newHcps: Record<string, number>, newCfg: TeamHandicapConfig) => {
    if (onUpdateBoth) {
      onUpdateBoth(newHcps, newCfg);
    } else {
      // Fallback: update config first, then handicaps (may still race)
      onUpdateHandicapConfig(newCfg);
      onUpdateHandicaps(newHcps);
    }
  };

  const applyMode = (newMode: TeamHandicapMode) => {
    const newConfig: TeamHandicapConfig = { ...handicapConfig, mode: newMode };

    if (newMode === 'individual') {
      const newHcps: Record<string, number> = {};
      allIds.forEach(id => { newHcps[id] = players.find(p => p.id === id)?.handicap ?? 0; });
      updateBoth(newHcps, newConfig);
    } else if (newMode === 'baseCero') {
      const hcps = allIds.map(id => players.find(p => p.id === id)?.handicap ?? 0);
      const minHcp = Math.min(...hcps);
      const newHcps: Record<string, number> = {};
      allIds.forEach(id => {
        const h = players.find(p => p.id === id)?.handicap ?? 0;
        newHcps[id] = Math.round(h - minHcp);
      });
      updateBoth(newHcps, newConfig);
    } else if (newMode === 'diferencialEquipo' && teamA && teamB) {
      const hcpMap: Record<string, number> = {};
      allIds.forEach(id => { hcpMap[id] = players.find(p => p.id === id)?.handicap ?? 0; });
      const { teamHandicaps: result } = calcTeamDifferentialFn(teamA, teamB, hcpMap, handicapConfig?.diferencialRecipientOverride);
      updateBoth(result, newConfig);
    } else if (newMode === 'slidingEquipo' && teamA && teamB) {
      const hcpMap: Record<string, number> = {};
      allIds.forEach(id => { hcpMap[id] = players.find(p => p.id === id)?.handicap ?? 0; });
      const slidings = {
        ac: getBilateralStrokes(teamA[0], teamB[0]),
        ad: getBilateralStrokes(teamA[0], teamB[1]),
        bc: getBilateralStrokes(teamA[1], teamB[0]),
        bd: getBilateralStrokes(teamA[1], teamB[1]),
      };
      const result = calcSlidingTeamDifferentialFn(slidings, teamA, teamB, hcpMap, handicapConfig?.slidingHalfPointMode ?? 'halfPoint');
      const finalConfig = result.hasHalf
        ? { ...newConfig, slidingHalfPointMode: handicapConfig?.slidingHalfPointMode ?? 'halfPoint' as const }
        : newConfig;
      updateBoth(result.teamHandicaps, finalConfig);
    } else {
      // No handicap changes, just update config
      onUpdateHandicapConfig(newConfig);
    }
  };

  // Detect half-point for sliding equipo
  const slidingHasHalf = React.useMemo(() => {
    if (mode !== 'slidingEquipo' || !teamA || !teamB) return false;
    const hcpMap: Record<string, number> = {};
    allIds.forEach(id => { hcpMap[id] = players.find(p => p.id === id)?.handicap ?? 0; });
    const slidings = {
      ac: getBilateralStrokes(teamA[0], teamB[0]),
      ad: getBilateralStrokes(teamA[0], teamB[1]),
      bc: getBilateralStrokes(teamA[1], teamB[0]),
      bd: getBilateralStrokes(teamA[1], teamB[1]),
    };
    const result = calcSlidingTeamDifferentialFn(slidings, teamA, teamB, hcpMap, 'halfPoint');
    return result.hasHalf;
  }, [mode, teamA, teamB, allIds, players, getBilateralStrokes]);

  const currentHalfMode = handicapConfig?.slidingHalfPointMode ?? 'roundDown';

  const toggleHalfPoint = (checked: boolean) => {
    const newHalfMode = checked ? 'halfPoint' : 'roundDown';
    if (!teamA || !teamB) return;
    const hcpMap: Record<string, number> = {};
    allIds.forEach(id => { hcpMap[id] = players.find(p => p.id === id)?.handicap ?? 0; });
    const slidings = {
      ac: getBilateralStrokes(teamA[0], teamB[0]),
      ad: getBilateralStrokes(teamA[0], teamB[1]),
      bc: getBilateralStrokes(teamA[1], teamB[0]),
      bd: getBilateralStrokes(teamA[1], teamB[1]),
    };
    const result = calcSlidingTeamDifferentialFn(slidings, teamA, teamB, hcpMap, newHalfMode as 'halfPoint' | 'roundDown');
    const newConfig: TeamHandicapConfig = { ...handicapConfig, mode: 'slidingEquipo', slidingHalfPointMode: newHalfMode as 'halfPoint' | 'roundDown' };
    updateBoth(result.teamHandicaps, newConfig);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-semibold text-primary">Modalidad HCP</Label>
        <Select value={mode} onValueChange={(v) => applyMode(v as TeamHandicapMode)}>
          <SelectTrigger className="h-7 w-44 text-[11px]">
            <SelectValue placeholder="Seleccionar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="individual">Full Hándicap</SelectItem>
            <SelectItem value="baseCero">Base Cero</SelectItem>
            <SelectItem value="diferencialEquipo">Diferencial Equipo</SelectItem>
            <SelectItem value="slidingEquipo">Sliding Equipo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {mode === 'slidingEquipo' && slidingHasHalf && (
        <div className="flex items-center justify-between bg-muted/40 rounded-md px-2 py-1.5">
          <Label className="text-[10px] text-muted-foreground">Jugar medio punto</Label>
          <Switch
            checked={currentHalfMode === 'halfPoint'}
            onCheckedChange={toggleHalfPoint}
            className="scale-75"
          />
        </div>
      )}
    </div>
  );
};

/* ─── Sixes Bet Card ─── */
const SixesBetCard: React.FC<{
  index: number;
  bet: SixesBetInstance;
  players: Player[];
  playerOptions: { value: string; label: string }[];
  onUpdate: (updates: Partial<SixesBetInstance>) => void;
  onRemove: () => void;
  bilateralHandicaps?: BilateralHandicap[];
  getStrokesForLocalPair?: (localIdA: string, localIdB: string) => number;
  getLocalPairStrokeState?: (localIdA: string, localIdB: string) => { strokes: number; hasExplicitOverride: boolean };
}> = ({ index, bet, players, playerOptions, onUpdate, onRemove, bilateralHandicaps, getStrokesForLocalPair, getLocalPairStrokeState }) => {
  const set1 = (bet.sets ?? []).find(s => s.setNumber === 1);
  const allPlayerIds = set1 ? [...set1.team1, ...set1.team2].filter(Boolean) : [];
  const th = bet.teamHandicaps ?? {};

  return (
  <div className={cn('space-y-3 p-3 rounded-lg', index > 0 ? 'border-t border-border mt-4 pt-4' : 'bg-muted/30')}>
    <div className="flex items-center justify-between">
      <Label className="text-xs font-medium">Sixes {index + 1}</Label>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar Sixes {index + 1}?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción eliminará permanentemente esta apuesta. No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

    <div className="flex items-center justify-between">
      <Label className="text-[10px] font-semibold text-primary">Modalidad</Label>
      <Select value={bet.scoringMode} onValueChange={(v) => onUpdate({ scoringMode: v as SixesScoringMode })}>
        <SelectTrigger className="h-7 w-36 text-[11px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="lowBall">Bola Baja</SelectItem>
          <SelectItem value="lowHighBall">Bola Baja + Alta</SelectItem>
          <SelectItem value="stroke">Score Neto</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div className="flex items-center justify-between">
      <Label className="text-[10px] font-semibold text-primary">Cobro</Label>
      <Select value={bet.cobro} onValueChange={(v) => onUpdate({ cobro: v as SixesCobro })}>
        <SelectTrigger className="h-7 w-36 text-[11px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="per_hole">Por hoyo ganado</SelectItem>
          <SelectItem value="per_set">Por set ganado</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div className="flex items-center gap-2">
      <Switch checked={bet.useHandicap} onCheckedChange={(v) => onUpdate({ useHandicap: v })} />
      <Label className="text-xs">Jugar con hándicap</Label>
    </div>

    {/* Handicap Mode Selector — only when useHandicap is on and we have 4 players */}
    {bet.useHandicap && allPlayerIds.length === 4 && (
      <HandicapModeSelector
        allIds={allPlayerIds}
        players={players}
        teamHandicaps={th}
        handicapConfig={bet.handicapConfig}
        onUpdateHandicaps={(hcps) => onUpdate({ teamHandicaps: hcps })}
        onUpdateHandicapConfig={(cfg) => onUpdate({ handicapConfig: cfg })}
        onUpdateBoth={(hcps, cfg) => onUpdate({ teamHandicaps: hcps, handicapConfig: cfg })}
        teamA={set1?.team1}
        teamB={set1?.team2}
        bilateralHandicaps={bilateralHandicaps}
        getStrokesForLocalPair={getStrokesForLocalPair}
        getLocalPairStrokeState={getLocalPairStrokeState}
      />
    )}

    <AmountInput label="Monto" value={bet.amount} onChange={(v) => onUpdate({ amount: v })} />

    <div className="flex items-center gap-2">
      <Switch
        checked={bet.usePerSetAmounts ?? false}
        onCheckedChange={(v) => onUpdate({ usePerSetAmounts: v })}
      />
      <Label className="text-xs">Monto diferente por set</Label>
    </div>

    {bet.usePerSetAmounts && (
      <div className="space-y-2 p-2 bg-muted/30 rounded-lg">
        <AmountInput
          label="Set 1 · H1–6"
          value={bet.set1Amount ?? bet.amount}
          onChange={(v) => onUpdate({ set1Amount: v })}
        />
        <AmountInput
          label="Set 2 · H7–12"
          value={bet.set2Amount ?? bet.amount}
          onChange={(v) => onUpdate({ set2Amount: v })}
        />
        <AmountInput
          label="Set 3 · H13–18"
          value={bet.set3Amount ?? bet.amount}
          onChange={(v) => onUpdate({ set3Amount: v })}
        />
      </div>
    )}

    <div className="space-y-3">
      {(() => {
        // Check if sets 2&3 are auto-generated from set 1
        const set1Complete = set1 && set1.team1[0] && set1.team1[1] && set1.team2[0] && set1.team2[1];
        const gn = (id: string) => players.find(p => p.id === id)?.name?.split(' ')[0] ?? '?';

        return (
          <>
            {/* Set 1 - always editable */}
            <div className="space-y-2 p-2 rounded-lg bg-muted/30">
              <Label className="text-[10px] font-semibold text-primary">Set 1 · H1–6</Label>
              <TeamColumns teamA={set1?.team1 ?? ['', '']} teamB={set1?.team2 ?? ['', '']}
                teamHandicaps={bet.useHandicap ? th : {}}
                players={players} playerOptions={playerOptions}
                onUpdateTeamA={(t) => {
                  const currentSets = bet.sets ?? [];
                  const newSets: SixesSetAssignment[] = ([1, 2, 3] as const).map(n => {
                    if (n === 1) return { setNumber: n, team1: t, team2: set1?.team2 ?? ['', ''] as [string,string] };
                    return currentSets.find(s => s.setNumber === n) ?? { setNumber: n, team1: ['', ''] as [string,string], team2: ['', ''] as [string,string] };
                  });
                  // Auto-rotate when Set 1 is fully assigned
                  if (t[0] && t[1] && (set1?.team2?.[0]) && (set1?.team2?.[1])) {
                    const [a, b] = t;
                    const [c, d] = set1!.team2;
                    newSets[1] = { setNumber: 2, team1: [a, c], team2: [b, d] };
                    newSets[2] = { setNumber: 3, team1: [a, d], team2: [b, c] };
                  }
                  onUpdate({ sets: newSets });
                }}
                onUpdateTeamB={(t) => {
                  const currentSets = bet.sets ?? [];
                  const newSets: SixesSetAssignment[] = ([1, 2, 3] as const).map(n => {
                    if (n === 1) return { setNumber: n, team1: set1?.team1 ?? ['', ''] as [string,string], team2: t };
                    return currentSets.find(s => s.setNumber === n) ?? { setNumber: n, team1: ['', ''] as [string,string], team2: ['', ''] as [string,string] };
                  });
                  // Auto-rotate when Set 1 is fully assigned
                  if ((set1?.team1?.[0]) && (set1?.team1?.[1]) && t[0] && t[1]) {
                    const [a, b] = set1!.team1;
                    const [c, d] = t;
                    newSets[1] = { setNumber: 2, team1: [a, c], team2: [b, d] };
                    newSets[2] = { setNumber: 3, team1: [a, d], team2: [b, c] };
                  }
                  onUpdate({ sets: newSets });
                }}
                onUpdateHandicaps={(hcps) => onUpdate({ teamHandicaps: hcps })} />
            </div>

            {/* All 3 sets - read-only preview when auto-generated */}
            {set1Complete && (
              <div className="bg-muted/40 rounded-lg p-2 space-y-1">
                <Label className="text-[9px] font-semibold text-muted-foreground">Rotación automática</Label>
                <div className="grid grid-cols-3 gap-1 text-[9px] text-center">
                  {([1, 2, 3] as const).map(setNum => {
                    const assignment = (bet.sets ?? []).find(s => s.setNumber === setNum);
                    const ranges: Record<number, string> = { 1: 'H1–6', 2: 'H7–12', 3: 'H13–18' };
                    return (
                      <div key={setNum} className="bg-background rounded p-1.5">
                        <div className="font-semibold text-primary">{ranges[setNum]}</div>
                        <div>{gn(assignment?.team1[0] ?? '')}+{gn(assignment?.team1[1] ?? '')}</div>
                        <div className="text-muted-foreground">vs</div>
                        <div>{gn(assignment?.team2[0] ?? '')}+{gn(assignment?.team2[1] ?? '')}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        );
      })()}
    </div>
  </div>
  );
};

/* ─── Vegas Bet Card ─── */
const VegasBetCard: React.FC<{
  index: number;
  bet: VegasBetInstance;
  players: Player[];
  playerOptions: { value: string; label: string }[];
  onUpdate: (updates: Partial<VegasBetInstance>) => void;
  onRemove: () => void;
  bilateralHandicaps?: BilateralHandicap[];
  getStrokesForLocalPair?: (localIdA: string, localIdB: string) => number;
  getLocalPairStrokeState?: (localIdA: string, localIdB: string) => { strokes: number; hasExplicitOverride: boolean };
}> = ({ index, bet, players, playerOptions, onUpdate, onRemove, bilateralHandicaps, getStrokesForLocalPair, getLocalPairStrokeState }) => (
  <div className={cn('space-y-3 p-3 rounded-lg', index > 0 ? 'border-t border-border mt-4 pt-4' : 'bg-muted/30')}>
    <div className="flex items-center justify-between">
      <Label className="text-xs font-medium">Vegas {index + 1}</Label>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar Vegas {index + 1}?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción eliminará permanentemente esta apuesta. No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

    {/* Modalidad FIRST */}
    <div className="flex items-center justify-between">
      <Label className="text-[10px] font-semibold text-primary">Modalidad</Label>
      <Select value={bet.variant} onValueChange={(v) => onUpdate({ variant: v as VegasVariant })}>
        <SelectTrigger className="h-7 w-44 text-[11px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="fixed">Fija — una pareja toda la ronda</SelectItem>
          <SelectItem value="rotating">Rotatoria — 3 sets</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <AmountInput label="Valor por punto" value={bet.valuePerPoint} onChange={(v) => onUpdate({ valuePerPoint: v })} />

    <div className="flex items-center gap-2">
      <Switch
        checked={bet.useSegmentAmounts ?? false}
        onCheckedChange={(v) => onUpdate({ useSegmentAmounts: v })}
      />
      <Label className="text-xs">
        {bet.variant === 'fixed' ? 'Monto diferente Front/Back' : 'Monto diferente por set'}
      </Label>
    </div>

    {bet.useSegmentAmounts && bet.variant === 'fixed' && (
      <div className="space-y-2 p-2 bg-muted/30 rounded-lg">
        <AmountInput
          label="Front 9 · H1–9"
          value={bet.frontAmount ?? bet.valuePerPoint}
          onChange={(v) => onUpdate({ frontAmount: v })}
        />
        <AmountInput
          label="Back 9 · H10–18"
          value={bet.backAmount ?? bet.valuePerPoint}
          onChange={(v) => onUpdate({ backAmount: v })}
        />
      </div>
    )}

    {bet.useSegmentAmounts && bet.variant === 'rotating' && (
      <div className="space-y-2 p-2 bg-muted/30 rounded-lg">
        <AmountInput
          label="Set 1 · H1–6"
          value={bet.set1Amount ?? bet.valuePerPoint}
          onChange={(v) => onUpdate({ set1Amount: v })}
        />
        <AmountInput
          label="Set 2 · H7–12"
          value={bet.set2Amount ?? bet.valuePerPoint}
          onChange={(v) => onUpdate({ set2Amount: v })}
        />
        <AmountInput
          label="Set 3 · H13–18"
          value={bet.set3Amount ?? bet.valuePerPoint}
          onChange={(v) => onUpdate({ set3Amount: v })}
        />
      </div>
    )}

    <div className="flex items-center gap-2">
      <Switch checked={bet.useHandicap} onCheckedChange={(v) => onUpdate({ useHandicap: v })} />
      <Label className="text-xs">Jugar con hándicap</Label>
    </div>

    <div className="flex items-center gap-2">
      <Switch checked={bet.birdieMultiplier} onCheckedChange={(v) => onUpdate({ birdieMultiplier: v })} />
      <Label className="text-xs">Multiplicador Birdie (×2)</Label>
    </div>

    {/* Handicap Mode Selector — only when useHandicap is on and we have 4 players */}
    {bet.useHandicap && bet.playerAId && bet.playerBId && bet.playerCId && bet.playerDId && (
      <HandicapModeSelector
        allIds={[bet.playerAId, bet.playerBId, bet.playerCId, bet.playerDId]}
        players={players}
        teamHandicaps={bet.teamHandicaps ?? {}}
        handicapConfig={bet.handicapConfig}
        onUpdateHandicaps={(hcps) => onUpdate({ teamHandicaps: hcps })}
        onUpdateHandicapConfig={(cfg) => onUpdate({ handicapConfig: cfg })}
        onUpdateBoth={(hcps, cfg) => onUpdate({ teamHandicaps: hcps, handicapConfig: cfg })}
        teamA={[bet.playerAId, bet.playerBId]}
        teamB={[bet.playerCId, bet.playerDId]}
        bilateralHandicaps={bilateralHandicaps}
        getStrokesForLocalPair={getStrokesForLocalPair}
        getLocalPairStrokeState={getLocalPairStrokeState}
      />
    )}

    <div className="space-y-2">
      <Label className="text-[10px] font-semibold text-primary">Jugadores</Label>
      <TeamColumns
        teamA={[bet.playerAId, bet.playerBId]}
        teamB={[bet.playerCId, bet.playerDId]}
        teamHandicaps={bet.useHandicap ? (bet.teamHandicaps ?? {}) : {}}
        players={players}
        playerOptions={playerOptions}
        onUpdateTeamA={([a, b]) => onUpdate({ playerAId: a, playerBId: b })}
        onUpdateTeamB={([c, d]) => onUpdate({ playerCId: c, playerDId: d })}
        onUpdateHandicaps={(hcps) => onUpdate({ teamHandicaps: hcps })}
      />
      <p className="text-[9px] text-muted-foreground">Equipo 1: A+B · Equipo 2: C+D</p>
    </div>

    {/* Auto-rotation preview for rotating variant */}
    {bet.variant === 'rotating' && bet.playerAId && bet.playerBId && bet.playerCId && bet.playerDId && (() => {
      const gn = (id: string) => players.find(p => p.id === id)?.name?.split(' ')[0] ?? '?';
      const A = gn(bet.playerAId), B = gn(bet.playerBId), C = gn(bet.playerCId), D = gn(bet.playerDId);
      return (
        <div className="bg-muted/40 rounded-lg p-2 space-y-1 mt-1">
          <Label className="text-[9px] font-semibold text-muted-foreground">Rotación automática</Label>
          <div className="grid grid-cols-3 gap-1 text-[9px] text-center">
            <div className="bg-background rounded p-1">
              <div className="font-semibold text-primary">H1–6</div>
              <div>{A}+{B}</div>
              <div className="text-muted-foreground">vs</div>
              <div>{C}+{D}</div>
            </div>
            <div className="bg-background rounded p-1">
              <div className="font-semibold text-primary">H7–12</div>
              <div>{A}+{C}</div>
              <div className="text-muted-foreground">vs</div>
              <div>{B}+{D}</div>
            </div>
            <div className="bg-background rounded p-1">
              <div className="font-semibold text-primary">H13–18</div>
              <div>{A}+{D}</div>
              <div className="text-muted-foreground">vs</div>
              <div>{B}+{C}</div>
            </div>
          </div>
        </div>
      );
    })()}
  </div>
);
