import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Loader2, LayoutGrid, Trophy, AlertCircle, Share2 } from 'lucide-react';
import { RoundShareImage } from '@/components/share/RoundShareImage';
import { calcHighlightsFromSnapshot } from '@/lib/shareHighlights';
import { supabase } from '@/integrations/supabase/client';
import { HistoricalScorecard } from './HistoricalScorecard';
import { BetDashboard } from './bets/BetDashboard';
import { GolfCourse, Player, PlayerScore, BetConfig, MarkerState, defaultMarkerState, PlayerGroup, WolfConfig, WolfHoleState } from '@/types/golf';
import { defaultBetConfig } from './setup/BetSetup';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { RoundSnapshot, isValidSnapshot, SnapshotHoleScore, SnapshotPlayer, SnapshotGroup } from '@/lib/roundSnapshot';
import { filterSnapshotByGroup, filterSnapshotCrossGroup, snapshotHasCrossGroupData } from '@/lib/snapshotGroupFilter';
import { devError, devLog, devWarn } from '@/lib/logger';
import { parseLocalDate } from '@/lib/dateUtils';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { cn } from '@/lib/utils';
import { formatPlayerName } from '@/lib/playerInput';

interface PlayerScoreData {
  playerId: string;
  playerName: string;
  initials: string;
  color: string;
  handicap: number;
  profileId?: string | null;
  teeColor?: string;
  scores: { holeNumber: number; strokes: number; putts: number; oyesProximity?: number | null }[];
  totalStrokes: number;
}

interface HistoricalRoundViewProps {
  roundId: string;
  courseId: string;
  players: PlayerScoreData[];
  teeColor: string;
  date: string;
  course: GolfCourse;
}

export const HistoricalRoundView: React.FC<HistoricalRoundViewProps> = ({
  roundId,
  courseId,
  players: fallbackPlayers,
  teeColor,
  date,
  course,
}) => {
  const { profile } = useAuth();
  const currentUserProfileId = profile?.id ?? null;
  const [activeTab, setActiveTab] = useState<'scorecard' | 'bets' | 'leaderboards'>('scorecard');

  type RoundLeaderboard = {
    id: string;
    name: string;
    competition_type: string;
    status: string;
    myPosition: number | null;
    myNetVsPar: number | null;
    myGrossTotal: number | null;
    totalParticipants: number;
    topStandings: Array<{
      display_name: string;
      initials: string;
      avatar_color: string;
      netVsPar: number;
      grossTotal: number;
      isMe: boolean;
    }>;
  };
  const [roundLeaderboards, setRoundLeaderboards] = useState<RoundLeaderboard[]>([]);
  const [showShare, setShowShare] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [snapshot, setSnapshot] = useState<RoundSnapshot | null>(null);
  
  // Group selector for multi-group rounds: 'g0', 'g1', ..., 'cross'
  const [historicalGroupTab, setHistoricalGroupTab] = useState<string>('g0');
  
  // Fallback state for rounds without snapshot
  const [betConfig, setBetConfig] = useState<BetConfig>(defaultBetConfig);
  const [markers, setMarkers] = useState<Map<string, Map<number, MarkerState>>>(new Map());

  // ── Wolf data for historical rendering ─────────────────────────────────────
  const [historicalWolfConfig, setHistoricalWolfConfig] = useState<WolfConfig | null>(null);
  const [historicalWolfHoleStates, setHistoricalWolfHoleStates] = useState<WolfHoleState[]>([]);

  useEffect(() => {
    const fetchWolfData = async () => {
      try {
        const [{ data: cfg }, { data: states }] = await Promise.all([
          supabase.from('wolf_config').select('*').eq('round_id', roundId).maybeSingle(),
          supabase.from('wolf_hole_state').select('*').eq('round_id', roundId).order('hole_number'),
        ]);
        if (cfg) {
          setHistoricalWolfConfig({
            roundId: cfg.round_id,
            amountPerHole: cfg.amount_per_hole,
            scoringMode: cfg.scoring_mode as WolfConfig['scoringMode'],
            useHandicap: cfg.use_handicap,
            timing: cfg.timing as WolfConfig['timing'],
            carryover: cfg.carryover,
            playerOrder: (cfg as any).player_order ?? [],
            participantIds: (cfg as any).participant_ids ?? [],
            playerHandicaps: (cfg as any).player_handicaps ?? [],
          });
        }
        if (states) {
          setHistoricalWolfHoleStates(states.map(s => ({
            roundId: s.round_id,
            holeNumber: s.hole_number,
            wolfPlayerId: s.wolf_player_id,
            partnerIds: s.partner_ids ?? [],
            wentSolo: s.went_solo,
            result: (s.result as WolfHoleState['result']) ?? null,
            effectiveAmount: s.effective_amount ?? null,
            carryoverHoles: s.carryover_holes ?? 0,
          })));
        }
      } catch (err) {
        devError('[HistoricalRoundView] Error fetching wolf data:', err);
      }
    };
    fetchWolfData();
  }, [roundId]);

  // Fetch snapshot — this is the ONLY source of truth for historical views.
  useEffect(() => {
    const fetchRoundData = async () => {
      try {
        const { data: snapshotData, error: snapshotError } = await supabase
          .from('round_snapshots')
          .select('snapshot_json')
          .eq('round_id', roundId)
          .maybeSingle();

        if (!snapshotError && snapshotData?.snapshot_json) {
          const snap = snapshotData.snapshot_json as unknown;
          if (isValidSnapshot(snap)) {
            if (!(snap as any).meta?.noRecalcContract) {
              devWarn('[noRecalcContract] Legacy snapshot — rendering from snapshot data only.', roundId);
            } else {
              devLog('[noRecalcContract] ✅ Snapshot V3 verified.', roundId);
            }
            setSnapshot(snap);
            setHasSnapshot(true);
            setLoading(false);
            return;
          }
        }

        devWarn('[noRecalcContract] No snapshot found for round:', roundId);

        const { data: roundData, error: roundError } = await supabase
          .from('rounds')
          .select('bet_config')
          .eq('id', roundId)
          .single();

        if (roundError) throw roundError;

        if (roundData?.bet_config) {
          const loadedConfig = roundData.bet_config as any;
          setBetConfig({
            ...defaultBetConfig,
            ...loadedConfig,
            medal: { ...defaultBetConfig.medal, ...loadedConfig.medal },
            pressures: { ...defaultBetConfig.pressures, ...loadedConfig.pressures },
            skins: { ...defaultBetConfig.skins, ...loadedConfig.skins },
            caros: { ...defaultBetConfig.caros, ...loadedConfig.caros },
            oyeses: { ...defaultBetConfig.oyeses, ...loadedConfig.oyeses },
            units: { ...defaultBetConfig.units, ...loadedConfig.units },
            manchas: { ...defaultBetConfig.manchas, ...loadedConfig.manchas },
            culebras: { ...defaultBetConfig.culebras, ...loadedConfig.culebras },
            pinguinos: { ...defaultBetConfig.pinguinos, ...loadedConfig.pinguinos },
            rayas: { ...defaultBetConfig.rayas, ...loadedConfig.rayas },
            carritos: { ...defaultBetConfig.carritos, ...loadedConfig.carritos },
            medalGeneral: { ...defaultBetConfig.medalGeneral, ...loadedConfig.medalGeneral },
            coneja: { ...defaultBetConfig.coneja, ...loadedConfig.coneja },
            putts: { ...defaultBetConfig.putts, ...loadedConfig.putts },
            sideBets: { ...defaultBetConfig.sideBets, ...loadedConfig.sideBets },
            stableford: { ...defaultBetConfig.stableford, ...loadedConfig.stableford },
            teamPressures: { ...defaultBetConfig.teamPressures, ...loadedConfig.teamPressures },
          });
        }
      } catch (err) {
        devError('[HistoricalRoundView] Error fetching snapshot:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRoundData();
  }, [roundId]);

  // ── Competitions (leaderboards) linked to this round ─────────────────────
  const { competitions: roundLeaderboards } =
    useHistoricalCompetitions(roundId, currentUserProfileId);



  // ── All snapshot players (unfiltered) ──────────────────────────────────────
  const allSnapshotPlayers: Player[] = useMemo(() => {
    if (hasSnapshot && snapshot) {
      return snapshot.players.map((p: SnapshotPlayer) => ({
        id: p.id,
        name: p.name,
        initials: p.initials,
        color: p.color,
        handicap: p.handicap,
        profileId: p.profileId || undefined,
        groupId: p.groupId,
        teeColor: p.teeColor,
      }));
    }
    return fallbackPlayers.map(p => ({
      id: p.playerId,
      name: p.playerName,
      initials: p.initials,
      color: p.color,
      handicap: p.handicap,
      profileId: p.playerId,
    }));
  }, [hasSnapshot, snapshot, fallbackPlayers]);

  // ── All scores (unfiltered) ────────────────────────────────────────────────
  const allScores: Map<string, PlayerScore[]> = useMemo(() => {
    const scoresMap = new Map<string, PlayerScore[]>();
    
    if (hasSnapshot && snapshot) {
      Object.entries(snapshot.scores).forEach(([playerId, scores]) => {
        const playerScores: PlayerScore[] = (scores as SnapshotHoleScore[]).map(s => ({
          playerId,
          holeNumber: s.holeNumber,
          strokes: s.strokes,
          putts: s.putts,
          markers: { ...defaultMarkerState, ...s.markers } as MarkerState,
          strokesReceived: s.strokesReceived,
          oyesProximity: s.oyesProximity ?? null,
          netScore: s.netScore,
          confirmed: true,
        }));
        scoresMap.set(playerId, playerScores);
      });
      return scoresMap;
    }
    
    // Legacy fallback
    const strokesPerHoleByPlayer: Record<string, number[]> = {};
    allSnapshotPlayers.forEach(player => {
      strokesPerHoleByPlayer[player.id] = calculateStrokesPerHole(player.handicap, course);
    });
    
    fallbackPlayers.forEach(player => {
      const playerScores: PlayerScore[] = player.scores.map(s => {
        const hole = course.holes.find(h => h.number === s.holeNumber);
        const par = hole?.par || 4;
        const strokesReceived = strokesPerHoleByPlayer[player.playerId]?.[s.holeNumber - 1] || 0;
        const playerMarkers = markers.get(player.playerId)?.get(s.holeNumber) || defaultMarkerState;
        
        const toPar = s.strokes - par;
        const detectedMarkers: MarkerState = {
          ...playerMarkers,
          birdie: s.strokes > 0 && toPar === -1,
          eagle: s.strokes > 0 && toPar === -2,
          albatross: s.strokes > 0 && toPar <= -3,
          cuatriput: s.strokes > 0 && s.putts >= 4,
          culebra: s.strokes > 0 && s.putts >= 3,
        };
        
        return {
          playerId: player.playerId,
          holeNumber: s.holeNumber,
          strokes: s.strokes,
          putts: s.putts,
          markers: detectedMarkers,
          strokesReceived,
          oyesProximity: s.oyesProximity ?? null,
          netScore: s.strokes - strokesReceived,
          confirmed: true,
        };
      });
      
      scoresMap.set(player.playerId, playerScores);
    });
    
    return scoresMap;
  }, [hasSnapshot, snapshot, fallbackPlayers, course, allSnapshotPlayers, markers]);

  // ── Multi-group detection ──────────────────────────────────────────────────
  const hasMultipleGroups = !!(hasSnapshot && snapshot?.groups && snapshot.groups.length > 1);

  const hasCrossGroupData = useMemo(() => {
    if (!hasMultipleGroups || !snapshot) return false;
    return snapshotHasCrossGroupData(snapshot);
  }, [hasMultipleGroups, snapshot]);

  // ── Group-filtered view ────────────────────────────────────────────────────
  const groupView = useMemo(() => {
    if (!hasMultipleGroups || !snapshot) return null;

    if (historicalGroupTab === 'cross') {
      return filterSnapshotCrossGroup(snapshot, allSnapshotPlayers);
    }

    const groupIndex = parseInt(historicalGroupTab.replace('g', ''), 10);
    return filterSnapshotByGroup(snapshot, groupIndex, allSnapshotPlayers);
  }, [hasMultipleGroups, snapshot, historicalGroupTab, allSnapshotPlayers]);

  // ── Effective data for rendering (filtered or full) ────────────────────────
  const viewPlayers = useMemo(() => {
    if (groupView) return groupView.players;
    // Single-group: all players go to main, no playerGroups
    return allSnapshotPlayers;
  }, [groupView, allSnapshotPlayers]);

  const viewScores = useMemo(() => {
    if (!groupView) return allScores;
    const filtered = new Map<string, PlayerScore[]>();
    for (const pid of groupView.playerIds) {
      const ps = allScores.get(pid);
      if (ps) filtered.set(pid, ps);
    }
    return filtered;
  }, [groupView, allScores]);

  const viewBalances = groupView?.balances || (snapshot?.balances);
  const viewLedger = groupView?.ledger || (snapshot?.ledger);
  const viewPairBreakdowns = groupView?.pairBreakdowns || (snapshot?.pairBreakdowns);
  const viewPairSegmentResults = groupView?.pairSegmentResults || (snapshot?.pairSegmentResults);

  // ── Bilateral handicaps (filtered) ─────────────────────────────────────────
  const viewBilateralHandicaps = useMemo(() => {
    if (!hasSnapshot || !snapshot?.bilateralHandicaps) return [];

    const allHandicaps = snapshot.bilateralHandicaps
      .filter((h) => h && typeof h.strokesGivenByA === 'number')
      .map((h) => {
        const strokes = h.strokesGivenByA;
        if (strokes >= 0) {
          return {
            playerAId: h.playerAId,
            playerBId: h.playerBId,
            playerAHandicap: 0,
            playerBHandicap: strokes,
          };
        }
        return {
          playerAId: h.playerAId,
          playerBId: h.playerBId,
          playerAHandicap: Math.abs(strokes),
          playerBHandicap: 0,
        };
      });

    if (!groupView) return allHandicaps;

    // Filter to only pairs within the current view
    return allHandicaps.filter(
      h => groupView.playerIds.has(h.playerAId) && groupView.playerIds.has(h.playerBId),
    );
  }, [hasSnapshot, snapshot, groupView]);

  // ── Scorecard data (filtered by group) ─────────────────────────────────────
  const scorecardPlayers: PlayerScoreData[] = useMemo(() => {
    if (!hasSnapshot || !snapshot) return fallbackPlayers;

    // Scorecard always shows ALL players (all groups), sorted by gross score (best first)
    return allSnapshotPlayers
      .map(p => {
        const scores = (snapshot.scores[p.id] || []) as SnapshotHoleScore[];
        return {
          playerId: p.id,
          playerName: p.name,
          initials: p.initials,
          color: p.color,
          handicap: p.handicap,
          teeColor: (p as any).teeColor,
          scores: scores.map(s => ({
            holeNumber: s.holeNumber,
            strokes: s.strokes,
            putts: s.putts,
            oyesProximity: s.oyesProximity,
          })),
          totalStrokes: scores.reduce((sum, s) => sum + (s.strokes || 0), 0),
        };
      })
      .sort((a, b) => {
        // Players with 0 total (no scores) go last
        if (a.totalStrokes === 0 && b.totalStrokes > 0) return 1;
        if (b.totalStrokes === 0 && a.totalStrokes > 0) return -1;
        return a.totalStrokes - b.totalStrokes;
      });
  }, [hasSnapshot, snapshot, allSnapshotPlayers, fallbackPlayers]);

  // ── Bet config ─────────────────────────────────────────────────────────────
  const effectiveBetConfig = useMemo(() => {
    if (hasSnapshot && snapshot) return snapshot.betConfig;
    return betConfig;
  }, [hasSnapshot, snapshot, betConfig]);

  // All 18 holes confirmed for historical view
  const confirmedHoles = useMemo(() => {
    return new Set(Array.from({ length: 18 }, (_, i) => i + 1));
  }, []);

  // Display data — the tee shown is the VIEWER's own tee (not the round default),
  // falling back to the round tee when the viewer didn't play the round.
  const TEE_LABEL_ES: Record<string, string> = {
    blue: 'Azul', white: 'Blanco', yellow: 'Dorado', red: 'Rojo', black: 'Negro', gold: 'Dorado',
  };

  const displayData = useMemo(() => {
    const base = hasSnapshot && snapshot
      ? { courseName: snapshot.courseName, date: snapshot.date, roundTee: snapshot.teeColor }
      : { courseName: course.name, date, roundTee: teeColor };

    // Prefer the tee of the logged-in player as recorded per player.
    // Priority: snapshot per-player tee → per-player tee from the DB (round_players,
    // passed in as `teeColor` by the history list) → round default tee.
    const ownTee =
      (currentUserProfileId
        ? (allSnapshotPlayers.find((p: any) => p.profileId === currentUserProfileId) as any)?.teeColor
        : undefined) ??
      (currentUserProfileId
        ? (fallbackPlayers as any[]).find((p: any) => p.profileId === currentUserProfileId)?.teeColor
        : undefined) ??
      teeColor;

    const rawTee = ownTee || base.roundTee;
    return {
      courseName: base.courseName,
      date: base.date,
      teeColor: rawTee,
      teeLabel: TEE_LABEL_ES[rawTee] ?? rawTee,
    };
  }, [hasSnapshot, snapshot, course.name, teeColor, date, allSnapshotPlayers, fallbackPlayers, currentUserProfileId]);


  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center pb-2 border-b border-border">
        <h3 className="font-semibold text-lg text-primary">{displayData.courseName}</h3>
        <p className="text-sm text-muted-foreground">
          {format(parseLocalDate(displayData.date), "d 'de' MMMM, yyyy", { locale: es })} • Tee {displayData.teeLabel}
        </p>
        {hasSnapshot && (
          <div className="flex items-center justify-center gap-2 mt-1">
            <p className="text-xs text-green-600 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Vista histórica inmutable
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setShowShare(true)}
            >
              <Share2 className="h-3 w-3 mr-1" />
              Compartir
            </Button>
          </div>
        )}
        {!hasSnapshot && (
          <p className="text-xs text-amber-600 mt-1 flex items-center justify-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Ronda anterior al sistema de snapshots
          </p>
        )}
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'scorecard' | 'bets' | 'leaderboards')}>
        <TabsList className={`grid w-full ${roundLeaderboards.length > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <TabsTrigger value="scorecard" className="text-sm">
            <LayoutGrid className="h-4 w-4 mr-1.5" />
            Scorecard
          </TabsTrigger>
          <TabsTrigger value="bets" className="text-sm">
            <Trophy className="h-4 w-4 mr-1.5" />
            Apuestas
          </TabsTrigger>
          {roundLeaderboards.length > 0 && (
            <TabsTrigger value="leaderboards" className="text-sm">
              <Trophy className="h-4 w-4 mr-1.5" />
              Competencias
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="scorecard" className="mt-4">
          <HistoricalScorecard
            course={course}
            players={scorecardPlayers}
            teeColor={displayData.teeColor}
            date={displayData.date}
            roundHoles={((snapshot as any)?.betConfig?.roundHoles === 9 ? 9 : 18) as 9 | 18}
          />

        </TabsContent>

        <TabsContent value="bets" className="mt-4 space-y-3 overflow-x-hidden max-w-full min-w-0">
          {/* ── Group Selector (multi-group only, bets section) ──────────── */}
          {hasMultipleGroups && snapshot?.groups && (
            <div className="flex gap-1.5 justify-center pb-1 px-1">
              {snapshot.groups.map((g, idx) => (
                <button
                  key={g.id}
                  onClick={() => setHistoricalGroupTab(`g${idx}`)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors border",
                    historicalGroupTab === `g${idx}`
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80",
                  )}
                >
                  Grupo {idx + 1}
                </button>
              ))}
              {hasCrossGroupData && (
                <button
                  onClick={() => setHistoricalGroupTab('cross')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors border",
                    historicalGroupTab === 'cross'
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80",
                  )}
                >
                  ⚡ Cruzadas
                </button>
              )}
            </div>
          )}

          {historicalGroupTab === 'cross' && (!viewLedger || viewLedger.length === 0) ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No hay apuestas cruzadas registradas en esta ronda.
            </div>
          ) : (
            <BetDashboard
              players={viewPlayers}
              scores={viewScores}
              betConfig={effectiveBetConfig}
              course={course}
              confirmedHoles={confirmedHoles}
              startingHole={hasSnapshot && snapshot ? snapshot.startingHole : undefined}
              playerGroups={[]}
              basePlayerId={profile?.id}
              getBilateralHandicapsForEngine={
                hasSnapshot && snapshot
                  ? () => viewBilateralHandicaps
                  : undefined
              }
              snapshotBalances={viewBalances}
              snapshotLedger={viewLedger}
              snapshotPairBreakdowns={viewPairBreakdowns}
              snapshotPairSegmentResults={viewPairSegmentResults}
              wolfHook={historicalWolfConfig ? {
                wolfConfig: historicalWolfConfig,
                holeStates: historicalWolfHoleStates,
                isActive: true,
                loading: false,
              } as any : undefined}
            />
          )}
        </TabsContent>

        <TabsContent value="leaderboards" className="mt-4 space-y-3">
          {roundLeaderboards.map(lb => (
            lb.competition_type === 'teams_cup' ? (
              <HistoricalCupSummaryCard
                key={lb.id}
                leaderboardId={lb.id}
                name={lb.name}
                status={lb.status}
                roundId={roundId}
                currentUserProfileId={currentUserProfileId}
              />
            ) : (
              <HistoricalStrokeSummaryCard key={lb.id} competition={lb} />
            )
          ))}


          {roundLeaderboards.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm flex flex-col items-center gap-2">
              <Trophy className="h-8 w-8 opacity-30" />
              <p>Esta ronda no participó en ninguna competencia</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Share dialog for historical rounds */}
      {hasSnapshot && snapshot && (
          <RoundShareImage
            open={showShare}
            onClose={() => setShowShare(false)}
            courseName={displayData.courseName}
            date={format(parseLocalDate(displayData.date), "d 'de' MMMM yyyy", { locale: es })}
            players={
              (snapshot.balances || []).map((b: any) => {
                const sp = snapshot.players.find((p: any) => p.id === b.playerId);
                const vsBalances = b.vsBalances || [];
                const wonFrom = vsBalances
                  .filter((v: any) => v.netAmount > 0)
                  .reduce((sum: number, v: any) => sum + v.netAmount, 0);
                const lostTo = vsBalances
                  .filter((v: any) => v.netAmount < 0)
                  .reduce((sum: number, v: any) => sum + Math.abs(v.netAmount), 0);
                return {
                  name: b.playerName || sp?.name || '??',
                  initials: sp?.initials || '??',
                  color: sp?.color || '#006747',
                  totalNet: b.totalNet || 0,
                  totalGross: b.totalGross || 0,
                  wonFrom,
                  lostTo,
                  rivalStats: {
                    won: vsBalances.filter((v: any) => v.netAmount > 0).length,
                    lost: vsBalances.filter((v: any) => v.netAmount < 0).length,
                  },
                };
              })
            }
            betTypes={[]}
            coursePar={(snapshot as any).coursePar || 72}
            roundHoles={((snapshot as any)?.betConfig?.roundHoles === 9 ? 9 : 18) as 9 | 18}
            highlights={calcHighlightsFromSnapshot(snapshot)}
          />
      )}
    </div>
  );
};
