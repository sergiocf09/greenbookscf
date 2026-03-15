/**
 * Team Pressures Calculator — pressure bets between pairs (lowball/highball/combined)
 */
import { Player, PlayerScore, BetConfig, GolfCourse, MarkerState } from '@/types/golf';
import { calculateStrokesPerHole, getSegmentHoleRanges } from '../handicapUtils';
import { detectScoreBasedMarkers, mergeMarkers } from '../scoreDetection';
import { devLog } from '../logger';
import { BetSummary } from './shared';

export const calculateTeamPressuresBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
  startingHole: 1 | 10 = 1
): BetSummary[] => {
  if (!config.teamPressures?.bets?.length) return [];

  const summaries: BetSummary[] = [];
  const ranges = getSegmentHoleRanges(startingHole);
  const frontHoles = Array.from({ length: 9 }, (_, i) => ranges.front[0] + i);
  const backHoles = Array.from({ length: 9 }, (_, i) => ranges.back[0] + i);

  const resolvePlayerId = (pid: string): string => {
    if (scores.has(pid)) return pid;
    const match = players.find(p => p.profileId === pid);
    return match?.id ?? pid;
  };

  const disabledTeamIds = new Set(config.disabledTeamBetIds || []);

  config.teamPressures.bets.forEach(bet => {
    if (!bet.enabled) return;
    if (disabledTeamIds.has(bet.id)) return;

    const teamA: [string, string] = [resolvePlayerId(bet.teamA[0]), resolvePlayerId(bet.teamA[1])];
    const teamB: [string, string] = [resolvePlayerId(bet.teamB[0]), resolvePlayerId(bet.teamB[1])];
    const { scoringType, teamHandicaps } = bet;

    const openingThreshold = (scoringType === 'lowBall' || scoringType === 'highBall') ? 2 : 3;

    const getHandicap = (playerId: string): number => {
      if (teamHandicaps) {
        const direct = teamHandicaps[playerId];
        if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
        const byProfile = players.find(p => p.id === playerId)?.profileId;
        if (byProfile) { const h = teamHandicaps[byProfile]; if (typeof h === 'number' && Number.isFinite(h)) return h; }
      }
      return players.find(p => p.id === playerId)?.handicap ?? 0;
    };

    const strokesMap = new Map<string, number[]>();
    [...teamA, ...teamB].forEach(pid => { strokesMap.set(pid, calculateStrokesPerHole(getHandicap(pid), course)); });

    const getNet = (playerId: string, holeNum: number): number | null => {
      const score = scores.get(playerId)?.find(s => s.holeNumber === holeNum && s.confirmed);
      if (!score || typeof score.strokes !== 'number') return null;
      const strokes = strokesMap.get(playerId)?.[holeNum - 1] || 0;
      return score.strokes - strokes;
    };

    const getHoleResult = (holeNum: number): number | null => {
      const netA1 = getNet(teamA[0], holeNum), netA2 = getNet(teamA[1], holeNum);
      const netB1 = getNet(teamB[0], holeNum), netB2 = getNet(teamB[1], holeNum);
      if (netA1 === null || netA2 === null || netB1 === null || netB2 === null) return null;
      let teamAPoints = 0, teamBPoints = 0;
      if (scoringType === 'lowBall' || scoringType === 'combined') {
        const lowA = Math.min(netA1, netA2), lowB = Math.min(netB1, netB2);
        if (lowA < lowB) teamAPoints++; else if (lowB < lowA) teamBPoints++;
      }
      if (scoringType === 'highBall' || scoringType === 'combined') {
        const highA = Math.max(netA1, netA2), highB = Math.max(netB1, netB2);
        if (highA < highB) teamAPoints++; else if (highB < highA) teamBPoints++;
      }
      return teamAPoints - teamBPoints;
    };

    const processNine = (holes: number[]): number[] => {
      const bets: number[] = [0];
      holes.forEach((holeNum, holeIndex) => {
        const result = getHoleResult(holeNum);
        if (result === null) return;
        for (let i = 0; i < bets.length; i++) bets[i] += result;
        const isLastHole = holeIndex === holes.length - 1;
        if (!isLastHole) {
          const lastBet = bets[bets.length - 1];
          if (Math.abs(lastBet) >= openingThreshold) bets.push(0);
        }
      });
      return bets;
    };

    const frontBets = processNine(frontHoles);
    const backBets = processNine(backHoles);

    const frontIsTied = frontBets[0] === 0;
    const frontNetBets = frontBets.filter(b => b > 0).length - frontBets.filter(b => b < 0).length;
    const backNetBets = backBets.filter(b => b > 0).length - backBets.filter(b => b < 0).length;

    const effectiveBackValue = frontIsTied ? (2 * bet.frontAmount + bet.totalAmount) : bet.backAmount;
    const frontMoney = frontNetBets * bet.frontAmount;
    const backMoney = backNetBets * effectiveBackValue;
    const matchTotal = frontBets[0] + backBets[0];
    const matchMoney = frontIsTied ? 0 : (matchTotal > 0 ? 1 : matchTotal < 0 ? -1 : 0) * bet.totalAmount;

    let pressureMoney = frontMoney + backMoney + matchMoney;

    // Team Units sub-modality
    let unitsMoney = 0;
    if (bet.unitsConfig?.enabled && bet.unitsConfig.enabledMarkers?.length > 0) {
      const enabledMarkersSet = new Set(bet.unitsConfig.enabledMarkers);
      const countUnitsForTeam = (teamIds: string[]): number => {
        let total = 0;
        teamIds.forEach(pid => {
          const playerScores = scores.get(pid) || [];
          playerScores.forEach(s => {
            if (!s.confirmed || !s.strokes || s.strokes <= 0) return;
            const holePar = course.holes.find(h => h.number === s.holeNumber)?.par ?? 4;
            const autoDetected = detectScoreBasedMarkers(s.strokes, s.putts, holePar);
            const merged = { ...s.markers, ...autoDetected };
            enabledMarkersSet.forEach(marker => { if (merged[marker as keyof MarkerState]) total++; });
          });
        });
        return total;
      };
      const unitsA = countUnitsForTeam(teamA);
      const unitsB = countUnitsForTeam(teamB);
      unitsMoney = (unitsA - unitsB) * bet.unitsConfig.valuePerUnit;
      devLog(`[TeamPressures:Units] bet=${bet.id} unitsA=${unitsA} unitsB=${unitsB} money=${unitsMoney}`);
    }

    // Team Oyeses sub-modality
    let oyesesMoney = 0;
    if (bet.oyesesConfig?.enabled) {
      const par3Holes = course.holes.filter(h => h.par === 3).map(h => h.number);
      const modality = bet.oyesesConfig.modality || 'acumulados';
      const valuePerOyes = bet.oyesesConfig.valuePerOyes || 25;
      let oyesWinsA = 0, oyesWinsB = 0, accumulated = 0;

      par3Holes.forEach(holeNum => {
        const proximityField = modality === 'sangron' ? 'oyesProximitySangron' : 'oyesProximity';
        const fallbackField = 'oyesProximity';
        type ProxEntry = { playerId: string; proximity: number };
        const entries: ProxEntry[] = [];
        [...teamA, ...teamB].forEach(pid => {
          const score = scores.get(pid)?.find(s => s.holeNumber === holeNum && s.confirmed);
          if (!score) return;
          let prox = (score as any)[proximityField] ?? null;
          if (prox === null && modality === 'sangron') prox = (score as any)[fallbackField] ?? null;
          if (typeof prox === 'number' && prox > 0) entries.push({ playerId: pid, proximity: prox });
        });
        if (entries.length === 0) { if (modality === 'acumulados') accumulated++; return; }
        entries.sort((a, b) => a.proximity - b.proximity);
        const isTeamA = teamA.includes(entries[0].playerId);
        if (modality === 'sangron') { if (isTeamA) oyesWinsA++; else oyesWinsB++; }
        else { const totalWorth = 1 + accumulated; if (isTeamA) oyesWinsA += totalWorth; else oyesWinsB += totalWorth; accumulated = 0; }
      });
      oyesesMoney = (oyesWinsA - oyesWinsB) * valuePerOyes;
      devLog(`[TeamPressures:Oyeses] bet=${bet.id} winsA=${oyesWinsA} winsB=${oyesWinsB} money=${oyesesMoney}`);
    }

    const totalMoney = pressureMoney + unitsMoney + oyesesMoney;
    devLog(`[TeamPressures] bet=${bet.id} presiones=${pressureMoney} units=${unitsMoney} oyes=${oyesesMoney} totalMoney=${totalMoney}`);

    if (totalMoney !== 0) {
      const perPairAmount = totalMoney / 2;
      const descParts = [`Presiones: ${pressureMoney >= 0 ? '+' : '-'}$${Math.abs(pressureMoney)}`];
      if (unitsMoney !== 0) descParts.push(`Unidades: ${unitsMoney >= 0 ? '+' : '-'}$${Math.abs(unitsMoney)}`);
      if (oyesesMoney !== 0) descParts.push(`Oyeses: ${oyesesMoney >= 0 ? '+' : '-'}$${Math.abs(oyesesMoney)}`);
      const descA = descParts.join(' | ');
      const descB = descParts.map(p => p.replace(/[+-]\$/g, (m) => m === '+$' ? '-$' : '+$')).join(' | ');

      teamA.forEach(aId => {
        teamB.forEach(bId => {
          summaries.push({ playerId: aId, vsPlayer: bId, betType: 'Presiones Parejas', amount: perPairAmount, segment: 'total', description: descA, betId: bet.id });
          summaries.push({ playerId: bId, vsPlayer: aId, betType: 'Presiones Parejas', amount: -perPairAmount, segment: 'total', description: descB, betId: bet.id });
        });
      });
    }
  });

  return summaries;
};
