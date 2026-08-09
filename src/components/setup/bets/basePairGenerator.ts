/**
 * Base pair generator — 5-player pairs round robin.
 *
 * When 5 players participate in a pairs bet (Foursomes / Carritos), it is common
 * for 2 of them to stay together as the "base pair" and play 3 matches against
 * every combination of the remaining 3 players (A+B, A+C, B+C).
 */
import { CarritosTeamBet, TeamPressuresBet } from '@/types/golf';

/** All 2-player combinations from a list of ids (order-independent). */
export const getPairCombinations = (ids: string[]): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      out.push([ids[i], ids[j]]);
    }
  }
  return out;
};

/** Stable key for a match (set of 4 players, team order irrelevant). */
export const matchKey = (
  teamA: [string, string],
  teamB: [string, string]
): string => {
  const a = [...teamA].sort().join('|');
  const b = [...teamB].sort().join('|');
  return [a, b].sort().join('#');
};

const uid = (prefix: string, idx: number) =>
  `${prefix}-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;

export const buildBasePairTeamPressures = (
  base: [string, string],
  others: string[],
  template?: TeamPressuresBet
): TeamPressuresBet[] =>
  getPairCombinations(others).map((teamB, idx) => ({
    id: uid('team-pressure', idx),
    teamA: [...base] as [string, string],
    teamB,
    frontAmount: template?.frontAmount ?? 100,
    backAmount: template?.backAmount ?? 100,
    totalAmount: template?.totalAmount ?? 100,
    openingThreshold: template?.openingThreshold ?? 3,
    teamHandicaps: { ...(template?.teamHandicaps ?? {}) },
    scoringType: template?.scoringType ?? 'lowBall',
    enabled: true,
    continua: template?.continua,
    handicapConfig: template?.handicapConfig
      ? { ...template.handicapConfig }
      : undefined,
    unitsConfig: template?.unitsConfig ? { ...template.unitsConfig } : undefined,
    oyesesConfig: template?.oyesesConfig ? { ...template.oyesesConfig } : undefined,
  }));

export const buildBasePairCarritosTeams = (
  base: [string, string],
  others: string[],
  template?: Partial<CarritosTeamBet>
): CarritosTeamBet[] =>
  getPairCombinations(others).map((teamB, idx) => ({
    id: uid('carritos', idx),
    teamA: [...base] as [string, string],
    teamB,
    frontAmount: template?.frontAmount ?? 100,
    backAmount: template?.backAmount ?? 100,
    totalAmount: template?.totalAmount ?? 100,
    scoringType: template?.scoringType ?? 'all',
    teamHandicaps: { ...(template?.teamHandicaps ?? {}) },
    handicapConfig: template?.handicapConfig
      ? { ...template.handicapConfig }
      : undefined,
    enabled: true,
  }));

/** Filters generated matches, dropping any whose 4-player set already exists. */
export const dropExistingMatches = <
  T extends { teamA: [string, string]; teamB: [string, string] }
>(
  generated: T[],
  existing: Array<{ teamA: [string, string]; teamB: [string, string] }>
): T[] => {
  const existingKeys = new Set(
    existing
      .filter((e) => e.teamA?.[0] && e.teamA?.[1] && e.teamB?.[0] && e.teamB?.[1])
      .map((e) => matchKey(e.teamA, e.teamB))
  );
  return generated.filter((g) => !existingKeys.has(matchKey(g.teamA, g.teamB)));
};
