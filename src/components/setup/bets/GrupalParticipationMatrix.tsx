import React, { useMemo } from 'react';
import { BetConfig, Player, NinesBetInstance } from '@/types/golf';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { disambiguateInitials } from '@/lib/playerInput';

interface GrupalParticipationMatrixProps {
  config: BetConfig;
  players: Player[];
  onUpdateBet: <K extends keyof BetConfig>(betType: K, updates: Partial<BetConfig[K]>) => void;
  onUpdateConfig?: (config: BetConfig) => void;
}

/** ALL grupal bet types — always shown in matrix */
const GRUPAL_BETS = [
  { key: 'culebras' as const, label: 'Culebras' },
  { key: 'pinguinos' as const, label: 'Pingüinos' },
  { key: 'zoologico' as const, label: 'Zoológico' },
  { key: 'coneja' as const, label: 'Coneja' },
  { key: 'medalGeneral' as const, label: 'Medal Gral' },
  { key: 'stableford' as const, label: 'Stableford' },
  { key: 'skinsGrupal' as const, label: 'Skins Grl' },
  { key: 'nines' as const, label: 'Nines' },
] as const;

type GrupalBetKey = typeof GRUPAL_BETS[number]['key'];

const getActiveIds = (
  participantIds: string[] | undefined,
  players: Player[]
): string[] => {
  const allIds = players.map(p => p.id);
  if (participantIds === undefined) return allIds;
  if (participantIds.length === 0) return [];
  const valid = participantIds.filter(id => allIds.includes(id));
  return valid.length === 0 ? allIds : valid;
};

const getParticipantIds = (config: BetConfig, betKey: GrupalBetKey): string[] | undefined => {
  if (betKey === 'nines') {
    const ninesBets = config.ninesBets ?? [];
    if (ninesBets.length === 0) return [];
    const ids = new Set<string>();
    ninesBets.forEach(b => b.playerIds.forEach(id => ids.add(id)));
    return ids.size > 0 ? Array.from(ids) : undefined;
  }
  const betConfig = config[betKey] as any;
  if (!betConfig?.enabled && betConfig?.participantIds === undefined) return [];
  return betConfig?.participantIds;
};

const isEffectivelyParticipating = (
  participantIds: string[] | undefined,
  playerId: string,
  players: Player[]
): boolean => {
  if (Array.isArray(participantIds) && participantIds.length === 0) return false;
  const active = getActiveIds(participantIds, players);
  return active.includes(playerId);
};

/** Check if a grupal bet has at least one participant */
export const grupalBetHasParticipants = (config: BetConfig, betKey: string, players: Player[]): boolean => {
  if (betKey === 'nines') {
    return (config.ninesBets?.length ?? 0) > 0 && config.ninesBets!.some(b => b.playerIds.length > 0);
  }
  const betConfig = config[betKey as keyof BetConfig] as any;
  if (!betConfig) return false;
  if (!betConfig.enabled && betConfig.participantIds === undefined) return false;
  const pIds = betConfig.participantIds;
  if (Array.isArray(pIds) && pIds.length === 0) return false;
  return true;
};

/** Helper to update a bet, handling nines specially via onUpdateConfig */
const updateBet = (
  betKey: GrupalBetKey,
  updates: any,
  config: BetConfig,
  players: Player[],
  onUpdateBet: <K extends keyof BetConfig>(betType: K, updates: Partial<BetConfig[K]>) => void,
  onUpdateConfig?: (config: BetConfig) => void,
) => {
  if (betKey === 'nines') {
    if (!onUpdateConfig) return;
    // For nines, 'enabled' maps to having instances, 'participantIds' maps to playerIds across instances
    if (updates.enabled === false) {
      onUpdateConfig({ ...config, ninesBets: [] });
    } else if (updates.participantIds !== undefined || updates.enabled === true) {
      const newPlayerIds: string[] = updates.participantIds ?? players.map(p => p.id);
      const existing = config.ninesBets ?? [];
      if (existing.length === 0) {
        // Create first instance with the given players
        const nueva: NinesBetInstance = { id: `nines-${Date.now()}`, valuePerPoint: 10, playerIds: newPlayerIds };
        onUpdateConfig({ ...config, ninesBets: [nueva] });
      } else {
        // Update playerIds across all instances
        const updated = existing.map(b => ({ ...b, playerIds: newPlayerIds }));
        onUpdateConfig({ ...config, ninesBets: updated });
      }
    }
  } else {
    onUpdateBet(betKey as keyof BetConfig, updates);
  }
};

export const GrupalParticipationMatrix: React.FC<GrupalParticipationMatrixProps> = ({
  config,
  players,
  onUpdateBet,
  onUpdateConfig,
}) => {
  const disambiguatedMap = useMemo(() => disambiguateInitials(players), [players]);

  if (players.length === 0) return null;

  const doUpdate = (betKey: GrupalBetKey, updates: any) =>
    updateBet(betKey, updates, config, players, onUpdateBet, onUpdateConfig);

  const handleCellToggle = (betKey: GrupalBetKey, playerId: string) => {
    const pIds = getParticipantIds(config, betKey);
    const isExplicitlyEmpty = Array.isArray(pIds) && pIds.length === 0;

    if (isExplicitlyEmpty) {
      doUpdate(betKey, { participantIds: [playerId], enabled: true });
      return;
    }

    const currentIds = getActiveIds(pIds, players);
    const isOn = currentIds.includes(playerId);
    const newIds = isOn
      ? currentIds.filter(id => id !== playerId)
      : [...currentIds, playerId];

    const allIds = players.map(p => p.id);
    const isAll = allIds.every(id => newIds.includes(id));
    const isEmpty = newIds.length === 0;
    doUpdate(betKey, { 
      participantIds: isAll ? undefined : newIds,
      enabled: !isEmpty,
    });
  };

  const handleRowToggle = (betKey: GrupalBetKey) => {
    const pIds = getParticipantIds(config, betKey);
    const isExplicitlyEmpty = Array.isArray(pIds) && pIds.length === 0;
    const currentIds = getActiveIds(pIds, players);
    const allIds = players.map(p => p.id);
    const allActive = !isExplicitlyEmpty && allIds.every(id => currentIds.includes(id));

    if (allActive) {
      doUpdate(betKey, { participantIds: [], enabled: false });
    } else {
      doUpdate(betKey, { participantIds: undefined, enabled: true });
    }
  };

  const handleColumnToggle = (playerId: string) => {
    const colState = getColumnState(playerId);
    const allIds = players.map(p => p.id);

    let newConfig = { ...config };
    GRUPAL_BETS.forEach(b => {
      if (b.key === 'nines') {
        // Handle nines specially — mutate newConfig.ninesBets
        const ninesBets = newConfig.ninesBets ?? [];
        if (colState === 'all') {
          if (ninesBets.length === 0) return;
          const updated = ninesBets.map(nb => ({
            ...nb,
            playerIds: nb.playerIds.filter(id => id !== playerId),
          })).filter(nb => nb.playerIds.length > 0);
          newConfig = { ...newConfig, ninesBets: updated };
        } else {
          if (ninesBets.length === 0) {
            const nueva: NinesBetInstance = { id: `nines-${Date.now()}`, valuePerPoint: 10, playerIds: [playerId] };
            newConfig = { ...newConfig, ninesBets: [nueva] };
          } else {
            const updated = ninesBets.map(nb => ({
              ...nb,
              playerIds: nb.playerIds.includes(playerId) ? nb.playerIds : [...nb.playerIds, playerId],
            }));
            newConfig = { ...newConfig, ninesBets: updated };
          }
        }
        return;
      }

      const pIds = getParticipantIds(config, b.key);
      const isExplicitlyEmpty = Array.isArray(pIds) && pIds.length === 0;

      if (colState === 'all') {
        const currentIds = isExplicitlyEmpty ? [] : getActiveIds(pIds, players);
        const newIds = currentIds.filter(id => id !== playerId);
        if (newIds.length === 0) {
          newConfig = { ...newConfig, [b.key]: { ...newConfig[b.key], participantIds: [], enabled: false } };
        } else {
          const isAll = allIds.every(id => newIds.includes(id));
          newConfig = { ...newConfig, [b.key]: { ...newConfig[b.key], participantIds: isAll ? undefined : newIds, enabled: true } };
        }
      } else {
        if (isExplicitlyEmpty) {
          newConfig = { ...newConfig, [b.key]: { ...newConfig[b.key], participantIds: [playerId], enabled: true } };
        } else {
          const currentIds = getActiveIds(pIds, players);
          if (!currentIds.includes(playerId)) {
            const newIds = [...currentIds, playerId];
            const isAll = allIds.every(id => newIds.includes(id));
            newConfig = { ...newConfig, [b.key]: { ...newConfig[b.key], participantIds: isAll ? undefined : newIds, enabled: true } };
          }
        }
      }
    });

    if (onUpdateConfig) {
      onUpdateConfig(newConfig);
    }
  };

  const getRowState = (betKey: GrupalBetKey): 'all' | 'none' | 'partial' => {
    const pIds = getParticipantIds(config, betKey);
    if (Array.isArray(pIds) && pIds.length === 0) return 'none';
    const currentIds = getActiveIds(pIds, players);
    const allIds = players.map(p => p.id);
    if (allIds.every(id => currentIds.includes(id))) return 'all';
    return 'partial';
  };

  const getColumnState = (playerId: string): 'all' | 'none' | 'partial' => {
    const states = GRUPAL_BETS.map(b =>
      isEffectivelyParticipating(getParticipantIds(config, b.key), playerId, players)
    );
    if (states.every(Boolean)) return 'all';
    if (states.every(s => !s)) return 'none';
    return 'partial';
  };

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
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleColumnToggle(player.id); }}
                      className={cn(
                        "w-7 h-7 rounded-md flex items-center justify-center mx-auto transition-opacity border",
                        colState === 'none' 
                          ? "opacity-35 border-transparent" 
                          : "border-border/40"
                      )}
                      title={`${player.name} — ${colState === 'all' ? 'Excluir de todas' : 'Incluir en todas'}`}
                    >
                      <span className="text-[10px] font-bold text-foreground">{disambiguatedMap.get(player.id) || player.initials}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {GRUPAL_BETS.map(bet => {
              const rowState = getRowState(bet.key);
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
                    const cellOn = isEffectivelyParticipating(
                      getParticipantIds(config, bet.key), player.id, players
                    );
                    return (
                      <td key={player.id} className="p-1 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCellToggle(bet.key, player.id);
                          }}
                          className={cn(
                            "w-7 h-7 rounded-md flex items-center justify-center transition-all text-[10px]",
                            cellOn
                              ? "bg-primary/20 text-primary border border-primary/40"
                              : "bg-muted/40 text-muted-foreground/40 border border-transparent hover:border-border"
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
