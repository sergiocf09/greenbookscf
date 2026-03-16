/**
 * Skins Grupal Bet Calculator — group-level skins (acumulados / sinAcumular)
 * Each loser pays the winner per skin won. In acumulados mode, ties carry over.
 */
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { calculateStrokesPerHole } from '../handicapUtils';
import { BetSummary, groupPlayersByGroup, resolveParticipantsForGroup } from './shared';
import { resolveConfigForGroup } from '../groupBetOverrides';

export const calculateSkinsGrupalBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse
): BetSummary[] => {
  if (!config.skinsGrupal?.enabled || players.length < 2) return [];

  const cfg = config.skinsGrupal;
  const summaries: BetSummary[] = [];

  const playersByGroup = groupPlayersByGroup(players);

  playersByGroup.forEach(groupPlayers => {
    if (groupPlayers.length < 2) return;
    const groupId = groupPlayers[0]?.groupId;
    const resolvedConfig = resolveConfigForGroup(config, groupId);
    if (!resolvedConfig.skinsGrupal?.enabled) return;

    const resolvedCfg = resolvedConfig.skinsGrupal!;
    const participants = resolveParticipantsForGroup(
      players,
      resolvedCfg.participantIds,
      groupPlayers
    );
    if (participants.length < 2) return;

    // Build net scores per hole per player using skinsGrupal-specific handicaps
    const getNetScore = (playerId: string, holeNum: number): number | null => {
      const ph = resolvedCfg.playerHandicaps?.find(h => h.playerId === playerId);
      const hcp = ph?.handicap ?? players.find(p => p.id === playerId)?.handicap ?? 0;
      const strokesPerHole = calculateStrokesPerHole(hcp, course);
      const playerScores = scores.get(playerId) || [];
      const score = playerScores.find(s => s.confirmed && s.holeNumber === holeNum);
      if (!score || !score.strokes) return null;
      return score.strokes - (strokesPerHole[holeNum - 1] || 0);
    };

    const frontHoles = Array.from({ length: 9 }, (_, i) => i + 1);
    const backHoles = Array.from({ length: 9 }, (_, i) => i + 10);

    const processSegment = (
      holes: number[],
      amount: number,
      betType: string,
      segment: 'front' | 'back'
    ) => {
      if (amount <= 0) return;
      const modality = resolvedCfg.modality ?? 'acumulados';

      if (modality === 'sinAcumular') {
        // Count holes won per player (only sole winners)
        const wins = new Map<string, number>(participants.map(p => [p.id, 0]));
        holes.forEach(holeNum => {
          const nets = participants
            .map(p => ({ id: p.id, net: getNetScore(p.id, holeNum) }))
            .filter(x => x.net !== null) as { id: string; net: number }[];
          if (nets.length < 2) return;
          const minNet = Math.min(...nets.map(x => x.net));
          const winners = nets.filter(x => x.net === minNet);
          if (winners.length === 1) {
            wins.set(winners[0].id, (wins.get(winners[0].id) || 0) + 1);
          }
        });

        // Each player pays each other based on net skins difference
        const pIds = participants.map(p => p.id);
        for (let i = 0; i < pIds.length; i++) {
          for (let j = i + 1; j < pIds.length; j++) {
            const wA = wins.get(pIds[i]) || 0;
            const wB = wins.get(pIds[j]) || 0;
            const diff = wA - wB;
            if (diff === 0) continue;
            const pay = Math.abs(diff) * amount;
            const winnerId = diff > 0 ? pIds[i] : pIds[j];
            const loserId = diff > 0 ? pIds[j] : pIds[i];
            summaries.push({ playerId: winnerId, vsPlayer: loserId, betType, amount: pay, segment, description: `${Math.abs(diff)} skins grupales` });
            summaries.push({ playerId: loserId, vsPlayer: winnerId, betType, amount: -pay, segment, description: `${Math.abs(diff)} skins grupales` });
          }
        }
      } else {
        // Acumulados: carry-over when tied
        let accumulated = 0;
        const skinWins: { holeNum: number; winnerId: string; value: number }[] = [];
        holes.forEach(holeNum => {
          const nets = participants
            .map(p => ({ id: p.id, net: getNetScore(p.id, holeNum) }))
            .filter(x => x.net !== null) as { id: string; net: number }[];
          accumulated += amount;
          if (nets.length < 2) return;
          const minNet = Math.min(...nets.map(x => x.net));
          const winners = nets.filter(x => x.net === minNet);
          if (winners.length === 1) {
            skinWins.push({ holeNum, winnerId: winners[0].id, value: accumulated });
            accumulated = 0;
          }
        });

        // Each skin win: winner collects from every other participant
        skinWins.forEach(skin => {
          const losers = participants.filter(p => p.id !== skin.winnerId);
          losers.forEach(loser => {
            summaries.push({ playerId: skin.winnerId, vsPlayer: loser.id, betType, amount: skin.value, segment, description: `Skin hoyo ${skin.holeNum}` });
            summaries.push({ playerId: loser.id, vsPlayer: skin.winnerId, betType, amount: -skin.value, segment, description: `Skin hoyo ${skin.holeNum}` });
          });
        });
      }
    };

    processSegment(frontHoles, resolvedCfg.frontAmount, 'Skins Grupal Front', 'front');
    processSegment(backHoles, resolvedCfg.backAmount, 'Skins Grupal Back', 'back');
  });

  return summaries;
};
