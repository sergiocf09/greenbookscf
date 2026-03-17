import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { disambiguateInitials } from '@/lib/playerInput';
import { Player, PlayerScore, BetConfig, GolfCourse, PlayerGroup, MarkerState, SideBet, ZooEvent } from '@/types/golf';
import { defaultMarkerState } from '@/types/golf';
import { PlayerScoreInput } from '@/components/scoring/PlayerScoreInput';
import { GroupSelector, getPlayersForGroup, getAllPlayersFromAllGroups } from '@/components/GroupSelector';
import { SideBetsDialog } from '@/components/scoring/SideBetsDialog';
import { OyesesDialog } from '@/components/scoring/OyesesDialog';
import { ZoologicoDialog } from '@/components/scoring/ZoologicoDialog';
import { Button } from '@/components/ui/button';
import { Check, CheckCircle2, DollarSign, Target } from 'lucide-react';

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
  // Zoologico handlers
  onAddZooEvent?: (event: ZooEvent) => void;
  onUpdateZooEvent?: (event: ZooEvent) => void;
  onDeleteZooEvent?: (eventId: string) => void;
  
}

/** Hole nav bar that auto-scrolls to center the active hole */
const HoleNavigationBar: React.FC<{
  currentHole: number;
  setCurrentHole: (hole: number) => void;
  isHoleConfirmedForDisplayGroup: (hole: number) => boolean;
}> = ({ currentHole, setCurrentHole, isHoleConfirmedForDisplayGroup }) => {
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
      {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => {
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
}) => {
  // State for which group to display (0 = main group, 1+ = additional groups)
  const [displayGroupIndex, setDisplayGroupIndex] = useState(0);
  
  const hasMultipleGroups = playerGroups.length > 0;
  
  // Get players to display based on selected group, with logged-in player first
  const displayPlayers = useMemo(() => {
    const groupPlayers = getPlayersForGroup(displayGroupIndex, players, playerGroups);
    
    // Sort to put logged-in player first
    if (!profile?.id) return groupPlayers;
    
    return [...groupPlayers].sort((a, b) => {
      const aIsBase = a.profileId === profile.id;
      const bIsBase = b.profileId === profile.id;
      if (aIsBase && !bIsBase) return -1;
      if (!aIsBase && bIsBase) return 1;
      return 0;
    });
  }, [displayGroupIndex, players, playerGroups, profile?.id]);
  
  // Get all players for confirmation check (a hole is confirmed when ALL players have confirmed)
  const allPlayers = useMemo(() => {
    return getAllPlayersFromAllGroups(players, playerGroups);
  }, [players, playerGroups]);

  const disambiguatedInitials = useMemo(() => disambiguateInitials(displayPlayers), [displayPlayers]);

  // Check if hole is confirmed for the CURRENTLY DISPLAYED group only
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

  // Confirm hole for the currently displayed group's players
  const handleConfirmHole = useCallback((holeNumber: number) => {
    const playerIds = displayPlayers.map(p => p.id);
    confirmHole(holeNumber, playerIds);
  }, [displayPlayers, confirmHole]);

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
      <HoleNavigationBar currentHole={currentHole} setCurrentHole={setCurrentHole} isHoleConfirmedForDisplayGroup={isHoleConfirmedForDisplayGroup} />

      {/* Help button row */}
      <div className="flex justify-end -mt-1 mb-1">
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded-full hover:bg-muted/50"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          Ayuda
        </button>
      </div>

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
                players={getAllPlayersFromAllGroups(players, playerGroups)}
                betConfig={betConfig}
                basePlayerId={profile?.id}
                currentHole={currentHole}
                isPar3={holePar === 3}
                proximitiesAcumulado={new Map(
                  getAllPlayersFromAllGroups(players, playerGroups).map(p => {
                    const hs = scores.get(p.id)?.find(s => s.holeNumber === currentHole);
                    return [p.id, hs?.oyesProximity ?? null];
                  })
                )}
                onProximityAcumuladoChange={(playerId, proximity) => {
                  updateScore(playerId, currentHole, { oyesProximity: proximity });
                }}
                proximitiesSangron={new Map(
                  getAllPlayersFromAllGroups(players, playerGroups).map(p => {
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
        disabled={isHoleConfirmedForDisplayGroup(currentHole)}
        className={`w-full ${isHoleConfirmedForDisplayGroup(currentHole) ? 'bg-green-600 hover:bg-green-600' : 'bg-accent hover:bg-accent/90'}`}
      >
        {isHoleConfirmedForDisplayGroup(currentHole) ? (
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

      {/* Help Sheet */}
      <Sheet open={showHelp} onOpenChange={(o) => { if (!o) setShowHelp(false); }}>
        <SheetContent side="top" className="max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              <div className="flex items-center gap-2">
                <span>📓</span>
                <span>Captura de Scores</span>
              </div>
            </SheetTitle>
            <SheetDescription>Ayuda de captura</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 mt-4 text-sm text-muted-foreground">
            {[
              'Navega entre hoyos tocando el número en la barra superior. Los hoyos confirmados aparecen en verde.',
              'Para cada jugador ingresa los golpes (strokes) y los putts del hoyo. Los badges de birdie 🐦, águila 🦅 y doble dígito 🔟 se detectan automáticamente al capturar.',
              'Toca el ícono de marcadores junto a cada jugador para registrar manualmente: Sandy Par 🏖️, Aqua Par 💧, Hole Out 🎯, Doble OB 🚫, Trampa ⚠️, Pinkies 👠, Paloma 💨, Retruje ↩️, Moreliana 🎭 y más.',
              'En hoyos par 3, si la apuesta de Oyeses está activa aparece el botón 🎯 flotante — tócalo para registrar el orden de proximidad al pin de todos los jugadores.',
              'Cuando estén capturados todos los golpes y putts del hoyo, toca "Confirmar Scores del Hoyo" — solo los hoyos confirmados entran al cálculo de apuestas.',
              'Usa los botones "← Ant" y "Sig →" para moverte entre hoyos, o toca directamente el número en la barra de navegación.',
              'Si hay grupos adicionales en la ronda, aparece un selector arriba para cambiar de grupo y capturar sus scores.',
              'El botón 💲 permite agregar Side Bets manuales para apuestas extra no contempladas en la configuración. El botón 🐾 registra incidencias del Zoológico si esa apuesta está activa.',
            ].map((item, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-primary font-bold">•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
