import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, LayoutGrid, Trophy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { HistoricalScorecard } from './HistoricalScorecard';
import { BetDashboard } from './bets/BetDashboard';
import { GolfCourse, Player, PlayerScore, BetConfig, MarkerState, defaultMarkerState } from '@/types/golf';
import { defaultBetConfig } from './setup/BetSetup';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';

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
  players: initialPlayers,
  teeColor,
  date,
  course,
}) => {
  const [activeTab, setActiveTab] = useState<'scorecard' | 'bets'>('scorecard');
  const [betConfig, setBetConfig] = useState<BetConfig>(defaultBetConfig);
  const [loading, setLoading] = useState(true);
  const [markers, setMarkers] = useState<Map<string, Map<number, MarkerState>>>(new Map());

  // Fetch bet config and markers from the round
  useEffect(() => {
    const fetchRoundData = async () => {
      try {
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
          });
        }

        // Fetch markers for each player's hole scores
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

            // Get markers for each hole score
            const playerMarkers = new Map<number, MarkerState>();
            
            if (holeScores) {
              for (const hs of holeScores) {
                const { data: holeMarkers } = await supabase
                  .from('hole_markers')
                  .select('marker_type')
                  .eq('hole_score_id', rp.id);
                
                // Reconstruct marker state
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
        console.error('Error fetching round data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRoundData();
  }, [roundId]);

  // Convert PlayerScoreData to Player objects for BetDashboard
  const dashboardPlayers: Player[] = useMemo(() => {
    return initialPlayers.map(p => ({
      id: p.playerId,
      name: p.playerName,
      initials: p.initials,
      color: p.color,
      handicap: p.handicap,
      profileId: p.playerId,
    }));
  }, [initialPlayers]);

  // Convert to Map<string, PlayerScore[]> for BetDashboard
  const dashboardScores: Map<string, PlayerScore[]> = useMemo(() => {
    const scoresMap = new Map<string, PlayerScore[]>();
    
    // Calculate strokes per hole for each player based on their handicap
    const strokesPerHoleByPlayer: Record<string, number[]> = {};
    dashboardPlayers.forEach(player => {
      strokesPerHoleByPlayer[player.id] = calculateStrokesPerHole(player.handicap, course);
    });
    
    initialPlayers.forEach(player => {
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
          confirmed: true, // Historical scores are always confirmed
        };
      });
      
      scoresMap.set(player.playerId, playerScores);
    });
    
    return scoresMap;
  }, [initialPlayers, course, dashboardPlayers, markers]);

  // All 18 holes are confirmed for historical view
  const confirmedHoles = useMemo(() => {
    return new Set(Array.from({ length: 18 }, (_, i) => i + 1));
  }, []);

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
        <h3 className="font-semibold text-lg text-primary">{course.name}</h3>
        <p className="text-sm text-muted-foreground">
          {format(new Date(date), "d 'de' MMMM, yyyy", { locale: es })} • Tee {teeColor}
        </p>
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
            players={initialPlayers}
            teeColor={teeColor}
            date={date}
          />
        </TabsContent>

        <TabsContent value="bets" className="mt-4">
          <BetDashboard
            players={dashboardPlayers}
            scores={dashboardScores}
            betConfig={betConfig}
            course={course}
            confirmedHoles={confirmedHoles}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
