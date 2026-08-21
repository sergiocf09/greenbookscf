// Oyeses (Closest to the Pin) Calculations
import { Player, PlayerScore, BetConfig, GolfCourse, OyesModality } from '@/types/golf';
import { BetSummary, sortHolesByPlayOrder } from './bets/shared';

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
  // EXCEPTION: in oneVsAll mode, every player participates (anchor vs all others);
  // pair filtering happens at the pair-loop level via shouldCalculatePair.
  const oneVsAll = (config.oyeses as any)?.oneVsAll === true && (config.oyeses as any)?.anchorPlayerId;
  const participantIds = oneVsAll ? [] : (config.oyeses.participantIds ?? []);
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
 * Resolve the per-pair Oyes bet amount, honoring pair-level betOverrides.
 * Falls back to the global config.oyeses.amount when no override exists.
 * Matches overrides stored with either player.id or player.profileId.
 */
/**
 * In 9-hole rounds only the played nine counts for Oyeses (and therefore for
 * the Zapato 100% rule). 18-hole rounds keep every Par 3.
 */
const isHoleInPlayedRound = (
  holeNumber: number,
  config: BetConfig,
  startingHole: 1 | 10 = 1
): boolean => {
  if ((config.roundHoles ?? 18) !== 9) return true;
  return startingHole === 10 ? holeNumber >= 10 : holeNumber <= 9;
};

export const getOyesesPairAmount = (
  config: BetConfig,
  playerAId: string,
  playerBId: string,
  players?: Player[]
): number => {
  const baseAmount = config.oyeses?.amount ?? 0;
  const overrides = config.betOverrides;
  if (!overrides || overrides.length === 0) return baseAmount;

  const idsForPlayer = (pid: string): string[] => {
    const ids = new Set<string>([pid]);
    if (players) {
      const p = players.find((x) => x.id === pid || x.profileId === pid);
      if (p) {
        ids.add(p.id);
        if (p.profileId) ids.add(p.profileId);
      }
    }
    return Array.from(ids);
  };

  const idsA = idsForPlayer(playerAId);
  const idsB = idsForPlayer(playerBId);

  const match = overrides.find((o) => {
    if (o.enabled === false) return false;
    if ((o.betType ?? '').toLowerCase() !== 'oyes') return false;
    const pairMatches =
      (idsA.includes(o.playerAId) && idsB.includes(o.playerBId)) ||
      (idsA.includes(o.playerBId) && idsB.includes(o.playerAId));
    return pairMatches && typeof o.amountOverride === 'number' && Number.isFinite(o.amountOverride);
  });

  return match?.amountOverride ?? baseAmount;
};

/**
 * Get Oyeses pair result for zapato detection
 */
export const getOyesesPairResult = (
  playerAId: string,
  playerBId: string,
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  startingHole: 1 | 10 = 1
): OyesesPairResult | null => {
  if (!config.oyeses.enabled) return null;

  // oneVsAll: only pairs including the anchor settle
  const _ovaOn = (config.oyeses as any)?.oneVsAll === true;
  const _ovaAnchor: string | undefined = _ovaOn ? (config.oyeses as any)?.anchorPlayerId : undefined;
  if (_ovaOn && _ovaAnchor && playerAId !== _ovaAnchor && playerBId !== _ovaAnchor) return null;
  
  const amount = getOyesesPairAmount(config, playerAId, playerBId);

  
  // Find Par 3 holes
  const par3Holes = course.holes
    .filter(h => h.par === 3)
    .map(h => h.number)
    .filter(n => isHoleInPlayedRound(n, config, startingHole));
  const orderedPar3Holes = sortHolesByPlayOrder(par3Holes, startingHole);
  
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
  
  for (const holeNum of orderedPar3Holes) {
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
  const pairZapatoOverride = config.oyesPairZapatoOverrides?.[pairKey];
  const oyesZapatoEnabled = pairZapatoOverride !== undefined
    ? pairZapatoOverride
    : (config.oyeses?.zapatoEnabled !== false); // defaults to true
  const hasZapato = oyesZapatoEnabled && totalPlayedHoles >= 2 && 
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
  course: GolfCourse,
  /** Optional override to force display in a specific modality (for tabs in dashboard) */
  forceModality?: OyesModality,
  startingHole: 1 | 10 = 1
): { playerAHoles: OyesHoleDisplay[]; playerBHoles: OyesHoleDisplay[] } => {
  const playerAHoles: OyesHoleDisplay[] = [];
  const playerBHoles: OyesHoleDisplay[] = [];
  
  // When forcing a modality (display-only for dashboard tabs), bypass the
  // per-player enabled/modality checks so we can render proximities even if
  // the individual Oyes bet isn't configured for this exact modality.
  if (!config.oyeses?.enabled && !forceModality) return { playerAHoles, playerBHoles };
  
  const amount = getOyesesPairAmount(config, playerAId, playerBId);
  
  // Find Par 3 holes
  const par3Holes = course.holes
    .filter(h => h.par === 3)
    .map(h => h.number)
    .filter(n => isHoleInPlayedRound(n, config, startingHole));
  const orderedPar3Holes = sortHolesByPlayOrder(par3Holes, startingHole);
  
  let pairModality: OyesModality;
  
  if (forceModality) {
    pairModality = forceModality;
  } else {
    const cfgA = getEffectiveOyesesPlayerConfig(playerAId, config);
    const cfgB = getEffectiveOyesesPlayerConfig(playerBId, config);
    const modalityA = cfgA.enabled ? cfgA.modality : null;
    const modalityB = cfgB.enabled ? cfgB.modality : null;
    
    if (!modalityA || !modalityB) return { playerAHoles, playerBHoles };
    
    // Determine the pair's effective modality
    const pairKey = [playerAId, playerBId].sort().join('_');
    const pairOverride = config.oyesPairModalityOverrides?.[pairKey];
    pairModality = pairOverride
      ?? ((modalityA === modalityB) ? modalityA : 'sangron');
  }
  
  let accumulated = 0;
  
  for (const holeNum of orderedPar3Holes) {
    const scoresA = scores.get(playerAId) || [];
    const scoresB = scores.get(playerBId) || [];
    
    const scoreA = scoresA.find(s => s.holeNumber === holeNum);
    const scoreB = scoresB.find(s => s.holeNumber === holeNum);
    
    const proximityAcumuladoA = scoreA?.oyesProximity ?? null;
    const proximityAcumuladoB = scoreB?.oyesProximity ?? null;
    const proximitySangronA = scoreA?.oyesProximitySangron ?? null;
    const proximitySangronB = scoreB?.oyesProximitySangron ?? null;

    // Sangrón fallback: when no explicit Sangrón value is captured for a player,
    // mirror the Acumulado value (matches OyesesDialog inheritance behavior).
    // This handles cases where most players capture in Acumulado and only one
    // (e.g., Raúl) differs in Sangrón.
    const proximityA = pairModality === 'sangron'
      ? (proximitySangronA ?? proximityAcumuladoA)
      : proximityAcumuladoA;
    const proximityB = pairModality === 'sangron'
      ? (proximitySangronB ?? proximityAcumuladoB)
      : proximityAcumuladoB;
    
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
  course: GolfCourse,
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!config.oyeses.enabled) return [];
  
  const summaries: BetSummary[] = [];
  const singleWinnerMode = !!config.oyeses.singleWinner;

  
  // Find all Par 3 holes
  const par3Holes = course.holes
    .filter(h => h.par === 3)
    .map(h => h.number)
    .filter(n => isHoleInPlayedRound(n, config, startingHole));
  const orderedPar3Holes = sortHolesByPlayOrder(par3Holes, startingHole);
  
  const getPlayerModality = (playerId: string): OyesModality | null => {
    const cfg = getEffectiveOyesesPlayerConfig(playerId, config);
    return cfg.enabled ? cfg.modality : null;
  };
  
  const oneVsAllOn = (config.oyeses as any)?.oneVsAll === true;
  const anchorId: string | undefined = oneVsAllOn ? (config.oyeses as any)?.anchorPlayerId : undefined;

  // Process each pair of players
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];

      // oneVsAll filter: only pairs that include the anchor are settled
      if (oneVsAllOn && anchorId && playerA.id !== anchorId && playerB.id !== anchorId) continue;

      // Per-pair bet amount (honors betOverrides for this specific pair)
      const amount = getOyesesPairAmount(config, playerA.id, playerB.id, players);


      const modalityA = getPlayerModality(playerA.id);
      const modalityB = getPlayerModality(playerB.id);

      if (!modalityA || !modalityB) continue;
      
      // Determine the pair's effective modality
      const pairKey = [playerA.id, playerB.id].sort().join('_');
      const pairOverride = config.oyesPairModalityOverrides?.[pairKey];
      const pairModality: OyesModality = pairOverride
        ?? ((modalityA === modalityB) ? modalityA : 'sangron');
      
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
      for (const holeNum of orderedPar3Holes) {
        const scoresA = scores.get(playerA.id) || [];
        const scoresB = scores.get(playerB.id) || [];
        
        const scoreA = scoresA.find(s => s.holeNumber === holeNum);
        const scoreB = scoresB.find(s => s.holeNumber === holeNum);

        const proximityAcumuladoA = scoreA?.oyesProximity ?? null;
        const proximityAcumuladoB = scoreB?.oyesProximity ?? null;
        const proximitySangronA = scoreA?.oyesProximitySangron ?? null;
        const proximitySangronB = scoreB?.oyesProximitySangron ?? null;

        // Sangrón fallback: mirror Acumulado when no explicit Sangrón is captured
        // (matches OyesesDialog inheritance behavior).
        const proximityA = pairModality === 'sangron'
          ? (proximitySangronA ?? proximityAcumuladoA)
          : proximityAcumuladoA;
        const proximityB = pairModality === 'sangron'
          ? (proximitySangronB ?? proximityAcumuladoB)
          : proximityAcumuladoB;
        
        // ============= SINGLE-WINNER MODE =============
        // Only #1 (closest) wins. The #1 globally collects from everyone.
        // For this pair (A,B): if W ∈ {A,B}, W beats the other; if W ∉ {A,B}, neither
        // wins from the other (the hole "carries" for the pair in acumulados, or is a wash in sangrón).
        if (singleWinnerMode) {
          // Find the global #1 across ALL players with the same proximity field as this pair's modality.
          const findGlobalWinner = (): string | null => {
            const winners: string[] = [];
            for (const p of players) {
              const ps = scores.get(p.id) || [];
              const s = ps.find(x => x.holeNumber === holeNum);
              const prox = pairModality === 'sangron'
                ? (s?.oyesProximitySangron ?? s?.oyesProximity ?? null)
                : (s?.oyesProximity ?? null);
              if (prox === 1) winners.push(p.id);
            }
            return winners.length === 1 ? winners[0] : null;
          };
          const winnerId = findGlobalWinner();

          if (pairModality === 'acumulados') {
            totalPlayedHoles++;
            if (!winnerId) {
              accumulated += amount;
              pendingAccumulatedHoles++;
              continue;
            }
            const totalAmount = amount + accumulated;
            const holesBeingWon = 1 + pendingAccumulatedHoles;
            const acumLabel = accumulated > 0 ? ` (+$${accumulated} acum)` : '';
            if (winnerId === playerA.id) {
              holesWonByA += holesBeingWon;
              pairSummaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Oyes', amount: totalAmount, segment: 'hole', holeNumber: holeNum, description: `#1 (único)${acumLabel}` });
              pairSummaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Oyes', amount: -totalAmount, segment: 'hole', holeNumber: holeNum, description: `vs #1 (único)${acumLabel}` });
            } else if (winnerId === playerB.id) {
              holesWonByB += holesBeingWon;
              pairSummaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Oyes', amount: totalAmount, segment: 'hole', holeNumber: holeNum, description: `#1 (único)${acumLabel}` });
              pairSummaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Oyes', amount: -totalAmount, segment: 'hole', holeNumber: holeNum, description: `vs #1 (único)${acumLabel}` });
            }
            // If winner is a 3rd player, the pair (A,B) does NOT settle and pot keeps accumulating for them.
            // But to mirror the global single-winner semantics, the pot resets globally — so reset for this pair too.
            accumulated = 0;
            pendingAccumulatedHoles = 0;
          } else {
            // Sangrón single-winner: settle each Par 3 immediately if a global #1 exists.
            if (!winnerId) continue;
            totalPlayedHoles++;
            if (winnerId === playerA.id) {
              holesWonByA++;
              pairSummaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Oyes', amount, segment: 'hole', holeNumber: holeNum, description: '#1 (único)' });
              pairSummaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Oyes', amount: -amount, segment: 'hole', holeNumber: holeNum, description: 'vs #1 (único)' });
            } else if (winnerId === playerB.id) {
              holesWonByB++;
              pairSummaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: 'Oyes', amount, segment: 'hole', holeNumber: holeNum, description: '#1 (único)' });
              pairSummaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: 'Oyes', amount: -amount, segment: 'hole', holeNumber: holeNum, description: 'vs #1 (único)' });
            }
            // Winner is a 3rd player: nothing changes for this pair (no money flows between A and B).
          }
          continue;
        }
        // ============= END SINGLE-WINNER MODE =============
        
        
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
      const pairZapatoOverride2 = config.oyesPairZapatoOverrides?.[pairKey];
      const oyesZapatoEnabled2 = pairZapatoOverride2 !== undefined
        ? pairZapatoOverride2
        : (config.oyeses?.zapatoEnabled !== false);
      const hasZapato = oyesZapatoEnabled2 && totalPlayedHoles >= 2 && 
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
        // Use `units` so that betOverrides amountOverride scales correctly
        const zapatoHoles = holesWonByA === totalPlayedHoles ? holesWonByA : holesWonByB;
        pairSummaries.push({
          playerId: zapatoWinnerId,
          vsPlayer: zapatoLoserId,
          betType: 'Oyes',
          amount: zapatoBonus,
          segment: 'total',
          description: '🥾 Zapato (100%)',
          units: zapatoHoles,
        });
        pairSummaries.push({
          playerId: zapatoLoserId,
          vsPlayer: zapatoWinnerId,
          betType: 'Oyes',
          amount: -zapatoBonus,
          segment: 'total',
          description: '🥾 Zapato (100%)',
          units: zapatoHoles,
        });
      }
      
      // Add pair summaries to main list
      summaries.push(...pairSummaries);
    }
  }
  
  return summaries;
};
