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

const createRayasConfig = (frontValue = 100, backValue = 100, medalTotalValue = 200): BetConfig => ({
  ...defaultBetConfig,
  rayas: {
    enabled: true,
    frontValue,
    backValue,
    medalTotalValue,
    skinVariant: 'acumulados',
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

  it('should accumulate Oyes when nobody hits the green', () => {
    const course = createTestCourse();
    const players = createTestPlayers();
    
    // Hole 3 (Par 3): Nobody on green - accumulate
    // Hole 6 (Par 3): Player A closest - wins 2 rayas (1 current + 1 accumulated)
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
    
    const config = createRayasConfig(100, 100, 200);
    const summaries = calculateRayasBets(players, scores, config, course);
    
    const oyesSummaries = summaries.filter(s => s.betType === 'Rayas Oyes');
    
    // Player A should win 2 rayas (1 + 1 accumulated) against each of B, C, D
    const playerAWins = oyesSummaries.filter(s => s.playerId === 'player-a' && s.amount > 0);
    expect(playerAWins.length).toBe(3);
    
    // Each win should be 2 rayas * 100 = 200
    playerAWins.forEach(win => {
      expect(win.amount).toBe(200);
      expect(win.description).toContain('(2 acum)');
    });
  });

  it('should pay Front accumulated Oyes at Front value even when resolved in Back', () => {
    const course = createTestCourse();
    const players = createTestPlayers();
    
    // Both Front Par 3s (hole 3 and 6): Nobody on green - accumulate 2 front oyes
    // Back Par 3 (hole 12): Player A closest - wins current + 2 carried from front
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
    
    // Different values for Front and Back to verify correct application
    const config = createRayasConfig(100, 150, 200);
    const summaries = calculateRayasBets(players, scores, config, course);
    
    const oyesSummaries = summaries.filter(s => s.betType === 'Rayas Oyes');
    
    // Player A wins against each rival
    const playerAWins = oyesSummaries.filter(s => s.playerId === 'player-a' && s.amount > 0);
    
    // Should have wins in both segments (front for carried, back for current)
    const frontWins = playerAWins.filter(w => w.segment === 'front');
    const backWins = playerAWins.filter(w => w.segment === 'back');
    
    // Front wins: 2 accumulated * 100 = 200 per rival = 3 entries
    expect(frontWins.length).toBe(3);
    frontWins.forEach(win => {
      expect(win.amount).toBe(200); // 2 accumulated * 100 front value
    });
    
    // Back wins: 1 current * 150 = 150 per rival = 3 entries
    expect(backWins.length).toBe(3);
    backWins.forEach(win => {
      expect(win.amount).toBe(150); // 1 * 150 back value
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
