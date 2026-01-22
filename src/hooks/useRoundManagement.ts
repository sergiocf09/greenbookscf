import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Player, BetConfig, PlayerScore, GolfCourse } from '@/types/golf';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';
import { defaultMarkerState } from '@/types/golf';
import { toast } from 'sonner';

interface RoundState {
  id: string | null;
  status: 'setup' | 'in_progress' | 'completed';
  date: Date;
  courseId: string | null;
  teeColor: 'blue' | 'white' | 'yellow' | 'red';
  groupId: string | null;
}

interface UseRoundManagementProps {
  players: Player[];
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  scores: Map<string, PlayerScore[]>;
  setScores: React.Dispatch<React.SetStateAction<Map<string, PlayerScore[]>>>;
  setConfirmedHoles: React.Dispatch<React.SetStateAction<Set<number>>>;
  betConfig: BetConfig;
  course: GolfCourse | null;
}

export const useRoundManagement = ({
  players,
  setPlayers,
  scores,
  setScores,
  setConfirmedHoles,
  betConfig,
  course,
}: UseRoundManagementProps) => {
  const { profile } = useAuth();
  const [roundState, setRoundState] = useState<RoundState>({
    id: null,
    status: 'setup',
    date: new Date(),
    courseId: null,
    teeColor: 'white',
    groupId: null,
  });
  const [roundPlayerIds, setRoundPlayerIds] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  const isRoundStarted = roundState.status !== 'setup';

  // Generate shareable link
  const getShareableLink = useCallback(() => {
    if (!roundState.id) return null;
    return `${window.location.origin}/join/${roundState.id}`;
  }, [roundState.id]);

  // Create a new round in the database using server-side RPC
  const createRound = useCallback(async (courseId: string, teeColor: string, date: Date) => {
    if (!profile) {
      toast.error('Debes iniciar sesión para crear una ronda');
      return null;
    }

    // Verify we have an active session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      toast.error('Sesión expirada. Por favor, inicia sesión nuevamente.');
      return null;
    }

    setIsLoading(true);
    try {
      // Use the security-definer RPC to create round atomically
      const { data, error } = await supabase.rpc('create_round', {
        p_course_id: courseId,
        p_tee_color: teeColor,
        p_date: date.toISOString().split('T')[0],
        p_bet_config: betConfig as any,
      });

      if (error) {
        console.error('Round creation error:', error);
        throw error;
      }

      // RPC returns an array with one row
      const result = Array.isArray(data) ? data[0] : data;
      
      if (!result) {
        throw new Error('No data returned from create_round');
      }

      // Update state
      setRoundState({
        id: result.round_id,
        status: 'setup',
        date: date,
        courseId: courseId,
        teeColor: teeColor as any,
        groupId: result.group_id,
      });

      setRoundPlayerIds(new Map([[result.organizer_profile_id, result.round_player_id]]));

      toast.success('Ronda creada');
      return result.round_id;
    } catch (error) {
      console.error('Error creating round:', error);
      toast.error('Error al crear la ronda');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [profile, betConfig]);

  // Start the round (change status to in_progress)
  const startRound = useCallback(async () => {
    if (!roundState.id || !course) return false;

    setIsLoading(true);
    try {
      // Update round status
      const { error } = await supabase
        .from('rounds')
        .update({ status: 'in_progress' })
        .eq('id', roundState.id);

      if (error) throw error;

      // Initialize scores locally
      const initialScores = new Map<string, PlayerScore[]>();
      players.forEach(player => {
        const strokesPerHole = calculateStrokesPerHole(player.handicap, course);
        const playerScores: PlayerScore[] = Array.from({ length: 18 }, (_, i) => {
          const holePar = course.holes[i]?.par || 4;
          return {
            playerId: player.id,
            holeNumber: i + 1,
            strokes: holePar,
            putts: 2,
            markers: { ...defaultMarkerState },
            strokesReceived: strokesPerHole[i],
            netScore: holePar - strokesPerHole[i],
            confirmed: false,
          };
        });
        initialScores.set(player.id, playerScores);
      });

      setScores(initialScores);
      setRoundState(prev => ({ ...prev, status: 'in_progress' }));
      
      return true;
    } catch (error) {
      console.error('Error starting round:', error);
      toast.error('Error al iniciar la ronda');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [roundState.id, course, players, setScores]);

  // Close the scorecard (complete the round)
  const closeScorecard = useCallback(async (allBetResults: any[]) => {
    if (!roundState.id || !profile) return false;

    setIsLoading(true);
    try {
      // Update round status to completed
      const { error: roundError } = await supabase
        .from('rounds')
        .update({ 
          status: 'completed',
          bet_config: betConfig as any,
        })
        .eq('id', roundState.id);

      if (roundError) throw roundError;

      // Save all hole scores to database
      const scoreRecords: any[] = [];
      for (const [playerId, playerScores] of scores) {
        const rpId = roundPlayerIds.get(playerId);
        if (!rpId) continue;

        playerScores.forEach(score => {
          scoreRecords.push({
            round_player_id: rpId,
            hole_number: score.holeNumber,
            strokes: score.strokes,
            putts: score.putts,
            strokes_received: score.strokesReceived,
            net_score: score.netScore,
            oyes_proximity: score.oyesProximity,
            confirmed: true,
          });
        });
      }

      // Upsert scores
      if (scoreRecords.length > 0) {
        const { error: scoresError } = await supabase
          .from('hole_scores')
          .upsert(scoreRecords, { 
            onConflict: 'round_player_id,hole_number',
            ignoreDuplicates: false 
          });

        if (scoresError) throw scoresError;
      }

      // Save ledger transactions for bet results
      const ledgerRecords: any[] = [];
      allBetResults.forEach(result => {
        if (result.amount !== 0 && result.fromPlayerId && result.toPlayerId) {
          // Get profile IDs from players
          const fromPlayer = players.find(p => p.id === result.fromPlayerId);
          const toPlayer = players.find(p => p.id === result.toPlayerId);
          
          if (fromPlayer?.profileId && toPlayer?.profileId) {
            ledgerRecords.push({
              round_id: roundState.id,
              from_profile_id: fromPlayer.profileId,
              to_profile_id: toPlayer.profileId,
              amount: Math.abs(result.amount),
              bet_type: result.betType || 'other',
              segment: result.segment || 'total',
              hole_number: result.holeNumber || null,
              description: result.description || null,
            });
          }
        }
      });

      if (ledgerRecords.length > 0) {
        const { error: ledgerError } = await supabase
          .from('ledger_transactions')
          .insert(ledgerRecords);

        if (ledgerError) {
          console.error('Ledger error:', ledgerError);
        }
      }

      // Update player vs player records
      const pvpUpdates = new Map<string, { aWon: number; bWon: number }>();
      allBetResults.forEach(result => {
        if (!result.fromPlayerId || !result.toPlayerId || result.amount === 0) return;
        
        const fromPlayer = players.find(p => p.id === result.fromPlayerId);
        const toPlayer = players.find(p => p.id === result.toPlayerId);
        
        if (!fromPlayer?.profileId || !toPlayer?.profileId) return;

        const key = [fromPlayer.profileId, toPlayer.profileId].sort().join('-');
        const existing = pvpUpdates.get(key) || { aWon: 0, bWon: 0 };
        
        // Determine who is player A (alphabetically first)
        const isFromPlayerA = fromPlayer.profileId < toPlayer.profileId;
        if (result.amount > 0) {
          // toPlayer won
          if (isFromPlayerA) {
            existing.bWon += result.amount;
          } else {
            existing.aWon += result.amount;
          }
        }
        pvpUpdates.set(key, existing);
      });

      // Upsert PvP records
      for (const [key, amounts] of pvpUpdates) {
        const [playerAId, playerBId] = key.split('-');
        
        const { data: existing } = await supabase
          .from('player_vs_player')
          .select('*')
          .eq('player_a_id', playerAId)
          .eq('player_b_id', playerBId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('player_vs_player')
            .update({
              rounds_played: existing.rounds_played + 1,
              total_won_by_a: Number(existing.total_won_by_a) + amounts.aWon,
              total_won_by_b: Number(existing.total_won_by_b) + amounts.bWon,
              last_played_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('player_vs_player')
            .insert({
              player_a_id: playerAId,
              player_b_id: playerBId,
              rounds_played: 1,
              total_won_by_a: amounts.aWon,
              total_won_by_b: amounts.bWon,
              last_played_at: new Date().toISOString(),
            });
        }
      }

      // Update handicap history for all players with profiles
      for (const player of players) {
        if (player.profileId) {
          await supabase
            .from('handicap_history')
            .insert({
              profile_id: player.profileId,
              handicap: player.handicap,
              round_id: roundState.id,
            });
        }
      }

      setRoundState(prev => ({ ...prev, status: 'completed' }));
      toast.success('Tarjeta cerrada y guardada');
      return true;
    } catch (error) {
      console.error('Error closing scorecard:', error);
      toast.error('Error al cerrar la tarjeta');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [roundState.id, profile, scores, players, betConfig, roundPlayerIds]);

  // Add a guest player (non-registered)
  const addGuestPlayer = useCallback(async (name: string, handicap: number) => {
    if (!roundState.id || !roundState.groupId) return null;

    // For guests, we just add them locally - they don't have profiles
    const initials = name
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const colors = [
      '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
      '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
    ];

    const newPlayer: Player = {
      id: `guest-${Date.now()}`,
      name,
      initials,
      color: colors[players.length % colors.length],
      handicap,
    };

    return newPlayer;
  }, [roundState.id, roundState.groupId, players.length]);

  // Update round date
  const setRoundDate = useCallback((date: Date) => {
    setRoundState(prev => ({ ...prev, date }));
    
    // If round exists, update in database
    if (roundState.id) {
      supabase
        .from('rounds')
        .update({ date: date.toISOString().split('T')[0] })
        .eq('id', roundState.id)
        .then(({ error }) => {
          if (error) console.error('Error updating date:', error);
        });
    }
  }, [roundState.id]);

  // Copy link to clipboard
  const copyShareLink = useCallback(async () => {
    const link = getShareableLink();
    if (!link) {
      toast.error('Primero crea la ronda');
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copiado al portapapeles');
    } catch {
      toast.error('Error al copiar el link');
    }
  }, [getShareableLink]);

  return {
    roundState,
    setRoundState,
    roundPlayerIds,
    setRoundPlayerIds,
    isLoading,
    isRoundStarted,
    getShareableLink,
    createRound,
    startRound,
    closeScorecard,
    addGuestPlayer,
    setRoundDate,
    copyShareLink,
  };
};
