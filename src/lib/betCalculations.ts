// Bet Calculations Engine - All bilateral calculations
import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap, MedalGeneralPlayerConfig } from '@/types/golf';
import { calculateOyesesBets } from './oyesesCalculations';
import { calculateRayasBets } from './rayasCalculations';
import { calculateConejaBets } from './conejaCalculations';
import { calculateStrokesPerHole, getSegmentHoleRanges } from './handicapUtils';

export interface BetSummary {
  playerId: string;
  vsPlayer: string;
  betType: string;
  amount: number; // positive = winning, negative = losing
  segment: 'front' | 'back' | 'total' | 'hole';
  holeNumber?: number;
  description?: string;
  // Optional fields used to correctly apply per-pair amount overrides.
  units?: number; // signed unit count (e.g., -7 skins, +2 presiones)
  baseUnitAmount?: number; // value per unit (e.g., $25 per skin)
  multiplier?: number; // e.g., x2 for skins zapato/sweep
}

// Get bilateral handicap for a specific pair of players
// Supports matching by both player.id and player.profileId since overrides may use either
export const getBilateralHandicapForPair = (
  playerAId: string,
  playerBId: string,
  bilateralHandicaps?: BilateralHandicap[],
  playerAProfileId?: string,
  playerBProfileId?: string
): BilateralHandicap | undefined => {
  if (!bilateralHandicaps) return undefined;
  
  // Match function that checks both id and profileId
  const matches = (overrideId: string, id: string, profileId?: string): boolean => {
    return overrideId === id || (profileId !== undefined && overrideId === profileId);
  };
  
  return bilateralHandicaps.find(
    h => (matches(h.playerAId, playerAId, playerAProfileId) && matches(h.playerBId, playerBId, playerBProfileId)) ||
         (matches(h.playerAId, playerBId, playerBProfileId) && matches(h.playerBId, playerAId, playerAProfileId))
  );
};

// Recalculate net scores for a pair based on bilateral handicap overrides
// Returns a new scores map with recalculated net scores for the pair
export const getAdjustedScoresForPair = (
  playerA: Player,
  playerB: Player,
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[]
): Map<string, PlayerScore[]> => {
  // Pass profileId to support overrides stored with profile IDs
  const override = getBilateralHandicapForPair(
    playerA.id, 
    playerB.id, 
    bilateralHandicaps,
    playerA.profileId,
    playerB.profileId
  );
  
  // If no override, return original scores
  if (!override) return scores;
  
  // Determine which player is A and which is B in the override
  // Check both id and profileId for matching
  const matchesPlayerA = (id: string) => 
    id === playerA.id || (playerA.profileId && id === playerA.profileId);
  const isPlayerAFirst = matchesPlayerA(override.playerAId);
  const handicapA = isPlayerAFirst ? override.playerAHandicap : override.playerBHandicap;
  const handicapB = isPlayerAFirst ? override.playerBHandicap : override.playerAHandicap;
  
  // Calculate strokes per hole for each player with overridden handicaps
  const strokesPerHoleA = calculateStrokesPerHole(handicapA, course);
  const strokesPerHoleB = calculateStrokesPerHole(handicapB, course);
  
  // Create new scores map with adjusted net scores
  const adjustedScores = new Map<string, PlayerScore[]>();
  
  // Copy all scores, adjusting only for playerA and playerB
  scores.forEach((playerScores, playerId) => {
    if (playerId === playerA.id) {
      adjustedScores.set(playerId, playerScores.map(score => ({
        ...score,
        strokesReceived: strokesPerHoleA[score.holeNumber - 1],
        netScore: score.strokes - strokesPerHoleA[score.holeNumber - 1]
      })));
    } else if (playerId === playerB.id) {
      adjustedScores.set(playerId, playerScores.map(score => ({
        ...score,
        strokesReceived: strokesPerHoleB[score.holeNumber - 1],
        netScore: score.strokes - strokesPerHoleB[score.holeNumber - 1]
      })));
    } else {
      adjustedScores.set(playerId, playerScores);
    }
  });
  
  return adjustedScores;
};

// Calculate net score for a segment (front 9, back 9, or total)
// Supports startingHole to swap front/back when starting at hole 10
const getSegmentHoleRange = (segment: 'front' | 'back' | 'total', startingHole: 1 | 10 = 1): [number, number] => {
  if (segment === 'total') return [1, 18];
  const ranges = getSegmentHoleRanges(startingHole);
  return segment === 'front' ? ranges.front : ranges.back;
};

// Sum net totals for a segment using ONLY the holes that exist for that player.
// (Used by Medal display mode where we want "all holes of the player" instead of mutual holes.)
const getSegmentNetTotal = (
  playerId: string,
  scores: Map<string, PlayerScore[]>,
  segment: 'front' | 'back' | 'total',
  startingHole: 1 | 10 = 1
): number => {
  const [start, end] = getSegmentHoleRange(segment, startingHole);
  const playerScores = scores.get(playerId) || [];
  return playerScores
    .filter((s) => s.confirmed && s.holeNumber >= start && s.holeNumber <= end)
    .reduce((sum, s) => {
      const net = Number.isFinite(s.netScore) ? s.netScore : Number.isFinite(s.strokes) ? s.strokes : 0;
      return sum + net;
    }, 0);
};

// IMPORTANT:
// For bilateral comparisons we must sum over the SAME set of holes for both players.
// If one player is missing a hole (late join / sync), comparing totals across different
// hole counts produces incorrect "net" numbers.
const getMutualSegmentNetTotals = (
  playerAId: string,
  playerBId: string,
  scores: Map<string, PlayerScore[]>,
  segment: 'front' | 'back' | 'total',
  startingHole: 1 | 10 = 1
): { netA: number; netB: number } => {
  const [start, end] = getSegmentHoleRange(segment, startingHole);
  const aScores = (scores.get(playerAId) || []).filter((s) => s.holeNumber >= start && s.holeNumber <= end);
  const bScores = (scores.get(playerBId) || []).filter((s) => s.holeNumber >= start && s.holeNumber <= end);

  const aByHole = new Map<number, PlayerScore>();
  aScores.forEach((s) => aByHole.set(s.holeNumber, s));

  const bByHole = new Map<number, PlayerScore>();
  bScores.forEach((s) => bByHole.set(s.holeNumber, s));

  let netA = 0;
  let netB = 0;
  for (let hole = start; hole <= end; hole++) {
    const a = aByHole.get(hole);
    const b = bByHole.get(hole);
    if (!a || !b) continue;

    // Be defensive: restored rows can be inconsistent during sync
    const aNet = Number.isFinite(a.netScore) ? a.netScore : Number.isFinite(a.strokes) ? a.strokes : 0;
    const bNet = Number.isFinite(b.netScore) ? b.netScore : Number.isFinite(b.strokes) ? b.strokes : 0;
    netA += aNet;
    netB += bNet;
  }

  return { netA, netB };
};

// Get strokes for specific hole
const getHoleScore = (
  playerId: string,
  holeNumber: number,
  scores: Map<string, PlayerScore[]>,
  useNet: boolean = true
): number | null => {
  const playerScores = scores.get(playerId) || [];
  const score = playerScores.find(s => s.holeNumber === holeNumber);
  if (!score) return null;
  return useNet ? (score.netScore ?? score.strokes) : score.strokes;
};

// MEDAL: Compare net totals for segments
export const calculateMedalBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!config.medal.enabled) return [];
  
  const summaries: BetSummary[] = [];
  
  const segments: Array<{ key: 'front' | 'back' | 'total'; amount: number; label: string }> = [
    { key: 'front', amount: config.medal.frontAmount, label: 'Medal Front 9' },
    { key: 'back', amount: config.medal.backAmount, label: 'Medal Back 9' },
    { key: 'total', amount: config.medal.totalAmount, label: 'Medal Total' },
  ];
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      // Get adjusted scores for this pair based on bilateral handicap overrides
      const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);
      
      segments.forEach(({ key, amount, label }) => {
        if (amount <= 0) return;

          // Medal (requested behavior): compare each player's accumulated net over THEIR confirmed holes.
          // This intentionally does not require mutual holes.
          const netA = getSegmentNetTotal(playerA.id, adjustedScores, key, startingHole);
          const netB = getSegmentNetTotal(playerB.id, adjustedScores, key, startingHole);
        
        if (netA < netB) {
          // Player A wins
          summaries.push({
            playerId: playerA.id,
            vsPlayer: playerB.id,
            betType: label,
            amount: amount,
            segment: key,
            description: `${netA} vs ${netB}`,
          });
          summaries.push({
            playerId: playerB.id,
            vsPlayer: playerA.id,
            betType: label,
            amount: -amount,
            segment: key,
            description: `${netB} vs ${netA}`,
          });
        } else if (netB < netA) {
          // Player B wins
          summaries.push({
            playerId: playerB.id,
            vsPlayer: playerA.id,
            betType: label,
            amount: amount,
            segment: key,
            description: `${netB} vs ${netA}`,
          });
          summaries.push({
            playerId: playerA.id,
            vsPlayer: playerB.id,
            betType: label,
            amount: -amount,
            segment: key,
            description: `${netA} vs ${netB}`,
          });
        }
        // Tie = no money changes hands
      });
    }
  }
  
  return summaries;
};

// PRESSURES: Cascading bet system - CORRECTED LOGIC
// - Each pressure bet only counts 1x the bet value (not multiplied by score)
// - When front 9 is tied ("Even"), it's a "carry" - back 9 pressures are worth 2x front + totalAmount
// - Match 18 is cancelled when there's a carry
// - IMPORTANT: totalAmount for Match 18 is calculated as frontAmount + backAmount
export const calculatePressureBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!config.pressures.enabled) return [];
  
  const summaries: BetSummary[] = [];
  
  // Get hole ranges based on starting hole
  const ranges = getSegmentHoleRanges(startingHole);
  const frontHoles = Array.from({ length: 9 }, (_, i) => ranges.front[0] + i);
  const backHoles = Array.from({ length: 9 }, (_, i) => ranges.back[0] + i);
  
  // Total 18 (Match) uses its own configured amount
  const totalMatchAmount = config.pressures.totalAmount;

  // Resolve per-pair amount overrides (stored in betConfig.betOverrides) for the labels
  // emitted by this calculator.
  const getPairOverrideAmount = (
    playerAId: string,
    playerBId: string,
    label: string
  ): number | undefined => {
    const overrides = config.betOverrides;
    if (!overrides || overrides.length === 0) return undefined;

    const match = overrides.find((o) => {
      const matchesPair =
        (o.playerAId === playerAId && o.playerBId === playerBId) ||
        (o.playerAId === playerBId && o.playerBId === playerAId);
      if (!matchesPair) return false;
      if (o.enabled === false) return false;
      return (o.betType ?? '').toLowerCase() === label.toLowerCase();
    });

    if (!match) return undefined;
    return typeof match.amountOverride === 'number' && Number.isFinite(match.amountOverride)
      ? match.amountOverride
      : undefined;
  };
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      // Get adjusted scores for this pair based on bilateral handicap overrides
      const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);
      
      // Process a nine and return bets array
      // PRESSURE LOGIC: 
      // - Only the LAST opened bet can trigger a new bet
      // - When the last bet reaches ±2, a NEW bet opens at 0 on the NEXT hole
      // - Once a new bet opens, the previous bets continue accumulating but cannot trigger more bets
      const processNine = (holes: number[]): number[] => {
        let bets: number[] = [0]; // Start with first bet at 0
        let lastBetCanTrigger = true; // Only the last bet can trigger new bets
        
        holes.forEach((holeNum, holeIndex) => {
          const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
          const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
          
          if (scoreA === null || scoreB === null) return;
          
          let holeResult = 0;
          if (scoreA < scoreB) holeResult = 1;
          else if (scoreB < scoreA) holeResult = -1;
          
          // Apply the hole result to ALL active bets
          bets = bets.map(bal => bal + holeResult);
          
          // Check if the LAST bet (most recent) reached ±2 after this hole
          // Only the last bet can trigger a new bet opening
          const isLastHole = holeIndex === holes.length - 1;
          if (!isLastHole && lastBetCanTrigger) {
            const lastBetBalance = bets[bets.length - 1];
            if (Math.abs(lastBetBalance) >= 2) {
              // Open a new bet at 0 - this starts fresh from next hole
              bets.push(0);
              // The new bet is now the one that can trigger future bets
              // (lastBetCanTrigger stays true, but now refers to the new last bet)
            }
          }
        });
        
        return bets;
      };
      
      const frontBets = processNine(frontHoles);
      const backBets = processNine(backHoles);
      
      // Carry happens when the MAIN (first) Front-9 pressure line ends Even.
      // There may still be additional opened lines due to cascading triggers.
      const frontIsTied = frontBets[0] === 0;

      // IMPORTANT: Carry needs to use the pair-specific (override) amounts for:
      // - Front 9 (because the formula is F9*2)
      // - Match 18 (because the formula adds Total18)
      // Back 9 base amount is NOT used during carry.
      const frontUnit =
        getPairOverrideAmount(playerA.id, playerB.id, 'Presiones Front') ??
        config.pressures.frontAmount;
      const match18Unit =
        getPairOverrideAmount(playerA.id, playerB.id, 'Presiones Match 18') ??
        totalMatchAmount;
      const backUnit =
        getPairOverrideAmount(playerA.id, playerB.id, 'Presiones Back') ??
        config.pressures.backAmount;
      
      // Front 9 - Each bet result contributes ONLY 1x the bet value
      const frontBetsWonA = frontBets.filter(b => b > 0).length;
      const frontBetsLostA = frontBets.filter(b => b < 0).length;
      const frontNetBets = frontBetsWonA - frontBetsLostA;
      const frontAmountA = frontNetBets * frontUnit;
      
      // Helper to format pressure results: "Even" only if exactly 1 line at 0
      const formatPressureResult = (bets: number[]): string => {
        if (bets.length === 1 && bets[0] === 0) return 'Even';
        return bets.map(b => (b > 0 ? '+' : '') + b).join(' ');
      };
      
      // Front 9 display:
      // - "Even" ONLY when there was exactly one line and it ended 0
      // - If carry applies (main line ended 0), append "(Carry)" even if there are multiple lines
      const frontBaseStr = formatPressureResult(frontBets);
      const frontDisplayStr = frontIsTied ? `${frontBaseStr} (Carry)` : frontBaseStr;
      
      // Inverted results for player B
      const frontInvertedBets = frontBets.map(b => -b);
      const frontBaseStrB = formatPressureResult(frontInvertedBets);
      const frontDisplayStrB = frontIsTied ? `${frontBaseStrB} (Carry)` : frontBaseStrB;
      
      if (frontAmountA !== 0 || frontBets.length > 0) {
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Presiones Front',
          amount: frontAmountA,
          segment: 'front',
          description: frontDisplayStr,
          units: frontNetBets,
          baseUnitAmount: frontUnit,
          multiplier: 1,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Presiones Front',
          amount: -frontAmountA,
          segment: 'front',
          description: frontDisplayStrB,
          units: -frontNetBets,
          baseUnitAmount: frontUnit,
          multiplier: 1,
        });
      }
      
      // Back 9 - Apply carry multiplier if front was tied
      // When carry: back value = 2x frontAmount + totalMatchAmount (NOT backAmount)
      // Example: frontAmount=50, totalAmount=50 -> carry = 2*50+50 = 150
      const effectiveBackValue = frontIsTied 
        ? (2 * frontUnit + match18Unit)
        : backUnit;
      
      const backBetsWonA = backBets.filter(b => b > 0).length;
      const backBetsLostA = backBets.filter(b => b < 0).length;
      const backNetBets = backBetsWonA - backBetsLostA;
      const backAmountA = backNetBets * effectiveBackValue;
      
      const backLabel = frontIsTied ? 'Presiones Back (Carry x2+Match)' : 'Presiones Back';
      
      // Back 9: "Even" only when exactly 1 line at 0
      const backDisplayStr = formatPressureResult(backBets);
      const backInvertedBets = backBets.map(b => -b);
      const backDisplayStrB = formatPressureResult(backInvertedBets);
      
      if (backAmountA !== 0 || backBets.length > 0) {
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: backLabel,
          amount: backAmountA,
          segment: 'back',
          description: backDisplayStr,
          units: backNetBets,
          baseUnitAmount: effectiveBackValue,
          multiplier: 1,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: backLabel,
          amount: -backAmountA,
          segment: 'back',
          description: backDisplayStrB,
          units: -backNetBets,
          baseUnitAmount: effectiveBackValue,
          multiplier: 1,
        });
      }
      
      // Match 18: Only if front 9 was NOT tied
      // Uses its own configured totalAmount
      if (!frontIsTied && totalMatchAmount > 0) {
        const total18Balance = frontBets[0] + backBets[0];
        
        let matchWinner = 0;
        if (total18Balance > 0) matchWinner = 1;
        else if (total18Balance < 0) matchWinner = -1;
        
        const totalAmountA = matchWinner * match18Unit;
        
        // Only show the final balance result, not the sum formula
        const total18Str = total18Balance === 0 ? 'Even' : ((total18Balance >= 0 ? '+' : '') + total18Balance);
        const total18StrB = (-total18Balance) === 0 ? 'Even' : (((-total18Balance) >= 0 ? '+' : '') + (-total18Balance));
        
        if (matchWinner !== 0) {
          summaries.push({
            playerId: playerA.id,
            vsPlayer: playerB.id,
            betType: 'Presiones Match 18',
            amount: totalAmountA,
            segment: 'total',
            description: total18Str,
            units: matchWinner,
            baseUnitAmount: match18Unit,
            multiplier: 1,
          });
          summaries.push({
            playerId: playerB.id,
            vsPlayer: playerA.id,
            betType: 'Presiones Match 18',
            amount: -totalAmountA,
            segment: 'total',
            description: total18StrB,
            units: -matchWinner,
            baseUnitAmount: match18Unit,
            multiplier: 1,
          });
        } else {
          // Tie in Match 18
          summaries.push({
            playerId: playerA.id,
            vsPlayer: playerB.id,
            betType: 'Presiones Match 18',
            amount: 0,
            segment: 'total',
            description: 'Even',
          });
          summaries.push({
            playerId: playerB.id,
            vsPlayer: playerA.id,
            betType: 'Presiones Match 18',
            amount: 0,
            segment: 'total',
            description: 'Even',
          });
        }
      } else if (frontIsTied && totalMatchAmount > 0) {
        // When there's a carry, Match 18 is cancelled - show just "Carry"
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Presiones Match 18',
          amount: 0,
          segment: 'total',
          description: 'Carry',
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Presiones Match 18',
          amount: 0,
          segment: 'total',
          description: 'Carry',
        });
      }
    }
  }
  
  return summaries;
};

// SKINS: Bilateral ACCUMULATED - net holes won per nine with carry over
// If tied holes accumulate and first winner takes the pot
// Tied holes at end = no payout
// DOUBLING RULE: If a player wins ALL 9 holes of a nine, the bet amount DOUBLES
// During play: if winning all decided holes, show as doubled - stops if opponent wins or ties hole 9/18
export const calculateSkinsBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!config.skins.enabled) return [];

  // Variant: ties do NOT accumulate; tied holes are void.
  if ((config.skins.modality ?? 'acumulados') === 'sinAcumular') {
    const summaries: BetSummary[] = [];

    const calcNine = (
      playerA: Player,
      playerB: Player,
      adjustedScores: Map<string, PlayerScore[]>,
      start: number,
      end: number,
      value: number,
      betType: 'Skins Front' | 'Skins Back',
      segment: 'front' | 'back'
    ) => {
      if (value <= 0) return;

      let winsA = 0;
      let winsB = 0;

      for (let holeNum = start; holeNum <= end; holeNum++) {
        const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
        const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
        if (scoreA === null || scoreB === null) continue;
        if (scoreA < scoreB) winsA += 1;
        else if (scoreB < scoreA) winsB += 1;
        // tie => void
      }

      const net = winsA - winsB;
      if (net === 0) return;

      const perfectSweepA = winsA === 9 && winsB === 0;
      const perfectSweepB = winsB === 9 && winsA === 0;
      const multiplier = net > 0 ? (perfectSweepA ? 2 : 1) : (perfectSweepB ? 2 : 1);

      const amount = net * value * multiplier;
      const doubleLabel = multiplier === 2 ? ' (x2)' : '';

      summaries.push({
        playerId: playerA.id,
        vsPlayer: playerB.id,
        betType,
        amount,
        segment,
        description: `${winsA} vs ${winsB} skins${doubleLabel} (sin acumular)`,
      });
      summaries.push({
        playerId: playerB.id,
        vsPlayer: playerA.id,
        betType,
        amount: -amount,
        segment,
        description: `${winsB} vs ${winsA} skins${doubleLabel} (sin acumular)`,
      });
    };

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const playerA = players[i];
        const playerB = players[j];
        const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);

        calcNine(playerA, playerB, adjustedScores, 1, 9, config.skins.frontValue, 'Skins Front', 'front');
        calcNine(playerA, playerB, adjustedScores, 10, 18, config.skins.backValue, 'Skins Back', 'back');
      }
    }

    return summaries;
  }
  
  const summaries: BetSummary[] = [];
  
  // For each pair of players, calculate bilateral skins with accumulation
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      // Get adjusted scores for this pair based on bilateral handicap overrides
      const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);
      
      // Process front 9
      let frontSkinsABase = 0;  // Skins won in holes 1-9 only
      let frontSkinsBBase = 0;
      let frontAccumulated = 0;
      let frontCarryToBack = 0;
      let frontHolesWithWinner = 0;
      let frontHolesWonByA = 0;
      let frontHolesWonByB = 0;
      let frontHole9Tied = false;
      
      for (let holeNum = 1; holeNum <= 9; holeNum++) {
        const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
        const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
        
        if (scoreA === null || scoreB === null) {
          frontAccumulated++; // Count as accumulated if incomplete
          continue;
        }
        
        frontAccumulated++; // Add current hole to pot
        
        if (scoreA < scoreB) {
          frontSkinsABase += frontAccumulated;
          frontAccumulated = 0;
          frontHolesWithWinner++;
          frontHolesWonByA++;
        } else if (scoreB < scoreA) {
          frontSkinsBBase += frontAccumulated;
          frontAccumulated = 0;
          frontHolesWithWinner++;
          frontHolesWonByB++;
        } else if (holeNum === 9) {
          frontHole9Tied = true;
        }
        // Tie = accumulate
      }
      
      // If carry over is enabled, remaining accumulated skins go to back 9 to be resolved
      if (config.skins.carryOver) {
        frontCarryToBack = frontAccumulated;
        frontAccumulated = 0;
      }
      // If not carry over, remaining accumulated skins are void (no payout)
      
      // Process back 9
      // Carried skins from front are resolved by first winner in back, but COUNT toward front 9 result
      let backSkinsA = 0;  // Skins won purely in back 9 (holes 10-18)
      let backSkinsB = 0;
      let carriedSkinsWonByA = 0;  // Carried skins won by A - add to FRONT result
      let carriedSkinsWonByB = 0;  // Carried skins won by B - add to FRONT result
      let backAccumulated = 0;  // Only track back 9 accumulation
      let pendingCarrySkins = frontCarryToBack;  // Carried from front, waiting to be won
      let backHolesWithWinner = 0;
      let backHolesWonByA = 0;
      let backHolesWonByB = 0;
      let backHole18Tied = false;
      
      for (let holeNum = 10; holeNum <= 18; holeNum++) {
        const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
        const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
        
        if (scoreA === null || scoreB === null) {
          backAccumulated++;
          continue;
        }
        
        backAccumulated++;
        
        if (scoreA < scoreB) {
          // Player A wins this hole
          // Award pending carried skins - these go to FRONT result
          if (pendingCarrySkins > 0) {
            carriedSkinsWonByA += pendingCarrySkins;
            pendingCarrySkins = 0;
          }
          // Award back 9 accumulated skins (at back rate)
          backSkinsA += backAccumulated;
          backAccumulated = 0;
          backHolesWithWinner++;
          backHolesWonByA++;
        } else if (scoreB < scoreA) {
          // Player B wins this hole
          // Award pending carried skins - these go to FRONT result
          if (pendingCarrySkins > 0) {
            carriedSkinsWonByB += pendingCarrySkins;
            pendingCarrySkins = 0;
          }
          // Award back 9 accumulated skins (at back rate)
          backSkinsB += backAccumulated;
          backAccumulated = 0;
          backHolesWithWinner++;
          backHolesWonByB++;
        } else if (holeNum === 18) {
          backHole18Tied = true;
        }
        // Tie = accumulate (carried skins stay pending until someone wins)
      }
      // Remaining accumulated at end of back 9 = void (no payout)
      // Remaining pending carry skins at end = void (no payout)
      
      // FINAL FRONT 9 SKINS = base + carried skins resolved in back 9
      const frontSkinsA = frontSkinsABase + carriedSkinsWonByA;
      const frontSkinsB = frontSkinsBBase + carriedSkinsWonByB;

      // SKINS "zapato" (x2) rule (Skins ONLY):
      // During a nine, if ONLY one player has any skins won so far (>=1) and the opponent has 0,
      // Skins for that nine is doubled *at that moment*.
      // Note: This is independent of Oyeses; do not mix bet types.
      const hasZapatoFront =
        (frontSkinsA > 0 && frontSkinsB === 0) || (frontSkinsB > 0 && frontSkinsA === 0);
      const hasZapatoBack =
        (backSkinsA > 0 && backSkinsB === 0) || (backSkinsB > 0 && backSkinsA === 0);

      // DOUBLING LOGIC:
      // Perfect sweep: won all 9 holes in the nine
      const frontPerfectSweepA = frontHolesWonByA === 9 && frontHolesWonByB === 0;
      const frontPerfectSweepB = frontHolesWonByB === 9 && frontHolesWonByA === 0;
      const backPerfectSweepA = backHolesWonByA === 9 && backHolesWonByB === 0;
      const backPerfectSweepB = backHolesWonByB === 9 && backHolesWonByA === 0;

      // Apply doubling: perfect sweep (all 9) OR zapato (only one has skins so far)
      const frontDoubleMultiplierA = (frontPerfectSweepA || hasZapatoFront) ? 2 : 1;
      const frontDoubleMultiplierB = (frontPerfectSweepB || hasZapatoFront) ? 2 : 1;
      const backDoubleMultiplierA = (backPerfectSweepA || hasZapatoBack) ? 2 : 1;
      const backDoubleMultiplierB = (backPerfectSweepB || hasZapatoBack) ? 2 : 1;
      
      // Calculate money for front 9 (includes carried skins resolved in back, at front rate)
      const netSkinsFront = frontSkinsA - frontSkinsB;
      if (netSkinsFront !== 0 && config.skins.frontValue > 0) {
        const multiplier = netSkinsFront > 0 ? frontDoubleMultiplierA : frontDoubleMultiplierB;
        const frontAmount = netSkinsFront * config.skins.frontValue * multiplier;
        const shoeLabel = multiplier === 2 ? ' 🥾' : '';
        const doubleLabel = multiplier === 2 ? ` (x2)${shoeLabel}` : '';
        // Show breakdown if there were carried skins
        const hasCarried = carriedSkinsWonByA > 0 || carriedSkinsWonByB > 0;
        const descA = hasCarried 
          ? `${frontSkinsA} vs ${frontSkinsB} skins${doubleLabel} (inc. ${frontCarryToBack} carry)`
          : `${frontSkinsA} vs ${frontSkinsB} skins${doubleLabel}`;
        const descB = hasCarried
          ? `${frontSkinsB} vs ${frontSkinsA} skins${doubleLabel} (inc. ${frontCarryToBack} carry)`
          : `${frontSkinsB} vs ${frontSkinsA} skins${doubleLabel}`;
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Skins Front',
          amount: frontAmount,
          segment: 'front',
          description: descA,
          units: netSkinsFront,
          baseUnitAmount: config.skins.frontValue,
          multiplier,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Skins Front',
          amount: -frontAmount,
          segment: 'front',
          description: descB,
          units: -netSkinsFront,
          baseUnitAmount: config.skins.frontValue,
          multiplier,
        });
      }
      
      // Calculate money for back 9 - ONLY pure back 9 skins (holes 10-18)
      // Carried skins are already included in front 9 result above
      const netPureBackSkins = backSkinsA - backSkinsB;
      if (netPureBackSkins !== 0 && config.skins.backValue > 0) {
        const pureBackMultiplier = netPureBackSkins > 0 ? backDoubleMultiplierA : backDoubleMultiplierB;
        const backAmount = netPureBackSkins * config.skins.backValue * pureBackMultiplier;
         const shoeLabel = pureBackMultiplier === 2 ? ' 🥾' : '';
         const doubleLabel = pureBackMultiplier === 2 ? ` (x2)${shoeLabel}` : '';
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Skins Back',
          amount: backAmount,
          segment: 'back',
          description: `${backSkinsA} vs ${backSkinsB} skins${doubleLabel}`,
          units: netPureBackSkins,
          baseUnitAmount: config.skins.backValue,
          multiplier: pureBackMultiplier,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Skins Back',
          amount: -backAmount,
          segment: 'back',
          description: `${backSkinsB} vs ${backSkinsA} skins${doubleLabel}`,
          units: -netPureBackSkins,
          baseUnitAmount: config.skins.backValue,
          multiplier: pureBackMultiplier,
        });
      }
    }
  }
  
  return summaries;
};

// CAROS: Holes 15-18 special bet - Single amount per pair (not per hole)
// Win by 1 or more net strokes = win the single bet amount
export const calculateCarosBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!config.caros.enabled || config.caros.amount <= 0) return [];
  
  const summaries: BetSummary[] = [];
  const caroHoles = [15, 16, 17, 18];
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      // Get adjusted scores for this pair based on bilateral handicap overrides
      const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);
      
      // Calculate total net scores for holes 15-18
      let totalA = 0;
      let totalB = 0;
      let played = 0;
      
      caroHoles.forEach(holeNum => {
        const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
        const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
        
        // Show partial results: only count holes where BOTH players have a score
        if (scoreA === null || scoreB === null) return;
        played += 1;
        totalA += scoreA;
        totalB += scoreB;
      });

      // Nothing to compare yet
      if (played === 0) continue;
      
      // Single bet - whoever has lower total wins
      if (totalA < totalB) {
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Caros',
          amount: config.caros.amount,
          segment: 'back',
          description: `${totalA} vs ${totalB} (${played}/4)`,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Caros',
          amount: -config.caros.amount,
          segment: 'back',
          description: `${totalB} vs ${totalA} (${played}/4)`,
        });
      } else if (totalB < totalA) {
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Caros',
          amount: config.caros.amount,
          segment: 'back',
          description: `${totalB} vs ${totalA} (${played}/4)`,
        });
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Caros',
          amount: -config.caros.amount,
          segment: 'back',
          description: `${totalA} vs ${totalB} (${played}/4)`,
        });
      }
      // Tie = no money changes hands
    }
  }
  
  return summaries;
};

// UNITS: Birdies/Eagles/Albatross (positive) - Cuatriput counts as negative unit
export const calculateUnitsBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): BetSummary[] => {
  if (!config.units.enabled || config.units.valuePerPoint <= 0) return [];
  
  const summaries: BetSummary[] = [];
  
  const countUnits = (playerId: string): { positive: number; negative: number } => {
    const playerScores = scores.get(playerId) || [];
    let positive = 0;
    let negative = 0;
    
    playerScores.forEach(score => {
      // Skip if strokes is not a valid positive number
      if (!score.strokes || score.strokes <= 0) return;
      
      const holePar = course.holes[score.holeNumber - 1]?.par || 4;
      const toPar = score.strokes - holePar;
      
      // Positive units from score-based achievements
      if (toPar === -1) positive += 1; // Birdie
      if (toPar === -2) positive += 2; // Eagle
      if (toPar <= -3) positive += 3; // Albatross
      
      // Positive units from manual markers
      if (score.markers?.sandyPar) positive += 1;
      if (score.markers?.aquaPar) positive += 1;
      if (score.markers?.holeOut) positive += 1;
      
      // Negative units - Cuatriput (4+ putts)
      if (score.putts && score.putts >= 4) negative += 1;
    });
    
    return { positive, negative };
  };
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      const unitsA = countUnits(playerA.id);
      const unitsB = countUnits(playerB.id);
      
      // Net units = (positive - negative) for each player
      const netA = unitsA.positive - unitsA.negative;
      const netB = unitsB.positive - unitsB.negative;
      const diff = netA - netB;
      
      if (diff !== 0) {
        const amount = diff * config.units.valuePerPoint;
        
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Unidades',
          amount: amount,
          segment: 'total',
          description: `${netA} vs ${netB} unidades (${unitsA.positive}+ ${unitsA.negative}- vs ${unitsB.positive}+ ${unitsB.negative}-)`,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Unidades',
          amount: -amount,
          segment: 'total',
          description: `${netB} vs ${netA} unidades (${unitsB.positive}+ ${unitsB.negative}- vs ${unitsA.positive}+ ${unitsA.negative}-)`,
        });
      }
    }
  }
  
  return summaries;
};

// MANCHAS: Negative markers - Cuatriput pays to ALL other players
export const calculateManchasBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig
): BetSummary[] => {
  if (!config.manchas.enabled || config.manchas.valuePerPoint <= 0) return [];
  
  const summaries: BetSummary[] = [];
  
  // Manual manchas that are persisted to database
  const manualManchaMarkers = ['ladies', 'swingBlanco', 'retruje', 'trampa', 'dobleAgua', 'dobleOB', 'par3GirMas3', 'moreliana'] as const;
  
  // Count regular manchas (not cuatriput)
  // Also auto-detect dobleDigito (10+ strokes) since it's not persisted to DB
  const countManchas = (playerId: string): number => {
    const playerScores = scores.get(playerId) || [];
    let manchas = 0;
    
    playerScores.forEach(score => {
      // Count manual markers from database
      manualManchaMarkers.forEach(marker => {
        if (score.markers[marker]) manchas += 1;
      });
      
      // Auto-detect dobleDigito (10+ strokes) - this is auto-detected, not persisted
      if (score.strokes >= 10) {
        manchas += 1;
      }
    });
    
    return manchas;
  };
  
  // Count cuatriputs - these pay to ALL players
  const countCuatriputs = (playerId: string): number => {
    const playerScores = scores.get(playerId) || [];
    return playerScores.filter(s => s.putts >= 4 || s.markers.cuatriput).length;
  };
  
  // Calculate bilateral manchas (excluding cuatriput)
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      const manchasA = countManchas(playerA.id);
      const manchasB = countManchas(playerB.id);
      const diff = manchasB - manchasA; // Player with FEWER manchas wins
      
      if (diff !== 0) {
        const amount = diff * config.manchas.valuePerPoint;
        
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Manchas',
          amount: amount,
          segment: 'total',
          description: `${manchasA} vs ${manchasB} manchas`,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Manchas',
          amount: -amount,
          segment: 'total',
          description: `${manchasB} vs ${manchasA} manchas`,
        });
      }
      
      // Add cuatriput payments - each cuatriput pays to each other player
      const cuatriputsA = countCuatriputs(playerA.id);
      const cuatriputsB = countCuatriputs(playerB.id);
      
      // Player A pays for their cuatriputs to player B
      if (cuatriputsA > 0) {
        const cuatriputAmount = cuatriputsA * config.manchas.valuePerPoint;
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Manchas',
          amount: -cuatriputAmount,
          segment: 'total',
          description: `Cuatriput x${cuatriputsA}`,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Manchas',
          amount: cuatriputAmount,
          segment: 'total',
          description: `Cuatriput rival x${cuatriputsA}`,
        });
      }
      
      // Player B pays for their cuatriputs to player A
      if (cuatriputsB > 0) {
        const cuatriputAmount = cuatriputsB * config.manchas.valuePerPoint;
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Manchas',
          amount: -cuatriputAmount,
          segment: 'total',
          description: `Cuatriput x${cuatriputsB}`,
        });
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Manchas',
          amount: cuatriputAmount,
          segment: 'total',
          description: `Cuatriput rival x${cuatriputsB}`,
        });
      }
    }
  }
  
  return summaries;
};

// CULEBRAS: 3+ putts - ONLY the LAST player to make one pays ALL occurrences to ALL others
// Find which hole(s) have culebras and determine the last one
export const calculateCulebrasBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig
): BetSummary[] => {
  if (!config.culebras.enabled || config.culebras.valuePerOccurrence <= 0) return [];
  
  const summaries: BetSummary[] = [];
  
  // Find all culebras with their hole numbers
  const allCulebras: { playerId: string; holeNumber: number; putts: number }[] = [];
  
  players.forEach(player => {
    const playerScores = scores.get(player.id) || [];
    playerScores.forEach(score => {
      if (score.putts >= 3) {
        allCulebras.push({ 
          playerId: player.id, 
          holeNumber: score.holeNumber,
          putts: score.putts 
        });
      }
    });
  });
  
  if (allCulebras.length === 0) return [];
  
  // Find the last hole with culebras
  const maxHole = Math.max(...allCulebras.map(c => c.holeNumber));
  const culebrasOnLastHole = allCulebras.filter(c => c.holeNumber === maxHole);
  
  // If multiple players have culebra on same last hole, the one with more putts pays
  // If tied putts, this should be resolved by user (handled in UI)
  let lastPlayerToPay: string;
  
  if (culebrasOnLastHole.length === 1) {
    lastPlayerToPay = culebrasOnLastHole[0].playerId;
  } else {
    // Multiple culebras on last hole - pick the one with most putts
    const maxPutts = Math.max(...culebrasOnLastHole.map(c => c.putts));
    const playersWithMaxPutts = culebrasOnLastHole.filter(c => c.putts === maxPutts);
    
    if (playersWithMaxPutts.length === 1) {
      lastPlayerToPay = playersWithMaxPutts[0].playerId;
    } else {
      // Exact tie - for now, use first player (UI should handle this)
      // Store this as a tie that needs resolution
      lastPlayerToPay = playersWithMaxPutts[0].playerId;
    }
  }
  
  const totalCulebras = allCulebras.length;
  const amountPerPlayer = totalCulebras * config.culebras.valuePerOccurrence;
  
  // Last player pays each other player
  players.forEach(player => {
    if (player.id === lastPlayerToPay) return;
    
    summaries.push({
      playerId: lastPlayerToPay,
      vsPlayer: player.id,
      betType: 'Culebras',
      amount: -amountPerPlayer,
      segment: 'total',
      description: `Último en culebra - paga ${totalCulebras} culebras`,
    });
    summaries.push({
      playerId: player.id,
      vsPlayer: lastPlayerToPay,
      betType: 'Culebras',
      amount: amountPerPlayer,
      segment: 'total',
      description: `Recibe de culebras x${totalCulebras}`,
    });
  });
  
  return summaries;
};

// PINGUINOS: Triple bogey or worse (3+ over par) - ONLY the LAST player pays ALL
export const calculatePinguinosBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): BetSummary[] => {
  if (!config.pinguinos.enabled || config.pinguinos.valuePerOccurrence <= 0) return [];
  
  const summaries: BetSummary[] = [];
  
  // Find all pinguinos with their hole numbers
  const allPinguinos: { playerId: string; holeNumber: number; overPar: number }[] = [];
  
  players.forEach(player => {
    const playerScores = scores.get(player.id) || [];
    playerScores.forEach(score => {
      const holePar = course.holes[score.holeNumber - 1]?.par || 4;
      const overPar = score.strokes - holePar;
      if (overPar >= 3) { // Triple bogey or worse
        allPinguinos.push({ 
          playerId: player.id, 
          holeNumber: score.holeNumber,
          overPar 
        });
      }
    });
  });
  
  if (allPinguinos.length === 0) return [];
  
  // Find the last hole with pinguinos
  const maxHole = Math.max(...allPinguinos.map(p => p.holeNumber));
  const pinguinosOnLastHole = allPinguinos.filter(p => p.holeNumber === maxHole);
  
  // If multiple players have pinguino on same last hole, the one with worst score pays
  let lastPlayerToPay: string;
  
  if (pinguinosOnLastHole.length === 1) {
    lastPlayerToPay = pinguinosOnLastHole[0].playerId;
  } else {
    // Multiple pinguinos on last hole - pick the one with worst score (most over par)
    const maxOverPar = Math.max(...pinguinosOnLastHole.map(p => p.overPar));
    const playersWithWorst = pinguinosOnLastHole.filter(p => p.overPar === maxOverPar);
    
    if (playersWithWorst.length === 1) {
      lastPlayerToPay = playersWithWorst[0].playerId;
    } else {
      // Exact tie - for now, use first player (UI should handle this)
      lastPlayerToPay = playersWithWorst[0].playerId;
    }
  }
  
  const totalPinguinos = allPinguinos.length;
  const amountPerPlayer = totalPinguinos * config.pinguinos.valuePerOccurrence;
  
  // Last player pays each other player
  players.forEach(player => {
    if (player.id === lastPlayerToPay) return;
    
    summaries.push({
      playerId: lastPlayerToPay,
      vsPlayer: player.id,
      betType: 'Pingüinos',
      amount: -amountPerPlayer,
      segment: 'total',
      description: `Último en pingüino - paga ${totalPinguinos} pingüinos`,
    });
    summaries.push({
      playerId: player.id,
      vsPlayer: lastPlayerToPay,
      betType: 'Pingüinos',
      amount: amountPerPlayer,
      segment: 'total',
      description: `Recibe de pingüinos x${totalPinguinos}`,
    });
  });
  
  return summaries;
};

// Calculate Medal General group bet - lowest net total wins
export const calculateMedalGeneralBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): BetSummary[] => {
  const summaries: BetSummary[] = [];
  
  // Guard against undefined medalGeneral config (for backward compatibility)
  if (!config.medalGeneral?.enabled || players.length < 2) {
    return summaries;
  }
  
  const amount = config.medalGeneral.amount || 100;
  const playerHandicaps = config.medalGeneral.playerHandicaps || [];
  
  // Calculate net totals for each player using their Medal General handicap
  const playerNetTotals: { playerId: string; netTotal: number; grossTotal: number }[] = [];
  
  players.forEach(player => {
    const playerScores = scores.get(player.id) || [];
    
    // Only consider confirmed scores
    const confirmedScores = playerScores.filter(s => s.confirmed && s.strokes > 0);
    if (confirmedScores.length === 0) return;
    
    // Get Medal General handicap for this player (fallback to round handicap)
    const playerHcp = playerHandicaps.find(ph => ph.playerId === player.id);
    const handicap = playerHcp?.handicap ?? player.handicap;
    
    // Calculate strokes received per hole
    const strokesPerHole = calculateStrokesPerHole(handicap, course);
    
    // Calculate gross total
    const grossTotal = confirmedScores.reduce((sum, s) => sum + s.strokes, 0);
    
    // Calculate net total
    const netTotal = confirmedScores.reduce((sum, s) => {
      const received = strokesPerHole[s.holeNumber - 1] || 0;
      return sum + (s.strokes - received);
    }, 0);
    
    playerNetTotals.push({ playerId: player.id, netTotal, grossTotal });
  });
  
  // Need at least 2 players with scores
  if (playerNetTotals.length < 2) {
    return summaries;
  }
  
  // Find the minimum net total
  const minNetTotal = Math.min(...playerNetTotals.map(p => p.netTotal));
  
  // Find all winners (those with the minimum net total)
  const winners = playerNetTotals.filter(p => p.netTotal === minNetTotal);
  const losers = playerNetTotals.filter(p => p.netTotal !== minNetTotal);
  
  // If everyone tied, no one wins/loses
  if (losers.length === 0) {
    return summaries;
  }
  
  // Calculate total pot from losers
  const totalPot = losers.length * amount;
  
  // Split pot among winners
  const amountPerWinner = totalPot / winners.length;
  
  // Create bet summaries - losers pay to each winner
  losers.forEach(loser => {
    const loserPlayer = players.find(p => p.id === loser.playerId);
    const amountToPayPerWinner = amount / winners.length;
    
    winners.forEach(winner => {
      const winnerPlayer = players.find(p => p.id === winner.playerId);
      
      summaries.push({
        playerId: loser.playerId,
        vsPlayer: winner.playerId,
        betType: 'Medal General',
        amount: -amountToPayPerWinner,
        segment: 'total',
        description: `Neto ${loser.netTotal} vs ${winner.netTotal}${winners.length > 1 ? ' (empate dividido)' : ''}`,
      });
      
      summaries.push({
        playerId: winner.playerId,
        vsPlayer: loser.playerId,
        betType: 'Medal General',
        amount: amountToPayPerWinner,
        segment: 'total',
        description: `Neto ${winner.netTotal} vs ${loser.netTotal}${winners.length > 1 ? ' (empate dividido)' : ''}`,
      });
    });
  });
  
  return summaries;
};

// Calculate ALL bet summaries with bet overrides and bilateral handicap overrides applied
export const calculateAllBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  startingHole: 1 | 10 = 1,
  confirmedHoles: Set<number> = new Set()
): BetSummary[] => {
  const bilateralHandicaps = config.bilateralHandicaps;
  
  // Convert Coneja bets to BetSummary format
  const conejaSummaries: BetSummary[] = [];
  if (config.coneja?.enabled && players.length >= 2) {
    const conejaBets = calculateConejaBets(players, scores, course, config, confirmedHoles);
    conejaBets.forEach(bet => {
      // Winner gets positive amount
      conejaSummaries.push({
        playerId: bet.winnerId,
        vsPlayer: bet.loserId,
        betType: 'Coneja',
        amount: bet.amount,
        segment: 'total',
        description: bet.description,
      });
      // Loser gets negative amount
      conejaSummaries.push({
        playerId: bet.loserId,
        vsPlayer: bet.winnerId,
        betType: 'Coneja',
        amount: -bet.amount,
        segment: 'total',
        description: bet.description,
      });
    });
  }
  
  const allSummaries = [
    ...calculateMedalBets(players, scores, config, course, bilateralHandicaps, startingHole),
    ...calculatePressureBets(players, scores, config, course, bilateralHandicaps, startingHole),
    ...calculateSkinsBets(players, scores, config, course, bilateralHandicaps, startingHole),
    ...calculateCarosBets(players, scores, config, course, bilateralHandicaps, startingHole),
    ...calculateOyesesBets(players, scores, config, course),
    ...calculateUnitsBets(players, scores, config, course),
    ...calculateManchasBets(players, scores, config),
    ...calculateCulebrasBets(players, scores, config),
    ...calculatePinguinosBets(players, scores, config, course),
    ...calculateRayasBets(players, scores, config, course, bilateralHandicaps, startingHole),
    ...calculateMedalGeneralBets(players, scores, config, course),
    ...conejaSummaries,
  ];
  
  // Apply bet overrides - cancel disabled bets and apply amount overrides
  if (config.betOverrides && config.betOverrides.length > 0) {
    // betOverrides can be stored using either `player.id` (often round_player_id)
    // or `player.profileId` (profile id). Normalize to the ids used by summaries.
    const resolveOverridePlayerId = (pid: string): string => {
      const direct = players.find((p) => p.id === pid);
      if (direct) return direct.id;
      const byProfile = players.find((p) => p.profileId === pid);
      return byProfile?.id ?? pid;
    };

    return allSummaries.map(summary => {
      // Find if there's an override for this pair and bet type
      const override = config.betOverrides?.find(o => {
        const aId = resolveOverridePlayerId(o.playerAId);
        const bId = resolveOverridePlayerId(o.playerBId);
        const matchesPair = (aId === summary.playerId && bId === summary.vsPlayer) ||
                           (aId === summary.vsPlayer && bId === summary.playerId);
        const summaryType = summary.betType.toLowerCase();
        // Back-compat: historically some overrides were stored using internal keys (e.g. "pressures")
        // while summaries use Spanish labels (e.g. "Presiones Front"). Normalize to improve matching.
        const rawOverrideType = (o.betType ?? '').toLowerCase();
        const overrideType = (() => {
          switch (rawOverrideType) {
            case 'pressures':
              return 'presiones';
            case 'oyeses':
              return 'oyes';
            case 'units':
              return 'unidades';
            case 'pinguinos':
              return 'pingüinos';
            case 'medalgeneral':
              return 'medal general';
            default:
              return rawOverrideType;
          }
        })();

        // IMPORTANT: In carry scenarios (e.g. "Presiones Back (Carry x2+Match)"),
        // we must NOT allow the regular segment override ("Presiones Back") to overwrite
        // the computed carry value (Front×2 + Match18).
        const isCarryLabel = summaryType.includes('(carry');
        const matchesBetType = isCarryLabel
          ? summaryType === overrideType
          : summaryType.includes(overrideType);
        return matchesPair && matchesBetType;
      });
      
      if (override) {
        // If bet is disabled, zero out the amount
        if (override.enabled === false) {
          return { ...summary, amount: 0 };
        }
        // If there's an amount override, recompute using units × override × multiplier when available.
        if (override.amountOverride !== undefined && summary.amount !== 0) {
          if (typeof summary.units === 'number') {
            const mult = typeof summary.multiplier === 'number' ? summary.multiplier : 1;
            return {
              ...summary,
              baseUnitAmount: override.amountOverride,
              amount: summary.units * override.amountOverride * mult,
            };
          }

          // Fallback (older summaries without units)
          const sign = summary.amount > 0 ? 1 : -1;
          return { ...summary, amount: sign * override.amountOverride };
        }
      }
      return summary;
    }).filter(s => s.amount !== 0 || !config.betOverrides?.some(o => {
      if (o.enabled !== false) return false;
      const aId = resolveOverridePlayerId(o.playerAId);
      const bId = resolveOverridePlayerId(o.playerBId);
      return (
        (aId === s.playerId && bId === s.vsPlayer) ||
        (aId === s.vsPlayer && bId === s.playerId)
      );
    }));
  }
  
  return allSummaries;
};

// Get player total balance from summaries
export const getPlayerBalance = (playerId: string, summaries: BetSummary[]): number => {
  return summaries
    .filter(s => s.playerId === playerId)
    .reduce((sum, s) => sum + s.amount, 0);
};

// Get balance between two players
export const getBilateralBalance = (
  playerId: string,
  vsPlayerId: string,
  summaries: BetSummary[]
): number => {
  return summaries
    .filter(s => s.playerId === playerId && s.vsPlayer === vsPlayerId)
    .reduce((sum, s) => sum + s.amount, 0);
};

// Group summaries by bet type for display
export const groupSummariesByType = (
  playerId: string,
  vsPlayerId: string,
  summaries: BetSummary[]
): Record<string, { total: number; details: BetSummary[] }> => {
  const filtered = summaries.filter(
    s => s.playerId === playerId && s.vsPlayer === vsPlayerId
  );
  
  return filtered.reduce((acc, s) => {
    const key = s.betType.replace(/ H\d+$/, ''); // Group Skin H1, Skin H2, etc.
    if (!acc[key]) {
      acc[key] = { total: 0, details: [] };
    }
    acc[key].total += s.amount;
    acc[key].details.push(s);
    return acc;
  }, {} as Record<string, { total: number; details: BetSummary[] }>);
};

// Helper to detect culebra/pinguino ties for UI resolution
export interface TieResolution {
  type: 'culebra' | 'pinguino';
  holeNumber: number;
  players: string[];
}

export const detectTiesNeedingResolution = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse
): TieResolution[] => {
  const ties: TieResolution[] = [];
  
  // Check culebras
  const allCulebras: { playerId: string; holeNumber: number; putts: number }[] = [];
  players.forEach(player => {
    const playerScores = scores.get(player.id) || [];
    playerScores.forEach(score => {
      if (score.putts >= 3) {
        allCulebras.push({ playerId: player.id, holeNumber: score.holeNumber, putts: score.putts });
      }
    });
  });
  
  if (allCulebras.length > 0) {
    const maxHole = Math.max(...allCulebras.map(c => c.holeNumber));
    const culebrasOnLastHole = allCulebras.filter(c => c.holeNumber === maxHole);
    const maxPutts = Math.max(...culebrasOnLastHole.map(c => c.putts));
    const tied = culebrasOnLastHole.filter(c => c.putts === maxPutts);
    
    if (tied.length > 1) {
      ties.push({
        type: 'culebra',
        holeNumber: maxHole,
        players: tied.map(t => t.playerId),
      });
    }
  }
  
  // Check pinguinos
  const allPinguinos: { playerId: string; holeNumber: number; overPar: number }[] = [];
  players.forEach(player => {
    const playerScores = scores.get(player.id) || [];
    playerScores.forEach(score => {
      const holePar = course.holes[score.holeNumber - 1]?.par || 4;
      const overPar = score.strokes - holePar;
      if (overPar >= 3) {
        allPinguinos.push({ playerId: player.id, holeNumber: score.holeNumber, overPar });
      }
    });
  });
  
  if (allPinguinos.length > 0) {
    const maxHole = Math.max(...allPinguinos.map(p => p.holeNumber));
    const pinguinosOnLastHole = allPinguinos.filter(p => p.holeNumber === maxHole);
    const maxOverPar = Math.max(...pinguinosOnLastHole.map(p => p.overPar));
    const tied = pinguinosOnLastHole.filter(p => p.overPar === maxOverPar);
    
    if (tied.length > 1) {
      ties.push({
        type: 'pinguino',
        holeNumber: maxHole,
        players: tied.map(t => t.playerId),
      });
    }
  }
  
  return ties;
};

// ==========================================
// TOOLKIT CALCULATIONS - Hole-by-hole evolution for dashboard tooltips
// ==========================================

/**
 * Pressure evolution per hole for a pair of players
 * Shows the cumulative balance after each hole for all active lines
 */
export interface PressureHoleState {
  holeNumber: number;
  bets: number[]; // Array of cumulative balances for each pressure line
  display: string; // e.g., "+1", "Even", "+2 +1", etc.
}

export interface PressureEvolution {
  segment: 'front' | 'back';
  holes: PressureHoleState[];
  finalDisplay: string;
  hasCarry: boolean;
}

export const getPressureEvolution = (
  playerA: Player,
  playerB: Player,
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): { front: PressureEvolution; back: PressureEvolution } => {
  const ranges = getSegmentHoleRanges(startingHole);
  const frontHoles = Array.from({ length: 9 }, (_, i) => ranges.front[0] + i);
  const backHoles = Array.from({ length: 9 }, (_, i) => ranges.back[0] + i);
  
  const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);
  
  const processNine = (holes: number[], segment: 'front' | 'back'): PressureEvolution => {
    const states: PressureHoleState[] = [];
    let bets: number[] = [0];
    
    holes.forEach((holeNum, holeIndex) => {
      const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
      const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
      
      if (scoreA === null || scoreB === null) {
        states.push({
          holeNumber: holeNum,
          bets: [...bets],
          display: bets.map(b => b === 0 ? 'E' : (b > 0 ? '+' : '') + b).join(' '),
        });
        return;
      }
      
      let holeResult = 0;
      if (scoreA < scoreB) holeResult = 1;
      else if (scoreB < scoreA) holeResult = -1;
      
      bets = bets.map(bal => bal + holeResult);
      
      const isLastHole = holeIndex === holes.length - 1;
      if (!isLastHole) {
        const lastBetBalance = bets[bets.length - 1];
        if (Math.abs(lastBetBalance) >= 2) {
          bets.push(0);
        }
      }
      
      const display = bets.map(b => b === 0 ? 'E' : (b > 0 ? '+' : '') + b).join(' ');
      states.push({
        holeNumber: holeNum,
        bets: [...bets],
        display,
      });
    });
    
    const finalBets = states.length > 0 ? states[states.length - 1].bets : [0];
    const hasCarry = segment === 'front' && finalBets[0] === 0;
    
    // "Even" only shown when there's exactly ONE bet line that ended at 0
    // If multiple lines exist (e.g., +1 -1), show the actual results even if net is $0
    const showEven = finalBets.length === 1 && finalBets[0] === 0;
    const finalDisplay = showEven 
      ? 'Even' 
      : finalBets.map(b => (b > 0 ? '+' : '') + b).join(' ');
    
    return {
      segment,
      holes: states,
      finalDisplay,
      hasCarry,
    };
  };
  
  return {
    front: processNine(frontHoles, 'front'),
    back: processNine(backHoles, 'back'),
  };
};

/**
 * Skins evolution per hole for a pair of players
 * Shows skins won/lost per hole, including accumulation
 */
export interface SkinsHoleState {
  holeNumber: number;
  accumulated: number; // Skins accumulated at this hole
  winner: 'A' | 'B' | null; // Who won this hole
  skinsWon: number; // How many skins were won (includes accumulated)
  display: string; // e.g., "+2", "-1", "•" (tie), etc.
}

export interface SkinsEvolution {
  segment: 'front' | 'back';
  holes: SkinsHoleState[];
  totalSkinsA: number;
  totalSkinsB: number;
  hasZapato: boolean;
}

export const getSkinsEvolution = (
  playerA: Player,
  playerB: Player,
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): { front: SkinsEvolution; back: SkinsEvolution } => {
  const ranges = getSegmentHoleRanges(startingHole);
  const frontHoles = Array.from({ length: 9 }, (_, i) => ranges.front[0] + i);
  const backHoles = Array.from({ length: 9 }, (_, i) => ranges.back[0] + i);
  
  const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);
  const isAccumulated = (config.skins.modality ?? 'acumulados') === 'acumulados';
  
  const processNine = (holes: number[], segment: 'front' | 'back'): SkinsEvolution => {
    const states: SkinsHoleState[] = [];
    let accumulated = 0;
    let totalSkinsA = 0;
    let totalSkinsB = 0;
    let holesWonByA = 0;
    let holesWonByB = 0;
    
    holes.forEach(holeNum => {
      const scoreA = getHoleScore(playerA.id, holeNum, adjustedScores);
      const scoreB = getHoleScore(playerB.id, holeNum, adjustedScores);
      
      if (scoreA === null || scoreB === null) {
        if (isAccumulated) accumulated++;
        states.push({
          holeNumber: holeNum,
          accumulated,
          winner: null,
          skinsWon: 0,
          display: '-',
        });
        return;
      }
      
      if (isAccumulated) {
        accumulated++;
      }
      
      let winner: 'A' | 'B' | null = null;
      let skinsWon = 0;
      let display = '•'; // tie
      
      if (scoreA < scoreB) {
        winner = 'A';
        skinsWon = isAccumulated ? accumulated : 1;
        totalSkinsA += skinsWon;
        holesWonByA++;
        display = '+' + skinsWon;
        if (isAccumulated) accumulated = 0;
      } else if (scoreB < scoreA) {
        winner = 'B';
        skinsWon = isAccumulated ? accumulated : 1;
        totalSkinsB += skinsWon;
        holesWonByB++;
        display = '-' + skinsWon;
        if (isAccumulated) accumulated = 0;
      }
      // Tie = accumulate continues
      
      states.push({
        holeNumber: holeNum,
        accumulated: isAccumulated ? accumulated : 0,
        winner,
        skinsWon,
        display,
      });
    });
    
    // Zapato: one player has skins, the other has 0
    const hasZapato = (holesWonByA > 0 && holesWonByB === 0) || (holesWonByB > 0 && holesWonByA === 0);
    
    return {
      segment,
      holes: states,
      totalSkinsA,
      totalSkinsB,
      hasZapato,
    };
  };
  
  return {
    front: processNine(frontHoles, 'front'),
    back: processNine(backHoles, 'back'),
  };
};

// Note: Uses existing getHoleScore function defined earlier in this file
