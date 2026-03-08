/**
 * Shared utilities for the bet calculations engine.
 * All bet modules import from here to avoid circular dependencies.
 */

import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap } from '@/types/golf';
import { resolveConfigForGroup } from '../groupBetOverrides';
import { calculateStrokesPerHole, getSegmentHoleRanges } from '../handicapUtils';

// ── BetSummary interface ──

export interface BetSummary {
  playerId: string;
  vsPlayer: string;
  betType: string;
  amount: number; // positive = winning, negative = losing
  segment: 'front' | 'back' | 'total' | 'hole';
  holeNumber?: number;
  description?: string;
  units?: number;
  baseUnitAmount?: number;
  multiplier?: number;
  betId?: string;
}

// ── Player grouping ──

export const groupPlayersByGroup = (players: Player[]): Player[][] => {
  const hasAnyGroup = players.some(p => p.groupId);
  if (!hasAnyGroup) return [players];
  
  const groups = new Map<string, Player[]>();
  players.forEach(p => {
    const gid = p.groupId || '__ungrouped__';
    if (!groups.has(gid)) groups.set(gid, []);
    groups.get(gid)!.push(p);
  });
  return Array.from(groups.values());
};

// ── Participant resolution ──

export const resolveParticipantsForGroup = (
  allPlayers: Player[],
  participantIds: string[] | undefined,
  groupPlayers: Player[]
): Player[] => {
  if (participantIds === undefined) return groupPlayers;
  if (participantIds.length === 0) return [];
  
  const groupPlayersInList = groupPlayers.filter(p => participantIds.includes(p.id));
  
  if (groupPlayersInList.length === 0) {
    const allPlayerIds = new Set(allPlayers.map(p => p.id));
    const referencesOtherGroupPlayers = participantIds.some(id => {
      if (!allPlayerIds.has(id)) return false;
      const player = allPlayers.find(p => p.id === id);
      if (!player || !player.groupId) return false;
      const thisGroupId = groupPlayers[0]?.groupId;
      return thisGroupId && player.groupId !== thisGroupId;
    });
    
    if (referencesOtherGroupPlayers) return groupPlayers;
    return [];
  }
  
  return groupPlayersInList;
};

export const shouldCalculatePair = (
  betConfig: { oneVsAll?: boolean; anchorPlayerId?: string },
  playerAId: string,
  playerBId: string
): boolean => {
  if (!betConfig.oneVsAll || !betConfig.anchorPlayerId) return true;
  return playerAId === betConfig.anchorPlayerId || playerBId === betConfig.anchorPlayerId;
};

export const resolveParticipantsWithOneVsAll = (
  betConfig: { oneVsAll?: boolean; anchorPlayerId?: string; participantIds?: string[] },
  allPlayers: Player[],
  resolvedParticipantIds: string[] | undefined,
  groupPlayers: Player[]
): Player[] => {
  const baseParticipants = resolveParticipantsForGroup(allPlayers, resolvedParticipantIds, groupPlayers);
  
  if (betConfig.oneVsAll && betConfig.anchorPlayerId) {
    const anchorInGroup = groupPlayers.some(p => p.id === betConfig.anchorPlayerId);
    const anchorInParticipants = baseParticipants.some(p => p.id === betConfig.anchorPlayerId);
    if (anchorInGroup || anchorInParticipants) return groupPlayers;
    return [];
  }
  return baseParticipants;
};

// ── Bilateral handicap resolution ──

export const getBilateralHandicapForPair = (
  playerAId: string,
  playerBId: string,
  bilateralHandicaps?: BilateralHandicap[],
  playerAProfileId?: string,
  playerBProfileId?: string
): BilateralHandicap | undefined => {
  if (!bilateralHandicaps) return undefined;
  
  const matches = (overrideId: string, id: string, profileId?: string): boolean => {
    return overrideId === id || (profileId !== undefined && overrideId === profileId);
  };
  
  return bilateralHandicaps.find(
    h => (matches(h.playerAId, playerAId, playerAProfileId) && matches(h.playerBId, playerBId, playerBProfileId)) ||
         (matches(h.playerAId, playerBId, playerBProfileId) && matches(h.playerBId, playerAId, playerAProfileId))
  );
};

// ── Adjusted scores for bilateral comparison ──

export const getAdjustedScoresForPair = (
  playerA: Player,
  playerB: Player,
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[]
): Map<string, PlayerScore[]> => {
  const override = getBilateralHandicapForPair(
    playerA.id, playerB.id, bilateralHandicaps, playerA.profileId, playerB.profileId
  );
  
  let handicapA = 0;
  let handicapB = 0;
  
  if (override) {
    const matchesPlayerA = (id: string) => 
      id === playerA.id || (playerA.profileId && id === playerA.profileId);
    const isPlayerAFirst = matchesPlayerA(override.playerAId);
    handicapA = isPlayerAFirst ? override.playerAHandicap : override.playerBHandicap;
    handicapB = isPlayerAFirst ? override.playerBHandicap : override.playerAHandicap;
  }
  
  const strokesPerHoleA = calculateStrokesPerHole(handicapA, course);
  const strokesPerHoleB = calculateStrokesPerHole(handicapB, course);
  
  const adjustedScores = new Map<string, PlayerScore[]>();
  
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

// ── Segment helpers ──

export const getSegmentHoleRange = (segment: 'front' | 'back' | 'total', startingHole: 1 | 10 = 1): [number, number] => {
  if (segment === 'total') return [1, 18];
  const ranges = getSegmentHoleRanges(startingHole);
  return segment === 'front' ? ranges.front : ranges.back;
};

export const getSegmentNetTotal = (
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

export const getMutualSegmentNetTotals = (
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
    const aNet = Number.isFinite(a.netScore) ? a.netScore : Number.isFinite(a.strokes) ? a.strokes : 0;
    const bNet = Number.isFinite(b.netScore) ? b.netScore : Number.isFinite(b.strokes) ? b.strokes : 0;
    netA += aNet;
    netB += bNet;
  }

  return { netA, netB };
};

export const getHoleScore = (
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
