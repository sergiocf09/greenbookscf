import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, LayoutGrid, Trophy, AlertCircle, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { HistoricalScorecard } from './HistoricalScorecard';
import { BetDashboard } from './bets/BetDashboard';
import { LedgerAuditView } from './bets/LedgerAuditView';
import { GolfCourse, Player, PlayerScore, BetConfig, MarkerState, defaultMarkerState } from '@/types/golf';
import { defaultBetConfig } from './setup/BetSetup';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { RoundSnapshot, isValidSnapshot, SnapshotHoleScore, SnapshotPlayer } from '@/lib/roundSnapshot';
import { devError, devLog } from '@/lib/logger';
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
  const [activeTab, setActiveTab] = useState<'scorecard' | 'bets' | 'audit'>('scorecard');
  const [loading, setLoading] = useState(true);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [snapshot, setSnapshot] = useState<RoundSnapshot | null>(null);
  
  // Fallback state for rounds without snapshot
  const [betConfig, setBetConfig] = useState<BetConfig>(defaultBetConfig);
  const [markers, setMarkers] = useState<Map<string, Map<number, MarkerState>>>(new Map());

  // Fetch snapshot or fallback to legacy data
  useEffect(() => {
    const fetchRoundData = async () => {
      try {
        // First, try to get the snapshot
        const { data: snapshotData, error: snapshotError } = await supabase
          .from('round_snapshots')
          .select('snapshot_json')
          .eq('round_id', roundId)
          .maybeSingle();

        if (!snapshotError && snapshotData?.snapshot_json) {
          const snap = snapshotData.snapshot_json as unknown;
          if (isValidSnapshot(snap)) {
            devLog('Using immutable snapshot for round:', roundId);
            setSnapshot(snap);
            setHasSnapshot(true);
            setLoading(false);
            return;
          }
        }

        // No valid snapshot - fall back to legacy behavior
        devLog('No snapshot found, using legacy data for round:', roundId);
        
        // Fetch bet config from round
        const { data: roundData, error: roundError } = await supabase
          .from('rounds')
          .select('bet_config')
          .eq('id', roundId)
          .single();

        if (roundError) throw roundError;
        
        if (roundData?.bet_config) {
          // Merge with defaults to ensure all properties exist
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

        // Fetch markers for each player's hole scores (legacy)
        const { data: roundPlayers } = await supabase
          .from('round_players')
          .select('id, profile_id')
          .eq('round_id', roundId);

        if (roundPlayers) {
          const markersMap = new Map<string, Map<number, MarkerState>>();
          
          for (const rp of roundPlayers) {
            const { data: holeScores } = await supabase
              .from('hole_scores')
              .select('hole_number')
              .eq('round_player_id', rp.id);

            const playerMarkers = new Map<number, MarkerState>();
            
            if (holeScores) {
              for (const hs of holeScores) {
                const { data: holeMarkers } = await supabase
                  .from('hole_markers')
                  .select('marker_type')
                  .eq('hole_score_id', rp.id);
                
                const markerState: MarkerState = { ...defaultMarkerState };
                if (holeMarkers) {
                  for (const m of holeMarkers) {
                    if (m.marker_type in markerState) {
                      (markerState as any)[m.marker_type] = true;
                    }
                  }
                }
                playerMarkers.set(hs.hole_number, markerState);
              }
            }
            
            markersMap.set(rp.profile_id, playerMarkers);
          }
          
          setMarkers(markersMap);
        }
      } catch (err) {
        devError('Error fetching round data:', err);
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
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'scorecard' | 'bets' | 'audit')}>
        <TabsList className={`grid w-full ${hasSnapshot ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <TabsTrigger value="scorecard" className="text-sm">
            <LayoutGrid className="h-4 w-4 mr-1.5" />
            Scorecard
          </TabsTrigger>
          <TabsTrigger value="bets" className="text-sm">
            <Trophy className="h-4 w-4 mr-1.5" />
            Apuestas
          </TabsTrigger>
          {hasSnapshot && (
            <TabsTrigger value="audit" className="text-sm">
              <Shield className="h-4 w-4 mr-1.5" />
              Auditoría
            </TabsTrigger>
          )}
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
            getBilateralHandicapsForEngine={
              hasSnapshot && snapshot
                ? () => snapshotBilateralHandicapsForEngine
                : undefined
            }
            snapshotBalances={hasSnapshot && snapshot ? snapshot.balances : undefined}
            snapshotLedger={hasSnapshot && snapshot ? snapshot.ledger : undefined}
          />
        </TabsContent>

        {hasSnapshot && snapshot && (
          <TabsContent value="audit" className="mt-4">
            <LedgerAuditView
              ledger={snapshot.ledger}
              players={snapshot.players}
              myPlayerId={
                snapshot.players.find(p => p.profileId === profile?.id)?.id
              }
              isOrganizer={true}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
