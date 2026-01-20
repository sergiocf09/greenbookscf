// Bet Calculations Engine - All bilateral calculations
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';

export interface BetSummary {
  playerId: string;
  vsPlayer: string;
  betType: string;
  amount: number; // positive = winning, negative = losing
  segment: 'front' | 'back' | 'total' | 'hole';
  holeNumber?: number;
  description?: string;
}

export interface BilateralHandicap {
  playerAId: string;
  playerBId: string;
  betType: string;
  playerAHandicap: number;
  playerBHandicap: number;
}

// Calculate net score for a segment (front 9, back 9, or total)
const getSegmentNetTotal = (
  playerId: string,
  scores: Map<string, PlayerScore[]>,
  segment: 'front' | 'back' | 'total'
): number => {
  const playerScores = scores.get(playerId) || [];
  const holeRange = segment === 'front' ? [1, 9] : segment === 'back' ? [10, 18] : [1, 18];
  
  return playerScores
    .filter(s => s.holeNumber >= holeRange[0] && s.holeNumber <= holeRange[1])
    .reduce((sum, s) => sum + (s.netScore ?? s.strokes), 0);
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
  handicapOverrides?: BilateralHandicap[]
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
      
      segments.forEach(({ key, amount, label }) => {
        if (amount <= 0) return;
        
        const netA = getSegmentNetTotal(playerA.id, scores, key);
        const netB = getSegmentNetTotal(playerB.id, scores, key);
        
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
  config: BetConfig
): BetSummary[] => {
  if (!config.pressures.enabled) return [];
  
  const summaries: BetSummary[] = [];
  
  const frontHoles = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const backHoles = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  
  // Total 18 (Match) uses its own configured amount
  const totalMatchAmount = config.pressures.totalAmount;
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      // Process a nine and return bets array
      const processNine = (holes: number[]): number[] => {
        let bets: number[] = [0]; // Start with first bet at 0
        
        holes.forEach(holeNum => {
          const scoreA = getHoleScore(playerA.id, holeNum, scores);
          const scoreB = getHoleScore(playerB.id, holeNum, scores);
          
          if (scoreA === null || scoreB === null) return;
          
          let holeResult = 0;
          if (scoreA < scoreB) holeResult = 1;
          else if (scoreB < scoreA) holeResult = -1;
          
          bets = bets.map(bal => bal + holeResult);
          
          const justReachedTwo = bets.some(bal => Math.abs(bal) === 2);
          if (justReachedTwo && holeNum !== holes[holes.length - 1]) {
            const hasZeroBet = bets.some(bal => bal === 0);
            if (!hasZeroBet) {
              bets.push(0);
            }
          }
        });
        
        return bets;
      };
      
      const frontBets = processNine(frontHoles);
      const backBets = processNine(backHoles);
      
      const frontIsTied = frontBets[0] === 0 && frontBets.length === 1;
      
      // Front 9 - Each bet result contributes ONLY 1x the bet value
      const frontBetsWonA = frontBets.filter(b => b > 0).length;
      const frontBetsLostA = frontBets.filter(b => b < 0).length;
      const frontNetBets = frontBetsWonA - frontBetsLostA;
      const frontAmountA = frontNetBets * config.pressures.frontAmount;
      
      const frontDisplayStr = frontIsTied ? 'Even (Carry)' : frontBets.map(b => (b >= 0 ? '+' : '') + b).join(' ');
      
      if (frontAmountA !== 0 || frontBets.length > 0) {
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Presiones Front',
          amount: frontAmountA,
          segment: 'front',
          description: frontDisplayStr,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Presiones Front',
          amount: -frontAmountA,
          segment: 'front',
          description: frontBets.map(b => ((-b) >= 0 ? '+' : '') + (-b)).join(' '),
        });
      }
      
      // Back 9 - Apply carry multiplier if front was tied
      // When carry: back value = 2x frontAmount + totalMatchAmount (NOT backAmount)
      // Example: frontAmount=50, totalAmount=50 -> carry = 2*50+50 = 150
      const effectiveBackValue = frontIsTied 
        ? (2 * config.pressures.frontAmount + totalMatchAmount)
        : config.pressures.backAmount;
      
      const backBetsWonA = backBets.filter(b => b > 0).length;
      const backBetsLostA = backBets.filter(b => b < 0).length;
      const backNetBets = backBetsWonA - backBetsLostA;
      const backAmountA = backNetBets * effectiveBackValue;
      
      const backLabel = frontIsTied ? 'Presiones Back (Carry x2+Match)' : 'Presiones Back';
      const backDisplayStr = backBets.map(b => (b >= 0 ? '+' : '') + b).join(' ');
      
      if (backAmountA !== 0 || backBets.length > 0) {
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: backLabel,
          amount: backAmountA,
          segment: 'back',
          description: backDisplayStr,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: backLabel,
          amount: -backAmountA,
          segment: 'back',
          description: backBets.map(b => ((-b) >= 0 ? '+' : '') + (-b)).join(' '),
        });
      }
      
      // Match 18: Only if front 9 was NOT tied
      // Uses its own configured totalAmount
      if (!frontIsTied && totalMatchAmount > 0) {
        const total18Balance = frontBets[0] + backBets[0];
        
        let matchWinner = 0;
        if (total18Balance > 0) matchWinner = 1;
        else if (total18Balance < 0) matchWinner = -1;
        
        const totalAmountA = matchWinner * totalMatchAmount;
        
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
          });
          summaries.push({
            playerId: playerB.id,
            vsPlayer: playerA.id,
            betType: 'Presiones Match 18',
            amount: -totalAmountA,
            segment: 'total',
            description: total18StrB,
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
        // When there's a carry, Match 18 is cancelled
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Presiones Match 18',
          amount: 0,
          segment: 'total',
          description: 'Cancelado (Carry)',
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Presiones Match 18',
          amount: 0,
          segment: 'total',
          description: 'Cancelado (Carry)',
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
  config: BetConfig
): BetSummary[] => {
  if (!config.skins.enabled) return [];
  
  const summaries: BetSummary[] = [];
  
  // For each pair of players, calculate bilateral skins with accumulation
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
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
        const scoreA = getHoleScore(playerA.id, holeNum, scores);
        const scoreB = getHoleScore(playerB.id, holeNum, scores);
        
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
        const scoreA = getHoleScore(playerA.id, holeNum, scores);
        const scoreB = getHoleScore(playerB.id, holeNum, scores);
        
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
      
      // DOUBLING LOGIC:
      // IMPORTANT: Doubling should only be applied once the segment is finished (hole 9 / 18 recorded),
      // otherwise we'd incorrectly show x2 early (e.g. after winning just one hole).
      const frontSegmentFinished =
        getHoleScore(playerA.id, 9, scores) !== null && getHoleScore(playerB.id, 9, scores) !== null;
      const backSegmentFinished =
        getHoleScore(playerA.id, 18, scores) !== null && getHoleScore(playerB.id, 18, scores) !== null;

      // Perfect sweep: Won all 9 holes in the nine (only meaningful when segment finished)
      const frontPerfectSweepA = frontSegmentFinished && frontHolesWonByA === 9 && frontHolesWonByB === 0;
      const frontPerfectSweepB = frontSegmentFinished && frontHolesWonByB === 9 && frontHolesWonByA === 0;
      const backPerfectSweepA = backSegmentFinished && backHolesWonByA === 9 && backHolesWonByB === 0;
      const backPerfectSweepB = backSegmentFinished && backHolesWonByB === 9 && backHolesWonByA === 0;
      
      // Progressive doubling: Winning all holes that have had a winner, stops if opponent wins or ties 9/18.
      // Apply only when segment finished.
      const frontProgressiveDoubleA =
        frontSegmentFinished && frontHolesWithWinner > 0 && frontHolesWonByA === frontHolesWithWinner && !frontHole9Tied;
      const frontProgressiveDoubleB =
        frontSegmentFinished && frontHolesWithWinner > 0 && frontHolesWonByB === frontHolesWithWinner && !frontHole9Tied;
      const backProgressiveDoubleA =
        backSegmentFinished && backHolesWithWinner > 0 && backHolesWonByA === backHolesWithWinner && !backHole18Tied;
      const backProgressiveDoubleB =
        backSegmentFinished && backHolesWithWinner > 0 && backHolesWonByB === backHolesWithWinner && !backHole18Tied;
      
      // Apply doubling: perfect sweep (all 9) or progressive (all decided, no tie on 9/18)
      const frontDoubleMultiplierA = (frontPerfectSweepA || frontProgressiveDoubleA) ? 2 : 1;
      const frontDoubleMultiplierB = (frontPerfectSweepB || frontProgressiveDoubleB) ? 2 : 1;
      const backDoubleMultiplierA = (backPerfectSweepA || backProgressiveDoubleA) ? 2 : 1;
      const backDoubleMultiplierB = (backPerfectSweepB || backProgressiveDoubleB) ? 2 : 1;
      
      // Calculate money for front 9 (includes carried skins resolved in back, at front rate)
      const netSkinsFront = frontSkinsA - frontSkinsB;
      if (netSkinsFront !== 0 && config.skins.frontValue > 0) {
        const multiplier = netSkinsFront > 0 ? frontDoubleMultiplierA : frontDoubleMultiplierB;
        const frontAmount = netSkinsFront * config.skins.frontValue * multiplier;
        const doubleLabel = multiplier === 2 ? ' (x2)' : '';
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
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Skins Front',
          amount: -frontAmount,
          segment: 'front',
          description: descB,
        });
      }
      
      // Calculate money for back 9 - ONLY pure back 9 skins (holes 10-18)
      // Carried skins are already included in front 9 result above
      const netPureBackSkins = backSkinsA - backSkinsB;
      if (netPureBackSkins !== 0 && config.skins.backValue > 0) {
        const pureBackMultiplier = netPureBackSkins > 0 ? backDoubleMultiplierA : backDoubleMultiplierB;
        const backAmount = netPureBackSkins * config.skins.backValue * pureBackMultiplier;
        const doubleLabel = pureBackMultiplier === 2 ? ' (x2)' : '';
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Skins Back',
          amount: backAmount,
          segment: 'back',
          description: `${backSkinsA} vs ${backSkinsB} skins${doubleLabel}`,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Skins Back',
          amount: -backAmount,
          segment: 'back',
          description: `${backSkinsB} vs ${backSkinsA} skins${doubleLabel}`,
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
  config: BetConfig
): BetSummary[] => {
  if (!config.caros.enabled || config.caros.amount <= 0) return [];
  
  const summaries: BetSummary[] = [];
  const caroHoles = [15, 16, 17, 18];
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      // Calculate total net scores for holes 15-18
      let totalA = 0;
      let totalB = 0;
      let hasAllScores = true;
      
      caroHoles.forEach(holeNum => {
        const scoreA = getHoleScore(playerA.id, holeNum, scores);
        const scoreB = getHoleScore(playerB.id, holeNum, scores);
        
        if (scoreA === null || scoreB === null) {
          hasAllScores = false;
          return;
        }
        
        totalA += scoreA;
        totalB += scoreB;
      });
      
      if (!hasAllScores) continue;
      
      // Single bet - whoever has lower total wins
      if (totalA < totalB) {
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Caros',
          amount: config.caros.amount,
          segment: 'back',
          description: `${totalA} vs ${totalB}`,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Caros',
          amount: -config.caros.amount,
          segment: 'back',
          description: `${totalB} vs ${totalA}`,
        });
      } else if (totalB < totalA) {
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Caros',
          amount: config.caros.amount,
          segment: 'back',
          description: `${totalB} vs ${totalA}`,
        });
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Caros',
          amount: -config.caros.amount,
          segment: 'back',
          description: `${totalA} vs ${totalB}`,
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
      const holePar = course.holes[score.holeNumber - 1]?.par || 4;
      const toPar = score.strokes - holePar;
      
      // Positive units
      if (toPar === -1) positive += 1; // Birdie
      if (toPar === -2) positive += 2; // Eagle
      if (toPar <= -3) positive += 3; // Albatross
      if (score.markers.sandyPar) positive += 1;
      if (score.markers.aquaPar) positive += 1;
      if (score.markers.holeOut) positive += 2;
      
      // Negative units - Cuatriput (4+ putts)
      if (score.putts >= 4) negative += 1;
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
  
  const manchaMarkers = ['ladies', 'swingBlanco', 'retruje', 'trampa', 'dobleAgua', 'dobleOB', 'par3GirMas3', 'dobleDigito', 'moreliana'] as const;
  
  // Count regular manchas (not cuatriput)
  const countManchas = (playerId: string): number => {
    const playerScores = scores.get(playerId) || [];
    let manchas = 0;
    
    playerScores.forEach(score => {
      manchaMarkers.forEach(marker => {
        if (score.markers[marker]) manchas += 1;
      });
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

// Calculate ALL bet summaries with bet overrides applied
export const calculateAllBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): BetSummary[] => {
  const allSummaries = [
    ...calculateMedalBets(players, scores, config),
    ...calculatePressureBets(players, scores, config),
    ...calculateSkinsBets(players, scores, config),
    ...calculateCarosBets(players, scores, config),
    ...calculateUnitsBets(players, scores, config, course),
    ...calculateManchasBets(players, scores, config),
    ...calculateCulebrasBets(players, scores, config),
    ...calculatePinguinosBets(players, scores, config, course),
  ];
  
  // Apply bet overrides - cancel disabled bets and apply amount overrides
  if (config.betOverrides && config.betOverrides.length > 0) {
    return allSummaries.map(summary => {
      // Find if there's an override for this pair and bet type
      const override = config.betOverrides?.find(o => {
        const matchesPair = (o.playerAId === summary.playerId && o.playerBId === summary.vsPlayer) ||
                           (o.playerAId === summary.vsPlayer && o.playerBId === summary.playerId);
        const matchesBetType = summary.betType.toLowerCase().includes(o.betType.toLowerCase());
        return matchesPair && matchesBetType;
      });
      
      if (override) {
        // If bet is disabled, zero out the amount
        if (override.enabled === false) {
          return { ...summary, amount: 0 };
        }
        // If there's an amount override, scale the amount proportionally
        if (override.amountOverride !== undefined && summary.amount !== 0) {
          const sign = summary.amount > 0 ? 1 : -1;
          return { ...summary, amount: sign * override.amountOverride };
        }
      }
      return summary;
    }).filter(s => s.amount !== 0 || !config.betOverrides?.some(o => 
      o.enabled === false && 
      ((o.playerAId === s.playerId && o.playerBId === s.vsPlayer) ||
       (o.playerAId === s.vsPlayer && o.playerBId === s.playerId))
    ));
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
