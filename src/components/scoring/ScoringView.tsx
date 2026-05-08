import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { disambiguateInitials } from '@/lib/playerInput';
import { Player, PlayerScore, BetConfig, GolfCourse, PlayerGroup, MarkerState, SideBet, ZooEvent, WolfConfig, WolfHoleState, SixesConfig } from '@/types/golf';
import { defaultMarkerState } from '@/types/golf';
import { PlayerScoreInput } from '@/components/scoring/PlayerScoreInput';
import { GroupSelector, getPlayersForGroup, getAllPlayersFromAllGroups } from '@/components/GroupSelector';
import { SideBetsDialog } from '@/components/scoring/SideBetsDialog';
import { OyesesDialog } from '@/components/scoring/OyesesDialog';
import { ZoologicoDialog } from '@/components/scoring/ZoologicoDialog';
import { WolfDecisionPanel } from '@/components/bets/WolfDecisionPanel';
import { SixesActiveBadge } from '@/components/bets/SixesActiveBadge';

import { resolveWolfHole } from '@/lib/bets/wolf';
import { Button } from '@/components/ui/button';
import { Check, CheckCircle2, DollarSign, Target, AlertTriangle } from 'lucide-react';

interface ScoringViewProps {
  players: Player[];
  playerGroups: PlayerGroup[];
  course: GolfCourse;
  currentHole: number;
  setCurrentHole: (hole: number) => void;
  scores: Map<string, PlayerScore[]>;
  confirmedHoles: Set<number>;
  isHoleConfirmed: (holeNumber: number) => boolean;
  confirmHole: (holeNumber: number, playerIds?: string[]) => void;
  updateScore: (playerId: string, holeNumber: number, updates: Partial<PlayerScore>) => void;
  betConfig: BetConfig;
  holePar: number;
  profile: { id: string } | null;
  onAddSideBet?: (bet: SideBet) => void;
  onUpdateSideBet?: (bet: SideBet) => void;
  onDeleteSideBet?: (betId: string) => void;
  onAddZooEvent?: (event: ZooEvent) => void;
  onUpdateZooEvent?: (event: ZooEvent) => void;
  onDeleteZooEvent?: (eventId: string) => void;
  wolfConfig?: WolfConfig;
  wolfHoleStates?: WolfHoleState[];
  currentUserId?: string;
  isOrganizer?: boolean;
  onWolfDecision?: (holeNumber: number, partnerIds: string[], wentSolo: boolean) => Promise<void>;
  onWolfResolve?: (holeNumber: number, result: 'won' | 'lost' | 'tied') => Promise<void>;
  onWolfRevert?: (holeNumber: number) => Promise<void>;
  onWolfRecalculate?: (holeNumber: number) => Promise<void>;
  sixesConfig?: SixesConfig;
  startingHole?: 1 | 10;
}

/** Hole nav bar that auto-scrolls to center the active hole */
const HoleNavigationBar: React.FC<{
  currentHole: number;
  setCurrentHole: (hole: number) => void;
  isHoleConfirmedForDisplayGroup: (hole: number) => boolean;
  activeHoles: number[];
}> = ({ currentHole, setCurrentHole, isHoleConfirmedForDisplayGroup, activeHoles }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const btn = buttonRefs.current.get(currentHole);
    if (btn && containerRef.current) {
      const container = containerRef.current;
      const scrollLeft = btn.offsetLeft - container.clientWidth / 2 + btn.offsetWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, [currentHole]);

  return (
    <div ref={containerRef} className="flex gap-1 overflow-x-auto pb-2 pt-1">
      {activeHoles.map(hole => {
        const confirmed = isHoleConfirmedForDisplayGroup(hole);
        return (
          <button
            key={hole}
            ref={(el) => { if (el) buttonRefs.current.set(hole, el); }}
            onClick={() => setCurrentHole(hole)}
            className={`min-w-[2rem] h-8 rounded-full text-sm font-medium transition-all relative
              ${currentHole === hole ? 'bg-primary text-primary-foreground scale-110' : 
                confirmed ? 'bg-green-500/20 text-green-700 dark:text-green-400 ring-2 ring-green-500' : 'bg-muted text-muted-foreground hover:bg-muted/80'}
              ${hole === 9 ? 'mr-2' : ''}`}
          >
            {hole}
          </button>
        );
      })}
    </div>
  );
};

export const ScoringView: React.FC<ScoringViewProps> = ({
  players,
  playerGroups,
  course,
  currentHole,
  setCurrentHole,
  scores,
  confirmedHoles,
  isHoleConfirmed,
  confirmHole,
  updateScore,
  betConfig,
  holePar,
  profile,
  onAddSideBet,
  onUpdateSideBet,
  onDeleteSideBet,
  onAddZooEvent,
  onUpdateZooEvent,
  onDeleteZooEvent,
  wolfConfig,
  wolfHoleStates,
  currentUserId,
  isOrganizer,
  onWolfDecision,
  onWolfResolve,
  onWolfRevert,
  onWolfRecalculate,
  sixesConfig,
  startingHole = 1,
}) => {
  const isNineHole = (betConfig?.roundHoles ?? 18) === 9;
  const activeHoles = useMemo(() => {
    if (!isNineHole) return Array.from({ length: 18 }, (_, i) => i + 1);
    return startingHole === 10
      ? [10, 11, 12, 13, 14, 15, 16, 17, 18]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9];
  }, [isNineHole, startingHole]);
  const minHole = activeHoles[0];
  const maxHole = activeHoles[activeHoles.length - 1];

  useEffect(() => {
    if (!activeHoles.includes(currentHole)) {
      setCurrentHole(minHole);
    }
  }, [activeHoles, currentHole, minHole, setCurrentHole]);

  // Auto-detect user's group for default selection
  const userGroupIndex = useMemo(() => {
    if (!profile?.id || playerGroups.length === 0) return 0;
    if (players.some(p => p.profileId === profile.id)) return 0;
    for (let i = 0; i < playerGroups.length; i++) {
      if (playerGroups[i].players.some(p => p.profileId === profile.id)) return i + 1;
    }
    return 0;
  }, [profile?.id, players, playerGroups]);

  const [displayGroupIndex, setDisplayGroupIndex] = useState(0);

  const hasSetInitialGroup = useRef(false);
  useEffect(() => {
    if (!hasSetInitialGroup.current && playerGroups.length > 0) {
      setDisplayGroupIndex(userGroupIndex);
      hasSetInitialGroup.current = true;
    }
  }, [userGroupIndex, playerGroups.length]);
  
  const hasMultipleGroups = playerGroups.length > 0;
  
  const displayPlayers = useMemo(() => {
    const groupPlayers = getPlayersForGroup(displayGroupIndex, players, playerGroups);
    if (!profile?.id) return groupPlayers;
    return [...groupPlayers].sort((a, b) => {
      const aIsBase = a.profileId === profile.id;
      const bIsBase = b.profileId === profile.id;
      if (aIsBase && !bIsBase) return -1;
      if (!aIsBase && bIsBase) return 1;
      return 0;
    });
  }, [displayGroupIndex, players, playerGroups, profile?.id]);
  
  const allPlayers = useMemo(() => {
    return getAllPlayersFromAllGroups(players, playerGroups);
  }, [players, playerGroups]);

  const disambiguatedInitials = useMemo(() => disambiguateInitials(displayPlayers), [displayPlayers]);

  const isHoleConfirmedForDisplayGroup = useCallback(
    (holeNumber: number): boolean => {
      if (!displayPlayers.length) return false;
      return displayPlayers.every((p) => {
        const hs = scores.get(p.id)?.find((s) => s.holeNumber === holeNumber);
        return Boolean(hs?.confirmed);
      });
    },
    [displayPlayers, scores]
  );

  const handleConfirmHole = useCallback((holeNumber: number) => {
    const playerIds = displayPlayers.map(p => p.id);
    confirmHole(holeNumber, playerIds);

    // Auto-resolve or recalculate wolf hole on confirm
    if (wolfConfig && wolfHoleStates) {
      const holeState = wolfHoleStates.find(s => s.holeNumber === holeNumber) ?? null;
      if (holeState && holeState.result !== null && onWolfRecalculate) {
        // Score changed after resolution — recalculate
        onWolfRecalculate(holeNumber);
      } else if (holeState && holeState.result === null && onWolfResolve) {
        const wolfTeam = [holeState.wolfPlayerId, ...holeState.partnerIds];
        const rivalTeam = players.filter(p => !wolfTeam.includes(p.id)).map(p => p.id);
        const resolved = resolveWolfHole(
          wolfTeam, rivalTeam, holeNumber, players, scores, course, wolfConfig
        );
        const result = resolved.winner === 'wolf' ? 'won'
          : resolved.winner === 'rival' ? 'lost' : 'tied';
        onWolfResolve(holeNumber, result);
      }
    }

    // Auto-advance to next unconfirmed hole
    const findNextUnconfirmed = (): number | null => {
      for (let h = holeNumber + 1; h <= 18; h++) {
        if (!isHoleConfirmedForDisplayGroup(h)) return h;
      }
      for (let h = 1; h < holeNumber; h++) {
        if (!isHoleConfirmedForDisplayGroup(h)) return h;
      }
      return null;
    };

    const next = findNextUnconfirmed();
    if (next !== null) {
      setTimeout(() => setCurrentHole(next), 350);
    }
  }, [displayPlayers, confirmHole, isHoleConfirmedForDisplayGroup, setCurrentHole, onWolfResolve, onWolfRecalculate, wolfConfig, wolfHoleStates, players, scores, course]);

  // Wolf: check if decision is needed before confirming
  const wolfEnabled = !!(betConfig?.wolfSetup?.enabled);
  const wolfNeedsDecision = !!(
    wolfEnabled &&
    wolfConfig &&
    players.length >= 4 &&
    !wolfHoleStates?.find(s => s.holeNumber === currentHole) &&
    !isHoleConfirmedForDisplayGroup(currentHole)
  );

  return (
    <>
      {/* Group Selector (only if multiple groups) */}
      {hasMultipleGroups && (
        <div className="bg-card border border-border rounded-lg p-2 mb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Capturando scores para:</span>
          </div>
          <GroupSelector
            currentGroupIndex={displayGroupIndex}
            players={players}
            playerGroups={playerGroups}
            onGroupChange={setDisplayGroupIndex}
          />
        </div>
      )}

      {/* Hole Navigation */}
      <HoleNavigationBar currentHole={currentHole} setCurrentHole={setCurrentHole} isHoleConfirmedForDisplayGroup={isHoleConfirmedForDisplayGroup} activeHoles={activeHoles} />

      {/* Sixes Badge */}
      {sixesConfig && sixesConfig.sets && sixesConfig.sets.length > 0 && (
        <SixesActiveBadge
          currentHole={currentHole}
          sixesConfig={sixesConfig}
          players={displayPlayers}
        />
      )}

      {/* Wolf Decision Panel — prominent at top */}
      {wolfEnabled && wolfConfig && players.length >= 4 && (() => {
        // Use wolfConfig (persisted source of truth) for wolf resolution
        const wolfParticipants = wolfConfig?.participantIds ?? [];
        const wolfPlayerOrder = wolfConfig?.playerOrder ?? [];
        const regularWolfPlayerId = wolfPlayerOrder.length > 0
          ? wolfPlayerOrder[(currentHole - 1) % wolfPlayerOrder.length]
          : wolfParticipants.length > 0
            ? wolfParticipants[(currentHole - 1) % wolfParticipants.length]
            : displayPlayers[(currentHole - 1) % displayPlayers.length]?.id ?? '';
        
        // Hole 18 Redemption: identify biggest loser as candidate (optional)
        const isRedemptionHole = currentHole === 18 && betConfig?.wolfSetup?.hole18Redemption;
        let redemptionCandidateId: string | null = null;
        let redemptionCandidateLoss = 0;
        if (isRedemptionHole && wolfHoleStates) {
          const pnl = new Map<string, number>();
          players.forEach(p => pnl.set(p.id, 0));
          wolfHoleStates.filter(s => s.holeNumber <= 17 && s.result && s.result !== 'tied').forEach(state => {
            const amount = state.effectiveAmount ?? wolfConfig.amountPerHole;
            const wolfTeam = [state.wolfPlayerId, ...state.partnerIds];
            const rivalTeam = players.filter(p => !wolfTeam.includes(p.id)).map(p => p.id);
            const winners = state.result === 'won' ? wolfTeam : rivalTeam;
            const losers = state.result === 'won' ? rivalTeam : wolfTeam;
            winners.forEach(w => losers.forEach(l => {
              pnl.set(w, (pnl.get(w) ?? 0) + amount);
              pnl.set(l, (pnl.get(l) ?? 0) - amount);
            }));
          });
          const sorted = [...pnl.entries()].sort((a, b) => a[1] - b[1]);
          if (sorted.length >= 2 && sorted[0][1] < sorted[1][1]) {
            redemptionCandidateId = sorted[0][0];
            redemptionCandidateLoss = sorted[0][1];
          }
        }

        // Don't auto-override; pass candidate info so the panel can offer the choice
        const existingState = wolfHoleStates?.find(s => s.holeNumber === currentHole);
        // Always use rotation-derived wolfId; ignore stale saved wolfPlayerId
        const effectiveWolfId = regularWolfPlayerId;

        return (
          <WolfDecisionPanel
            holeNumber={currentHole}
            players={displayPlayers}
            wolfPlayerId={effectiveWolfId}
            holeState={existingState ?? null}
            wolfConfig={wolfConfig}
            isOrganizer={isOrganizer ?? false}
            currentUserId={currentUserId ?? null}
            onDecision={async (partnerIds, wentSolo) => {
              await onWolfDecision?.(currentHole, partnerIds, wentSolo);
            }}
            onRevert={onWolfRevert}
            isRedemption={false}
            redemptionCandidateId={redemptionCandidateId ?? undefined}
            redemptionCandidateLoss={redemptionCandidateLoss ?? undefined}
            regularWolfPlayerId={regularWolfPlayerId}
          />
        );
      })()}

      {/* Player Score Inputs — wrapped in relative container for floating Oyes */}
      <div className="relative">
        {displayPlayers.map(player => {
          const playerScores = scores.get(player.id) || [];
          const holeScore = playerScores.find(s => s.holeNumber === currentHole);
          const isBasePlayer = player.profileId === profile?.id;
          
          return (
            <PlayerScoreInput
              key={player.id}
              playerName={player.name}
              playerInitials={disambiguatedInitials.get(player.id) || player.initials}
              avatarColor={player.color}
              holeNumber={currentHole}
              par={holePar}
              strokes={holeScore?.strokes ?? holePar}
              putts={holeScore?.putts ?? 2}
              markers={holeScore?.markers || defaultMarkerState}
              onStrokesChange={(strokes) => updateScore(player.id, currentHole, { strokes })}
              onPuttsChange={(putts) => updateScore(player.id, currentHole, { putts })}
              onMarkersChange={(markers) => updateScore(player.id, currentHole, { markers })}
              handicapStrokes={holeScore?.strokesReceived || 0}
              isBasePlayer={isBasePlayer}
              playerId={player.profileId || player.id}
              basePlayerId={profile?.id}
            />
          );
        })}

        {/* Floating Oyes Button — only on Par 3 */}
        {holePar === 3 && (
          <div className="sticky bottom-24 flex justify-end pointer-events-none z-20 -mt-2 mb-2 pr-[4.5rem]">
            <div className="pointer-events-auto">
              <OyesesDialog
                players={displayPlayers}
                betConfig={betConfig}
                basePlayerId={profile?.id}
                currentHole={currentHole}
                isPar3={holePar === 3}
                proximitiesAcumulado={new Map(
                  displayPlayers.map(p => {
                    const hs = scores.get(p.id)?.find(s => s.holeNumber === currentHole);
                    return [p.id, hs?.oyesProximity ?? null];
                  })
                )}
                onProximityAcumuladoChange={(playerId, proximity) => {
                  updateScore(playerId, currentHole, { oyesProximity: proximity });
                }}
                proximitiesSangron={new Map(
                  displayPlayers.map(p => {
                    const hs = scores.get(p.id)?.find(s => s.holeNumber === currentHole);
                    return [p.id, hs?.oyesProximitySangron ?? null];
                  })
                )}
                onProximitySangronChange={(playerId, proximity) => {
                  updateScore(playerId, currentHole, { oyesProximitySangron: proximity });
                }}
                trigger={
                  <button className="h-12 w-12 rounded-full bg-[hsl(155,100%,20%)] text-[hsl(50,95%,55%)] shadow-lg shadow-primary/30 border-2 border-[hsl(50,95%,55%)]/40 flex items-center justify-center animate-pulse hover:animate-none hover:brightness-110 transition-all">
                    <Target className="h-6 w-6" />
                  </button>
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Confirm Button */}
      <Button 
        onClick={() => handleConfirmHole(currentHole)}
        disabled={isHoleConfirmedForDisplayGroup(currentHole) || wolfNeedsDecision}
        className={`w-full ${isHoleConfirmedForDisplayGroup(currentHole) ? 'bg-green-600 hover:bg-green-600' : wolfNeedsDecision ? 'bg-amber-600 hover:bg-amber-600' : 'bg-accent hover:bg-accent/90'}`}
      >
        {wolfNeedsDecision ? (
          <><AlertTriangle className="h-4 w-4 mr-2" /> La Loba debe declarar</>
        ) : isHoleConfirmedForDisplayGroup(currentHole) ? (
          <><CheckCircle2 className="h-4 w-4 mr-2" /> Hoyo Confirmado</>
        ) : (
          <><Check className="h-4 w-4 mr-2" /> Confirmar Scores del Hoyo {currentHole}</>
        )}
      </Button>

      {/* Navigation Buttons and Side Bets */}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={() => setCurrentHole(Math.max(1, currentHole - 1))} disabled={currentHole === 1} className="flex-1 px-2 text-sm">
          ← Ant
        </Button>
        
        {/* Side Bets Button */}
        {onAddSideBet && (
          <SideBetsDialog
            players={getAllPlayersFromAllGroups(players, playerGroups)}
            sideBets={betConfig.sideBets?.bets || []}
            onAddSideBet={onAddSideBet}
            onUpdateSideBet={onUpdateSideBet}
            onDeleteSideBet={onDeleteSideBet}
            basePlayerId={profile?.id}
            currentHole={currentHole}
            trigger={
              <Button variant="outline" size="icon" className="shrink-0">
                <DollarSign className="h-4 w-4" />
              </Button>
            }
          />
        )}
        
        {/* Zoológico Button */}
        {betConfig.zoologico?.enabled && onAddZooEvent && (
          <ZoologicoDialog
            players={getAllPlayersFromAllGroups(players, playerGroups)}
            events={betConfig.zoologico?.events || []}
            enabledAnimals={betConfig.zoologico?.enabledAnimals || ['camello', 'pez', 'gorila']}
            valuePerOccurrence={betConfig.zoologico?.valuePerOccurrence ?? 10}
            onAddEvent={onAddZooEvent}
            onUpdateEvent={onUpdateZooEvent}
            onDeleteEvent={onDeleteZooEvent}
            basePlayerId={profile?.id}
            currentHole={currentHole}
            trigger={
              <Button variant="outline" size="sm" className="shrink-0 px-2 text-lg">
                🐾
              </Button>
            }
          />
        )}

        
        <Button onClick={() => setCurrentHole(Math.min(18, currentHole + 1))} disabled={currentHole === 18} className="flex-1 px-2 text-sm">
          Sig →
        </Button>
      </div>
    </>
  );
};
