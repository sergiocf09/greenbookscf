/**
 * Carritos (Team Bets) Calculator — lowball/highball/combined/all with 50/50 settlement
 */
import { Player, PlayerScore, BetConfig, GolfCourse } from '@/types/golf';
import { calculateStrokesPerHole } from '../handicapUtils';
import { BetSummary } from './shared';

export const calculateCarritosBets = (
  players: Player[],
  scores: Map<string, PlayerScore[]>,
  config: BetConfig,
  course: GolfCourse,
): BetSummary[] => {
  const summaries: BetSummary[] = [];

  const configs: Array<{
    teamA: [string, string];
    teamB: [string, string];
    frontAmount: number;
    backAmount: number;
    totalAmount: number;
    scoringType: 'lowBall' | 'highBall' | 'combined' | 'all';
    teamHandicaps?: Record<string, number>;
    useTeamHandicaps?: boolean;
  }> = [];

  const disabledIds = new Set(config.disabledTeamBetIds || []);
  const hasCarritosTeams = (config.carritosTeams?.length ?? 0) > 0;

  if (!hasCarritosTeams) {
    const c = config.carritos;
    const hasTeams = c.teamA[0] && c.teamA[1] && c.teamB[0] && c.teamB[1];
    if (hasTeams) {
      configs.push({
        teamA: c.teamA, teamB: c.teamB,
        frontAmount: c.frontAmount, backAmount: c.backAmount, totalAmount: c.totalAmount,
        scoringType: c.scoringType, teamHandicaps: c.teamHandicaps, useTeamHandicaps: c.useTeamHandicaps,
      });
    }
  }

  config.carritosTeams?.forEach((team, idx) => {
    const teamId = team.id || `carritos-${idx}`;
    if (disabledIds.has(teamId)) return;
    const hasTeams = team.teamA[0] && team.teamA[1] && team.teamB[0] && team.teamB[1];
    if (hasTeams) {
      configs.push({
        teamA: team.teamA, teamB: team.teamB,
        frontAmount: team.frontAmount, backAmount: team.backAmount, totalAmount: team.totalAmount,
        scoringType: team.scoringType, teamHandicaps: team.teamHandicaps, useTeamHandicaps: true,
      });
    }
  });

  const resolvePlayerId = (pid: string): string => {
    if (scores.has(pid)) return pid;
    const match = players.find(p => p.profileId === pid);
    return match?.id ?? pid;
  };

  configs.forEach(cfg => {
    const teamA: [string, string] = [resolvePlayerId(cfg.teamA[0]), resolvePlayerId(cfg.teamA[1])];
    const teamB: [string, string] = [resolvePlayerId(cfg.teamB[0]), resolvePlayerId(cfg.teamB[1])];

    const getHandicap = (playerId: string): number => {
      const th = cfg.teamHandicaps;
      if (th) {
        const direct = th[playerId];
        if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
        const byProfile = players.find(p => p.id === playerId)?.profileId;
        if (byProfile) {
          const h = th[byProfile];
          if (typeof h === 'number' && Number.isFinite(h)) return h;
        }
      }
      return players.find(p => p.id === playerId)?.handicap ?? 0;
    };

    const strokesMap = new Map<string, number[]>();
    [...new Set([...teamA, ...teamB])].forEach(pid => {
      strokesMap.set(pid, calculateStrokesPerHole(getHandicap(pid), course));
    });

    const getNet = (playerId: string, holeNum: number): number | null => {
      const score = scores.get(playerId)?.find(s => s.holeNumber === holeNum && s.confirmed);
      if (!score || typeof score.strokes !== 'number') return null;
      const sr = strokesMap.get(playerId)?.[holeNum - 1] ?? 0;
      return score.strokes - sr;
    };

    const includeLowBall = cfg.scoringType === 'lowBall' || cfg.scoringType === 'all';
    const includeHighBall = cfg.scoringType === 'highBall' || cfg.scoringType === 'all';
    const includeCombined = cfg.scoringType === 'combined' || cfg.scoringType === 'all';

    const getHolePoints = (holeNum: number): { pA: number; pB: number } | null => {
      const a1 = getNet(teamA[0], holeNum), a2 = getNet(teamA[1], holeNum);
      const b1 = getNet(teamB[0], holeNum), b2 = getNet(teamB[1], holeNum);
      if (a1 === null || a2 === null || b1 === null || b2 === null) return null;
      let pA = 0, pB = 0;
      if (includeLowBall) { const lA = Math.min(a1, a2), lB = Math.min(b1, b2); if (lA < lB) pA++; else if (lB < lA) pB++; }
      if (includeHighBall) { const hA = Math.max(a1, a2), hB = Math.max(b1, b2); if (hA < hB) pA++; else if (hB < hA) pB++; }
      if (includeCombined) { const cA = a1 + a2, cB = b1 + b2; if (cA < cB) pA++; else if (cB < cA) pB++; }
      return { pA, pB };
    };

    const calcSegment = (holes: number[]): { pA: number; pB: number } => {
      let pA = 0, pB = 0;
      holes.forEach(h => { const r = getHolePoints(h); if (r) { pA += r.pA; pB += r.pB; } });
      return { pA, pB };
    };

    const frontHoles = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const backHoles = [10, 11, 12, 13, 14, 15, 16, 17, 18];
    const front = calcSegment(frontHoles);
    const back = calcSegment(backHoles);
    const totalPtsA = front.pA + back.pA;
    const totalPtsB = front.pB + back.pB;

    const segments: Array<{ label: string; segment: 'front' | 'back' | 'total'; moneyA: number }> = [];
    if (front.pA !== front.pB) segments.push({ label: 'Carritos Front', segment: 'front', moneyA: front.pA > front.pB ? cfg.frontAmount : -cfg.frontAmount });
    if (back.pA !== back.pB) segments.push({ label: 'Carritos Back', segment: 'back', moneyA: back.pA > back.pB ? cfg.backAmount : -cfg.backAmount });
    if (totalPtsA !== totalPtsB) segments.push({ label: 'Carritos Total', segment: 'total', moneyA: totalPtsA > totalPtsB ? cfg.totalAmount : -cfg.totalAmount });

    segments.forEach(({ label, segment, moneyA }) => {
      const perPairAmount = moneyA / 2;
      teamA.forEach(aId => {
        teamB.forEach(bId => {
          if (perPairAmount !== 0) {
            summaries.push({ playerId: aId, vsPlayer: bId, betType: label, amount: perPairAmount, segment });
            summaries.push({ playerId: bId, vsPlayer: aId, betType: label, amount: -perPairAmount, segment });
          }
        });
      });
    });
  });

  return summaries;
};
