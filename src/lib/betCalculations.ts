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

// PRESSURES: Cascading bet system
// - Starts with bet 1 on hole 1 (or 10 for back 9)
// - When a player reaches +2 advantage, a new bet opens
// - Each bet is settled individually and each is worth the bet amount
// - Front 9 result carries to combine with back 9 for total 18
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
      
      // Track results per segment for combining front+back into total
      const segmentResults: Record<'front' | 'back', number> = { front: 0, back: 0 };
      const segmentDetails: Record<'front' | 'back', { holesWonA: number; holesWonB: number; betsWonA: number; betsWonB: number }> = {
        front: { holesWonA: 0, holesWonB: 0, betsWonA: 0, betsWonB: 0 },
        back: { holesWonA: 0, holesWonB: 0, betsWonA: 0, betsWonB: 0 },
      };
      
      segments.forEach(({ key, amount, holes }) => {
        if (amount <= 0) return;
        
        // Track all active bets - each bet has a running balance
        // When balance reaches +2 or -2, that bet is "closed" and a new one opens
        let activeBets: number[] = [0]; // Start with one bet at 0
        let totalBetsWonA = 0;
        let totalBetsWonB = 0;
        let holesWonA = 0;
        let holesWonB = 0;
        
        holes.forEach(holeNum => {
          const scoreA = getHoleScore(playerA.id, holeNum, scores);
          const scoreB = getHoleScore(playerB.id, holeNum, scores);
          
          if (scoreA === null || scoreB === null) return;
          
          let holeResult = 0; // +1 for A win, -1 for B win, 0 for tie
          if (scoreA < scoreB) {
            holeResult = 1;
            holesWonA++;
          } else if (scoreB < scoreA) {
            holeResult = -1;
            holesWonB++;
          }
          
          // Apply hole result to all active bets
          activeBets = activeBets.map(betBalance => betBalance + holeResult);
          
          // Check if any bet reached ±2 (closed)
          const closedBets = activeBets.filter(b => Math.abs(b) >= 2);
          activeBets = activeBets.filter(b => Math.abs(b) < 2);
          
          // Count closed bets
          closedBets.forEach(bet => {
            if (bet >= 2) totalBetsWonA++;
            if (bet <= -2) totalBetsWonB++;
          });
          
          // If a bet was closed by reaching +2 or -2, open a new bet for remaining holes
          if (closedBets.length > 0 && holeNum !== holes[holes.length - 1]) {
            activeBets.push(0); // New bet starts fresh
          }
        });
        
        // At end of segment, settle remaining active bets
        // Remaining active bets carry their current balance
        let remainingBalance = activeBets.reduce((sum, b) => sum + b, 0);
        
        // Calculate total: closed bets + remaining balance contribution
        // Each closed bet = 1 full bet won
        // Remaining bets contribute their partial state
        const netBetsA = totalBetsWonA - totalBetsWonB;
        const segmentAmountA = (netBetsA * amount) + (remainingBalance * amount);
        
        segmentResults[key] = segmentAmountA;
        segmentDetails[key] = { 
          holesWonA, 
          holesWonB, 
          betsWonA: totalBetsWonA + (remainingBalance > 0 ? 1 : 0),
          betsWonB: totalBetsWonB + (remainingBalance < 0 ? 1 : 0),
        };
        
        if (segmentAmountA !== 0) {
          summaries.push({
            playerId: playerA.id,
            vsPlayer: playerB.id,
            betType: `Presiones ${key === 'front' ? 'Front' : 'Back'}`,
            amount: segmentAmountA,
            segment: key,
            description: `${segmentDetails[key].betsWonA} vs ${segmentDetails[key].betsWonB} apuestas`,
          });
          summaries.push({
            playerId: playerB.id,
            vsPlayer: playerA.id,
            betType: `Presiones ${key === 'front' ? 'Front' : 'Back'}`,
            amount: -segmentAmountA,
            segment: key,
            description: `${segmentDetails[key].betsWonB} vs ${segmentDetails[key].betsWonA} apuestas`,
          });
        }
      });
      
      // Total 18 = Front + Back combined
      const totalAmount = segmentResults.front + segmentResults.back;
      if (totalAmount !== 0 && config.pressures.frontAmount > 0 && config.pressures.backAmount > 0) {
        const totalHolesA = segmentDetails.front.holesWonA + segmentDetails.back.holesWonA;
        const totalHolesB = segmentDetails.front.holesWonB + segmentDetails.back.holesWonB;
        const totalBetsA = segmentDetails.front.betsWonA + segmentDetails.back.betsWonA;
        const totalBetsB = segmentDetails.front.betsWonB + segmentDetails.back.betsWonB;
        
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Presiones Total',
          amount: totalAmount,
          segment: 'total',
          description: `${totalBetsA} vs ${totalBetsB} apuestas (${totalHolesA}-${totalHolesB} hoyos)`,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Presiones Total',
          amount: -totalAmount,
          segment: 'total',
          description: `${totalBetsB} vs ${totalBetsA} apuestas (${totalHolesB}-${totalHolesA} hoyos)`,
        });
      }
    }
  }
  
  return summaries;
};

// SKINS: Winner takes pot for each hole
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
  
  segments.forEach(({ key, value, holes }) => {
    if (value <= 0) return;
    
    let carryOver = 0;
    
    holes.forEach(holeNum => {
      const holeScores = players
        .map(p => ({
          player: p,
          score: getHoleScore(p.id, holeNum, scores),
        }))
        .filter(x => x.score !== null);
      
      if (holeScores.length < 2) return;
      
      const minScore = Math.min(...holeScores.map(x => x.score!));
      const winners = holeScores.filter(x => x.score === minScore);
      
      if (winners.length === 1) {
        // Single winner - pays/receives from each other player
        const winner = winners[0].player;
        const pot = (value + carryOver) * (players.length - 1);
        
        players.forEach(loser => {
          if (loser.id === winner.id) return;
          
          summaries.push({
            playerId: winner.id,
            vsPlayer: loser.id,
            betType: `Skin H${holeNum}`,
            amount: value + carryOver,
            segment: key,
            holeNumber: holeNum,
          });
          summaries.push({
            playerId: loser.id,
            vsPlayer: winner.id,
            betType: `Skin H${holeNum}`,
            amount: -(value + carryOver),
            segment: key,
            holeNumber: holeNum,
          });
        });
        
        carryOver = 0;
      } else {
        // Tie - carry over
        carryOver += value;
      }
    });
    
    // Handle remaining carryover at end of segment (or carry to back 9 if enabled)
    if (!config.skins.carryOver || key === 'back') {
      // Pot stays - no action needed, or split among all
    }
  });
  
  return summaries;
};

// CAROS: Holes 15-18 special bet
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
      
      caroHoles.forEach(holeNum => {
        const scoreA = getHoleScore(playerA.id, holeNum, scores);
        const scoreB = getHoleScore(playerB.id, holeNum, scores);
        
        if (scoreA === null || scoreB === null) return;
        
        if (scoreA < scoreB) {
          summaries.push({
            playerId: playerA.id,
            vsPlayer: playerB.id,
            betType: `Caro H${holeNum}`,
            amount: config.caros.amount,
            segment: 'hole',
            holeNumber: holeNum,
          });
          summaries.push({
            playerId: playerB.id,
            vsPlayer: playerA.id,
            betType: `Caro H${holeNum}`,
            amount: -config.caros.amount,
            segment: 'hole',
            holeNumber: holeNum,
          });
        } else if (scoreB < scoreA) {
          summaries.push({
            playerId: playerB.id,
            vsPlayer: playerA.id,
            betType: `Caro H${holeNum}`,
            amount: config.caros.amount,
            segment: 'hole',
            holeNumber: holeNum,
          });
          summaries.push({
            playerId: playerA.id,
            vsPlayer: playerB.id,
            betType: `Caro H${holeNum}`,
            amount: -config.caros.amount,
            segment: 'hole',
            holeNumber: holeNum,
          });
        }
      });
    }
  }
  
  return summaries;
};

// UNITS: Birdies/Eagles/Albatross/Cuatriputs
export const calculateUnitsBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): BetSummary[] => {
  if (!config.units.enabled || config.units.valuePerPoint <= 0) return [];
  
  const summaries: BetSummary[] = [];
  
  const countUnits = (playerId: string): number => {
    const playerScores = scores.get(playerId) || [];
    let units = 0;
    
    playerScores.forEach(score => {
      const holePar = course.holes[score.holeNumber - 1]?.par || 4;
      const toPar = score.strokes - holePar;
      
      if (toPar === -1) units += 1; // Birdie
      if (toPar === -2) units += 2; // Eagle
      if (toPar <= -3) units += 3; // Albatross
      if (score.markers.sandyPar) units += 1;
      if (score.markers.aquaPar) units += 1;
      if (score.markers.holeOut) units += 2;
    });
    
    return units;
  };
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const playerA = players[i];
      const playerB = players[j];
      
      const unitsA = countUnits(playerA.id);
      const unitsB = countUnits(playerB.id);
      const diff = unitsA - unitsB;
      
      if (diff !== 0) {
        const amount = diff * config.units.valuePerPoint;
        
        summaries.push({
          playerId: playerA.id,
          vsPlayer: playerB.id,
          betType: 'Unidades',
          amount: amount,
          segment: 'total',
          description: `${unitsA} vs ${unitsB} unidades`,
        });
        summaries.push({
          playerId: playerB.id,
          vsPlayer: playerA.id,
          betType: 'Unidades',
          amount: -amount,
          segment: 'total',
          description: `${unitsB} vs ${unitsA} unidades`,
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
