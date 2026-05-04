/**
 * Bloques Bet Calculator
 * Bilateral medal por bloques de N hoyos (2, 3 o 6).
 */
import { Player, PlayerScore, BetConfig, GolfCourse, BilateralHandicap } from '@/types/golf';
import { getSegmentHoleRanges } from '../handicapUtils';
import {
  BetSummary, groupPlayersByGroup,
  resolveParticipantsWithOneVsAll, shouldCalculatePair,
  getAdjustedScoresForPair, getHoleScore,
} from './shared';
import { resolveConfigForGroup, isBetEnabledAnywhere } from '../groupBetOverrides';

export interface BloqueResult {
  blockNumber: number;
  startHole: number;
  endHole: number;
  playerNetSum: number;
  rivalNetSum: number;
  diff: number;
  amountAtStake: number;
  winnerId: string | null;
  isCarry: boolean;
  resolved: boolean;
}

export const calculateBloquesForPair = (
  playerA: Player,
  playerB: Player,
  scores: Map<string, PlayerScore[]>,
  course: GolfCourse,
  config: BetConfig,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1,
  holesPerBlock: 2 | 3 | 6 = 3,
  amountPerBlock: number = 100,
  carryOverOnTie: boolean = true
): BloqueResult[] => {
  const adjustedScores = getAdjustedScoresForPair(playerA, playerB, scores, course, bilateralHandicaps);

  const ranges = getSegmentHoleRanges(startingHole);
  const allHoles = [
    ...Array.from({ length: 9 }, (_, i) => ranges.front[0] + i),
    ...Array.from({ length: 9 }, (_, i) => ranges.back[0] + i),
  ];

  const blocks: BloqueResult[] = [];
  const totalBlocks = 18 / holesPerBlock;
  let pendingCarry = 0;

  for (let b = 0; b < totalBlocks; b++) {
    const startIdx = b * holesPerBlock;
    const blockHoles = allHoles.slice(startIdx, startIdx + holesPerBlock);
    const startHole = blockHoles[0];
    const endHole = blockHoles[blockHoles.length - 1];

    let playerNetSum = 0;
    let rivalNetSum = 0;
    let allPlayed = true;

    for (const h of blockHoles) {
      const sA = getHoleScore(playerA.id, h, adjustedScores);
      const sB = getHoleScore(playerB.id, h, adjustedScores);
      if (sA === null || sB === null) { allPlayed = false; break; }
      playerNetSum += sA;
      rivalNetSum += sB;
    }

    const amountAtStake = amountPerBlock + pendingCarry;

    if (!allPlayed) {
      blocks.push({
        blockNumber: b + 1, startHole, endHole,
        playerNetSum: 0, rivalNetSum: 0, diff: 0,
        amountAtStake, winnerId: null,
        isCarry: pendingCarry > 0, resolved: false,
      });
      continue;
    }

    const diff = playerNetSum - rivalNetSum;
    let winnerId: string | null = null;
    if (diff < 0) winnerId = playerA.id;
    else if (diff > 0) winnerId = playerB.id;

    blocks.push({
      blockNumber: b + 1, startHole, endHole,
      playerNetSum, rivalNetSum, diff,
      amountAtStake, winnerId,
      isCarry: pendingCarry > 0, resolved: true,
    });

    if (winnerId === null && carryOverOnTie) {
      pendingCarry = amountAtStake;
    } else {
      pendingCarry = 0;
    }
  }

  return blocks;
};

export const calculateBloquesBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  bilateralHandicaps?: BilateralHandicap[],
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!config.bloques?.enabled) return [];
  if (!isBetEnabledAnywhere(config, 'bloques' as any)) return [];

  const playersByGroup = groupPlayersByGroup(players);
  const participatingPlayers = playersByGroup.flatMap(groupPlayers => {
    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    return resolveParticipantsWithOneVsAll(
      resolved.bloques ?? config.bloques,
      players,
      config.bloques?.participantIds,
      groupPlayers
    );
  });

  const summaries: BetSummary[] = [];

  for (let i = 0; i < participatingPlayers.length; i++) {
    for (let j = i + 1; j < participatingPlayers.length; j++) {
      const playerA = participatingPlayers[i];
      const playerB = participatingPlayers[j];

      if (playerA.groupId && playerB.groupId && playerA.groupId !== playerB.groupId) continue;
      if (!shouldCalculatePair(config.bloques, playerA.id, playerB.id)) continue;

      // Per-pair override: amount per block & enabled flag
      const matchesPair = (oA: string, oB: string) =>
        ((oA === playerA.id || oA === playerA.profileId) && (oB === playerB.id || oB === playerB.profileId)) ||
        ((oA === playerB.id || oA === playerB.profileId) && (oB === playerA.id || oB === playerA.profileId));
      const pairOverride = config.betOverrides?.find(o =>
        (o.betType === 'Modalidad' || o.betType === 'bloques') && matchesPair(o.playerAId, o.playerBId)
      );
      if (pairOverride?.enabled === false) continue;
      const amountPerBlock = pairOverride?.amountOverride ?? config.bloques.amountPerBlock;
      const carryOverOnTie = pairOverride?.carryOverOnTie ?? config.bloques.carryOverOnTie;

      const blocks = calculateBloquesForPair(
        playerA, playerB, scores, course, config,
        bilateralHandicaps, startingHole,
        config.bloques.holesPerBlock,
        amountPerBlock,
        carryOverOnTie
      );

      let amountA = 0;
      const wonByA: number[] = [];
      const wonByB: number[] = [];
      const tied: number[] = [];

      for (const blk of blocks) {
        if (!blk.resolved) continue;
        if (blk.winnerId === playerA.id) { amountA += blk.amountAtStake; wonByA.push(blk.blockNumber); }
        else if (blk.winnerId === playerB.id) { amountA -= blk.amountAtStake; wonByB.push(blk.blockNumber); }
        else { tied.push(blk.blockNumber); }
      }

      const partsA: string[] = [];
      if (wonByA.length > 0) partsA.push(`B${wonByA.join(',')}`);
      if (tied.length > 0) partsA.push(`Empate B${tied.join(',')}`);
      const descA = partsA.join(' · ') || '—';

      const partsB: string[] = [];
      if (wonByB.length > 0) partsB.push(`B${wonByB.join(',')}`);
      if (tied.length > 0) partsB.push(`Empate B${tied.join(',')}`);
      const descB = partsB.join(' · ') || '—';

      summaries.push({
        playerId: playerA.id, vsPlayer: playerB.id,
        betType: 'Modalidad', amount: amountA, segment: 'total',
        description: descA,
        baseUnitAmount: amountPerBlock, multiplier: 1,
      });
      summaries.push({
        playerId: playerB.id, vsPlayer: playerA.id,
        betType: 'Modalidad', amount: -amountA, segment: 'total',
        description: descB,
        baseUnitAmount: amountPerBlock, multiplier: 1,
      });
    }
  }

  return summaries;
};
