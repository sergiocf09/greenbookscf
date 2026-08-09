import { Lock, RefreshCw, CheckCircle2, Play, AlertCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useIsRoundAdmin } from '@/hooks/useIsRoundAdmin';
import { BetSetup } from '@/components/setup/BetSetup';
import { HandicapMatrix } from '@/components/setup/HandicapMatrix';
import { HandicapRankingView } from '@/components/handicap/HandicapRankingView';
import { ScoringView } from '@/components/scoring/ScoringView';
import { Scorecard } from '@/components/scorecard/Scorecard';
import { LeaderboardDialog } from '@/components/LeaderboardDialog';
import { BetDashboard } from '@/components/bets/BetDashboard';
import { DeleteRoundButton } from '@/components/round/DeleteRoundButton';

import { Player, PlayerScore, BetConfig, GolfCourse, PlayerGroup, SideBet, ZooEvent } from '@/types/golf';
import { useWolf } from '@/hooks/useWolf';
import { useSixes } from '@/hooks/useSixes';
import { useVegas } from '@/hooks/useVegas';
import { useNines } from '@/hooks/useNines';

type DialogName =
  | 'profile' | 'history' | 'balances' | 'handicap' | 'handicapHistory'
  | 'scorecard' | 'share' | 'addPlayer' | 'leaderboard' | 'linkLeaderboard'
  | 'handicapMatrix' | 'closeAttempt' | 'closeConfirm' | 'pendingRound'
  | 'friends' | 'addFromFriends' | 'onboarding' | 'help' | 'profileMenuHelp'
  | 'roundShare';

type AppView = 'setup' | 'betsetup' | 'scoring' | 'scorecard'
             | 'bets' | 'handicaps' | 'leaderboards' | 'rankings' | 'stats';

interface PlayViewsProps {
  view: AppView;
  players: Player[];
  playerGroups: PlayerGroup[];
  course: GolfCourse | null;
  scores: Map<string, PlayerScore[]>;
  confirmedHoles: Set<number>;
  betConfig: BetConfig;
  currentHole: number;
  roundState: {
    id: string | null;
    groupId: string | null;
    organizerProfileId: string | null;
    status: string;
  };
  profile: {
    id: string;
    display_name: string;
    initials: string;
    avatar_color: string;
  } | null;
  startingHole: 1 | 10;
  roundPlayerIds: Map<string, string>;
  isRoundStarted: boolean;
  isLoadingHandicaps: boolean;
  isLoading: boolean;
  isClosing: boolean;
  holePar: number;

  // Hooks
  wolfHook: ReturnType<typeof useWolf>;
  sixesHook: ReturnType<typeof useSixes>;
  vegasHook: ReturnType<typeof useVegas>;
  ninesHook: ReturnType<typeof useNines>;

  // Dialogs map (for LeaderboardDialog inside scorecard)
  dialogs: Record<DialogName, boolean>;
  setDialog: (name: DialogName, open: boolean) => void;

  // Handicap helpers
  getStrokesForLocalPair: (a: string, b: string) => number;
  getLocalPairStrokeState: (a: string, b: string) => unknown;
  setStrokesForLocalPair: (a: string, b: string, v: number) => Promise<boolean>;
  getBilateralHandicapsForEngine: () => unknown;
  getStrokeIndicators: (rivalId: string, holeNumber: number) => { receiving: boolean; giving: boolean };

  // Scoring helpers
  setCurrentHole: (h: number) => void;
  isHoleConfirmed: (holeNumber: number) => boolean;
  confirmHole: (holeNumber: number, playerIds?: string[]) => void;
  updateScore: (...args: unknown[]) => void;

  // Mutators
  setBetConfig: React.Dispatch<React.SetStateAction<BetConfig>>;
  setCurrentBetSummaries: (s: unknown[]) => void;
  setQuickScorePlayer: (p: Player | null) => void;

  // Handlers
  onOpenDialog: (name: DialogName) => void;
  onSetView: (v: AppView) => void;
  onResetRoundForReclose: () => void;
  onStartNewRound: () => void;
  crossBets?: import('@/hooks/useCrossBets').CrossBet[];
  onUpdateCrossBetConfig?: (args: { crossBetId: string; betConfig: Record<string, any> }) => Promise<void>;
}

export function PlayViews(props: PlayViewsProps) {
  const {
    view, players, playerGroups, course, scores, confirmedHoles, betConfig,
    currentHole, roundState, profile, startingHole, roundPlayerIds,
    isRoundStarted, isLoadingHandicaps, isLoading, isClosing, holePar,
    wolfHook: wolf, sixesHook: sixes, vegasHook: vegas, ninesHook: nines,
    dialogs, setDialog,
    getStrokesForLocalPair, getLocalPairStrokeState, setStrokesForLocalPair,
    getBilateralHandicapsForEngine, getStrokeIndicators,
    setCurrentHole, isHoleConfirmed, confirmHole, updateScore,
    setBetConfig, setCurrentBetSummaries, setQuickScorePlayer,
    onOpenDialog, onSetView, onResetRoundForReclose, onStartNewRound,
    crossBets, onUpdateCrossBetConfig,
  } = props;

  const adminInfo = useIsRoundAdmin(roundState.id);
  const myGroupCanEdit = adminInfo.canEditGroup(roundState.groupId);
  const showReadOnlyBanner = isRoundStarted && !adminInfo.loading && !myGroupCanEdit && (view === 'scoring' || view === 'handicaps');

  return (
    <>
      {showReadOnlyBanner && (
        <Alert className="mb-3 border-amber-500/40 bg-amber-500/10">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-700 dark:text-amber-400">Modo solo lectura</AlertTitle>
          <AlertDescription className="text-amber-700/90 dark:text-amber-400/90 text-xs">
            Solo el organizador o un co-administrador de tu grupo pueden capturar
            scores y editar handicaps. Las apuestas bilaterales (lápiz / X) sí se
            pueden editar normalmente desde el dashboard.
          </AlertDescription>
        </Alert>
      )}
      {view === 'betsetup' && (() => {
        const isOrg = profile?.id === roundState.organizerProfileId;
        const hasMulti = playerGroups.length > 0;
        const userGid = roundState.groupId || undefined;
        const isSecondary = hasMulti && !isOrg && !!userGid;
        const myGroupPlayers = isSecondary
          ? (playerGroups.find(g => g.id === userGid)?.players || players)
          : players;
        return (
          <BetSetup
            config={betConfig}
            onChange={setBetConfig}
            players={myGroupPlayers}
            hasMultipleGroups={hasMulti}
            userGroupId={userGid}
            isOrganizer={isOrg}
            getStrokesForLocalPair={getStrokesForLocalPair}
            getLocalPairStrokeState={getLocalPairStrokeState as never}
          />
        );
      })()}

      {view === 'handicaps' && (
        <>
          <HandicapMatrix
            players={players}
            playerGroups={playerGroups}
            basePlayerId={profile?.id || ''}
            roundPlayerIds={roundPlayerIds}
            getStrokesForLocalPair={getStrokesForLocalPair}
            getLocalPairStrokeState={getLocalPairStrokeState as never}
            setStrokesForLocalPair={setStrokesForLocalPair}
            isLoading={isLoadingHandicaps}
          />
          <div className="border-t border-border my-4" />
          <h3 className="text-sm font-semibold mb-2">Ranking de Hándicap</h3>
          <HandicapRankingView roundId={roundState.id} />
        </>
      )}

      {view === 'scoring' && course && (
        <ErrorBoundary context="ScoringView">
          <ScoringView
            players={players}
            playerGroups={playerGroups}
            course={course}
            currentHole={currentHole}
            setCurrentHole={setCurrentHole}
            scores={scores}
            confirmedHoles={confirmedHoles}
            isHoleConfirmed={isHoleConfirmed}
            confirmHole={confirmHole}
            updateScore={updateScore as never}
            betConfig={betConfig}
            holePar={holePar}
            profile={profile}
            startingHole={startingHole}
            onAddSideBet={(bet: SideBet) => {
              setBetConfig(prev => ({
                ...prev,
                sideBets: {
                  ...prev.sideBets,
                  enabled: true,
                  bets: [...(prev.sideBets?.bets || []), bet],
                },
              }));
            }}
            onUpdateSideBet={(bet: SideBet) => {
              setBetConfig(prev => ({
                ...prev,
                sideBets: {
                  ...prev.sideBets,
                  bets: (prev.sideBets?.bets || []).map(b => b.id === bet.id ? bet : b),
                },
              }));
            }}
            onDeleteSideBet={(betId: string) => {
              setBetConfig(prev => ({
                ...prev,
                sideBets: {
                  ...prev.sideBets,
                  bets: (prev.sideBets?.bets || []).filter(b => b.id !== betId),
                },
              }));
            }}
            onAddZooEvent={(event: ZooEvent) => {
              setBetConfig(prev => ({
                ...prev,
                zoologico: {
                  ...prev.zoologico,
                  events: [...(prev.zoologico?.events || []), event],
                },
              }));
            }}
            onUpdateZooEvent={(event: ZooEvent) => {
              setBetConfig(prev => ({
                ...prev,
                zoologico: {
                  ...prev.zoologico,
                  events: (prev.zoologico?.events || []).map(e => e.id === event.id ? event : e),
                },
              }));
            }}
            onDeleteZooEvent={(eventId: string) => {
              setBetConfig(prev => ({
                ...prev,
                zoologico: {
                  ...prev.zoologico,
                  events: (prev.zoologico?.events || []).filter(e => e.id !== eventId),
                },
              }));
            }}
            wolfConfig={wolf.wolfConfig ?? undefined}
            wolfHoleStates={wolf.holeStates}
            currentUserId={profile?.id ?? undefined}
            isOrganizer={profile?.id === roundState.organizerProfileId}
            onWolfDecision={async (holeNumber, partnerIds, wentSolo) => {
              const wolfId = wolf.getCurrentWolfId(holeNumber) ?? '';
              await wolf.saveDecision(holeNumber, wolfId, partnerIds, wentSolo);
            }}
            onWolfResolve={async (holeNumber, result) => {
              await wolf.resolveHole(holeNumber, result);
            }}
            onWolfRevert={async (holeNumber) => {
              await wolf.revertDecision(holeNumber);
            }}
            onWolfRecalculate={async (holeNumber) => {
              await wolf.recalculateHole(holeNumber);
            }}
            sixesConfig={sixes.sixesConfig ?? undefined}
          />
        </ErrorBoundary>
      )}

      {view === 'scorecard' && course && (
        <>
          <ErrorBoundary context="Scorecard">
            <Scorecard
              players={players}
              course={course}
              scores={scores}
              currentHole={currentHole}
              onHoleClick={h => { setCurrentHole(h); onSetView('scoring'); }}
              basePlayerId={profile?.id}
              getStrokeIndicators={getStrokeIndicators}
              confirmedHoles={confirmedHoles}
              onAddPlayerClick={() => onOpenDialog('addPlayer')}
              startingHole={startingHole}
              onLeaderboardClick={() => onOpenDialog('leaderboard')}
              playerGroups={playerGroups}
              onQuickScoreClick={(player) => setQuickScorePlayer(player)}
              betConfig={betConfig}
            />

            <LeaderboardDialog
              open={dialogs.leaderboard}
              onOpenChange={(v: boolean) => setDialog('leaderboard', v)}
              players={players}
              playerGroups={playerGroups}
              scores={scores}
              course={course}
              confirmedHoles={confirmedHoles}
              betConfig={betConfig}
              basePlayerId={profile?.id}
            />
          </ErrorBoundary>
        </>
      )}

      {view === 'bets' && course && (
        <>
          <ErrorBoundary context="BetDashboard">
            <BetDashboard
              players={players}
              scores={scores}
              betConfig={betConfig}
              course={course}
              basePlayerId={profile?.id}
              confirmedHoles={confirmedHoles}
              onBetConfigChange={setBetConfig}
              onBetSummariesChange={setCurrentBetSummaries as never}
              startingHole={startingHole}
              playerGroups={playerGroups}
              getStrokesForLocalPair={getStrokesForLocalPair}
              setStrokesForLocalPair={setStrokesForLocalPair}
              getBilateralHandicapsForEngine={getBilateralHandicapsForEngine as never}
              wolfHook={wolf}
              sixesHook={sixes}
              vegasHook={vegas}
              ninesHook={nines}
              crossBets={crossBets}
              onUpdateCrossBetConfig={onUpdateCrossBetConfig}
            />
          </ErrorBoundary>

          {/* Close Scorecard Button - only visible to organizer */}
          {isRoundStarted && roundState.status !== 'completed' && (
            <>
              {profile?.id === roundState.organizerProfileId ? (
                <>
                  <CloseRoundSection
                    onOpenDialog={() => onOpenDialog('closeConfirm')}
                    isLoading={isLoading}
                    isClosing={isClosing}
                  />
                  <div className="mt-2">
                    <DeleteRoundButton
                      roundId={roundState.id}
                      onDeleted={onStartNewRound}
                      disabled={isLoading || isClosing}
                    />
                  </div>
                </>
              ) : (

                <div className="text-center text-muted-foreground text-sm py-4 bg-muted rounded-lg mt-4">
                  Solo el organizador puede cerrar la tarjeta
                </div>
              )}
            </>
          )}

          {roundState.status === 'completed' && (
            <div className="space-y-4">
              <div className="text-center text-muted-foreground text-sm py-4 bg-muted rounded-lg">
                <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-600" />
                Tarjeta cerrada y guardada
              </div>
              {profile?.id === roundState.organizerProfileId && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Re-abrir para re-cerrar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Re-abrir ronda?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esto eliminará el snapshot, ledger y historial de sliding actuales. Podrás cerrar la ronda nuevamente con los datos corregidos.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onResetRoundForReclose()}>
                        Confirmar re-apertura
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              <Button
                onClick={onStartNewRound}
                className="w-full"
              >
                <Play className="h-4 w-4 mr-2" />
                Iniciar Nueva Ronda
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function CloseRoundSection({
  onOpenDialog,
  isLoading,
  isClosing,
}: {
  onOpenDialog: () => void;
  isLoading: boolean;
  isClosing: boolean;
}) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [showJumpBanner, setShowJumpBanner] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('jump_to_close_after_restore') === '1') {
      sessionStorage.removeItem('jump_to_close_after_restore');
      setShowJumpBanner(true);
      // Delay scroll until layout settles
      setTimeout(() => {
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, []);

  return (
    <div ref={sectionRef} className="mt-4 space-y-3">
      {showJumpBanner && (
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-700 dark:text-amber-400">
            Cierra tu tarjeta aquí abajo
          </AlertTitle>
          <AlertDescription className="text-amber-700/90 dark:text-amber-400/90">
            Para cerrar oficialmente tu ronda, usa el botón rojo de abajo
            (deberás escribir <strong>CERRAR</strong> para confirmar). Esto
            sella el resultado y libera a los demás jugadores.
          </AlertDescription>
        </Alert>
      )}
      <Button
        variant="destructive"
        onClick={onOpenDialog}
        disabled={isLoading || isClosing}
        className="w-full"
      >
        <Lock className="h-4 w-4 mr-2" />
        Cerrar Tarjeta y Guardar
      </Button>
    </div>
  );
}
