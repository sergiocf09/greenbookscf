// Bet Calculations Engine - All bilateral calculations
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { calculateStrokesPerHole } from '@/lib/handicapUtils';

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
// - First bet opens on hole 1 (front) or hole 10 (back)
// - When any bet reaches +2 or -2, a NEW bet opens starting at 0
// - Each bet tracks its own running balance independently
// - Final display shows each bet's final balance (e.g., +3 +1 -2)
// - Total 18 = first front 9 bet final balance + first back 9 bet final balance
export const calculatePressureBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig
): BetSummary[] => {
  if (!config.pressures.enabled) return [];
  
  const summaries: BetSummary[] = [];
  
  const segments: Array<{ key: 'front' | 'back'; amount: number; holes: number[] }> = [
    { key: 'front', amount: config.pressures.frontAmount, holes: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { key: 'back', amount: config.pressures.backAmount, holes: [10, 11, 12, 13, 14, 15, 16, 17, 18] },
  ];
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      // Track first bet result from each segment for total 18
      const firstBetResults: Record<'front' | 'back', number> = { front: 0, back: 0 };
      const allBetBalances: Record<'front' | 'back', number[]> = { front: [], back: [] };
      
      segments.forEach(({ key, amount, holes }) => {
        if (amount <= 0) return;
        
        // Each bet has its own balance that keeps accumulating
        // When a bet hits +2 or -2, a new bet opens (but existing bets continue)
        let bets: number[] = [0]; // Start with first bet at 0
        
        holes.forEach(holeNum => {
          const scoreA = getHoleScore(playerA.id, holeNum, scores);
          const scoreB = getHoleScore(playerB.id, holeNum, scores);
          
          if (scoreA === null || scoreB === null) return;
          
          let holeResult = 0; // +1 for A win, -1 for B win, 0 for tie
          if (scoreA < scoreB) holeResult = 1;
          else if (scoreB < scoreA) holeResult = -1;
          
          // Apply hole result to ALL active bets
          bets = bets.map(bal => bal + holeResult);
          
          // Check if any bet just reached ±2 - open new bet if not last hole
          const justReachedTwo = bets.some(bal => Math.abs(bal) === 2);
          if (justReachedTwo && holeNum !== holes[holes.length - 1]) {
            // Check if there's no bet at 0 already
            const hasZeroBet = bets.some(bal => bal === 0);
            if (!hasZeroBet) {
              bets.push(0);
            }
          }
        });
        
        // Store all bet balances for display
        allBetBalances[key] = bets;
        
        // First bet's final balance is used for total 18
        firstBetResults[key] = bets[0] || 0;
        
        // Calculate total money for this segment
        // Each bet result contributes: positive balance = A wins that many bets worth
        const totalBetsA = bets.filter(b => b > 0).reduce((sum, b) => sum + b, 0);
        const totalBetsB = Math.abs(bets.filter(b => b < 0).reduce((sum, b) => sum + b, 0));
        const netBets = totalBetsA - totalBetsB;
        const segmentAmountA = netBets * amount;
        
        // Create description showing each bet's balance
        const betBalanceStr = bets.map(b => (b >= 0 ? '+' : '') + b).join(' ');
        
        if (segmentAmountA !== 0 || bets.length > 0) {
          summaries.push({
            playerId: playerA.id,
            vsPlayer: playerB.id,
            betType: `Presiones ${key === 'front' ? 'Front' : 'Back'}`,
            amount: segmentAmountA,
            segment: key,
            description: betBalanceStr,
          });
          summaries.push({
            playerId: playerB.id,
            vsPlayer: playerA.id,
            betType: `Presiones ${key === 'front' ? 'Front' : 'Back'}`,
            amount: -segmentAmountA,
            segment: key,
            description: bets.map(b => ((-b) >= 0 ? '+' : '') + (-b)).join(' '),
          });
        }
      });
      
      // Total 18 = First bet from front + First bet from back
      const total18Balance = firstBetResults.front + firstBetResults.back;
      if (config.pressures.frontAmount > 0 && config.pressures.backAmount > 0) {
        // Use average amount for total 18
        const avgAmount = (config.pressures.frontAmount + config.pressures.backAmount) / 2;
        const totalAmount = total18Balance * avgAmount;
        
        const frontStr = (firstBetResults.front >= 0 ? '+' : '') + firstBetResults.front;
        const backStr = (firstBetResults.back >= 0 ? '+' : '') + firstBetResults.back;
        const total18Str = (total18Balance >= 0 ? '+' : '') + total18Balance;
        
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Presiones Total',
          amount: totalAmount,
          segment: 'total',
          description: `Match 18: ${frontStr} ${backStr} = ${total18Str}`,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Presiones Total',
          amount: -totalAmount,
          segment: 'total',
          description: `Match 18: ${(-firstBetResults.front) >= 0 ? '+' : ''}${-firstBetResults.front} ${(-firstBetResults.back) >= 0 ? '+' : ''}${-firstBetResults.back} = ${(-total18Balance) >= 0 ? '+' : ''}${-total18Balance}`,
        });
      }
    }
  }
  
  return summaries;
};

// SKINS: Bilateral accumulated - net holes won per nine
// Each pair of players competes individually
// At end of 18 holes, if there are tied holes, they are eliminated (no payment)
// Net skins won = holes won by A - holes won by B for that segment
export const calculateSkinsBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig
): BetSummary[] => {
  if (!config.skins.enabled) return [];
  
  const summaries: BetSummary[] = [];
  
  const segments: Array<{ key: 'front' | 'back'; value: number; holes: number[] }> = [
    { key: 'front', value: config.skins.frontValue, holes: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { key: 'back', value: config.skins.backValue, holes: [10, 11, 12, 13, 14, 15, 16, 17, 18] },
  ];
  
  // For each pair of players, calculate bilateral skins
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      segments.forEach(({ key, value, holes }) => {
        if (value <= 0) return;
        
        let holesWonA = 0;
        let holesWonB = 0;
        
        holes.forEach(holeNum => {
          const scoreA = getHoleScore(playerA.id, holeNum, scores);
          const scoreB = getHoleScore(playerB.id, holeNum, scores);
          
          if (scoreA === null || scoreB === null) return;
          
          if (scoreA < scoreB) holesWonA++;
          else if (scoreB < scoreA) holesWonB++;
          // Ties don't count for either
        });
        
        // Net skins = difference in holes won
        const netSkinsA = holesWonA - holesWonB;
        const amount = netSkinsA * value;
        
        if (amount !== 0) {
          summaries.push({
            playerId: playerA.id,
            vsPlayer: playerB.id,
            betType: `Skins ${key === 'front' ? 'Front' : 'Back'}`,
            amount: amount,
            segment: key,
            description: `${holesWonA} vs ${holesWonB} hoyos`,
          });
          summaries.push({
            playerId: playerB.id,
            vsPlayer: playerA.id,
            betType: `Skins ${key === 'front' ? 'Front' : 'Back'}`,
            amount: -amount,
            segment: key,
            description: `${holesWonB} vs ${holesWonA} hoyos`,
          });
        }
      });
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

// MANCHAS: Negative markers
export const calculateManchasBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig
): BetSummary[] => {
  if (!config.manchas.enabled || config.manchas.valuePerPoint <= 0) return [];
  
  const summaries: BetSummary[] = [];
  
  const manchaMarkers = ['ladies', 'swingBlanco', 'retruje', 'trampa', 'dobleAgua', 'dobleOB', 'par3GirMas3', 'dobleDigito', 'moreliana'] as const;
  
  const countManchas = (playerId: string): number => {
    const playerScores = scores.get(playerId) || [];
    let manchas = 0;
    
    playerScores.forEach(score => {
      manchaMarkers.forEach(marker => {
        if (score.markers[marker]) manchas += 1;
      });
      if (score.markers.cuatriput) manchas += 1;
    });
    
    return manchas;
  };
  
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
    }
  }
  
  return summaries;
};

// CULEBRAS: 3+ putts cumulative
export const calculateCulebrasBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig
): BetSummary[] => {
  if (!config.culebras.enabled || config.culebras.valuePerOccurrence <= 0) return [];
  
  const summaries: BetSummary[] = [];
  
  const countCulebras = (playerId: string): number => {
    const playerScores = scores.get(playerId) || [];
    return playerScores.filter(s => s.putts >= 3).length;
  };
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      const culebrasA = countCulebras(playerA.id);
      const culebrasB = countCulebras(playerB.id);
      const diff = culebrasB - culebrasA; // Fewer culebras wins
      
      if (diff !== 0) {
        const amount = diff * config.culebras.valuePerOccurrence;
        
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Culebras',
          amount: amount,
          segment: 'total',
          description: `${culebrasA} vs ${culebrasB} culebras`,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Culebras',
          amount: -amount,
          segment: 'total',
          description: `${culebrasB} vs ${culebrasA} culebras`,
        });
      }
    }
  }
  
  return summaries;
};

// PINGUINOS: 1-putt cumulative
export const calculatePinguinosBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig
): BetSummary[] => {
  if (!config.pinguinos.enabled || config.pinguinos.valuePerOccurrence <= 0) return [];
  
  const summaries: BetSummary[] = [];
  
  const countPinguinos = (playerId: string): number => {
    const playerScores = scores.get(playerId) || [];
    return playerScores.filter(s => s.putts === 1).length;
  };
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      const pinguinosA = countPinguinos(playerA.id);
      const pinguinosB = countPinguinos(playerB.id);
      const diff = pinguinosA - pinguinosB; // More pinguinos wins
      
      if (diff !== 0) {
        const amount = diff * config.pinguinos.valuePerOccurrence;
        
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Pingüinos',
          amount: amount,
          segment: 'total',
          description: `${pinguinosA} vs ${pinguinosB} pingüinos`,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Pingüinos',
          amount: -amount,
          segment: 'total',
          description: `${pinguinosB} vs ${pinguinosA} pingüinos`,
        });
      }
    }
  }
  
  return summaries;
};

// Calculate ALL bet summaries
export const calculateAllBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): BetSummary[] => {
  return [
    ...calculateMedalBets(players, scores, config),
    ...calculatePressureBets(players, scores, config),
    ...calculateSkinsBets(players, scores, config),
    ...calculateCarosBets(players, scores, config),
    ...calculateUnitsBets(players, scores, config, course),
    ...calculateManchasBets(players, scores, config),
    ...calculateCulebrasBets(players, scores, config),
    ...calculatePinguinosBets(players, scores, config),
  ];
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
