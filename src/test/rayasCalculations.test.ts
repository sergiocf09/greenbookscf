/**
 * Tests for Rayas Calculations
 * 
 * These tests verify the logic for:
 * 1. Oyes rayas - absolute closest wins vs ALL rivals
 * 2. Accumulated Oyes carry-over between holes
 * 3. Front Oyes accumulated pay at Front value when resolved in Back
 */

import { describe, it, expect } from 'vitest';
import { calculateRayasBets, getRayasDetailForPair } from '@/lib/rayasCalculations';
import { Player, PlayerScore, BetConfig, GolfCourse, defaultMarkerState } from '@/types/golf';
import { defaultBetConfig } from '@/components/setup/BetSetup';

// ============== TEST DATA SETUP ==============

const createTestCourse = (): GolfCourse => ({
  id: 'test-course',
  name: 'Test Golf Course',
  location: 'Test Location',
  holes: [
    // Front 9
    { number: 1, par: 4, handicapIndex: 5 },
    { number: 2, par: 4, handicapIndex: 13 },
    { number: 3, par: 3, handicapIndex: 17 }, // Par 3 - Oyes hole
    { number: 4, par: 5, handicapIndex: 1 },
    { number: 5, par: 4, handicapIndex: 9 },
    { number: 6, par: 3, handicapIndex: 15 }, // Par 3 - Oyes hole
    { number: 7, par: 4, handicapIndex: 7 },
    { number: 8, par: 4, handicapIndex: 11 },
    { number: 9, par: 5, handicapIndex: 3 },
    // Back 9
    { number: 10, par: 4, handicapIndex: 6 },
    { number: 11, par: 4, handicapIndex: 14 },
    { number: 12, par: 3, handicapIndex: 18 }, // Par 3 - Oyes hole
    { number: 13, par: 5, handicapIndex: 2 },
    { number: 14, par: 4, handicapIndex: 10 },
    { number: 15, par: 3, handicapIndex: 16 }, // Par 3 - Oyes hole
    { number: 16, par: 4, handicapIndex: 8 },
    { number: 17, par: 4, handicapIndex: 12 },
    { number: 18, par: 5, handicapIndex: 4 },
  ],
});

const createTestPlayers = (): Player[] => [
  { id: 'player-a', name: 'Alejandro', initials: 'AL', color: '#FF0000', handicap: 10 },
  { id: 'player-b', name: 'Bernardo', initials: 'BE', color: '#00FF00', handicap: 12 },
  { id: 'player-c', name: 'Carlos', initials: 'CA', color: '#0000FF', handicap: 8 },
  { id: 'player-d', name: 'David', initials: 'DA', color: '#FF00FF', handicap: 15 },
];

const createDefaultScores = (
  players: Player[],
  course: GolfCourse,
  overrides?: Partial<Record<string, Partial<PlayerScore>[]>>
): Map<string, PlayerScore[]> => {
  const scores = new Map<string, PlayerScore[]>();
  
  players.forEach(player => {
    const playerScores: PlayerScore[] = course.holes.map((hole) => {
      const override = overrides?.[player.id]?.find(o => o.holeNumber === hole.number);
      return {
        playerId: player.id,
        holeNumber: hole.number,
        strokes: override?.strokes ?? hole.par,
        putts: override?.putts ?? 2,
        markers: override?.markers ?? { ...defaultMarkerState },
        strokesReceived: 0,
        netScore: override?.netScore ?? (override?.strokes ?? hole.par),
        oyesProximity: override?.oyesProximity ?? null,
        confirmed: true,
      };
    });
    scores.set(player.id, playerScores);
  });
  
  return scores;
};

const createRayasConfig = (frontValue = 100, backValue = 100, medalTotalValue = 200, oyesMode: 'singleWinner' | 'allVsAll' = 'singleWinner'): BetConfig => ({
  ...defaultBetConfig,
  rayas: {
    enabled: true,
    frontValue,
    backValue,
    medalTotalValue,
    skinVariant: 'acumulados',
    oyesMode,
  },
});

// ============== TESTS ==============

describe('Rayas Oyes Calculations - Absolute Closest', () => {
  it('should award rayas to absolute closest player against ALL rivals on Par 3', () => {
    const course = createTestCourse();
    const players = createTestPlayers();
    
    // On hole 3 (Par 3), set proximities:
    // Player A: 1 (closest)
    // Player B: 2
    // Player C: 3
    // Player D: no proximity (missed green)
    const scores = createDefaultScores(players, course, {
      'player-a': [{ holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 1 }],
      'player-b': [{ holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 2 }],
      'player-c': [{ holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 3 }],
      'player-d': [{ holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: null }],
    });
    
    const config = createRayasConfig(100, 100, 200);
    const summaries = calculateRayasBets(players, scores, config, course);
    
    // Filter only Oyes summaries
    const oyesSummaries = summaries.filter(s => s.betType === 'Rayas Oyes');
    
    // Player A (closest) should win against B, C, and D
    const playerAWins = oyesSummaries.filter(s => s.playerId === 'player-a' && s.amount > 0);
    expect(playerAWins.length).toBe(3); // Wins against 3 rivals
    
    // Each win should be 1 raya * 100 (front value)
    playerAWins.forEach(win => {
      expect(win.amount).toBe(100);
      expect(win.segment).toBe('front');
    });
    
    // Verify B, C, D each lost 100 to A
    const playerBLoss = oyesSummaries.find(s => s.playerId === 'player-b' && s.vsPlayer === 'player-a');
    const playerCLoss = oyesSummaries.find(s => s.playerId === 'player-c' && s.vsPlayer === 'player-a');
    const playerDLoss = oyesSummaries.find(s => s.playerId === 'player-d' && s.vsPlayer === 'player-a');
    
    expect(playerBLoss?.amount).toBe(-100);
    expect(playerCLoss?.amount).toBe(-100);
    expect(playerDLoss?.amount).toBe(-100);
  });

  it('should NOT award hierarchical rayas (2nd vs 3rd should NOT earn)', () => {
    const course = createTestCourse();
    const players = createTestPlayers();
    
    // On hole 3 (Par 3):
    // Player A: 1 (closest)
    // Player B: 2
    // Player C: 3
    // Player D: 4
    const scores = createDefaultScores(players, course, {
      'player-a': [{ holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 1 }],
      'player-b': [{ holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 2 }],
      'player-c': [{ holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 3 }],
      'player-d': [{ holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 4 }],
    });
    
    const config = createRayasConfig(100, 100, 200);
    const summaries = calculateRayasBets(players, scores, config, course);
    
    const oyesSummaries = summaries.filter(s => s.betType === 'Rayas Oyes');
    
    // Player B (2nd) should NOT win anything
    const playerBWins = oyesSummaries.filter(s => s.playerId === 'player-b' && s.amount > 0);
    expect(playerBWins.length).toBe(0);
    
    // Player C (3rd) should NOT win anything
    const playerCWins = oyesSummaries.filter(s => s.playerId === 'player-c' && s.amount > 0);
    expect(playerCWins.length).toBe(0);
  });

  it('should accumulate Oyes when nobody hits the green (allVsAll mode)', () => {
    const course = createTestCourse();
    const players = createTestPlayers();
    
    // Hole 3 (Par 3): Nobody on green - accumulate
    // Hole 6 (Par 3): Player A closest - wins 2 rayas (1 current + 1 accumulated) per pair
    const scores = createDefaultScores(players, course, {
      'player-a': [
        { holeNumber: 3, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: 1 },
      ],
      'player-b': [
        { holeNumber: 3, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: 2 },
      ],
      'player-c': [
        { holeNumber: 3, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: null },
      ],
      'player-d': [
        { holeNumber: 3, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: null },
      ],
    });
    
    // Use allVsAll mode for accumulation
    const config = createRayasConfig(100, 100, 200, 'allVsAll');
    const summaries = calculateRayasBets(players, scores, config, course);
    
    const oyesSummaries = summaries.filter(s => s.betType === 'Rayas Oyes');
    
    // In allVsAll mode, accumulation is PER PAIR
    // Player A vs B: both had null on H3 (accumulate), A=1 B=2 on H6 -> A wins 2 rayas
    // Player A vs C: both null on H3 (accum), A=1 C=null on H6 -> A wins 2 rayas  
    // Player A vs D: both null on H3 (accum), A=1 D=null on H6 -> A wins 2 rayas
    
    const playerAWins = oyesSummaries.filter(s => s.playerId === 'player-a' && s.amount > 0);
    expect(playerAWins.length).toBe(3);
    
    // Each win should be 2 rayas * 100 = 200
    playerAWins.forEach(win => {
      expect(win.amount).toBe(200);
    });
  });

  it('should pay Front accumulated Oyes at Front value when resolved in Back (allVsAll mode)', () => {
    const course = createTestCourse();
    const players = createTestPlayers();
    
    // Both Front Par 3s (hole 3 and 6): Nobody on green - accumulate 2 front oyes per pair
    // Back Par 3 (hole 12): Player A closest - wins current (1) + 2 carried from front
    const scores = createDefaultScores(players, course, {
      'player-a': [
        { holeNumber: 3, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 6, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 12, strokes: 3, netScore: 3, oyesProximity: 1 },
      ],
      'player-b': [
        { holeNumber: 3, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 6, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 12, strokes: 3, netScore: 3, oyesProximity: 2 },
      ],
      'player-c': [
        { holeNumber: 3, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 6, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 12, strokes: 3, netScore: 3, oyesProximity: null },
      ],
      'player-d': [
        { holeNumber: 3, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 6, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 12, strokes: 3, netScore: 3, oyesProximity: null },
      ],
    });
    
    // Different values for Front and Back
    const config = createRayasConfig(100, 150, 200, 'allVsAll');
    const summaries = calculateRayasBets(players, scores, config, course);
    
    const oyesSummaries = summaries.filter(s => s.betType === 'Rayas Oyes');
    
    // Player A wins against each rival
    const playerAWins = oyesSummaries.filter(s => s.playerId === 'player-a' && s.amount > 0);
    
    // In allVsAll with accumulation: 
    // Front has 2 Par3s with no winner -> frontCarry = 2 per pair
    // Back H12: A wins current (1 back) + carry (2 front at front value)
    
    // Should have front wins (carry paid at front value) + back wins (current at back value)
    const frontWins = playerAWins.filter(w => w.segment === 'front');
    const backWins = playerAWins.filter(w => w.segment === 'back');
    
    // 3 rivals, front carry = 2 per rival at 100 = 200 per rival
    expect(frontWins.length).toBe(3);
    frontWins.forEach(win => {
      expect(win.amount).toBe(200); // 2 * 100
    });
    
    // 3 rivals, back current = 1 per rival at 150 = 150 per rival
    expect(backWins.length).toBe(3);
    backWins.forEach(win => {
      expect(win.amount).toBe(150); // 1 * 150
    });
  });

  it('should handle multiple Par 3 holes with different winners correctly', () => {
    const course = createTestCourse();
    const players = createTestPlayers();
    
    // Hole 3: Player A closest
    // Hole 6: Player B closest
    // Both in Front 9
    const scores = createDefaultScores(players, course, {
      'player-a': [
        { holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 1 },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: 2 },
      ],
      'player-b': [
        { holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 2 },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: 1 },
      ],
      'player-c': [
        { holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 3 },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: null },
      ],
      'player-d': [
        { holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: null },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: 3 },
      ],
    });
    
    const config = createRayasConfig(100, 100, 200);
    const summaries = calculateRayasBets(players, scores, config, course);
    
    const oyesSummaries = summaries.filter(s => s.betType === 'Rayas Oyes');
    
    // Player A wins on hole 3 against B, C, D = 3 wins * 100 = 300 total
    const playerAWins = oyesSummaries.filter(s => s.playerId === 'player-a' && s.amount > 0);
    const playerATotalWon = playerAWins.reduce((sum, s) => sum + s.amount, 0);
    expect(playerATotalWon).toBe(300);
    
    // Player B wins on hole 6 against A, C, D = 3 wins * 100 = 300 total
    const playerBWins = oyesSummaries.filter(s => s.playerId === 'player-b' && s.amount > 0);
    const playerBTotalWon = playerBWins.reduce((sum, s) => sum + s.amount, 0);
    expect(playerBTotalWon).toBe(300);
    
    // Net between A and B should be 0 (each won once against the other)
    const aVsBWins = oyesSummaries.filter(
      s => s.playerId === 'player-a' && s.vsPlayer === 'player-b'
    );
    const bVsAWins = oyesSummaries.filter(
      s => s.playerId === 'player-b' && s.vsPlayer === 'player-a'
    );
    
    const netAvsB = aVsBWins.reduce((sum, s) => sum + s.amount, 0) +
                    bVsAWins.reduce((sum, s) => sum + s.amount, 0);
    expect(netAvsB).toBe(0);
  });

  it('should correctly sum all Oyes rayas in total bilateral balance', () => {
    const course = createTestCourse();
    const players = createTestPlayers();
    
    // Player A wins all 4 Par 3s (holes 3, 6, 12, 15)
    const scores = createDefaultScores(players, course, {
      'player-a': [
        { holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 1 },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: 1 },
        { holeNumber: 12, strokes: 3, netScore: 3, oyesProximity: 1 },
        { holeNumber: 15, strokes: 3, netScore: 3, oyesProximity: 1 },
      ],
      'player-b': [
        { holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 2 },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: 2 },
        { holeNumber: 12, strokes: 3, netScore: 3, oyesProximity: 2 },
        { holeNumber: 15, strokes: 3, netScore: 3, oyesProximity: 2 },
      ],
    });
    
    const config = createRayasConfig(100, 150, 200);
    const summaries = calculateRayasBets(players, scores, config, course);
    
    // Calculate total Oyes won by A vs B
    const aVsBOyes = summaries.filter(
      s => s.betType === 'Rayas Oyes' && s.playerId === 'player-a' && s.vsPlayer === 'player-b'
    );
    
    const totalAmount = aVsBOyes.reduce((sum, s) => sum + s.amount, 0);
    
    // Front: 2 holes * 100 = 200
    // Back: 2 holes * 150 = 300
    // Total: 500
    expect(totalAmount).toBe(500);
  });
});

describe('Rayas Zero-Sum Verification', () => {
  it('should maintain zero-sum property for all Oyes transactions', () => {
    const course = createTestCourse();
    const players = createTestPlayers();
    
    const scores = createDefaultScores(players, course, {
      'player-a': [
        { holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 1 },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: 2 },
      ],
      'player-b': [
        { holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 2 },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: 1 },
      ],
      'player-c': [
        { holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 3 },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: 3 },
      ],
      'player-d': [
        { holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: null },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: null },
      ],
    });
    
    const config = createRayasConfig(100, 100, 200);
    const summaries = calculateRayasBets(players, scores, config, course);
    
    // Sum of all Oyes amounts should be zero
    const oyesSummaries = summaries.filter(s => s.betType === 'Rayas Oyes');
    const totalSum = oyesSummaries.reduce((sum, s) => sum + s.amount, 0);
    
    expect(totalSum).toBe(0);
  });

  it('should maintain zero-sum for all Rayas transactions combined', () => {
    const course = createTestCourse();
    const players = createTestPlayers();
    
    // Set up some scores with birdies for units testing
    const scores = createDefaultScores(players, course, {
      'player-a': [
        { holeNumber: 1, strokes: 3, netScore: 3 }, // Birdie
        { holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 1 },
      ],
      'player-b': [
        { holeNumber: 2, strokes: 3, netScore: 3 }, // Birdie
        { holeNumber: 3, strokes: 3, netScore: 3, oyesProximity: 2 },
      ],
    });
    
    const config = createRayasConfig(100, 100, 200);
    const summaries = calculateRayasBets(players, scores, config, course);
    
    // All transactions should sum to zero
    const totalSum = summaries.reduce((sum, s) => sum + s.amount, 0);
    expect(totalSum).toBe(0);
  });
});

// ============== NEW QA TESTS ==============

describe('Rayas Oyes - Sangrón Mode (Todos vs Todos)', () => {
  it('should resolve each Par 3 immediately based on ranking comparison', () => {
    const course = createTestCourse();
    const players = createTestPlayers();
    
    // Create scores with Sangrón proximities
    const scores = createDefaultScores(players, course, {
      'player-a': [{ holeNumber: 3, strokes: 3, netScore: 3 }],
      'player-b': [{ holeNumber: 3, strokes: 3, netScore: 3 }],
      'player-c': [{ holeNumber: 3, strokes: 3, netScore: 3 }],
      'player-d': [{ holeNumber: 3, strokes: 3, netScore: 3 }],
    });
    
    // Manually set Sangrón proximities (separate from Acumulado)
    const scoresA = scores.get('player-a')!;
    const h3a = scoresA.find(s => s.holeNumber === 3)!;
    (h3a as any).oyesProximitySangron = 1;
    
    const scoresB = scores.get('player-b')!;
    const h3b = scoresB.find(s => s.holeNumber === 3)!;
    (h3b as any).oyesProximitySangron = 2;
    
    const scoresC = scores.get('player-c')!;
    const h3c = scoresC.find(s => s.holeNumber === 3)!;
    (h3c as any).oyesProximitySangron = 3;
    
    const scoresD = scores.get('player-d')!;
    const h3d = scoresD.find(s => s.holeNumber === 3)!;
    (h3d as any).oyesProximitySangron = 4;
    
    // Configure with allVsAll mode and Sangrón modality
    const config: BetConfig = {
      ...defaultBetConfig,
      rayas: {
        enabled: true,
        frontValue: 100,
        backValue: 150,
        medalTotalValue: 200,
        skinVariant: 'acumulados',
        oyesMode: 'allVsAll',
        bilateralOverrides: {
          'player-a': [
            { rivalId: 'player-b', enabled: true, segments: { oyes: { enabled: true, modality: 'sangron' } } },
            { rivalId: 'player-c', enabled: true, segments: { oyes: { enabled: true, modality: 'sangron' } } },
            { rivalId: 'player-d', enabled: true, segments: { oyes: { enabled: true, modality: 'sangron' } } },
          ],
        },
      },
    };
    
    const summaries = calculateRayasBets(players, scores, config, course);
    const oyesSummaries = summaries.filter(s => s.betType === 'Rayas Oyes');
    
    // In Sangrón with this config:
    // - A has sangron configured vs B, C, D
    // - B, C, D do NOT have sangron configured with each other (use default acumulados)
    // 
    // For sangrón pairs (A vs B, A vs C, A vs D):
    // A (1) beats B (2): A wins 1 raya vs B
    // A (1) beats C (3): A wins 1 raya vs C
    // A (1) beats D (4): A wins 1 raya vs D
    // 
    // For acumulados pairs (B vs C, B vs D, C vs D):
    // These would use oyesProximity field (null for all), so no winner
    
    // Player A should win 3 rayas (vs B, C, D) in sangrón mode
    const playerAWins = oyesSummaries.filter(s => s.playerId === 'player-a' && s.amount > 0);
    expect(playerAWins.length).toBe(3);
    expect(playerAWins.every(w => w.amount === 100)).toBe(true); // Front value
    
    // Verify A won against each of B, C, D
    expect(playerAWins.some(w => w.vsPlayer === 'player-b')).toBe(true);
    expect(playerAWins.some(w => w.vsPlayer === 'player-c')).toBe(true);
    expect(playerAWins.some(w => w.vsPlayer === 'player-d')).toBe(true);
  });

  it('should handle partial rankings in Sangrón (one player without ranking loses)', () => {
    const course = createTestCourse();
    const players = createTestPlayers().slice(0, 2); // Just A and B
    
    const scores = createDefaultScores(players, course, {
      'player-a': [{ holeNumber: 3, strokes: 3, netScore: 3 }],
      'player-b': [{ holeNumber: 3, strokes: 3, netScore: 3 }],
    });
    
    // A has Sangrón ranking, B does not
    const scoresA = scores.get('player-a')!;
    const h3a = scoresA.find(s => s.holeNumber === 3)!;
    (h3a as any).oyesProximitySangron = 1;
    
    // B has null (didn't make green in Sangrón)
    const scoresB = scores.get('player-b')!;
    const h3b = scoresB.find(s => s.holeNumber === 3)!;
    (h3b as any).oyesProximitySangron = null;
    
    const config: BetConfig = {
      ...defaultBetConfig,
      rayas: {
        enabled: true,
        frontValue: 100,
        backValue: 150,
        medalTotalValue: 200,
        skinVariant: 'acumulados',
        oyesMode: 'allVsAll',
        bilateralOverrides: {
          'player-a': [
            { rivalId: 'player-b', enabled: true, segments: { oyes: { enabled: true, modality: 'sangron' } } },
          ],
        },
      },
    };
    
    const summaries = calculateRayasBets(players, scores, config, course);
    const oyesSummaries = summaries.filter(s => s.betType === 'Rayas Oyes');
    
    // A should win vs B (has ranking vs no ranking)
    const playerAWins = oyesSummaries.filter(s => s.playerId === 'player-a' && s.amount > 0);
    expect(playerAWins.length).toBe(1);
    expect(playerAWins[0].amount).toBe(100);
    expect(playerAWins[0].vsPlayer).toBe('player-b');
  });
});

describe('Rayas Oyes - Carry Front→Back Segmented Attribution', () => {
  it('should attribute carried Front rayas to Front segment when resolved in Back', () => {
    const course = createTestCourse();
    const players = createTestPlayers().slice(0, 2); // Just A and B
    
    // Front Par 3s (H3, H6): Both empty → carry = 2
    // Back Par 3 (H12): A wins → pays 2 rayas at FRONT value to FRONT segment
    //                          + 1 raya at BACK value to BACK segment
    const scores = createDefaultScores(players, course, {
      'player-a': [
        { holeNumber: 3, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 6, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 12, strokes: 3, netScore: 3, oyesProximity: 1 },
      ],
      'player-b': [
        { holeNumber: 3, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 6, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 12, strokes: 3, netScore: 3, oyesProximity: 2 },
      ],
    });
    
    const config = createRayasConfig(50, 100, 200, 'allVsAll');
    const summaries = calculateRayasBets(players, scores, config, course);
    
    const oyesSummaries = summaries.filter(s => s.betType === 'Rayas Oyes' && s.playerId === 'player-a' && s.amount > 0);
    
    // Should have 2 entries: one for Front carry (2*50=100), one for Back current (1*100=100)
    const frontEntry = oyesSummaries.find(s => s.segment === 'front');
    const backEntry = oyesSummaries.find(s => s.segment === 'back');
    
    expect(frontEntry).toBeDefined();
    expect(frontEntry?.amount).toBe(100); // 2 rayas * 50 front value
    
    expect(backEntry).toBeDefined();
    expect(backEntry?.amount).toBe(100); // 1 raya * 100 back value
    
    // Total A won vs B: 200
    const totalWon = oyesSummaries.reduce((sum, s) => sum + s.amount, 0);
    expect(totalWon).toBe(200);
  });

  it('should NOT mix front carry with back carry', () => {
    const course = createTestCourse();
    const players = createTestPlayers().slice(0, 2);
    
    // Front Par 3s: H3 empty, H6 A wins
    // Back Par 3s: H12 empty, H15 A wins
    const scores = createDefaultScores(players, course, {
      'player-a': [
        { holeNumber: 3, strokes: 4, netScore: 4, oyesProximity: null }, // Front carry +1
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: 1 },    // A wins front (1+1=2)
        { holeNumber: 12, strokes: 4, netScore: 4, oyesProximity: null }, // Back carry +1
        { holeNumber: 15, strokes: 3, netScore: 3, oyesProximity: 1 },   // A wins back (1+1=2)
      ],
      'player-b': [
        { holeNumber: 3, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 6, strokes: 3, netScore: 3, oyesProximity: 2 },
        { holeNumber: 12, strokes: 4, netScore: 4, oyesProximity: null },
        { holeNumber: 15, strokes: 3, netScore: 3, oyesProximity: 2 },
      ],
    });
    
    const config = createRayasConfig(50, 100, 200, 'allVsAll');
    const summaries = calculateRayasBets(players, scores, config, course);
    
    const oyesSummaries = summaries.filter(s => s.betType === 'Rayas Oyes' && s.playerId === 'player-a');
    
    // Front: 2 rayas at 50 = 100
    const frontWins = oyesSummaries.filter(s => s.segment === 'front' && s.amount > 0);
    const frontTotal = frontWins.reduce((sum, s) => sum + s.amount, 0);
    expect(frontTotal).toBe(100); // 2 * 50
    
    // Back: 2 rayas at 100 = 200
    const backWins = oyesSummaries.filter(s => s.segment === 'back' && s.amount > 0);
    const backTotal = backWins.reduce((sum, s) => sum + s.amount, 0);
    expect(backTotal).toBe(200); // 2 * 100
  });
});
