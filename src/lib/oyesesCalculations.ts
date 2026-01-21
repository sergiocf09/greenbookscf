// Oyeses (Closest to the Pin) Calculations
import { Player, PlayerScore, BetConfig, GolfCourse, OyesModality } from '@/types/golf';
import { BetSummary } from './betCalculations';

interface OyesAccumulation {
  pairKey: string; // "playerA-playerB"
  accumulated: number;
}

/**
 * Calculate Oyeses bets for all player pairs
 * 
 * Rules:
 * - Only applies to Par 3 holes
 * - Acumulados mode: Must reach green in 1 stroke to get a number. 
 *   If no one reaches green, bet accumulates to next Par 3.
 * - Sangrón mode: Everyone gets a number, no accumulation.
 * - Hierarchy: 1 beats all, 2 beats 3,4,5..., etc.
 * - Each pair settles independently
 */
export const calculateOyesesBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): BetSummary[] => {
  if (!config.oyeses.enabled) return [];
  
  const summaries: BetSummary[] = [];
  const amount = config.oyeses.amount;
  
  // Find all Par 3 holes
  const par3Holes = course.holes
    .filter(h => h.par === 3)
    .map(h => h.number);
  
  // Get player modalities
  const getPlayerModality = (playerId: string): OyesModality | null => {
    const playerConfig = config.oyeses.playerConfigs.find(pc => pc.playerId === playerId);
    if (!playerConfig?.enabled) return null;
    return playerConfig.modality;
  };
  
  // Track accumulations per pair (for Acumulados mode)
  const accumulations = new Map<string, number>();
  
  const getPairKey = (a: string, b: string) => [a, b].sort().join('-');
  
  // Process each pair of players
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      const modalityA = getPlayerModality(playerA.id);
      const modalityB = getPlayerModality(playerB.id);
      
      // Skip if either player doesn't have Oyeses enabled
      if (!modalityA || !modalityB) continue;
      
      const pairKey = getPairKey(playerA.id, playerB.id);
      
      // Determine the pair's effective modality
      // If both same → that modality. If mixed → Sangrón takes precedence (no accumulation)
      const pairModality = (modalityA === modalityB) ? modalityA : 'sangron';
      
      // Process each Par 3 hole
      for (const holeNum of par3Holes) {
        const scoresA = scores.get(playerA.id) || [];
        const scoresB = scores.get(playerB.id) || [];
        
        const scoreA = scoresA.find(s => s.holeNumber === holeNum);
        const scoreB = scoresB.find(s => s.holeNumber === holeNum);
        
        if (!scoreA || !scoreB) continue;
        
        const proximityA = scoreA.oyesProximity;
        const proximityB = scoreB.oyesProximity;
        
        // Current accumulation for this pair
        const currentAccum = accumulations.get(pairKey) || 0;
        
        if (pairModality === 'acumulados') {
          // Acumulados: null proximity means no green in 1, loses to anyone with number
          const hasNumberA = proximityA !== null && proximityA !== undefined;
          const hasNumberB = proximityB !== null && proximityB !== undefined;
          
          if (!hasNumberA && !hasNumberB) {
            // Neither reached green - accumulate
            accumulations.set(pairKey, currentAccum + amount);
            continue;
          }
          
          // At least one has a number - settle
          const totalAmount = amount + currentAccum;
          
          if (hasNumberA && !hasNumberB) {
            // A wins (has number, B doesn't)
            summaries.push({
              playerId: playerA.id,
              vsPlayer: playerB.id,
              betType: 'Oyes',
              amount: totalAmount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `#${proximityA} vs Sin Green${currentAccum > 0 ? ` (+$${currentAccum} acum)` : ''}`,
            });
            summaries.push({
              playerId: playerB.id,
              vsPlayer: playerA.id,
              betType: 'Oyes',
              amount: -totalAmount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `Sin Green vs #${proximityA}${currentAccum > 0 ? ` (+$${currentAccum} acum)` : ''}`,
            });
          } else if (!hasNumberA && hasNumberB) {
            // B wins (has number, A doesn't)
            summaries.push({
              playerId: playerB.id,
              vsPlayer: playerA.id,
              betType: 'Oyes',
              amount: totalAmount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `#${proximityB} vs Sin Green${currentAccum > 0 ? ` (+$${currentAccum} acum)` : ''}`,
            });
            summaries.push({
              playerId: playerA.id,
              vsPlayer: playerB.id,
              betType: 'Oyes',
              amount: -totalAmount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `Sin Green vs #${proximityB}${currentAccum > 0 ? ` (+$${currentAccum} acum)` : ''}`,
            });
          } else {
            // Both have numbers - compare proximity
            if (proximityA! < proximityB!) {
              // A is closer
              summaries.push({
                playerId: playerA.id,
                vsPlayer: playerB.id,
                betType: 'Oyes',
                amount: totalAmount,
                segment: 'hole',
                holeNumber: holeNum,
                description: `#${proximityA} vs #${proximityB}${currentAccum > 0 ? ` (+$${currentAccum} acum)` : ''}`,
              });
              summaries.push({
                playerId: playerB.id,
                vsPlayer: playerA.id,
                betType: 'Oyes',
                amount: -totalAmount,
                segment: 'hole',
                holeNumber: holeNum,
                description: `#${proximityB} vs #${proximityA}${currentAccum > 0 ? ` (+$${currentAccum} acum)` : ''}`,
              });
            } else if (proximityB! < proximityA!) {
              // B is closer
              summaries.push({
                playerId: playerB.id,
                vsPlayer: playerA.id,
                betType: 'Oyes',
                amount: totalAmount,
                segment: 'hole',
                holeNumber: holeNum,
                description: `#${proximityB} vs #${proximityA}${currentAccum > 0 ? ` (+$${currentAccum} acum)` : ''}`,
              });
              summaries.push({
                playerId: playerA.id,
                vsPlayer: playerB.id,
                betType: 'Oyes',
                amount: -totalAmount,
                segment: 'hole',
                holeNumber: holeNum,
                description: `#${proximityA} vs #${proximityB}${currentAccum > 0 ? ` (+$${currentAccum} acum)` : ''}`,
              });
            }
            // Tie = no money changes hands, but accumulation resets
          }
          
          // Reset accumulation after settlement
          accumulations.set(pairKey, 0);
          
        } else {
          // Sangrón: No accumulation, everyone should have a number
          // Skip if either doesn't have a number (shouldn't happen in Sangrón)
          if (proximityA === null || proximityA === undefined ||
              proximityB === null || proximityB === undefined) {
            continue;
          }
          
          if (proximityA < proximityB) {
            // A is closer
            summaries.push({
              playerId: playerA.id,
              vsPlayer: playerB.id,
              betType: 'Oyes',
              amount: amount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `#${proximityA} vs #${proximityB} (Sangrón)`,
            });
            summaries.push({
              playerId: playerB.id,
              vsPlayer: playerA.id,
              betType: 'Oyes',
              amount: -amount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `#${proximityB} vs #${proximityA} (Sangrón)`,
            });
          } else if (proximityB < proximityA) {
            // B is closer
            summaries.push({
              playerId: playerB.id,
              vsPlayer: playerA.id,
              betType: 'Oyes',
              amount: amount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `#${proximityB} vs #${proximityA} (Sangrón)`,
            });
            summaries.push({
              playerId: playerA.id,
              vsPlayer: playerB.id,
              betType: 'Oyes',
              amount: -amount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `#${proximityA} vs #${proximityB} (Sangrón)`,
            });
          }
          // Tie = no money changes hands
        }
      }
    }
  }
  
  return summaries;
};
