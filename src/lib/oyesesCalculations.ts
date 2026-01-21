// Oyeses (Closest to the Pin) Calculations
import { Player, PlayerScore, BetConfig, GolfCourse, OyesModality } from '@/types/golf';
import { BetSummary } from './betCalculations';

/**
 * Oyeses result per player per hole for display
 */
export interface OyesHoleDisplay {
  holeNumber: number;
  playerOrder: number | null; // proximity order (1=closest), null = no green / not set
  isAccumulated: boolean; // true if this hole added to accumulation
  isWin: boolean; // true if player won this hole vs the rival
  isLoss: boolean; // true if player lost this hole vs the rival
  accumulatedAmount?: number; // if won with accumulation, shows total amount
}

/**
 * Get Oyeses display data for a specific player pair
 * Shows the proximity order per hole and accumulation status
 */
export const getOyesesDisplayData = (
  playerAId: string,
  playerBId: string,
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): { playerAHoles: OyesHoleDisplay[]; playerBHoles: OyesHoleDisplay[] } => {
  const playerAHoles: OyesHoleDisplay[] = [];
  const playerBHoles: OyesHoleDisplay[] = [];
  
  if (!config.oyeses.enabled) return { playerAHoles, playerBHoles };
  
  const amount = config.oyeses.amount;
  
  // Find Par 3 holes
  const par3Holes = course.holes
    .filter(h => h.par === 3)
    .map(h => h.number);
  
  // Get player modalities
  const getPlayerModality = (playerId: string): OyesModality | null => {
    const playerConfig = config.oyeses.playerConfigs.find(pc => pc.playerId === playerId);
    if (!playerConfig?.enabled) return null;
    return playerConfig.modality;
  };
  
  const modalityA = getPlayerModality(playerAId);
  const modalityB = getPlayerModality(playerBId);
  
  // Skip if either player doesn't have Oyeses enabled
  if (!modalityA || !modalityB) return { playerAHoles, playerBHoles };
  
  // Determine the pair's effective modality
  // If both same → that modality. If mixed → Sangrón takes precedence (no accumulation)
  const pairModality = (modalityA === modalityB) ? modalityA : 'sangron';
  
  let accumulated = 0;
  
  for (const holeNum of par3Holes) {
    const scoresA = scores.get(playerAId) || [];
    const scoresB = scores.get(playerBId) || [];
    
    const scoreA = scoresA.find(s => s.holeNumber === holeNum);
    const scoreB = scoresB.find(s => s.holeNumber === holeNum);
    
    const proximityA = scoreA?.oyesProximity ?? null;
    const proximityB = scoreB?.oyesProximity ?? null;
    
    let holeA: OyesHoleDisplay = {
      holeNumber: holeNum,
      playerOrder: proximityA,
      isAccumulated: false,
      isWin: false,
      isLoss: false,
    };
    
    let holeB: OyesHoleDisplay = {
      holeNumber: holeNum,
      playerOrder: proximityB,
      isAccumulated: false,
      isWin: false,
      isLoss: false,
    };
    
    if (pairModality === 'acumulados') {
      // Acumulados: null means didn't reach green in 1, accumulates
      const hasNumberA = proximityA !== null;
      const hasNumberB = proximityB !== null;
      
      if (!hasNumberA && !hasNumberB) {
        // Neither reached green - accumulate
        accumulated += amount;
        holeA.isAccumulated = true;
        holeB.isAccumulated = true;
      } else if (hasNumberA && !hasNumberB) {
        // A wins (has number, B doesn't)
        holeA.isWin = true;
        holeA.accumulatedAmount = amount + accumulated;
        holeB.isLoss = true;
        accumulated = 0;
      } else if (!hasNumberA && hasNumberB) {
        // B wins
        holeB.isWin = true;
        holeB.accumulatedAmount = amount + accumulated;
        holeA.isLoss = true;
        accumulated = 0;
      } else {
        // Both have numbers - compare
        if (proximityA! < proximityB!) {
          holeA.isWin = true;
          holeA.accumulatedAmount = amount + accumulated;
          holeB.isLoss = true;
        } else if (proximityB! < proximityA!) {
          holeB.isWin = true;
          holeB.accumulatedAmount = amount + accumulated;
          holeA.isLoss = true;
        }
        // Tie = no winner, but accumulation resets
        accumulated = 0;
      }
    } else {
      // Sangrón: Everyone always has a number, no accumulation
      if (proximityA !== null && proximityB !== null) {
        if (proximityA < proximityB) {
          holeA.isWin = true;
          holeB.isLoss = true;
        } else if (proximityB < proximityA) {
          holeB.isWin = true;
          holeA.isLoss = true;
        }
      }
    }
    
    playerAHoles.push(holeA);
    playerBHoles.push(holeB);
  }
  
  return { playerAHoles, playerBHoles };
};

/**
 * Calculate Oyeses bets for all player pairs
 * 
 * Rules:
 * - Only applies to Par 3 holes
 * - Acumulados mode: Must reach green in 1 stroke to get a number. 
 *   If neither player reaches green, bet accumulates to next Par 3.
 *   Winner is the one with lower proximity number (1 beats 2, 2 beats 3, etc.)
 * - Sangrón mode: Everyone MUST be assigned a number for each Par 3.
 *   No accumulation - bet is always settled on each Par 3.
 * - Each pair settles independently (Player A vs B is separate from A vs C)
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
  
  // Process each pair of players
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      const modalityA = getPlayerModality(playerA.id);
      const modalityB = getPlayerModality(playerB.id);
      
      // Skip if either player doesn't have Oyeses enabled
      if (!modalityA || !modalityB) continue;
      
      // Determine the pair's effective modality
      // If both same → that modality. If mixed → Sangrón takes precedence (no accumulation)
      const pairModality = (modalityA === modalityB) ? modalityA : 'sangron';
      
      // Track accumulation for this specific pair
      let accumulated = 0;
      
      // Process each Par 3 hole
      for (const holeNum of par3Holes) {
        const scoresA = scores.get(playerA.id) || [];
        const scoresB = scores.get(playerB.id) || [];
        
        const scoreA = scoresA.find(s => s.holeNumber === holeNum);
        const scoreB = scoresB.find(s => s.holeNumber === holeNum);
        
        if (!scoreA || !scoreB) continue;
        
        const proximityA = scoreA.oyesProximity;
        const proximityB = scoreB.oyesProximity;
        
        if (pairModality === 'acumulados') {
          // Acumulados: null proximity means didn't reach green in 1
          const hasNumberA = proximityA !== null && proximityA !== undefined;
          const hasNumberB = proximityB !== null && proximityB !== undefined;
          
          if (!hasNumberA && !hasNumberB) {
            // Neither reached green - accumulate
            accumulated += amount;
            continue;
          }
          
          // At least one has a number - settle
          const totalAmount = amount + accumulated;
          
          if (hasNumberA && !hasNumberB) {
            // A wins (has number, B doesn't)
            summaries.push({
              playerId: playerA.id,
              vsPlayer: playerB.id,
              betType: 'Oyes',
              amount: totalAmount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `#${proximityA} vs ✗${accumulated > 0 ? ` (+$${accumulated} acum)` : ''}`,
            });
            summaries.push({
              playerId: playerB.id,
              vsPlayer: playerA.id,
              betType: 'Oyes',
              amount: -totalAmount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `✗ vs #${proximityA}${accumulated > 0 ? ` (+$${accumulated} acum)` : ''}`,
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
              description: `#${proximityB} vs ✗${accumulated > 0 ? ` (+$${accumulated} acum)` : ''}`,
            });
            summaries.push({
              playerId: playerA.id,
              vsPlayer: playerB.id,
              betType: 'Oyes',
              amount: -totalAmount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `✗ vs #${proximityB}${accumulated > 0 ? ` (+$${accumulated} acum)` : ''}`,
            });
          } else {
            // Both have numbers - compare proximity (lower wins)
            if (proximityA! < proximityB!) {
              // A is closer
              summaries.push({
                playerId: playerA.id,
                vsPlayer: playerB.id,
                betType: 'Oyes',
                amount: totalAmount,
                segment: 'hole',
                holeNumber: holeNum,
                description: `#${proximityA} vs #${proximityB}${accumulated > 0 ? ` (+$${accumulated} acum)` : ''}`,
              });
              summaries.push({
                playerId: playerB.id,
                vsPlayer: playerA.id,
                betType: 'Oyes',
                amount: -totalAmount,
                segment: 'hole',
                holeNumber: holeNum,
                description: `#${proximityB} vs #${proximityA}${accumulated > 0 ? ` (+$${accumulated} acum)` : ''}`,
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
                description: `#${proximityB} vs #${proximityA}${accumulated > 0 ? ` (+$${accumulated} acum)` : ''}`,
              });
              summaries.push({
                playerId: playerA.id,
                vsPlayer: playerB.id,
                betType: 'Oyes',
                amount: -totalAmount,
                segment: 'hole',
                holeNumber: holeNum,
                description: `#${proximityA} vs #${proximityB}${accumulated > 0 ? ` (+$${accumulated} acum)` : ''}`,
              });
            }
            // Tie = no money changes hands
          }
          
          // Reset accumulation after settlement attempt (even on tie)
          accumulated = 0;
          
        } else {
          // Sangrón: No accumulation, everyone should have a number
          // In Sangrón mode, bet ALWAYS settles - players MUST have a number
          if (proximityA === null || proximityA === undefined ||
              proximityB === null || proximityB === undefined) {
            // Skip if not yet entered (but UI should enforce entry in Sangrón)
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
              description: `#${proximityA} vs #${proximityB}`,
            });
            summaries.push({
              playerId: playerB.id,
              vsPlayer: playerA.id,
              betType: 'Oyes',
              amount: -amount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `#${proximityB} vs #${proximityA}`,
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
              description: `#${proximityB} vs #${proximityA}`,
            });
            summaries.push({
              playerId: playerA.id,
              vsPlayer: playerB.id,
              betType: 'Oyes',
              amount: -amount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `#${proximityA} vs #${proximityB}`,
            });
          }
          // Tie = no money changes hands
        }
      }
    }
  }
  
  return summaries;
};
