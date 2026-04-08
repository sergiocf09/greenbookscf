import React, { useMemo } from 'react';
import { BetConfig, Player, SixesBetInstance, VegasBetInstance, NinesBetInstance } from '@/types/golf';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { disambiguateInitials } from '@/lib/playerInput';

interface ParejasParticipationMatrixProps {
  config: BetConfig;
  players: Player[];
  onUpdateConfig: (config: BetConfig) => void;
  onUpdateBet: <K extends keyof BetConfig>(betType: K, updates: Partial<BetConfig[K]>) => void;
}

const PAREJAS_BETS = [
  { key: 'teamPressures' as const, label: 'Foursomes' },
  { key: 'carritos' as const, label: 'Carritos' },
  { key: 'sixes' as const, label: 'Sixes' },
  { key: 'vegas' as const, label: 'Vegas' },
  { key: 'wolf' as const, label: '🐺 Loba' },
] as const;

type ParejasBetKey = typeof PAREJAS_BETS[number]['key'];

/** Get whether a parejas bet is enabled */
const isBetEnabled = (config: BetConfig, betKey: ParejasBetKey): boolean => {
  switch (betKey) {
    case 'teamPressures': return config.teamPressures.enabled;
    case 'carritos': return config.carritos.enabled;
    case 'wolf': return config.wolfSetup?.enabled ?? false;
    case 'sixes': return (config.sixesBets?.length ?? 0) > 0;
    case 'vegas': return (config.vegasBets?.length ?? 0) > 0;
  }
};

/** Get participating player IDs for a parejas bet */
const getParticipantIds = (config: BetConfig, betKey: ParejasBetKey, players: Player[]): string[] => {
  const allIds = players.map(p => p.id);
  switch (betKey) {
    case 'teamPressures': {
      if (!config.teamPressures.enabled) return [];
      const ids = new Set<string>();
      config.teamPressures.bets.forEach(b => {
        b.teamA.forEach(id => id && ids.add(id));
        b.teamB.forEach(id => id && ids.add(id));
      });
      // If no players assigned yet but enabled, all are available
      return ids.size > 0 ? Array.from(ids) : allIds;
    }
    case 'carritos': {
      if (!config.carritos.enabled) return [];
      const ids = new Set<string>();
      // Primary
      config.carritos.teamA.forEach(id => id && ids.add(id));
      config.carritos.teamB.forEach(id => id && ids.add(id));
      // Additional
      config.carritosTeams?.forEach(t => {
        t.teamA.forEach(id => id && ids.add(id));
        t.teamB.forEach(id => id && ids.add(id));
      });
      return ids.size > 0 ? Array.from(ids) : allIds;
    }
    case 'wolf': {
      if (!(config.wolfSetup?.enabled)) return [];
      return allIds; // Wolf always uses all players
    }
    case 'sixes': {
      if ((config.sixesBets?.length ?? 0) === 0) return [];
      const ids = new Set<string>();
      config.sixesBets?.forEach(bet => {
        bet.sets.forEach(s => {
          s.team1.forEach(id => id && ids.add(id));
          s.team2.forEach(id => id && ids.add(id));
        });
      });
      return ids.size > 0 ? Array.from(ids) : allIds;
    }
    case 'vegas': {
      if ((config.vegasBets?.length ?? 0) === 0) return [];
      const ids = new Set<string>();
      config.vegasBets?.forEach(bet => {
        [bet.playerAId, bet.playerBId, bet.playerCId, bet.playerDId].forEach(id => id && ids.add(id));
      });
      return ids.size > 0 ? Array.from(ids) : allIds;
    }
  }
};

/** Check if a player is participating in a specific bet */
const isPlayerParticipating = (config: BetConfig, betKey: ParejasBetKey, playerId: string, players: Player[]): boolean => {
  if (!isBetEnabled(config, betKey)) return false;
  const pIds = getParticipantIds(config, betKey, players);
  return pIds.includes(playerId);
};

/** Get active participant IDs for a parejas bet (for external filtering) */
export const getParejasActivePlayerIds = (config: BetConfig, betKey: string, players: Player[]): string[] => {
  if (!PAREJAS_BETS.some(b => b.key === betKey)) return players.map(p => p.id);
  return getParticipantIds(config, betKey as ParejasBetKey, players);
};

export const ParejasParticipationMatrix: React.FC<ParejasParticipationMatrixProps> = ({
  config,
  players,
  onUpdateConfig,
  onUpdateBet,
}) => {
  const disambiguatedMap = useMemo(() => disambiguateInitials(players), [players]);

  if (players.length < 4) return null;

  /** Count how many players are currently participating in a bet */
  const getActiveCount = (betKey: ParejasBetKey): number => {
    if (!isBetEnabled(config, betKey)) return 0;
    return getParticipantIds(config, betKey, players).length;
  };

  /** Toggle a single player's participation in a bet */
  const handleCellToggle = (betKey: ParejasBetKey, playerId: string) => {
    if (!isBetEnabled(config, betKey)) return; // bet not enabled, do nothing

    const currentIds = getParticipantIds(config, betKey, players);
    const isIn = currentIds.includes(playerId);

    // Minimum 4 players — don't allow deselect if at limit
    if (isIn && currentIds.length <= 4) return;

    const newIds = isIn
      ? currentIds.filter(id => id !== playerId)
      : [...currentIds, playerId];

    // Apply the new participant set based on bet type
    switch (betKey) {
      case 'teamPressures': {
        // Store as disabledTeamBetIds concept — or better, we track via removing from team assignments
        // For team pressures, we filter out the player from all team assignments
        const allIds = players.map(p => p.id);
        const excluded = allIds.filter(id => !newIds.includes(id));
        const updatedBets = config.teamPressures.bets.map(b => ({
          ...b,
          teamA: b.teamA.map(id => excluded.includes(id) ? '' : id) as [string, string],
          teamB: b.teamB.map(id => excluded.includes(id) ? '' : id) as [string, string],
        }));
        onUpdateConfig({ ...config, teamPressures: { ...config.teamPressures, bets: updatedBets } });
        break;
      }
      case 'carritos': {
        const excluded = players.map(p => p.id).filter(id => !newIds.includes(id));
        const cleanId = (id: string) => excluded.includes(id) ? '' : id;
        const updatedCarritos = {
          ...config.carritos,
          teamA: [cleanId(config.carritos.teamA[0]), cleanId(config.carritos.teamA[1])] as [string, string],
          teamB: [cleanId(config.carritos.teamB[0]), cleanId(config.carritos.teamB[1])] as [string, string],
        };
        const updatedTeams = config.carritosTeams?.map(t => ({
          ...t,
          teamA: [cleanId(t.teamA[0]), cleanId(t.teamA[1])] as [string, string],
          teamB: [cleanId(t.teamB[0]), cleanId(t.teamB[1])] as [string, string],
        }));
        onUpdateConfig({ ...config, carritos: updatedCarritos, carritosTeams: updatedTeams });
        break;
      }
      case 'wolf':
        // Wolf uses all players, no per-player toggle currently
        break;
      case 'sixes': {
        const excluded = players.map(p => p.id).filter(id => !newIds.includes(id));
        const cleanId = (id: string) => excluded.includes(id) ? '' : id;
        const updatedSixes = config.sixesBets?.map(bet => ({
          ...bet,
          sets: bet.sets.map(s => ({
            ...s,
            team1: s.team1.map(cleanId) as [string, string],
            team2: s.team2.map(cleanId) as [string, string],
          })),
        }));
        onUpdateConfig({ ...config, sixesBets: updatedSixes });
        break;
      }
      case 'vegas': {
        const excluded = players.map(p => p.id).filter(id => !newIds.includes(id));
        const cleanId = (id: string) => excluded.includes(id) ? '' : id;
        const updatedVegas = config.vegasBets?.map(bet => ({
          ...bet,
          playerAId: cleanId(bet.playerAId),
          playerBId: cleanId(bet.playerBId),
          playerCId: cleanId(bet.playerCId),
          playerDId: cleanId(bet.playerDId),
        }));
        onUpdateConfig({ ...config, vegasBets: updatedVegas });
        break;
      }
    }
  };

  const handleRowToggle = (betKey: ParejasBetKey) => {
    const enabled = isBetEnabled(config, betKey);
    switch (betKey) {
      case 'teamPressures':
        if (enabled) {
          onUpdateBet('teamPressures', { enabled: false });
        } else {
          const bets = config.teamPressures.bets.length > 0 ? config.teamPressures.bets : [{
            id: `team-pressure-${Date.now()}`, teamA: ['', ''] as [string, string], teamB: ['', ''] as [string, string],
            frontAmount: 100, backAmount: 100, totalAmount: 100, openingThreshold: 3 as const,
            teamHandicaps: {}, scoringType: 'lowBall' as const, enabled: true,
          }];
          onUpdateConfig({ ...config, teamPressures: { ...config.teamPressures, enabled: true, bets } });
        }
        break;
      case 'carritos':
        if (enabled) {
          onUpdateBet('carritos', { enabled: false });
        } else {
          const hasTeams = (config.carritosTeams?.length ?? 0) > 0 || config.carritos.teamA[0] || config.carritos.teamA[1];
          if (!hasTeams) {
            onUpdateConfig({
              ...config,
              carritos: { ...config.carritos, enabled: true },
              carritosTeams: [{
                id: `carritos-${Date.now()}`, teamA: ['', ''], teamB: ['', ''],
                frontAmount: 100, backAmount: 100, totalAmount: 100,
                scoringType: 'all', teamHandicaps: {}, enabled: true,
              }],
            });
          } else {
            onUpdateBet('carritos', { enabled: true });
          }
        }
        break;
      case 'wolf':
        onUpdateBet('wolfSetup', { ...config.wolfSetup, enabled: !enabled } as any);
        break;
      case 'sixes':
        if (enabled) {
          onUpdateConfig({ ...config, sixesBets: [] });
        } else {
          const primera: SixesBetInstance = {
            id: `sixes-${Date.now()}`, scoringMode: 'lowBall', cobro: 'per_hole',
            amount: 100, useHandicap: true, sets: [],
          };
          onUpdateConfig({ ...config, sixesBets: [primera] });
        }
        break;
      case 'vegas':
        if (enabled) {
          onUpdateConfig({ ...config, vegasBets: [] });
        } else {
          const primera: VegasBetInstance = {
            id: `vegas-${Date.now()}`, valuePerPoint: 10, useHandicap: false,
            birdieMultiplier: false, variant: 'fixed',
            playerAId: '', playerBId: '', playerCId: '', playerDId: '',
          };
          onUpdateConfig({ ...config, vegasBets: [primera] });
        }
        break;
    }
  };

  const getRowState = (betKey: ParejasBetKey): 'all' | 'none' | 'partial' => {
    if (!isBetEnabled(config, betKey)) return 'none';
    const pIds = getParticipantIds(config, betKey, players);
    const allIds = players.map(p => p.id);
    if (allIds.every(id => pIds.includes(id))) return 'all';
    return 'partial';
  };

  const getColumnState = (playerId: string): 'all' | 'none' | 'partial' => {
    const states = PAREJAS_BETS.map(b => isPlayerParticipating(config, b.key, playerId, players));
    if (states.every(Boolean)) return 'all';
    if (states.every(s => !s)) return 'none';
    return 'partial';
  };

  // Wolf is only visible for 4-6 players
  const visibleBets = PAREJAS_BETS.filter(b => {
    if (b.key === 'wolf') return players.length >= 4 && players.length <= 6;
    return true;
  });

  return (
    <div className="border rounded-lg bg-card p-2 space-y-2">
      <p className="text-xs font-medium text-foreground px-1">Configuración Rápida</p>

      <div className="overflow-x-auto -mx-2 px-0">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card p-1 text-left min-w-[80px]" />
              {players.map(player => {
                const colState = getColumnState(player.id);
                return (
                  <th key={player.id} className="p-1 text-center min-w-[36px]">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-md flex items-center justify-center mx-auto transition-opacity border",
                        colState === 'none'
                          ? "opacity-35 border-transparent"
                          : "border-border/40"
                      )}
                    >
                      <span className="text-[10px] font-bold text-foreground">{disambiguatedMap.get(player.id) || player.initials}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleBets.map(bet => {
              const rowState = getRowState(bet.key);
              const activeCount = getActiveCount(bet.key);
              return (
                <tr key={bet.key} className={cn(
                  "border-t border-border/30",
                  rowState === 'none' && "opacity-50"
                )}>
                  <td className="sticky left-0 z-10 bg-card p-1.5">
                    <div className="flex items-center gap-1.5">
                      <Checkbox
                        checked={rowState === 'all' ? true : rowState === 'partial' ? 'indeterminate' : false}
                        onCheckedChange={() => handleRowToggle(bet.key)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="font-medium text-[11px] whitespace-nowrap">{bet.label}</span>
                    </div>
                  </td>
                  {players.map(player => {
                    const cellOn = isPlayerParticipating(config, bet.key, player.id, players);
                    const canToggle = isBetEnabled(config, bet.key) && bet.key !== 'wolf' && (cellOn ? activeCount > 4 : true);
                    return (
                      <td key={player.id} className="p-1 text-center">
                        <button
                          type="button"
                          disabled={!canToggle}
                          onClick={() => handleCellToggle(bet.key, player.id)}
                          className={cn(
                            "w-7 h-7 rounded-md flex items-center justify-center mx-auto transition-all text-[10px]",
                            cellOn
                              ? "bg-primary/20 text-primary border border-primary/40"
                              : "bg-muted/40 text-muted-foreground/40 border border-transparent",
                            canToggle && "cursor-pointer hover:border-border",
                            !canToggle && "cursor-default"
                          )}
                        >
                          {cellOn ? '✓' : '—'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
