import React, { useMemo } from 'react';
import { BetConfig, Player } from '@/types/golf';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { formatPlayerName } from '@/lib/playerInput';

interface ParticipationMatrixProps {
  config: BetConfig;
  players: Player[];
  onUpdateBet: <K extends keyof BetConfig>(betType: K, updates: Partial<BetConfig[K]>) => void;
}

/** Individual bet types that support participantIds */
const INDIVIDUAL_BETS = [
  { key: 'medal' as const, label: 'Medal' },
  { key: 'pressures' as const, label: 'Presiones' },
  { key: 'skins' as const, label: 'Skins' },
  { key: 'caros' as const, label: 'Caros' },
  { key: 'units' as const, label: 'Unidades' },
  { key: 'manchas' as const, label: 'Manchas' },
  { key: 'putts' as const, label: 'Putts' },
  { key: 'culebras' as const, label: 'Culebras' },
  { key: 'pinguinos' as const, label: 'Pingüinos' },
] as const;

type IndividualBetKey = typeof INDIVIDUAL_BETS[number]['key'];

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

/** Check if a player is participating in a bet */
const isParticipating = (
  participantIds: string[] | undefined,
  playerId: string,
  players: Player[]
): boolean => {
  const active = getActiveIds(participantIds, players);
  return active.includes(playerId);
};

/** Get participantIds from a bet config entry */
const getParticipantIds = (config: BetConfig, betKey: IndividualBetKey): string[] | undefined => {
  const betConfig = config[betKey] as any;
  return betConfig?.participantIds;
};

/** Check if a bet is enabled */
const isBetEnabled = (config: BetConfig, betKey: IndividualBetKey): boolean => {
  const betConfig = config[betKey] as any;
  return betConfig?.enabled ?? false;
};

export const ParticipationMatrix: React.FC<ParticipationMatrixProps> = ({
  config,
  players,
  onUpdateBet,
}) => {
  // Only show bets that are enabled
  const enabledBets = useMemo(
    () => INDIVIDUAL_BETS.filter(b => isBetEnabled(config, b.key)),
    [config]
  );

  if (enabledBets.length === 0 || players.length === 0) return null;

  const handleCellToggle = (betKey: IndividualBetKey, playerId: string) => {
    const currentIds = getActiveIds(getParticipantIds(config, betKey), players);
    const isOn = currentIds.includes(playerId);

    let newIds: string[];
    if (isOn) {
      // Remove player
      newIds = currentIds.filter(id => id !== playerId);
    } else {
      // Add player
      newIds = [...currentIds, playerId];
    }

    // If all players are selected, clear participantIds (means "all")
    const allIds = players.map(p => p.id);
    const isAll = allIds.every(id => newIds.includes(id));

    onUpdateBet(betKey, { participantIds: isAll ? undefined : newIds } as any);
  };

  const handleRowToggle = (betKey: IndividualBetKey) => {
    const currentIds = getActiveIds(getParticipantIds(config, betKey), players);
    const allIds = players.map(p => p.id);
    const allActive = allIds.every(id => currentIds.includes(id));

    if (allActive) {
      // Deselect all → set empty array (nobody)
      onUpdateBet(betKey, { participantIds: [] } as any);
    } else {
      // Select all → clear (means all)
      onUpdateBet(betKey, { participantIds: undefined } as any);
    }
  };

  const handleColumnToggle = (playerId: string) => {
    // Check if player is in ALL enabled bets
    const allActive = enabledBets.every(b =>
      isParticipating(getParticipantIds(config, b.key), playerId, players)
    );

    enabledBets.forEach(b => {
      const currentIds = getActiveIds(getParticipantIds(config, b.key), players);
      let newIds: string[];

      if (allActive) {
        // Remove from all
        newIds = currentIds.filter(id => id !== playerId);
      } else {
        // Add to all
        newIds = currentIds.includes(playerId) ? currentIds : [...currentIds, playerId];
      }

      const allIds = players.map(p => p.id);
      const isAll = allIds.every(id => newIds.includes(id));
      onUpdateBet(b.key, { participantIds: isAll ? undefined : newIds } as any);
    });
  };

  const getRowState = (betKey: IndividualBetKey): 'all' | 'none' | 'partial' => {
    const currentIds = getActiveIds(getParticipantIds(config, betKey), players);
    const allIds = players.map(p => p.id);
    if (currentIds.length === 0) return 'none';
    if (allIds.every(id => currentIds.includes(id))) return 'all';
    return 'partial';
  };

  const getColumnState = (playerId: string): 'all' | 'none' | 'partial' => {
    const states = enabledBets.map(b =>
      isParticipating(getParticipantIds(config, b.key), playerId, players)
    );
    if (states.every(Boolean)) return 'all';
    if (states.every(s => !s)) return 'none';
    return 'partial';
  };

  return (
    <div className="border rounded-lg bg-card p-3 space-y-2">
      <p className="text-xs font-medium text-foreground">Configuración Rápida de Participación</p>
      <p className="text-[10px] text-muted-foreground">
        Define rápidamente quién juega cada apuesta. Solo muestra apuestas activas.
      </p>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr>
              {/* Top-left: empty corner with sticky */}
              <th className="sticky left-0 z-10 bg-card p-1 text-left min-w-[80px]" />
              {/* Player column headers */}
              {players.map(player => {
                const colState = getColumnState(player.id);
                return (
                  <th key={player.id} className="p-1 text-center min-w-[44px]">
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleColumnToggle(player.id); }}
                      className="flex flex-col items-center gap-0.5 mx-auto group"
                      title={`${formatPlayerName(player.name)} — Click para ${colState === 'all' ? 'excluir de todas' : 'incluir en todas'}`}
                    >
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold transition-opacity",
                          colState === 'none' && "opacity-40"
                        )}
                        style={{ backgroundColor: player.color, color: '#fff' }}
                      >
                        {player.initials}
                      </div>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {enabledBets.map(bet => {
              const rowState = getRowState(bet.key);
              return (
                <tr key={bet.key} className={cn(
                  "border-t border-border/30",
                  rowState === 'none' && "opacity-50"
                )}>
                  {/* Row header: bet name + row toggle */}
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
                  {/* Player cells */}
                  {players.map(player => {
                    const on = isParticipating(getParticipantIds(config, bet.key), player.id, players);
                    // Check if participantIds is explicitly empty (nobody)
                    const pIds = getParticipantIds(config, bet.key);
                    const isExplicitlyEmpty = Array.isArray(pIds) && pIds.length === 0;
                    const cellOn = isExplicitlyEmpty ? false : on;

                    return (
                      <td key={player.id} className="p-1 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (isExplicitlyEmpty) {
                              // Nobody is selected, clicking should add just this player
                              onUpdateBet(bet.key, { participantIds: [player.id] } as any);
                            } else {
                              handleCellToggle(bet.key, player.id);
                            }
                          }}
                          className={cn(
                            "w-7 h-7 rounded-md flex items-center justify-center transition-all",
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
