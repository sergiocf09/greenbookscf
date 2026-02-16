import React from 'react';
import { BetConfig, Player } from '@/types/golf';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

interface GrupalParticipationMatrixProps {
  config: BetConfig;
  players: Player[];
  onUpdateBet: <K extends keyof BetConfig>(betType: K, updates: Partial<BetConfig[K]>) => void;
}

/** ALL grupal bet types — always shown in matrix */
const GRUPAL_BETS = [
  { key: 'culebras' as const, label: 'Culebras' },
  { key: 'pinguinos' as const, label: 'Pingüinos' },
  { key: 'zoologico' as const, label: 'Zoológico' },
  { key: 'coneja' as const, label: 'Coneja' },
  { key: 'medalGeneral' as const, label: 'Medal Gral' },
  { key: 'stableford' as const, label: 'Stableford' },
] as const;

type GrupalBetKey = typeof GRUPAL_BETS[number]['key'];

const getActiveIds = (
  participantIds: string[] | undefined,
  players: Player[]
): string[] => {
  const allIds = players.map(p => p.id);
  if (!participantIds || participantIds.length === 0) return allIds;
  const valid = participantIds.filter(id => allIds.includes(id));
  return valid.length === 0 ? allIds : valid;
};

const getParticipantIds = (config: BetConfig, betKey: GrupalBetKey): string[] | undefined => {
  const betConfig = config[betKey] as any;
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
  const betConfig = config[betKey as keyof BetConfig] as any;
  if (!betConfig) return false;
  const pIds = betConfig.participantIds;
  if (Array.isArray(pIds) && pIds.length === 0) return false;
  return true;
};

export const GrupalParticipationMatrix: React.FC<GrupalParticipationMatrixProps> = ({
  config,
  players,
  onUpdateBet,
}) => {
  if (players.length === 0) return null;

  const handleCellToggle = (betKey: GrupalBetKey, playerId: string) => {
    const pIds = getParticipantIds(config, betKey);
    const isExplicitlyEmpty = Array.isArray(pIds) && pIds.length === 0;

    if (isExplicitlyEmpty) {
      onUpdateBet(betKey, { participantIds: [playerId] } as any);
      return;
    }

    const currentIds = getActiveIds(pIds, players);
    const isOn = currentIds.includes(playerId);
    const newIds = isOn
      ? currentIds.filter(id => id !== playerId)
      : [...currentIds, playerId];

    const allIds = players.map(p => p.id);
    const isAll = allIds.every(id => newIds.includes(id));
    onUpdateBet(betKey, { participantIds: isAll ? undefined : newIds } as any);
  };

  const handleRowToggle = (betKey: GrupalBetKey) => {
    const pIds = getParticipantIds(config, betKey);
    const isExplicitlyEmpty = Array.isArray(pIds) && pIds.length === 0;
    const currentIds = getActiveIds(pIds, players);
    const allIds = players.map(p => p.id);
    const allActive = !isExplicitlyEmpty && allIds.every(id => currentIds.includes(id));

    if (allActive) {
      onUpdateBet(betKey, { participantIds: [] } as any);
    } else {
      onUpdateBet(betKey, { participantIds: undefined } as any);
    }
  };

  const handleColumnToggle = (playerId: string) => {
    const colState = getColumnState(playerId);
    const allIds = players.map(p => p.id);

    GRUPAL_BETS.forEach(b => {
      const pIds = getParticipantIds(config, b.key);
      const isExplicitlyEmpty = Array.isArray(pIds) && pIds.length === 0;

      if (colState === 'all') {
        const currentIds = isExplicitlyEmpty ? [] : getActiveIds(pIds, players);
        const newIds = currentIds.filter(id => id !== playerId);
        if (newIds.length === 0) {
          onUpdateBet(b.key, { participantIds: [] } as any);
        } else {
          const isAll = allIds.every(id => newIds.includes(id));
          onUpdateBet(b.key, { participantIds: isAll ? undefined : newIds } as any);
        }
      } else {
        if (isExplicitlyEmpty) {
          onUpdateBet(b.key, { participantIds: [playerId] } as any);
        } else {
          const currentIds = getActiveIds(pIds, players);
          if (!currentIds.includes(playerId)) {
            const newIds = [...currentIds, playerId];
            const isAll = allIds.every(id => newIds.includes(id));
            onUpdateBet(b.key, { participantIds: isAll ? undefined : newIds } as any);
          }
        }
      }
    });
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
    <div className="border rounded-lg bg-card p-3 space-y-2">
      <p className="text-xs font-medium text-foreground">Configuración Rápida</p>

      <div className="overflow-x-auto -mx-1 px-1">
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
                        "flex flex-col items-center gap-0.5 mx-auto transition-opacity",
                        colState === 'none' && "opacity-35"
                      )}
                      title={`${player.name} — ${colState === 'all' ? 'Excluir de todas' : 'Incluir en todas'}`}
                    >
                      <span className="text-[9px] font-bold text-foreground">{player.initials}</span>
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
