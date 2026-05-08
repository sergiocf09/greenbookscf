import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { calcHighlightsFromSnapshot } from '@/lib/shareHighlights';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import {
  Player,
  PlayerScore,
  BetConfig,
  GolfCourse,
  PlayerGroup,
  defaultMarkerState,
} from '@/types/golf';
import { RoundShareImageProps } from '@/components/share/RoundShareImage';
import { RoundHistory, CloneRoundData, FullCloneRoundData } from '@/components/RoundHistory';
import { CloseAttemptDialog } from '@/components/close/CloseAttemptDialog';
import { CloseRoundConfirmDialog } from '@/components/close/CloseRoundConfirmDialog';
import { HandicapCalculator } from '@/components/HandicapCalculator';
import { HandicapHistoryView } from '@/components/profile/HandicapHistoryView';
import { HistoricalRoundView } from '@/components/HistoricalRoundView';
import { ShareRoundDialog } from '@/components/ShareRoundDialog';
import { HistoricalBalances } from '@/components/HistoricalBalances';
import { FriendsDialog } from '@/components/friends/FriendsDialog';
import { AddFromFriendsDialog } from '@/components/friends/AddFromFriendsDialog';
import { LinkRoundToLeaderboardDialog } from '@/components/leaderboards/LinkRoundToLeaderboardDialog';
import { QuickScoreEntry } from '@/components/scoring/QuickScoreEntry';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';
import ContextualHelp from '@/components/help/ContextualHelp';
import { Friend } from '@/hooks/useFriends';

type DialogName =
  | 'profile' | 'history' | 'balances' | 'handicap' | 'handicapHistory'
  | 'scorecard' | 'share' | 'addPlayer' | 'leaderboard' | 'linkLeaderboard'
  | 'handicapMatrix' | 'closeAttempt' | 'closeConfirm' | 'pendingRound'
  | 'friends' | 'addFromFriends' | 'onboarding' | 'help' | 'profileMenuHelp'
  | 'roundShare';

type DialogState = Record<DialogName, boolean>;

type AppView =
  | 'setup' | 'betsetup' | 'scoring' | 'scorecard'
  | 'bets' | 'handicaps' | 'leaderboards' | 'rankings' | 'stats';

interface AppDialogsProps {
  // Dialog state
  dialogs: DialogState;
  setDialog: (name: DialogName, open: boolean) => void;
  openDialog: (name: DialogName) => void;
  closeDialog: (name: DialogName) => void;

  // User / round data
  profile: {
    id: string;
    display_name: string;
    initials: string;
    avatar_color: string;
  } | null;
  user: { id: string; is_anonymous?: boolean } | null;
  roundState: {
    id: string | null;
    groupId: string | null;
    organizerProfileId: string | null;
    status: string;
    date: Date;
  };
  course: GolfCourse | null;
  players: Player[];
  playerGroups: PlayerGroup[];
  scores: Map<string, PlayerScore[]>;
  roundPlayerIds: Map<string, string>;
  betConfig: BetConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentBetSummaries: any[];
  view: AppView;

  // Historical / close
  historicalScorecardData: {
    roundId: string;
    courseId: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    players: any[];
    teeColor: string;
    date: string;
  } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastCloseReport: any;
  isClosing: boolean;

  // Leaderboard linking
  leaderboardDetailId: string | null;
  isRoundLinkedToLeaderboard: boolean;
  preselectedLeaderboardId: string | null;

  // Quick score
  quickScorePlayer: Player | null;

  // Friends dialog target
  addFriendsTargetGroupId: string | null;

  // Profile menu interaction
  setProfileMenuOpen: (v: boolean) => void;

  // Functions
  getCourseById: (id: string) => GolfCourse | undefined;
  getStrokesForLocalPair: (a: string, b: string) => number;
  closeScorecard: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    summaries: any[],
    getStrokes: (a: string, b: string) => number
  ) => Promise<boolean>;
  resetToNewRound: () => void;
  handleCloneRound: (data: CloneRoundData) => void;
  handleCloneFullRound: (data: FullCloneRoundData) => Promise<void>;
  handleAddPlayersFromFriends: (players: Array<{
    profileId: string; name: string; initials: string;
    color: string; handicap: number;
  }>) => Promise<void>;
  handleAddPlayersFromFriendsToGroup: (
    groupId: string,
    players: Array<{
      profileId: string; name: string; initials: string;
      color: string; handicap: number;
    }>
  ) => Promise<void>;
  handleAddFriendToRound: (friend: Friend) => void;

  // Setters consumed by dialogs
  setHistoricalScorecardData: (data: AppDialogsProps['historicalScorecardData']) => void;
  setIsRoundLinkedToLeaderboard: (v: boolean) => void;
  setPreselectedLeaderboardId: (id: string | null) => void;
  setQuickScorePlayer: (p: Player | null) => void;
  setAddFriendsTargetGroupId: (id: string | null) => void;
  setScores: (
    fn: (prev: Map<string, PlayerScore[]>) => Map<string, PlayerScore[]>
  ) => void;

  // RoundShare trigger
  setRoundShareData: (
    data: Omit<RoundShareImageProps, 'open' | 'onClose'> | null
  ) => void;
  onOpenRoundShare: () => void;
}

export function AppDialogs(props: AppDialogsProps) {
  const {
    dialogs,
    setDialog,
    openDialog,
    closeDialog,
    profile,
    roundState,
    course,
    players,
    playerGroups,
    scores,
    roundPlayerIds,
    currentBetSummaries,
    view,
    historicalScorecardData,
    lastCloseReport,
    isClosing,
    leaderboardDetailId,
    preselectedLeaderboardId,
    quickScorePlayer,
    addFriendsTargetGroupId,
    setProfileMenuOpen,
    getCourseById,
    getStrokesForLocalPair,
    closeScorecard,
    resetToNewRound,
    handleCloneRound,
    handleCloneFullRound,
    handleAddPlayersFromFriends,
    handleAddPlayersFromFriendsToGroup,
    handleAddFriendToRound,
    setHistoricalScorecardData,
    setIsRoundLinkedToLeaderboard,
    setPreselectedLeaderboardId,
    setQuickScorePlayer,
    setAddFriendsTargetGroupId,
    setScores,
    setRoundShareData,
    onOpenRoundShare,
  } = props;

  return (
    <>
      <Dialog open={dialogs.history} onOpenChange={(v: boolean) => setDialog('history', v)}>
        <DialogContent className="max-w-md px-3 sm:px-6">
          <DialogHeader>
            <DialogTitle>Historial de Rondas</DialogTitle>
          </DialogHeader>
          <RoundHistory
            onClose={() => closeDialog('history')}
            onViewRound={(data) => {
              setHistoricalScorecardData(data);
              closeDialog('history');
              openDialog('scorecard');
            }}
            onCloneRound={handleCloneRound}
            onCloneFullRound={handleCloneFullRound}
          />
        </DialogContent>
      </Dialog>

      <CloseAttemptDialog
        open={dialogs.closeAttempt}
        onOpenChange={(v: boolean) => setDialog('closeAttempt', v)}
        report={lastCloseReport}
        onRetry={
          isClosing
            ? undefined
            : async () => {
                closeDialog('closeAttempt');
                const success = await closeScorecard(currentBetSummaries, getStrokesForLocalPair);
                if (success) {
                  // Reset immediately — share image not available from this path
                  resetToNewRound();
                } else {
                  openDialog('closeAttempt');
                }
              }
        }
      />

      <CloseRoundConfirmDialog
        open={dialogs.closeConfirm}
        onOpenChange={(v: boolean) => setDialog('closeConfirm', v)}
        isLoading={isClosing}
        onConfirm={async () => {
          closeDialog('closeConfirm');
          // Capture roundId before close clears state
          const closingRoundId = roundState.id;
          const closingDate = roundState.date;
          const closingCourseName = course?.name || 'Campo';
          const closingCoursePar = course?.holes.reduce((s, h) => s + h.par, 0) || 72;
          const success = await closeScorecard(currentBetSummaries, getStrokesForLocalPair);
          if (success) {
            // Fetch snapshot from DB after a short delay to get real balances
            setTimeout(async () => {
              try {
                const { data } = await supabase
                  .from('round_snapshots')
                  .select('snapshot_json')
                  .eq('round_id', closingRoundId)
                  .single();
                if (data?.snapshot_json) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const snap = data.snapshot_json as any;

                  setRoundShareData({
                    courseName: snap.courseName || closingCourseName,
                    date: snap.date || format(closingDate, "d 'de' MMMM yyyy", { locale: es }),
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    players: (snap.balances || []).map((b: any) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const p = (snap.players || []).find((pl: any) => pl.id === b.playerId);
                      const vsBalances = b.vsBalances || [];
                      const wonFrom = vsBalances
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .filter((v: any) => v.netAmount > 0)
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .reduce((sum: number, v: any) => sum + v.netAmount, 0);
                      const lostTo = vsBalances
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .filter((v: any) => v.netAmount < 0)
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .reduce((sum: number, v: any) => sum + Math.abs(v.netAmount), 0);
                      return {
                        name: b.playerName,
                        initials: p?.initials || '??',
                        color: p?.color || '#006747',
                        totalNet: b.totalNet ?? 0,
                        totalGross: b.totalGross ?? 0,
                        wonFrom,
                        lostTo,
                        rivalStats: {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          won: vsBalances.filter((v: any) => v.netAmount > 0).length,
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          lost: vsBalances.filter((v: any) => v.netAmount < 0).length,
                        },
                      };
                    }),
                    betTypes: [],
                    coursePar: snap.coursePar || closingCoursePar,
                    roundHoles: (snap?.betConfig?.roundHoles === 9 ? 9 : 18),
                    highlights: calcHighlightsFromSnapshot(snap),
                  });
                  onOpenRoundShare();
                } else {
                  // No snapshot — just reset
                  resetToNewRound();
                }
              } catch (e) {
                console.error('Failed to load snapshot for share image', e);
                resetToNewRound();
              }
            }, 1500);
          } else {
            openDialog('closeAttempt');
          }
        }}
      />

      {/* Handicap Calculator Dialog */}
      <Dialog open={dialogs.handicap} onOpenChange={(v: boolean) => setDialog('handicap', v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Calculadora de Handicap</DialogTitle>
          </DialogHeader>
          <HandicapCalculator onClose={() => closeDialog('handicap')} />
        </DialogContent>
      </Dialog>

      {/* Handicap History Dialog */}
      <Dialog open={dialogs.handicapHistory} onOpenChange={(v: boolean) => setDialog('handicapHistory', v)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de Handicap</DialogTitle>
          </DialogHeader>
          <HandicapHistoryView profileId={profile?.id ?? null} playerName={profile?.display_name} />
        </DialogContent>
      </Dialog>


      <Dialog open={dialogs.scorecard} onOpenChange={(v: boolean) => setDialog('scorecard', v)}>
        <DialogContent className="max-w-lg max-h-[90vh] p-0 overflow-hidden">
          <div className="overflow-y-auto overflow-x-hidden max-h-[90vh] p-6">
          <DialogHeader>
            <DialogTitle>Ronda Histórica</DialogTitle>
          </DialogHeader>
          {historicalScorecardData && getCourseById(historicalScorecardData.courseId) && (
            <HistoricalRoundView
              roundId={historicalScorecardData.roundId}
              courseId={historicalScorecardData.courseId}
              course={getCourseById(historicalScorecardData.courseId)!}
              players={historicalScorecardData.players}
              teeColor={historicalScorecardData.teeColor}
              date={historicalScorecardData.date}
            />
          )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Round Dialog */}
      <Dialog open={dialogs.share} onOpenChange={(v: boolean) => setDialog('share', v)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Invitar Jugadores</DialogTitle>
          </DialogHeader>
          {roundState.id && (
            <ShareRoundDialog
              roundId={roundState.id}
              onClose={() => closeDialog('share')}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Historical Balances Dialog */}
      <Dialog open={dialogs.balances} onOpenChange={(v: boolean) => setDialog('balances', v)}>
        <DialogContent className="max-w-md px-2 sm:px-6">
          <DialogHeader>
            <DialogTitle>Balances Históricos</DialogTitle>
          </DialogHeader>
          <HistoricalBalances
            onClose={() => closeDialog('balances')}
            onViewRound={async (roundId: string) => {
              try {
                // Load round players and scores to navigate to historical view
                const { data: roundData } = await supabase
                  .from('rounds')
                  .select('course_id, tee_color, date')
                  .eq('id', roundId)
                  .single();

                if (!roundData) return;

                const { data: roundPlayers } = await supabase
                  .from('round_players')
                  .select(`
                    id, profile_id, handicap_for_round,
                    guest_name, guest_initials, guest_color,
                    profiles(display_name, initials, avatar_color)
                  `)
                  .eq('round_id', roundId);

                const playerScores = await Promise.all(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (roundPlayers || []).map(async (rp: any) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const profileData = rp.profiles as any;
                    const isGuest = !rp.profile_id;
                    const { data: scores } = await supabase
                      .from('hole_scores')
                      .select('hole_number, strokes, putts, oyes_proximity')
                      .eq('round_player_id', rp.id)
                      .order('hole_number');

                    return {
                      playerId: isGuest ? rp.id : rp.profile_id,
                      playerName: isGuest ? (rp.guest_name || 'Invitado') : (profileData?.display_name || 'Jugador'),
                      initials: isGuest ? (rp.guest_initials || 'IN') : (profileData?.initials || 'XX'),
                      color: isGuest ? (rp.guest_color || '#3B82F6') : (profileData?.avatar_color || '#3B82F6'),
                      handicap: Number(rp.handicap_for_round) || 0,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      scores: (scores || []).map((s: any) => ({
                        holeNumber: s.hole_number,
                        strokes: s.strokes || 0,
                        putts: s.putts || 0,
                        oyesProximity: s.oyes_proximity,
                      })),
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      totalStrokes: scores?.reduce((sum: number, s: any) => sum + (s.strokes || 0), 0) || 0,
                    };
                  })
                );

                setHistoricalScorecardData({
                  roundId,
                  courseId: roundData.course_id,
                  players: playerScores,
                  teeColor: roundData.tee_color,
                  date: roundData.date,
                });
                closeDialog('balances');
                openDialog('scorecard');
              } catch (err) {
                console.error('Error loading round:', err);
              }
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Friends Dialog */}
      <FriendsDialog
        open={dialogs.friends}
        onOpenChange={(v: boolean) => setDialog('friends', v)}
        onAddToRound={handleAddFriendToRound}
        hasActiveRound={Boolean(roundState.id)}
      />

      {/* Add From Friends Dialog (for setup/scorecard) */}
      <AddFromFriendsDialog
        open={dialogs.addFromFriends}
        onOpenChange={(open) => {
          setDialog('addFromFriends', open);
          if (!open) setAddFriendsTargetGroupId(null);
        }}
        onAddPlayers={(selectedPlayers) => {
          if (addFriendsTargetGroupId) {
            void handleAddPlayersFromFriendsToGroup(addFriendsTargetGroupId, selectedPlayers);
          } else {
            void handleAddPlayersFromFriends(selectedPlayers);
          }
        }}
        existingPlayerIds={[
          ...players.map(p => p.profileId || p.id),
          ...playerGroups.flatMap(g => g.players.map(p => p.profileId || p.id)),
        ]}
        multiSelect={true}
      />

      {/* Bet Setup removed from here – now rendered inline as a tab view in main content */}

      {/* Link Round to Leaderboard Dialog */}
      <LinkRoundToLeaderboardDialog
        open={dialogs.linkLeaderboard}
        onOpenChange={async (open) => {
          setDialog('linkLeaderboard', open);
          if (!open) {
            setPreselectedLeaderboardId(null);
            // Recheck link status after dialog closes
            if (leaderboardDetailId && roundState.id) {
              const { data } = await supabase
                .from('leaderboard_rounds')
                .select('id')
                .eq('leaderboard_id', leaderboardDetailId)
                .eq('round_id', roundState.id)
                .maybeSingle();
              setIsRoundLinkedToLeaderboard(!!data);
            }
          }
        }}
        roundId={roundState.id}
        players={players}
        playerGroups={playerGroups}
        profileId={profile?.id}
        preselectedLeaderboardId={preselectedLeaderboardId}
      />

      {/* Quick Score Entry Dialog */}
      {quickScorePlayer && course && (() => {
        // Calculate holes confirmed by OTHER players (excluding the quick score player)
        const otherPlayers = players.filter(p => p.id !== quickScorePlayer.id);
        const holesConfirmedByOthers = new Set<number>();

        if (otherPlayers.length > 0) {
          for (let h = 1; h <= 18; h++) {
            // A hole is "round confirmed" if at least one other player has confirmed it
            const someOtherConfirmed = otherPlayers.some(p => {
              const playerScores = scores.get(p.id) || [];
              const holeScore = playerScores.find(s => s.holeNumber === h);
              return holeScore?.confirmed === true;
            });
            if (someOtherConfirmed) {
              holesConfirmedByOthers.add(h);
            }
          }
        }

        return (
        <QuickScoreEntry
          open={Boolean(quickScorePlayer)}
          onOpenChange={(open) => !open && setQuickScorePlayer(null)}
          playerName={quickScorePlayer.name}
          playerInitials={quickScorePlayer.initials}
          playerColor={quickScorePlayer.color}
          playerId={quickScorePlayer.id}
          course={course}
          currentScores={scores.get(quickScorePlayer.id) || []}
          roundConfirmedHoles={holesConfirmedByOthers}
          onSaveScores={async (newScores) => {
            const playerId = quickScorePlayer.id;
            const rpId = roundPlayerIds.get(playerId);

            // Update local state
            setScores(prev => {
              const next = new Map(prev);
              const existing = next.get(playerId) || [];
              const updated = [...existing];

              for (const s of newScores) {
                const idx = updated.findIndex(x => x.holeNumber === s.holeNumber);
                const strokesPerHole = calculateStrokesPerHole(quickScorePlayer.handicap, course);
                const strokesReceived = strokesPerHole[s.holeNumber - 1] || 0;

                const scoreData: PlayerScore = {
                  playerId,
                  holeNumber: s.holeNumber,
                  strokes: s.strokes,
                  putts: s.putts,
                  markers: idx >= 0 ? updated[idx].markers : { ...defaultMarkerState },
                  strokesReceived,
                  netScore: s.strokes - strokesReceived,
                  confirmed: true,
                };

                if (idx >= 0) {
                  updated[idx] = scoreData;
                } else {
                  updated.push(scoreData);
                }
              }

              next.set(playerId, updated);
              return next;
            });

            // Persist to database
            if (rpId && roundState.id) {
              const strokesPerHole = calculateStrokesPerHole(quickScorePlayer.handicap, course);
              const scoreRecords = newScores.map(s => ({
                round_player_id: rpId,
                hole_number: s.holeNumber,
                strokes: s.strokes,
                putts: s.putts,
                strokes_received: strokesPerHole[s.holeNumber - 1] || 0,
                net_score: s.strokes - (strokesPerHole[s.holeNumber - 1] || 0),
                confirmed: true,
              }));

              await supabase
                .from('hole_scores')
                .upsert(scoreRecords, { onConflict: 'round_player_id,hole_number', ignoreDuplicates: false });
            }
          }}
        />
        );
      })()}
      <OnboardingWizard open={dialogs.onboarding} onClose={() => closeDialog('onboarding')} />
      <ContextualHelp view={view} open={dialogs.help} onClose={() => closeDialog('help')} />

      {/* Profile Menu Help Dialog */}
      <Dialog open={dialogs.profileMenuHelp} onOpenChange={(open) => {
        setDialog('profileMenuHelp', open);
        if (!open) {
          // Reabrir el menú de perfil al cerrar el help
          setProfileMenuOpen(true);
        }
      }}>
        <DialogContent className="max-w-sm max-h-[calc(100vh-4rem)] mt-14 top-0 translate-y-0 flex flex-col">
          <DialogHeader>
            <DialogTitle>Menú de perfil</DialogTitle>
          </DialogHeader>
          <ul className="space-y-3 mt-2 overflow-y-auto flex-1 pr-1">
            <li className="flex gap-3 text-sm"><span>🌙</span><span><strong>Modo oscuro / Modo claro</strong> — Alterna entre el tema oscuro y claro de la app. Tu preferencia se guarda automáticamente.</span></li>
            <li className="flex gap-3 text-sm"><span>⚙️</span><span><strong>Perfil</strong> — Edita tu nombre, iniciales, color de avatar y handicap actual</span></li>
            <li className="flex gap-3 text-sm"><span>#️⃣</span><span><strong>Unirse con Código</strong> — Ingresa el código o escanea el QR de una ronda para unirte como jugador</span></li>
            <li className="flex gap-3 text-sm"><span>🏆</span><span><strong>Leaderboards</strong> — Crea tus propios leaderboards e invita a otros jugadores a unirse a tu competencia con un código. Consulta rankings, resultados acumulados y el desempeño de cada participante ronda a ronda.</span></li>
            <li className="flex gap-3 text-sm"><span>📊</span><span><strong>Rankings</strong> — Consulta el Scoring Ranking (Handicap Index USGA, promedio y mejor score) y crea Rankings de Dinero para rastrear balances bilaterales entre los miembros de tu grupo con filtros por período.</span></li>
            <li className="flex gap-3 text-sm"><span>📋</span><span><strong>Historial de Rondas</strong> — Consulta todas tus rondas anteriores con scorecard y resultados de apuestas</span></li>
            <li className="flex gap-3 text-sm"><span>💰</span><span><strong>Balances Históricos</strong> — Ve cuánto has ganado o perdido con cada jugador a lo largo del tiempo</span></li>
            <li className="flex gap-3 text-sm"><span>▶️</span><span><strong>Rondas Pendientes</strong> — Rondas que iniciaste y no has cerrado todavía (aparece solo si hay pendientes)</span></li>
            <li className="flex gap-3 text-sm"><span>🧮</span><span><strong>Calcular Handicap</strong> — Calcula tu Handicap Index USGA con tus rondas recientes</span></li>
            <li className="flex gap-3 text-sm"><span>📉</span><span><strong>Historial de Handicap</strong> — Ve cómo ha evolucionado tu handicap ronda a ronda</span></li>
            <li className="flex gap-3 text-sm"><span>🚪</span><span><strong>Cerrar Sesión</strong></span></li>
          </ul>
          <div className="pt-3 border-t border-border">
            <Button variant="outline" className="w-full" onClick={() => closeDialog('profileMenuHelp')}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
