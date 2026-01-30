// Coneja Bet Calculations Engine
// A group bet based on "patas" per hole within sets of 6 holes

import { Player, PlayerScore, BetConfig, GolfCourse, ConejaPataState, ConejaSetResult } from '@/types/golf';
import { calculateStrokesPerHole } from './handicapUtils';
import { getBilateralHandicapForPair } from './betCalculations';

// Set definitions
const CONEJA_SETS = [
  { setNumber: 1 as const, startHole: 1, endHole: 6 },
  { setNumber: 2 as const, startHole: 7, endHole: 12 },
  { setNumber: 3 as const, startHole: 13, endHole: 18 },
];

/**
 * Get net score for a player on a hole using either individual or bilateral handicap
 */
const getNetScoreForPlayerVsRival = (
  player: Player,
  rival: Player,
  holeNumber: number,
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig
): { playerNet: number; rivalNet: number } | null => {
  const playerScores = scores.get(player.id);
  const rivalScores = scores.get(rival.id);
  
  const playerHoleScore = playerScores?.find(s => s.holeNumber === holeNumber && s.confirmed && s.strokes > 0);
  const rivalHoleScore = rivalScores?.find(s => s.holeNumber === holeNumber && s.confirmed && s.strokes > 0);
  
  if (!playerHoleScore || !rivalHoleScore) return null;
  
  if (config.coneja?.handicapMode === 'bilateral') {
    // Use bilateral handicaps if available
    const bilateral = getBilateralHandicapForPair(
      player.id,
      rival.id,
      config.bilateralHandicaps,
      player.profileId,
      rival.profileId
    );
    
    if (bilateral) {
      const matchesPlayerA = (id: string) => 
        id === player.id || (player.profileId && id === player.profileId);
      const isPlayerFirst = matchesPlayerA(bilateral.playerAId);
      
      const playerHcp = isPlayerFirst ? bilateral.playerAHandicap : bilateral.playerBHandicap;
      const rivalHcp = isPlayerFirst ? bilateral.playerBHandicap : bilateral.playerAHandicap;
      
      const playerStrokesPerHole = calculateStrokesPerHole(playerHcp, course);
      const rivalStrokesPerHole = calculateStrokesPerHole(rivalHcp, course);
      
      const playerReceived = playerStrokesPerHole[holeNumber - 1] || 0;
      const rivalReceived = rivalStrokesPerHole[holeNumber - 1] || 0;
      
      return {
        playerNet: playerHoleScore.strokes - playerReceived,
        rivalNet: rivalHoleScore.strokes - rivalReceived,
      };
    }
  }
  
  // Fallback to individual handicaps
  const playerStrokesPerHole = calculateStrokesPerHole(player.handicap, course);
  const rivalStrokesPerHole = calculateStrokesPerHole(rival.handicap, course);
  
  const playerReceived = playerStrokesPerHole[holeNumber - 1] || 0;
  const rivalReceived = rivalStrokesPerHole[holeNumber - 1] || 0;
  
  return {
    playerNet: playerHoleScore.strokes - playerReceived,
    rivalNet: rivalHoleScore.strokes - rivalReceived,
  };
};

/**
 * Determine if a player is the absolute winner of a hole
 * A player is absolute winner if they beat ALL other players with a lower net score
 */
const getAbsoluteWinner = (
  players: Player[],
  holeNumber: number,
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig
): string | null => {
  if (players.length < 2) return null;
  
  // Check each player as potential absolute winner
  for (const candidate of players) {
    let isAbsoluteWinner = true;
    let hasValidComparisons = false;
    
    for (const rival of players) {
      if (rival.id === candidate.id) continue;
      
      const netResult = getNetScoreForPlayerVsRival(candidate, rival, holeNumber, scores, course, config);
      
      if (!netResult) {
        // No valid score for this comparison - can't be absolute winner
        isAbsoluteWinner = false;
        break;
      }
      
      hasValidComparisons = true;
      
      // Candidate must strictly beat the rival (no ties)
      if (netResult.playerNet >= netResult.rivalNet) {
        isAbsoluteWinner = false;
        break;
      }
    }
    
    if (isAbsoluteWinner && hasValidComparisons) {
      return candidate.id;
    }
  }
  
  return null; // No absolute winner (ties or missing scores)
};

/**
 * Check if a player lost to any rival on a specific hole
 */
const didPlayerLoseToAnyone = (
  playerId: string,
  players: Player[],
  holeNumber: number,
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig
): boolean => {
  const player = players.find(p => p.id === playerId);
  if (!player) return false;
  
  for (const rival of players) {
    if (rival.id === playerId) continue;
    
    const netResult = getNetScoreForPlayerVsRival(player, rival, holeNumber, scores, course, config);
    
    if (netResult && netResult.playerNet > netResult.rivalNet) {
      return true; // Lost to at least one rival
    }
  }
  
  return false;
};

/**
 * Calculate pata states for all holes
 */
export const calculateConejaPataStates = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig,
  confirmedHoles: Set<number>
): ConejaPataState[] => {
  const pataStates: ConejaPataState[] = [];
  
  // Track running patas per player (reset at each set boundary)
  let runningPatas: Record<string, number> = {};
  players.forEach(p => { runningPatas[p.id] = 0; });
  
  for (let holeNumber = 1; holeNumber <= 18; holeNumber++) {
    // Reset patas at set boundaries
    if (holeNumber === 1 || holeNumber === 7 || holeNumber === 13) {
      runningPatas = {};
      players.forEach(p => { runningPatas[p.id] = 0; });
    }
    
    // Skip if hole not confirmed
    if (!confirmedHoles.has(holeNumber)) {
      pataStates.push({
        holeNumber,
        winnerId: null,
        patasPerPlayer: { ...runningPatas },
      });
      continue;
    }
    
    // Determine absolute winner
    const winnerId = getAbsoluteWinner(players, holeNumber, scores, course, config);
    
    // Update patas
    if (winnerId) {
      runningPatas[winnerId] = (runningPatas[winnerId] || 0) + 1;
    }
    
    // Check who loses patas (those who lost to at least one rival AND are not the winner)
    for (const player of players) {
      if (player.id === winnerId) continue; // Winner doesn't lose pata
      
      if (runningPatas[player.id] > 0 && didPlayerLoseToAnyone(player.id, players, holeNumber, scores, course, config)) {
        runningPatas[player.id] = Math.max(0, runningPatas[player.id] - 1);
      }
    }
    
    pataStates.push({
      holeNumber,
      winnerId,
      patasPerPlayer: { ...runningPatas },
    });
  }
  
  return pataStates;
};

/**
 * Calculate Coneja set results including accumulations
 */
export const calculateConejaSetResults = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig,
  confirmedHoles: Set<number>
): ConejaSetResult[] => {
  const pataStates = calculateConejaPataStates(players, scores, course, config, confirmedHoles);
  const results: ConejaSetResult[] = [];
  
  let accumulatedSets: number[] = [];
  
  for (const set of CONEJA_SETS) {
    const setEndPataState = pataStates.find(ps => ps.holeNumber === set.endHole);
    
    // Check if all holes in set are confirmed
    const allHolesConfirmed = Array.from({ length: 6 }, (_, i) => set.startHole + i)
      .every(h => confirmedHoles.has(h));
    
    if (!allHolesConfirmed) {
      // Set not complete yet
      results.push({
        setNumber: set.setNumber,
        startHole: set.startHole,
        endHole: set.endHole,
        winnerId: null,
        wonOnHole: null,
        isAccumulated: false,
        accumulatedSets: [],
      });
      continue;
    }
    
    if (!setEndPataState) {
      results.push({
        setNumber: set.setNumber,
        startHole: set.startHole,
        endHole: set.endHole,
        winnerId: null,
        wonOnHole: null,
        isAccumulated: false,
        accumulatedSets: [],
      });
      continue;
    }
    
    // Find player with pata(s) at end of set
    const playersWithPatas = Object.entries(setEndPataState.patasPerPlayer)
      .filter(([_, patas]) => patas > 0);
    
    if (playersWithPatas.length === 1) {
      // We have a winner for this set
      const winnerId = playersWithPatas[0][0];
      
      // If there were accumulated conejas, this winner gets them too
      if (accumulatedSets.length > 0) {
        // Find the hole where the winner got their first pata (which breaks the accumulation)
        let wonOnHole = set.endHole;
        for (let h = set.startHole; h <= set.endHole; h++) {
          const ps = pataStates.find(p => p.holeNumber === h);
          if (ps?.winnerId === winnerId) {
            wonOnHole = h;
            break;
          }
        }
        
        results.push({
          setNumber: set.setNumber,
          startHole: set.startHole,
          endHole: set.endHole,
          winnerId,
          wonOnHole,
          isAccumulated: true,
          accumulatedSets: [...accumulatedSets, set.setNumber],
        });
        accumulatedSets = [];
      } else {
        results.push({
          setNumber: set.setNumber,
          startHole: set.startHole,
          endHole: set.endHole,
          winnerId,
          wonOnHole: set.endHole,
          isAccumulated: false,
          accumulatedSets: [],
        });
      }
    } else if (playersWithPatas.length === 0) {
      // No one has pata - coneja accumulates
      accumulatedSets.push(set.setNumber);
      
      results.push({
        setNumber: set.setNumber,
        startHole: set.startHole,
        endHole: set.endHole,
        winnerId: null,
        wonOnHole: null,
        isAccumulated: true,
        accumulatedSets: [],
      });
    } else {
      // Multiple players have patas - shouldn't happen by the rules
      // but handle gracefully - no winner
      results.push({
        setNumber: set.setNumber,
        startHole: set.startHole,
        endHole: set.endHole,
        winnerId: null,
        wonOnHole: null,
        isAccumulated: false,
        accumulatedSets: [],
      });
    }
  }
  
  return results;
};

/**
 * Calculate Coneja bets - returns BetSummary-like objects for integration with ledger
 */
export interface ConejaBetResult {
  winnerId: string;
  loserId: string;
  amount: number;
  setNumber: number;
  accumulatedSets: number[];
  description: string;
}

export const calculateConejaBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig,
  confirmedHoles: Set<number>
): ConejaBetResult[] => {
  if (!config.coneja?.enabled || players.length < 2) {
    return [];
  }
  
  const results: ConejaBetResult[] = [];
  const setResults = calculateConejaSetResults(players, scores, course, config, confirmedHoles);
  const amountPerConeja = config.coneja.amount || 50;
  
  for (const setResult of setResults) {
    if (!setResult.winnerId) continue;
    
    const winner = players.find(p => p.id === setResult.winnerId);
    if (!winner) continue;
    
    // Calculate how many conejas this winner gets
    const numConejas = setResult.isAccumulated && setResult.accumulatedSets.length > 0
      ? setResult.accumulatedSets.length
      : 1;
    
    const totalAmount = amountPerConeja * numConejas;
    
    // Each losing player pays the winner
    for (const loser of players) {
      if (loser.id === setResult.winnerId) continue;
      
      const description = setResult.isAccumulated && setResult.accumulatedSets.length > 1
        ? `Coneja Sets ${setResult.accumulatedSets.join('+')} (acum)`
        : `Coneja Set ${setResult.setNumber}`;
      
      results.push({
        winnerId: setResult.winnerId,
        loserId: loser.id,
        amount: totalAmount,
        setNumber: setResult.setNumber,
        accumulatedSets: setResult.accumulatedSets,
        description,
      });
    }
  }
  
  return results;
};

/**
 * Get visual state for Coneja toolkit display
 */
export interface ConejaHoleDisplay {
  holeNumber: number;
  hasPata: boolean;
  pataPlayerId: string | null;
  pataCount: number;
  isConfirmed: boolean;
  isTie: boolean; // Everyone tied on this hole
  winnerId: string | null; // Absolute winner of this hole
  isSetWonHole: boolean; // True if this hole is where the set was won
  previousPataCount: number; // Pata count before this hole (to detect losses)
}

export const getConejaHoleDisplays = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig,
  confirmedHoles: Set<number>
): ConejaHoleDisplay[] => {
  const pataStates = calculateConejaPataStates(players, scores, course, config, confirmedHoles);
  const setResults = calculateConejaSetResults(players, scores, course, config, confirmedHoles);
  
  // Create a set of holes where the Coneja was won
  const setWonHoles = new Set<number>();
  setResults.forEach(sr => {
    if (sr.winnerId && sr.wonOnHole) {
      setWonHoles.add(sr.wonOnHole);
    }
  });
  
  return pataStates.map((ps, index) => {
    const playersWithPatas = Object.entries(ps.patasPerPlayer)
      .filter(([_, count]) => count > 0);
    
    const hasPata = playersWithPatas.length === 1;
    const pataPlayerId = hasPata ? playersWithPatas[0][0] : null;
    const pataCount = hasPata ? playersWithPatas[0][1] : 0;
    
    // Check if it's a tie (no winner and hole is confirmed)
    const isTie = confirmedHoles.has(ps.holeNumber) && !ps.winnerId;
    
    // Get previous pata count (within same set)
    let previousPataCount = 0;
    const setStartHoles = [1, 7, 13];
    const isSetStart = setStartHoles.includes(ps.holeNumber);
    
    if (!isSetStart && index > 0) {
      const prevState = pataStates[index - 1];
      const prevPlayersWithPatas = Object.entries(prevState.patasPerPlayer)
        .filter(([_, count]) => count > 0);
      if (prevPlayersWithPatas.length === 1) {
        previousPataCount = prevPlayersWithPatas[0][1];
      }
    }
    
    return {
      holeNumber: ps.holeNumber,
      hasPata,
      pataPlayerId,
      pataCount,
      isConfirmed: confirmedHoles.has(ps.holeNumber),
      isTie,
      winnerId: ps.winnerId,
      isSetWonHole: setWonHoles.has(ps.holeNumber),
      previousPataCount,
    };
  });
};

/**
 * Get detailed net score comparison for a specific hole
 * Used for the tooltip showing handicap application
 */
export interface ConejaHoleDetailPlayer {
  playerId: string;
  name: string;
  initials: string;
  color: string;
  grossScore: number;
  strokesReceived: number; // 0 or 1 (indicator for dot display)
  netScore: number;
  isWinner: boolean;
}

export interface ConejaHoleDetail {
  holeNumber: number;
  par: number;
  players: ConejaHoleDetailPlayer[];
  winnerId: string | null;
  isTie: boolean;
}

/**
 * Matrix cell for pairwise net score comparison
 */
export interface ConejaMatrixCell {
  playerId: string;
  rivalId: string;
  playerNet: number;
  rivalNet: number;
  playerReceived: boolean; // True if player received a stroke
  result: 'win' | 'loss' | 'tie';
}

/**
 * Full matrix for all player pairs on a hole
 */
export interface ConejaHoleMatrix {
  holeNumber: number;
  par: number;
  playerIds: string[];
  playerInitials: Record<string, string>;
  playerColors: Record<string, string>;
  cells: Record<string, Record<string, ConejaMatrixCell>>; // [playerId][rivalId]
  winnerId: string | null;
}

/**
 * Calculate the pairwise matrix for a specific hole
 * Shows how each player fared against every other player
 */
export const getConejaHoleMatrix = (
  holeNumber: number,
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig,
  confirmedHoles: Set<number>
): ConejaHoleMatrix | null => {
  if (!confirmedHoles.has(holeNumber)) return null;
  
  const hole = course.holes[holeNumber - 1];
  if (!hole) return null;
  
  const playerIds = players.map(p => p.id);
  const playerInitials: Record<string, string> = {};
  const playerColors: Record<string, string> = {};
  players.forEach(p => {
    playerInitials[p.id] = p.initials;
    playerColors[p.id] = p.color;
  });
  
  const cells: Record<string, Record<string, ConejaMatrixCell>> = {};
  
  // Initialize cells
  players.forEach(player => {
    cells[player.id] = {};
    
    players.forEach(rival => {
      if (rival.id === player.id) return;
      
      const netResult = getNetScoreForPlayerVsRivalWithDetails(
        player, rival, holeNumber, scores, course, config
      );
      
      if (netResult) {
        let result: 'win' | 'loss' | 'tie' = 'tie';
        if (netResult.playerNet < netResult.rivalNet) result = 'win';
        if (netResult.playerNet > netResult.rivalNet) result = 'loss';
        
        cells[player.id][rival.id] = {
          playerId: player.id,
          rivalId: rival.id,
          playerNet: netResult.playerNet,
          rivalNet: netResult.rivalNet,
          playerReceived: netResult.playerReceived,
          result,
        };
      }
    });
  });
  
  // Get absolute winner
  const winnerId = getAbsoluteWinner(players, holeNumber, scores, course, config);
  
  return {
    holeNumber,
    par: hole.par,
    playerIds,
    playerInitials,
    playerColors,
    cells,
    winnerId,
  };
};

/**
 * Helper to get net scores with stroke received info for matrix
 */
const getNetScoreForPlayerVsRivalWithDetails = (
  player: Player,
  rival: Player,
  holeNumber: number,
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig
): { playerNet: number; rivalNet: number; playerReceived: boolean; rivalReceived: boolean } | null => {
  const playerScores = scores.get(player.id);
  const rivalScores = scores.get(rival.id);
  
  const playerHoleScore = playerScores?.find(s => s.holeNumber === holeNumber && s.confirmed && s.strokes > 0);
  const rivalHoleScore = rivalScores?.find(s => s.holeNumber === holeNumber && s.confirmed && s.strokes > 0);
  
  if (!playerHoleScore || !rivalHoleScore) return null;
  
  if (config.coneja?.handicapMode === 'bilateral') {
    // Use bilateral handicaps if available
    const bilateral = getBilateralHandicapForPair(
      player.id,
      rival.id,
      config.bilateralHandicaps,
      player.profileId,
      rival.profileId
    );
    
    if (bilateral) {
      const matchesPlayerA = (id: string) => 
        id === player.id || (player.profileId && id === player.profileId);
      const isPlayerFirst = matchesPlayerA(bilateral.playerAId);
      
      const playerHcp = isPlayerFirst ? bilateral.playerAHandicap : bilateral.playerBHandicap;
      const rivalHcp = isPlayerFirst ? bilateral.playerBHandicap : bilateral.playerAHandicap;
      
      const playerStrokesPerHole = calculateStrokesPerHole(playerHcp, course);
      const rivalStrokesPerHole = calculateStrokesPerHole(rivalHcp, course);
      
      const playerReceived = playerStrokesPerHole[holeNumber - 1] || 0;
      const rivalReceived = rivalStrokesPerHole[holeNumber - 1] || 0;
      
      return {
        playerNet: playerHoleScore.strokes - playerReceived,
        rivalNet: rivalHoleScore.strokes - rivalReceived,
        playerReceived: playerReceived > 0,
        rivalReceived: rivalReceived > 0,
      };
    }
  }
  
  // Fallback to individual handicaps
  const playerStrokesPerHole = calculateStrokesPerHole(player.handicap, course);
  const rivalStrokesPerHole = calculateStrokesPerHole(rival.handicap, course);
  
  const playerReceived = playerStrokesPerHole[holeNumber - 1] || 0;
  const rivalReceived = rivalStrokesPerHole[holeNumber - 1] || 0;
  
  return {
    playerNet: playerHoleScore.strokes - playerReceived,
    rivalNet: rivalHoleScore.strokes - rivalReceived,
    playerReceived: playerReceived > 0,
    rivalReceived: rivalReceived > 0,
  };
};

export const getConejaHoleDetail = (
  holeNumber: number,
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig,
  confirmedHoles: Set<number>
): ConejaHoleDetail | null => {
  if (!confirmedHoles.has(holeNumber)) return null;
  
  const hole = course.holes[holeNumber - 1];
  if (!hole) return null;
  
  // For 'individual' mode, calculate using player's own handicap
  if (config.coneja?.handicapMode !== 'bilateral') {
    const playerDetails: ConejaHoleDetailPlayer[] = [];
    
    players.forEach(player => {
      const playerScores = scores.get(player.id);
      const holeScore = playerScores?.find(s => s.holeNumber === holeNumber && s.confirmed && s.strokes > 0);
      if (!holeScore) return;
      
      const strokesPerHole = calculateStrokesPerHole(player.handicap, course);
      const strokesReceived = strokesPerHole[holeNumber - 1] || 0;
      
      playerDetails.push({
        playerId: player.id,
        name: player.name,
        initials: player.initials,
        color: player.color,
        grossScore: holeScore.strokes,
        strokesReceived,
        netScore: holeScore.strokes - strokesReceived,
        isWinner: false, // Will be set later
      });
    });
    
    if (playerDetails.length < 2) return null;
    
    // Determine winner (lowest net score, unique)
    const minNet = Math.min(...playerDetails.map(p => p.netScore));
    const playersWithMinNet = playerDetails.filter(p => p.netScore === minNet);
    const winnerId = playersWithMinNet.length === 1 ? playersWithMinNet[0].playerId : null;
    
    playerDetails.forEach(p => {
      p.isWinner = p.playerId === winnerId;
    });
    
    return {
      holeNumber,
      par: hole.par,
      players: playerDetails,
      winnerId,
      isTie: winnerId === null,
    };
  }
  
  // For 'bilateral' mode, show net scores based on bilateral handicaps
  // This is more complex - we need to show each player's strokes received vs the group
  // For simplicity in display, we'll show the max strokes received by any pairing
  const playerDetails: ConejaHoleDetailPlayer[] = [];
  
  players.forEach(player => {
    const playerScores = scores.get(player.id);
    const holeScore = playerScores?.find(s => s.holeNumber === holeNumber && s.confirmed && s.strokes > 0);
    if (!holeScore) return;
    
    // Find max strokes this player would receive against any rival
    let maxStrokesReceived = 0;
    
    players.forEach(rival => {
      if (rival.id === player.id) return;
      
      const bilateral = getBilateralHandicapForPair(
        player.id,
        rival.id,
        config.bilateralHandicaps,
        player.profileId,
        rival.profileId
      );
      
      if (bilateral) {
        const matchesPlayerA = (id: string) => 
          id === player.id || (player.profileId && id === player.profileId);
        const isPlayerFirst = matchesPlayerA(bilateral.playerAId);
        const playerHcp = isPlayerFirst ? bilateral.playerAHandicap : bilateral.playerBHandicap;
        
        const strokesPerHole = calculateStrokesPerHole(playerHcp, course);
        const received = strokesPerHole[holeNumber - 1] || 0;
        maxStrokesReceived = Math.max(maxStrokesReceived, received);
      }
    });
    
    // Fall back to individual if no bilateral found
    if (maxStrokesReceived === 0) {
      const strokesPerHole = calculateStrokesPerHole(player.handicap, course);
      maxStrokesReceived = strokesPerHole[holeNumber - 1] || 0;
    }
    
    playerDetails.push({
      playerId: player.id,
      name: player.name,
      initials: player.initials,
      color: player.color,
      grossScore: holeScore.strokes,
      strokesReceived: maxStrokesReceived,
      netScore: holeScore.strokes - maxStrokesReceived,
      isWinner: false,
    });
  });
  
  if (playerDetails.length < 2) return null;
  
  // Get absolute winner from existing calculation
  const winnerId = getAbsoluteWinner(players, holeNumber, scores, course, config);
  
  playerDetails.forEach(p => {
    p.isWinner = p.playerId === winnerId;
  });
  
  return {
    holeNumber,
    par: hole.par,
    players: playerDetails,
    winnerId,
    isTie: winnerId === null,
  };
};
