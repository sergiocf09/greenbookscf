import React, { useMemo } from 'react';
import { BetConfig, Player } from '@/types/golf';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { disambiguateInitials } from '@/lib/playerInput';

interface ParticipationMatrixProps {
  config: BetConfig;
  players: Player[];
  onUpdateBet: <K extends keyof BetConfig>(betType: K, updates: Partial<BetConfig[K]>) => void;
  onUpdateConfig?: (config: BetConfig) => void;
}

/** ALL individual bet types — always shown in matrix */
const INDIVIDUAL_BETS = [
  { key: 'medal' as const, label: 'Medal' },
  { key: 'pressures' as const, label: 'Presiones' },
  { key: 'skins' as const, label: 'Skins' },
  { key: 'caros' as const, label: 'Caros' },
  { key: 'oyeses' as const, label: 'Oyeses' },
  { key: 'units' as const, label: 'Unidades' },
  { key: 'manchas' as const, label: 'Manchas' },
  { key: 'putts' as const, label: 'Putts' },
  { key: 'rayas' as const, label: 'Rayas' },
] as const;

type IndividualBetKey = typeof INDIVIDUAL_BETS[number]['key'];

/** Bet keys that support oneVsAll mode */
const ONE_VS_ALL_ELIGIBLE: IndividualBetKey[] = [
  'medal', 'pressures', 'skins', 'caros', 'units', 'manchas', 'putts', 'rayas',
];

/** Get valid participant IDs for a bet, filtering stale IDs */
const getActiveIds = (
  participantIds: string[] | undefined,
  players: Player[]
): string[] => {
  const allIds = players.map(p => p.id);
  if (!participantIds || participantIds.length === 0) return allIds;
  const valid = participantIds.filter(id => allIds.includes(id));
  return valid.length === 0 ? allIds : valid;
};

/** Get participantIds from a bet config entry */
const getParticipantIds = (config: BetConfig, betKey: IndividualBetKey): string[] | undefined => {
  const betConfig = config[betKey] as any;
  if (!betConfig?.enabled && betConfig?.participantIds === undefined) return [];
  return betConfig?.participantIds;
};

/** Get oneVsAll flag from a bet config entry */
const getOneVsAll = (config: BetConfig, betKey: IndividualBetKey): boolean => {
  const betConfig = config[betKey] as any;
  return betConfig?.oneVsAll === true;
};

/** Get anchorPlayerId from a bet config entry */
const getAnchorPlayerId = (config: BetConfig, betKey: IndividualBetKey): string | undefined => {
  const betConfig = config[betKey] as any;
  return betConfig?.anchorPlayerId;
};

/** Determine effective participation considering explicit empty arrays and oneVsAll */
const isEffectivelyParticipating = (
  participantIds: string[] | undefined,
  playerId: string,
  players: Player[],
  oneVsAll?: boolean,
  anchorPlayerId?: string
): boolean => {
  // In oneVsAll mode: anchor is "selected", everyone else visually shows as participating via the chip
  if (oneVsAll && anchorPlayerId) {
    return playerId === anchorPlayerId;
  }
  if (Array.isArray(participantIds) && participantIds.length === 0) return false;
  const active = getActiveIds(participantIds, players);
  return active.includes(playerId);
};

/** Check if a bet has at least one participant */
export const betHasParticipants = (config: BetConfig, betKey: string, players: Player[]): boolean => {
  const betConfig = config[betKey as keyof BetConfig] as any;
  if (!betConfig) return false;
  // If bet is disabled and no explicit participantIds, treat as no participants
  if (!betConfig.enabled && betConfig.participantIds === undefined) return false;
  // oneVsAll mode always has participants
  if (betConfig.oneVsAll && betConfig.anchorPlayerId) return true;
  const pIds = betConfig.participantIds;
  if (Array.isArray(pIds) && pIds.length === 0) return false;
  return true;
};

export const ParticipationMatrix: React.FC<ParticipationMatrixProps> = ({
  config,
  players,
  onUpdateBet,
  onUpdateConfig,
}) => {
  const disambiguatedMap = useMemo(() => disambiguateInitials(players), [players]);

  if (players.length === 0) return null;
  /** Sync oneVsAll flag based on current participantIds state */
  const syncOneVsAll = (betKey: IndividualBetKey, newParticipantIds: string[] | undefined, enabled: boolean) => {
    const isEligible = ONE_VS_ALL_ELIGIBLE.includes(betKey);
    if (!isEligible) return {};

    // If exactly 1 player is selected and there are 2+ players, auto-enable oneVsAll
    if (enabled && Array.isArray(newParticipantIds) && newParticipantIds.length === 1 && players.length >= 2) {
      return { oneVsAll: true, anchorPlayerId: newParticipantIds[0] };
    }
    // Otherwise clear oneVsAll
    return { oneVsAll: false, anchorPlayerId: undefined };
  };

  const handleCellToggle = (betKey: IndividualBetKey, playerId: string) => {
    const currentOneVsAll = getOneVsAll(config, betKey);
    const currentAnchor = getAnchorPlayerId(config, betKey);

    // If in oneVsAll mode and clicking the anchor, revert to standard mode (disable all)
    if (currentOneVsAll && currentAnchor === playerId) {
      onUpdateBet(betKey, { participantIds: [], enabled: false, oneVsAll: false, anchorPlayerId: undefined } as any);
      return;
    }

    // If in oneVsAll mode and clicking another player, switch anchor to that player
    if (currentOneVsAll && currentAnchor !== playerId) {
      onUpdateBet(betKey, { participantIds: [playerId], enabled: true, oneVsAll: true, anchorPlayerId: playerId } as any);
      return;
    }

    const pIds = getParticipantIds(config, betKey);
    const isExplicitlyEmpty = Array.isArray(pIds) && pIds.length === 0;

    if (isExplicitlyEmpty) {
      const oneVsAllUpdates = syncOneVsAll(betKey, [playerId], true);
      onUpdateBet(betKey, { participantIds: [playerId], enabled: true, ...oneVsAllUpdates } as any);
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
    const finalIds = isAll ? undefined : newIds;
    const oneVsAllUpdates = syncOneVsAll(betKey, isEmpty ? [] : (isAll ? allIds : newIds), !isEmpty);
    
    onUpdateBet(betKey, { 
      participantIds: finalIds,
      enabled: !isEmpty,
      ...oneVsAllUpdates,
    } as any);
  };

  const handleRowToggle = (betKey: IndividualBetKey) => {
    const pIds = getParticipantIds(config, betKey);
    const currentOneVsAll = getOneVsAll(config, betKey);
    const isExplicitlyEmpty = Array.isArray(pIds) && pIds.length === 0;
    const currentIds = getActiveIds(pIds, players);
    const allIds = players.map(p => p.id);
    const allActive = !isExplicitlyEmpty && !currentOneVsAll && allIds.every(id => currentIds.includes(id));

    if (allActive) {
      onUpdateBet(betKey, { participantIds: [], enabled: false, oneVsAll: false, anchorPlayerId: undefined } as any);
    } else {
      onUpdateBet(betKey, { participantIds: undefined, enabled: true, oneVsAll: false, anchorPlayerId: undefined } as any);
    }
  };

  const handleOneVsAllRevert = (betKey: IndividualBetKey) => {
    // Revert to standard mode with all players
    onUpdateBet(betKey, { participantIds: undefined, enabled: true, oneVsAll: false, anchorPlayerId: undefined } as any);
  };

  const handleColumnToggle = (playerId: string) => {
    const colState = getColumnState(playerId);
    const allIds = players.map(p => p.id);

    let newConfig = { ...config };
    INDIVIDUAL_BETS.forEach(b => {
      const pIds = getParticipantIds(config, b.key);
      const isExplicitlyEmpty = Array.isArray(pIds) && pIds.length === 0;
      const currentOneVsAll = getOneVsAll(config, b.key);

      if (colState === 'all') {
        const currentIds = (isExplicitlyEmpty || currentOneVsAll) ? [] : getActiveIds(pIds, players);
        const newIds = currentIds.filter(id => id !== playerId);
        if (newIds.length === 0) {
          newConfig = { ...newConfig, [b.key]: { ...newConfig[b.key], participantIds: [], enabled: false, oneVsAll: false, anchorPlayerId: undefined } };
        } else {
          const isAll = allIds.every(id => newIds.includes(id));
          const oneVsAllUpdates = newIds.length === 1 && players.length >= 2 && ONE_VS_ALL_ELIGIBLE.includes(b.key)
            ? { oneVsAll: true, anchorPlayerId: newIds[0] }
            : { oneVsAll: false, anchorPlayerId: undefined };
          newConfig = { ...newConfig, [b.key]: { ...newConfig[b.key], participantIds: isAll ? undefined : newIds, enabled: true, ...oneVsAllUpdates } };
        }
      } else {
        if (isExplicitlyEmpty) {
          const oneVsAllUpdates = players.length >= 2 && ONE_VS_ALL_ELIGIBLE.includes(b.key)
            ? { oneVsAll: true, anchorPlayerId: playerId }
            : { oneVsAll: false, anchorPlayerId: undefined };
          newConfig = { ...newConfig, [b.key]: { ...newConfig[b.key], participantIds: [playerId], enabled: true, ...oneVsAllUpdates } };
        } else if (currentOneVsAll) {
          // Adding a player to a oneVsAll bet → revert to standard with anchor + new player
          const anchorId = getAnchorPlayerId(config, b.key);
          const newIds = anchorId ? [anchorId, playerId] : [playerId];
          const isAll = allIds.every(id => newIds.includes(id));
          newConfig = { ...newConfig, [b.key]: { ...newConfig[b.key], participantIds: isAll ? undefined : newIds, enabled: true, oneVsAll: false, anchorPlayerId: undefined } };
        } else {
          const currentIds = getActiveIds(pIds, players);
          if (!currentIds.includes(playerId)) {
            const newIds = [...currentIds, playerId];
            const isAll = allIds.every(id => newIds.includes(id));
            newConfig = { ...newConfig, [b.key]: { ...newConfig[b.key], participantIds: isAll ? undefined : newIds, enabled: true, oneVsAll: false, anchorPlayerId: undefined } };
          }
        }
      }
    });

    if (onUpdateConfig) {
      onUpdateConfig(newConfig);
    }
  };

  const getRowState = (betKey: IndividualBetKey): 'all' | 'none' | 'partial' | 'oneVsAll' => {
    if (getOneVsAll(config, betKey)) return 'oneVsAll';
    const pIds = getParticipantIds(config, betKey);
    if (Array.isArray(pIds) && pIds.length === 0) return 'none';
    const currentIds = getActiveIds(pIds, players);
    const allIds = players.map(p => p.id);
    if (allIds.every(id => currentIds.includes(id))) return 'all';
    return 'partial';
  };

  const getColumnState = (playerId: string): 'all' | 'none' | 'partial' => {
    const states = INDIVIDUAL_BETS.map(b => {
      const oneVsAll = getOneVsAll(config, b.key);
      const anchorId = getAnchorPlayerId(config, b.key);
      return isEffectivelyParticipating(
        getParticipantIds(config, b.key), playerId, players, oneVsAll, anchorId
      );
    });
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
                  <th key={player.id} className="p-1 text-center min-w-[40px]">
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
            {INDIVIDUAL_BETS.map(bet => {
              const rowState = getRowState(bet.key);
              const isOneVsAll = rowState === 'oneVsAll';
              const anchorId = isOneVsAll ? getAnchorPlayerId(config, bet.key) : undefined;
              const anchorPlayer = anchorId ? players.find(p => p.id === anchorId) : undefined;
              return (
                <tr key={bet.key} className={cn(
                  "border-t border-border/30",
                  rowState === 'none' && "opacity-50",
                  isOneVsAll && "bg-accent/30"
                )}>
                  <td className="sticky left-0 z-10 bg-card p-1.5">
                    <div className="flex items-center gap-1.5">
                      <Checkbox
                        checked={rowState === 'all' ? true : rowState === 'partial' || isOneVsAll ? 'indeterminate' : false}
                        onCheckedChange={() => handleRowToggle(bet.key)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="font-medium text-[11px] whitespace-nowrap">{bet.label}</span>
                      {isOneVsAll && anchorPlayer && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOneVsAllRevert(bet.key); }}
                          title="Volver a Todos vs Todos"
                        >
                          <Badge variant="secondary" className="text-[8px] px-1 py-0 h-3.5 cursor-pointer hover:bg-destructive/20">
                            {anchorPlayer.initials} vs Todos ✕
                          </Badge>
                        </button>
                      )}
                    </div>
                  </td>
                  {players.map(player => {
                    const oneVsAll = getOneVsAll(config, bet.key);
                    const anchor = getAnchorPlayerId(config, bet.key);
                    const cellOn = isEffectivelyParticipating(
                      getParticipantIds(config, bet.key), player.id, players, oneVsAll, anchor
                    );
                    const isAnchor = oneVsAll && anchor === player.id;
                    const isVsTarget = oneVsAll && anchor && anchor !== player.id;
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
                            isAnchor
                              ? "bg-primary text-primary-foreground border border-primary font-bold"
                              : isVsTarget
                              ? "bg-accent/50 text-accent-foreground/60 border border-accent/40"
                              : cellOn
                              ? "bg-primary/20 text-primary border border-primary/40"
                              : "bg-muted/40 text-muted-foreground/40 border border-transparent hover:border-border"
                          )}
                        >
                          {isAnchor ? '★' : isVsTarget ? 'vs' : cellOn ? '✓' : '—'}
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
