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
 * Oyeses pair result summary for 100% bonus display
 */
export interface OyesesPairResult {
  playerAId: string;
  playerBId: string;
  winsA: number;
  winsB: number;
  settledHoles: number;
  baseTotal: number; // Total before 100% bonus
  hasZapato: boolean; // true if someone won 100%
  zapatoWinnerId: string | null; // who got the zapato bonus
  zapatoBonus: number; // the bonus amount (equal to base, making total 2x)
}

/**
 * When a player is added mid-round, they may not have a per-player config entry yet.
 * For consistency with the scoring UI, we default to enabled and inherit a reasonable modality.
 */
const getEffectiveOyesesPlayerConfig = (
  playerId: string,
  config: BetConfig
): { enabled: boolean; modality: OyesModality } => {
  // IMPORTANT: Check participantIds FIRST — it is the authoritative source of truth
  // from the Participation Matrix. A stale playerConfigs entry (e.g. from a guest added
  // mid-round) must NOT override an explicit matrix exclusion.
  const participantIds = config.oyeses.participantIds ?? [];
  if (participantIds.length > 0 && !participantIds.includes(playerId)) {
    return { enabled: false, modality: 'acumulados' };
  }

  // Player is in the participation list (or list is empty = everyone).
  // Now check for per-player config to get modality.
  const playerConfig = config.oyeses.playerConfigs.find((pc) => pc.playerId === playerId);
  if (playerConfig) return { enabled: playerConfig.enabled, modality: playerConfig.modality };

  // If missing, inherit a default modality from participating players' configs (if any),
  // otherwise acumulados. We skip configs of excluded players to avoid inheriting
  // a sangron modality from a non-participant.
  const participantConfigs = participantIds.length > 0
    ? config.oyeses.playerConfigs.filter(pc => participantIds.includes(pc.playerId))
    : config.oyeses.playerConfigs;
  const fallbackModality: OyesModality =
    participantConfigs[0]?.modality ?? 'acumulados';

  return { enabled: true, modality: fallbackModality };
};

/**
 * Get Oyeses pair result for zapato detection
 */
export const getOyesesPairResult = (
  playerAId: string,
  playerBId: string,
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): OyesesPairResult | null => {
  if (!config.oyeses.enabled) return null;
  
  const amount = config.oyeses.amount;
  
  // Find Par 3 holes
  const par3Holes = course.holes
    .filter(h => h.par === 3)
    .map(h => h.number);
  
  const cfgA = getEffectiveOyesesPlayerConfig(playerAId, config);
  const cfgB = getEffectiveOyesesPlayerConfig(playerBId, config);
  const modalityA = cfgA.enabled ? cfgA.modality : null;
  const modalityB = cfgB.enabled ? cfgB.modality : null;
  
  if (!modalityA || !modalityB) return null;
  
  // Check explicit pair override first (from individual oyeses bet)
  const pairKey = [playerAId, playerBId].sort().join('_');
  const pairOverride = config.oyesPairModalityOverrides?.[pairKey];
  const pairModality: OyesModality = pairOverride
    ?? ((modalityA === modalityB) ? modalityA : 'sangron');
  
  let accumulated = 0;
  let pendingAccumulatedHoles = 0; // Holes accumulated but not yet won
  let holesWonByA = 0; // Total holes "owned" by A (including accumulated ones when won)
  let holesWonByB = 0; // Total holes "owned" by B
  let totalPlayedHoles = 0; // Total Par 3s that have been played
  let baseTotal = 0; // Money won by A (positive) or B (negative)
  
  for (const holeNum of par3Holes) {
    const scoresA = scores.get(playerAId) || [];
    const scoresB = scores.get(playerBId) || [];
    
    const scoreA = scoresA.find(s => s.holeNumber === holeNum);
    const scoreB = scoresB.find(s => s.holeNumber === holeNum);

    const proximityAcumuladoA = scoreA?.oyesProximity ?? null;
    const proximityAcumuladoB = scoreB?.oyesProximity ?? null;
    const proximitySangronA = scoreA?.oyesProximitySangron ?? null;
    const proximitySangronB = scoreB?.oyesProximitySangron ?? null;

    const proximityA = pairModality === 'sangron' ? proximitySangronA : proximityAcumuladoA;
    const proximityB = pairModality === 'sangron' ? proximitySangronB : proximityAcumuladoB;
    
    if (pairModality === 'acumulados') {
      // In Acumulados, a hole counts as played even if both miss (it can carry).
      totalPlayedHoles++;

      const hasNumberA = proximityA !== null && proximityA !== undefined;
      const hasNumberB = proximityB !== null && proximityB !== undefined;
      
      if (!hasNumberA && !hasNumberB) {
        // Both miss - accumulate this hole
        accumulated += amount;
        pendingAccumulatedHoles++;
        continue;
      }
      
      const totalAmount = amount + accumulated;
      const holesBeingWon = 1 + pendingAccumulatedHoles; // This hole + accumulated holes
      
      if (hasNumberA && !hasNumberB) {
        // A wins - gets this hole plus all accumulated
        holesWonByA += holesBeingWon;
        baseTotal += totalAmount;
      } else if (!hasNumberA && hasNumberB) {
        // B wins
        holesWonByB += holesBeingWon;
        baseTotal -= totalAmount;
      } else {
        // Both have numbers - compare
        if (proximityA! < proximityB!) {
          holesWonByA += holesBeingWon;
          baseTotal += totalAmount;
        } else if (proximityB! < proximityA!) {
          holesWonByB += holesBeingWon;
          baseTotal -= totalAmount;
        }
        // Tie: no one wins these holes (they're "lost")
      }
      
      accumulated = 0;
      pendingAccumulatedHoles = 0;
      
    } else {
      // Sangrón: A hole only counts once BOTH players have a proximity value.
      // (Prevents an unentered/missing Par 3 from blocking Zapato.)
      if (proximityA === null || proximityA === undefined ||
          proximityB === null || proximityB === undefined) {
        continue;
      }

      totalPlayedHoles++;
      
      if (proximityA < proximityB) {
        holesWonByA++;
        baseTotal += amount;
      } else if (proximityB < proximityA) {
        holesWonByB++;
        baseTotal -= amount;
      }
      // Tie: no one wins this hole
    }
  }
  
  // Zapato: One player won ALL played holes, with no pending accumulations
  // For Acumulados: pendingAccumulatedHoles must be 0 (all resolved)
  // For Sangrón: every hole has a clear winner going to one player
  const oyesZapatoEnabled = config.oyeses?.zapatoEnabled !== false; // defaults to true
  const hasZapato = oyesZapatoEnabled && totalPlayedHoles > 0 && 
    pendingAccumulatedHoles === 0 &&
    (holesWonByA === totalPlayedHoles || holesWonByB === totalPlayedHoles);
  
  const zapatoWinnerId = hasZapato ? (holesWonByA === totalPlayedHoles ? playerAId : playerBId) : null;
  const zapatoBonus = hasZapato ? Math.abs(baseTotal) : 0;
  
  return {
    playerAId,
    playerBId,
    winsA: holesWonByA,
    winsB: holesWonByB,
    settledHoles: totalPlayedHoles,
    baseTotal: Math.abs(baseTotal),
    hasZapato,
    zapatoWinnerId,
    zapatoBonus,
  };
};

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
  
  const cfgA = getEffectiveOyesesPlayerConfig(playerAId, config);
  const cfgB = getEffectiveOyesesPlayerConfig(playerBId, config);
  const modalityA = cfgA.enabled ? cfgA.modality : null;
  const modalityB = cfgB.enabled ? cfgB.modality : null;
  
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
    
    const proximityAcumuladoA = scoreA?.oyesProximity ?? null;
    const proximityAcumuladoB = scoreB?.oyesProximity ?? null;
    const proximitySangronA = scoreA?.oyesProximitySangron ?? null;
    const proximitySangronB = scoreB?.oyesProximitySangron ?? null;

    const proximityA = pairModality === 'sangron' ? proximitySangronA : proximityAcumuladoA;
    const proximityB = pairModality === 'sangron' ? proximitySangronB : proximityAcumuladoB;
    
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
 * - **100% RULE**: If a player wins ALL Par 3 holes against a rival (100%), 
 *   the total is DOUBLED.
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
  
  const getPlayerModality = (playerId: string): OyesModality | null => {
    const cfg = getEffectiveOyesesPlayerConfig(playerId, config);
    return cfg.enabled ? cfg.modality : null;
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
      let pendingAccumulatedHoles = 0; // Holes waiting to be won
      
      // Track holes won for 100% rule (including accumulated holes when won)
      let holesWonByA = 0;
      let holesWonByB = 0;
      let totalPlayedHoles = 0;
      
      // Temporary storage for pair's summaries (to apply Zapato bonus)
      const pairSummaries: BetSummary[] = [];
      
      // Process each Par 3 hole
      for (const holeNum of par3Holes) {
        const scoresA = scores.get(playerA.id) || [];
        const scoresB = scores.get(playerB.id) || [];
        
        const scoreA = scoresA.find(s => s.holeNumber === holeNum);
        const scoreB = scoresB.find(s => s.holeNumber === holeNum);

        const proximityAcumuladoA = scoreA?.oyesProximity ?? null;
        const proximityAcumuladoB = scoreB?.oyesProximity ?? null;
        const proximitySangronA = scoreA?.oyesProximitySangron ?? null;
        const proximitySangronB = scoreB?.oyesProximitySangron ?? null;

        const proximityA = pairModality === 'sangron' ? proximitySangronA : proximityAcumuladoA;
        const proximityB = pairModality === 'sangron' ? proximitySangronB : proximityAcumuladoB;
        
         if (pairModality === 'acumulados') {
           // In Acumulados, the hole counts as played even if both miss (carry).
           totalPlayedHoles++;

          // Acumulados: null proximity means didn't reach green in 1
           const hasNumberA = proximityA !== null && proximityA !== undefined;
           const hasNumberB = proximityB !== null && proximityB !== undefined;
          
          if (!hasNumberA && !hasNumberB) {
            // Neither reached green - accumulate this hole
            accumulated += amount;
            pendingAccumulatedHoles++;
            continue;
          }
          
          // At least one has a number - settle
          const totalAmount = amount + accumulated;
          const holesBeingWon = 1 + pendingAccumulatedHoles; // This hole + accumulated
          
          if (hasNumberA && !hasNumberB) {
            // A wins - gets this hole plus all accumulated
            holesWonByA += holesBeingWon;
            pairSummaries.push({
              playerId: playerA.id,
              vsPlayer: playerB.id,
              betType: 'Oyes',
              amount: totalAmount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `#${proximityA} vs ✗${accumulated > 0 ? ` (+$${accumulated} acum)` : ''}`,
            });
            pairSummaries.push({
              playerId: playerB.id,
              vsPlayer: playerA.id,
              betType: 'Oyes',
              amount: -totalAmount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `✗ vs #${proximityA}${accumulated > 0 ? ` (+$${accumulated} acum)` : ''}`,
            });
          } else if (!hasNumberA && hasNumberB) {
            // B wins
            holesWonByB += holesBeingWon;
            pairSummaries.push({
              playerId: playerB.id,
              vsPlayer: playerA.id,
              betType: 'Oyes',
              amount: totalAmount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `#${proximityB} vs ✗${accumulated > 0 ? ` (+$${accumulated} acum)` : ''}`,
            });
            pairSummaries.push({
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
              holesWonByA += holesBeingWon;
              pairSummaries.push({
                playerId: playerA.id,
                vsPlayer: playerB.id,
                betType: 'Oyes',
                amount: totalAmount,
                segment: 'hole',
                holeNumber: holeNum,
                description: `#${proximityA} vs #${proximityB}${accumulated > 0 ? ` (+$${accumulated} acum)` : ''}`,
              });
              pairSummaries.push({
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
              holesWonByB += holesBeingWon;
              pairSummaries.push({
                playerId: playerB.id,
                vsPlayer: playerA.id,
                betType: 'Oyes',
                amount: totalAmount,
                segment: 'hole',
                holeNumber: holeNum,
                description: `#${proximityB} vs #${proximityA}${accumulated > 0 ? ` (+$${accumulated} acum)` : ''}`,
              });
              pairSummaries.push({
                playerId: playerA.id,
                vsPlayer: playerB.id,
                betType: 'Oyes',
                amount: -totalAmount,
                segment: 'hole',
                holeNumber: holeNum,
                description: `#${proximityA} vs #${proximityB}${accumulated > 0 ? ` (+$${accumulated} acum)` : ''}`,
              });
            }
            // Tie = no one wins these holes
          }
          
          // Reset accumulation after settlement
          accumulated = 0;
          pendingAccumulatedHoles = 0;
          
         } else {
          // Sangrón: No accumulation, everyone should have a number
          // In Sangrón mode, bet ALWAYS settles - players MUST have a number
          if (proximityA === null || proximityA === undefined ||
              proximityB === null || proximityB === undefined) {
            // Skip if not yet entered (but UI should enforce entry in Sangrón)
            continue;
          }

           // Only count as played once BOTH proximities exist.
           totalPlayedHoles++;
          
          if (proximityA < proximityB) {
            // A is closer
            holesWonByA++;
            pairSummaries.push({
              playerId: playerA.id,
              vsPlayer: playerB.id,
              betType: 'Oyes',
              amount: amount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `#${proximityA} vs #${proximityB}`,
            });
            pairSummaries.push({
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
            holesWonByB++;
            pairSummaries.push({
              playerId: playerB.id,
              vsPlayer: playerA.id,
              betType: 'Oyes',
              amount: amount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `#${proximityB} vs #${proximityA}`,
            });
            pairSummaries.push({
              playerId: playerA.id,
              vsPlayer: playerB.id,
              betType: 'Oyes',
              amount: -amount,
              segment: 'hole',
              holeNumber: holeNum,
              description: `#${proximityA} vs #${proximityB}`,
            });
          }
          // Tie = no one wins this hole
        }
      }
      
      // Check for Zapato (100% win rule):
      // - All played holes must be resolved (no pending accumulations)
      // - One player must have won ALL the holes
      const oyesZapatoEnabled2 = config.oyeses?.zapatoEnabled !== false;
      const hasZapato = oyesZapatoEnabled2 && totalPlayedHoles > 0 && 
        pendingAccumulatedHoles === 0 &&
        (holesWonByA === totalPlayedHoles || holesWonByB === totalPlayedHoles);
      
      if (hasZapato && pairSummaries.length > 0) {
        // Calculate the base total for this pair
        const baseTotal = pairSummaries
          .filter(s => s.playerId === playerA.id)
          .reduce((sum, s) => sum + s.amount, 0);
        
        const zapatoWinnerId = holesWonByA === totalPlayedHoles ? playerA.id : playerB.id;
        const zapatoLoserId = zapatoWinnerId === playerA.id ? playerB.id : playerA.id;
        const zapatoBonus = Math.abs(baseTotal);
        
        // Add Zapato bonus as separate entry
        pairSummaries.push({
          playerId: zapatoWinnerId,
          vsPlayer: zapatoLoserId,
          betType: 'Oyes',
          amount: zapatoBonus,
          segment: 'total',
          description: '🥾 Zapato (100%)',
        });
        pairSummaries.push({
          playerId: zapatoLoserId,
          vsPlayer: zapatoWinnerId,
          betType: 'Oyes',
          amount: -zapatoBonus,
          segment: 'total',
          description: '🥾 Zapato (100%)',
        });
      }
      
      // Add pair summaries to main list
      summaries.push(...pairSummaries);
    }
  }
  
  return summaries;
};
