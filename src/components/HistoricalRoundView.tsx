import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, LayoutGrid, Trophy, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { HistoricalScorecard } from './HistoricalScorecard';
import { BetDashboard } from './bets/BetDashboard';
import { GolfCourse, Player, PlayerScore, BetConfig, MarkerState, defaultMarkerState, PlayerGroup } from '@/types/golf';
import { defaultBetConfig } from './setup/BetSetup';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { RoundSnapshot, isValidSnapshot, SnapshotHoleScore, SnapshotPlayer, SnapshotGroup } from '@/lib/roundSnapshot';
import { devError, devLog, devWarn } from '@/lib/logger';
import { parseLocalDate } from '@/lib/dateUtils';
import { useAuth } from '@/contexts/AuthContext';

interface PlayerScoreData {
  playerId: string;
  playerName: string;
  initials: string;
  color: string;
  handicap: number;
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
  const [activeTab, setActiveTab] = useState<'scorecard' | 'bets'>('scorecard');
  const [loading, setLoading] = useState(true);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [snapshot, setSnapshot] = useState<RoundSnapshot | null>(null);
  
  // Fallback state for rounds without snapshot
  const [betConfig, setBetConfig] = useState<BetConfig>(defaultBetConfig);
  const [markers, setMarkers] = useState<Map<string, Map<number, MarkerState>>>(new Map());

  // Fetch snapshot — this is the ONLY source of truth for historical views.
  // No recalculation occurs here; we only render what the snapshot contains.
  useEffect(() => {
    const fetchRoundData = async () => {
      try {
        // PRIMARY PATH: load immutable snapshot
        const { data: snapshotData, error: snapshotError } = await supabase
          .from('round_snapshots')
          .select('snapshot_json')
          .eq('round_id', roundId)   // ← strict round_id filter, no cross-contamination
          .maybeSingle();

        if (!snapshotError && snapshotData?.snapshot_json) {
          const snap = snapshotData.snapshot_json as unknown;
          if (isValidSnapshot(snap)) {
            // Enforce noRecalcContract — warn if missing (legacy snapshots)
            if (!(snap as any).meta?.noRecalcContract) {
              devWarn(
                '[noRecalcContract] Legacy snapshot (no noRecalcContract). ' +
                'Rendering from snapshot data only — no recalculation.',
                roundId
              );
            } else {
              devLog(
                '[noRecalcContract] ✅ Snapshot V3 verified — rendering directly from snapshot.',
                roundId,
                'schema:', (snap as any).meta?.schemaVersion
              );
            }
            setSnapshot(snap);
            setHasSnapshot(true);
            setLoading(false);
            return;
          }
        }

        // LEGACY FALLBACK: Round predates the snapshot system.
        // We can only show the scorecard (no bet totals). No recalculation of bets.
        devWarn('[noRecalcContract] No snapshot found for round:', roundId, '— showing legacy scorecard only.');

        // For legacy rounds, load only the betConfig for display (no bet recalculation)
        const { data: roundData, error: roundError } = await supabase
          .from('rounds')
          .select('bet_config')
          .eq('id', roundId)   // ← strict round_id filter
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

        // NOTE: We intentionally do NOT query hole_scores/hole_markers for legacy rounds
        // because that would constitute a recalculation — violating noRecalcContract.
        // Legacy rounds display only the scorecard data passed via props (fallbackPlayers).

      } catch (err) {
        devError('[HistoricalRoundView] Error fetching snapshot:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRoundData();
  }, [roundId]);

  // Convert snapshot players to Player objects for BetDashboard
  const dashboardPlayers: Player[] = useMemo(() => {
    if (hasSnapshot && snapshot) {
      return snapshot.players.map((p: SnapshotPlayer) => ({
        id: p.id,
        name: p.name,
        initials: p.initials,
        color: p.color,
        handicap: p.handicap,
        profileId: p.profileId || undefined,
        groupId: p.groupId,
      }));
    }
    
    // Fallback to legacy data
    return fallbackPlayers.map(p => ({
      id: p.playerId,
      name: p.playerName,
      initials: p.initials,
      color: p.color,
      handicap: p.handicap,
      profileId: p.playerId,
    }));
  }, [hasSnapshot, snapshot, fallbackPlayers]);

  // Reconstruct PlayerGroup[] from snapshot groups for BetDashboard
  const dashboardPlayerGroups: PlayerGroup[] = useMemo(() => {
    if (!hasSnapshot || !snapshot?.groups || snapshot.groups.length === 0) return [];
    
    return snapshot.groups.map((g: SnapshotGroup) => ({
      id: g.id,
      name: g.name,
      players: g.playerIds
        .map(pid => dashboardPlayers.find(p => p.id === pid))
        .filter((p): p is Player => !!p),
    }));
  }, [hasSnapshot, snapshot, dashboardPlayers]);

  // Convert to Map<string, PlayerScore[]> for BetDashboard
  const dashboardScores: Map<string, PlayerScore[]> = useMemo(() => {
    const scoresMap = new Map<string, PlayerScore[]>();
    
    if (hasSnapshot && snapshot) {
      // Use snapshot scores directly - NO RECALCULATION
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
    
    // Fallback: legacy behavior with recalculation (for old rounds)
    const strokesPerHoleByPlayer: Record<string, number[]> = {};
    dashboardPlayers.forEach(player => {
      strokesPerHoleByPlayer[player.id] = calculateStrokesPerHole(player.handicap, course);
    });
    
    fallbackPlayers.forEach(player => {
      const playerScores: PlayerScore[] = player.scores.map(s => {
        const hole = course.holes.find(h => h.number === s.holeNumber);
        const par = hole?.par || 4;
        const strokesReceived = strokesPerHoleByPlayer[player.playerId]?.[s.holeNumber - 1] || 0;
        const playerMarkers = markers.get(player.playerId)?.get(s.holeNumber) || defaultMarkerState;
        
        // Auto-detect score-based markers
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
  }, [hasSnapshot, snapshot, fallbackPlayers, course, dashboardPlayers, markers]);

  // Get bet config from snapshot or fallback
  const effectiveBetConfig = useMemo(() => {
    if (hasSnapshot && snapshot) {
      return snapshot.betConfig;
    }
    return betConfig;
  }, [hasSnapshot, snapshot, betConfig]);

  // When using snapshots, bilateral handicaps must come from the snapshot too.
  // Bet engine expects BilateralHandicap[] with absolute handicaps per side.
  const snapshotBilateralHandicapsForEngine = useMemo(() => {
    if (!hasSnapshot || !snapshot?.bilateralHandicaps) return [];

    return snapshot.bilateralHandicaps
      .filter((h) => h && typeof h.strokesGivenByA === 'number')
      .map((h) => {
        const strokes = h.strokesGivenByA;
        if (strokes >= 0) {
          // A gives strokes to B → B is weaker → B gets handicap=strokes, A=0
          return {
            playerAId: h.playerAId,
            playerBId: h.playerBId,
            playerAHandicap: 0,
            playerBHandicap: strokes,
          };
        }
        // A receives strokes from B → A is weaker → A gets handicap=|strokes|, B=0
        return {
          playerAId: h.playerAId,
          playerBId: h.playerBId,
          playerAHandicap: Math.abs(strokes),
          playerBHandicap: 0,
        };
      });
  }, [hasSnapshot, snapshot]);

  // All 18 holes are confirmed for historical view
  const confirmedHoles = useMemo(() => {
    return new Set(Array.from({ length: 18 }, (_, i) => i + 1));
  }, []);

  // Get display data from snapshot or fallback
  const displayData = useMemo(() => {
    if (hasSnapshot && snapshot) {
      return {
        courseName: snapshot.courseName,
        teeColor: snapshot.teeColor,
        date: snapshot.date,
      };
    }
    return {
      courseName: course.name,
      teeColor,
      date,
    };
  }, [hasSnapshot, snapshot, course.name, teeColor, date]);

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
          {format(parseLocalDate(displayData.date), "d 'de' MMMM, yyyy", { locale: es })} • Tee {displayData.teeColor}
        </p>
        {hasSnapshot && (
          <p className="text-xs text-green-600 mt-1 flex items-center justify-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Vista histórica inmutable
          </p>
        )}
        {!hasSnapshot && (
          <p className="text-xs text-amber-600 mt-1 flex items-center justify-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Ronda anterior al sistema de snapshots
          </p>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'scorecard' | 'bets')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="scorecard" className="text-sm">
            <LayoutGrid className="h-4 w-4 mr-1.5" />
            Scorecard
          </TabsTrigger>
          <TabsTrigger value="bets" className="text-sm">
            <Trophy className="h-4 w-4 mr-1.5" />
            Apuestas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="scorecard" className="mt-4">
          <HistoricalScorecard
            course={course}
            players={fallbackPlayers}
            teeColor={displayData.teeColor}
            date={displayData.date}
          />
        </TabsContent>

        <TabsContent value="bets" className="mt-4">
          <BetDashboard
            players={dashboardPlayers}
            scores={dashboardScores}
            betConfig={effectiveBetConfig}
            course={course}
            confirmedHoles={confirmedHoles}
            startingHole={hasSnapshot && snapshot ? snapshot.startingHole : undefined}
            playerGroups={dashboardPlayerGroups}
            basePlayerId={profile?.id}
            getBilateralHandicapsForEngine={
              hasSnapshot && snapshot
                ? () => snapshotBilateralHandicapsForEngine
                : undefined
            }
            snapshotBalances={hasSnapshot && snapshot ? snapshot.balances : undefined}
            snapshotLedger={hasSnapshot && snapshot ? snapshot.ledger : undefined}
            snapshotPairBreakdowns={hasSnapshot && snapshot ? snapshot.pairBreakdowns : undefined}
            snapshotPairSegmentResults={hasSnapshot && snapshot ? snapshot.pairSegmentResults : undefined}
          />
        </TabsContent>

      </Tabs>
    </div>
  );
};
