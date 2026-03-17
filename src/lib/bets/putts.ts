/**
 * Putts Bet Calculator — direct comparison of putts per segment
 */
import { Player, PlayerScore, BetConfig } from '@/types/golf';
import { getSegmentHoleRanges } from '../handicapUtils';
import { resolveConfigForGroup } from '../groupBetOverrides';
import { BetSummary, groupPlayersByGroup, resolveParticipantsWithOneVsAll, shouldCalculatePair } from './shared';

export const calculatePuttsBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!config.putts?.enabled) return [];
  
  const playersByGroup = groupPlayersByGroup(players);
  const participatingPlayers = playersByGroup.flatMap(groupPlayers => {
    const groupId = groupPlayers[0]?.groupId;
    const resolved = resolveConfigForGroup(config, groupId);
    const puttParticipantIds = resolved.putts?.participantIds;
    return resolveParticipantsWithOneVsAll(config.putts, players, puttParticipantIds, groupPlayers);
  });
  
  const summaries: BetSummary[] = [];
  const ranges = getSegmentHoleRanges(startingHole);
  
  const segments: Array<{ key: 'front' | 'back' | 'total'; holes: [number, number]; amount: number; label: string }> = [
    { key: 'front', holes: ranges.front, amount: config.putts.frontAmount || 0, label: 'Putts Front 9' },
    { key: 'back', holes: ranges.back, amount: config.putts.backAmount || 0, label: 'Putts Back 9' },
  ];

  const getPairOverrideAmount = (playerAId: string, playerBId: string, label: string): number | undefined => {
    const overrides = config.betOverrides;
    if (!overrides || overrides.length === 0) return undefined;
    const match = overrides.find((o) => {
      const matchesPair = (o.playerAId === playerAId && o.playerBId === playerBId) ||
                          (o.playerAId === playerBId && o.playerBId === playerAId);
      if (!matchesPair || o.enabled === false) return false;
      return o.betType?.toLowerCase() === label.toLowerCase();
    });
    return typeof match?.amountOverride === 'number' && Number.isFinite(match.amountOverride)
      ? match.amountOverride
      : undefined;
  };
  
  for (let i = 0; i < participatingPlayers.length; i++) {
    for (let j = i + 1; j < participatingPlayers.length; j++) {
      const playerA = participatingPlayers[i];
      const playerB = participatingPlayers[j];
      if (playerA.groupId && playerB.groupId && playerA.groupId !== playerB.groupId) continue;
      if (!shouldCalculatePair(config.putts, playerA.id, playerB.id)) continue;
      
      segments.forEach(({ key, holes, amount, label }) => {
        const effectiveAmount = getPairOverrideAmount(playerA.id, playerB.id, label) ?? amount;
        if (effectiveAmount <= 0) return;
        const [start, end] = holes;
        
        const scoresA = (scores.get(playerA.id) || []).filter(s => s.confirmed && s.holeNumber >= start && s.holeNumber <= end && typeof s.putts === 'number');
        const scoresB = (scores.get(playerB.id) || []).filter(s => s.confirmed && s.holeNumber >= start && s.holeNumber <= end && typeof s.putts === 'number');
        
        const aByHole = new Map(scoresA.map(s => [s.holeNumber, s]));
        const bByHole = new Map(scoresB.map(s => [s.holeNumber, s]));
        
        let puttsA = 0, puttsB = 0, commonHoles = 0;
        for (let h = start; h <= end; h++) {
          const a = aByHole.get(h);
          const b = bByHole.get(h);
          if (a && b) { puttsA += a.putts || 0; puttsB += b.putts || 0; commonHoles++; }
        }
        
        if (commonHoles === 0) return;
        
        if (puttsA < puttsB) {
          summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: label, amount: effectiveAmount, segment: key, description: `${puttsA} vs ${puttsB} putts` });
          summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: label, amount: -effectiveAmount, segment: key, description: `${puttsB} vs ${puttsA} putts` });
        } else if (puttsB < puttsA) {
          summaries.push({ playerId: playerB.id, vsPlayer: playerA.id, betType: label, amount: effectiveAmount, segment: key, description: `${puttsB} vs ${puttsA} putts` });
          summaries.push({ playerId: playerA.id, vsPlayer: playerB.id, betType: label, amount: -effectiveAmount, segment: key, description: `${puttsA} vs ${puttsB} putts` });
        }
      });
    }
  }
  
  return summaries;
};
