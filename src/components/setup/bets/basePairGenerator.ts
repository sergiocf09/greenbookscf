/**
 * Base pair generator — 5-player pairs round robin.
 *
 * When 5 players participate in a pairs bet (Foursomes / Carritos), it is common
 * for 2 of them to stay together as the "base pair" and play 3 matches against
 * every combination of the remaining 3 players (A+B, A+C, B+C).
 */
import {
  CarritosTeamBet,
  TeamPressuresBet,
  TeamHandicapMode,
  MarkerState,
} from '@/types/golf';

/** Shared configuration applied to every generated match. */
export interface BasePairDefaults {
  /** Play modality (Modalidad Juego) */
  scoringType: 'lowBall' | 'highBall' | 'combined' | 'matchOnly' | 'all';
  /** Handicap modality (Modalidad HCP) */
  handicapMode: TeamHandicapMode;
  frontAmount: number;
  backAmount: number;
  totalAmount: number;
  /** Foursomes only */
  openingThreshold?: number;
  continua?: boolean;
  unitsEnabled?: boolean;
  unitsValue?: number;
  oyesesEnabled?: boolean;
  oyesesValue?: number;
  oyesesModality?: 'acumulados' | 'sangron';
}

const DEFAULT_MARKERS: (keyof MarkerState)[] = [
  'birdie',
  'eagle',
  'albatross',
  'sandyPar',
  'aquaPar',
  'holeOut',
];

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

/** Resolves per-match team handicaps for a handicap modality. */
export type TeamHandicapResolver = (
  mode: TeamHandicapMode,
  teamA: [string, string],
  teamB: [string, string]
) => { teamHandicaps: Record<string, number>; slidingHalfPointMode?: 'halfPoint' | 'roundDown' };

export const buildBasePairTeamPressures = (
  base: [string, string],
  others: string[],
  template?: TeamPressuresBet,
  defaults?: BasePairDefaults,
  resolveHandicaps?: TeamHandicapResolver
): TeamPressuresBet[] =>
  getPairCombinations(others).map((teamB, idx) => {
    const teamA = [...base] as [string, string];
    const hcp = defaults && resolveHandicaps
      ? resolveHandicaps(defaults.handicapMode, teamA, teamB)
      : undefined;
    const scoringType = (defaults?.scoringType ?? template?.scoringType ?? 'lowBall') as
      TeamPressuresBet['scoringType'];

    return {
      id: uid('team-pressure', idx),
      teamA,
      teamB,
      frontAmount: defaults?.frontAmount ?? template?.frontAmount ?? 100,
      backAmount: defaults?.backAmount ?? template?.backAmount ?? 100,
      totalAmount: defaults?.totalAmount ?? template?.totalAmount ?? 100,
      openingThreshold:
        defaults?.openingThreshold ?? template?.openingThreshold ?? 3,
      teamHandicaps: hcp?.teamHandicaps ?? { ...(template?.teamHandicaps ?? {}) },
      scoringType,
      enabled: true,
      continua:
        scoringType === 'matchOnly'
          ? defaults?.continua ?? template?.continua
          : template?.continua,
      handicapConfig: defaults
        ? {
            ...(template?.handicapConfig ?? {}),
            mode: defaults.handicapMode,
            ...(hcp?.slidingHalfPointMode
              ? { slidingHalfPointMode: hcp.slidingHalfPointMode }
              : {}),
          }
        : template?.handicapConfig
        ? { ...template.handicapConfig }
        : undefined,
      unitsConfig: defaults
        ? {
            ...(template?.unitsConfig ?? {}),
            enabled: !!defaults.unitsEnabled,
            valuePerUnit:
              defaults.unitsValue ?? template?.unitsConfig?.valuePerUnit ?? 25,
            enabledMarkers:
              template?.unitsConfig?.enabledMarkers ?? DEFAULT_MARKERS,
          }
        : template?.unitsConfig
        ? { ...template.unitsConfig }
        : undefined,
      oyesesConfig: defaults
        ? {
            ...(template?.oyesesConfig ?? {}),
            enabled: !!defaults.oyesesEnabled,
            valuePerOyes:
              defaults.oyesesValue ?? template?.oyesesConfig?.valuePerOyes ?? 25,
            modality:
              defaults.oyesesModality ??
              template?.oyesesConfig?.modality ??
              'acumulados',
          }
        : template?.oyesesConfig
        ? { ...template.oyesesConfig }
        : undefined,
      manchasConfig: template?.manchasConfig
        ? { ...template.manchasConfig }
        : undefined,
    } as TeamPressuresBet;

  });

export const buildBasePairCarritosTeams = (
  base: [string, string],
  others: string[],
  template?: Partial<CarritosTeamBet>,
  defaults?: BasePairDefaults,
  resolveHandicaps?: TeamHandicapResolver
): CarritosTeamBet[] =>
  getPairCombinations(others).map((teamB, idx) => {
    const teamA = [...base] as [string, string];
    const hcp = defaults && resolveHandicaps
      ? resolveHandicaps(defaults.handicapMode, teamA, teamB)
      : undefined;

    return {
      id: uid('carritos', idx),
      teamA,
      teamB,
      frontAmount: defaults?.frontAmount ?? template?.frontAmount ?? 100,
      backAmount: defaults?.backAmount ?? template?.backAmount ?? 100,
      totalAmount: defaults?.totalAmount ?? template?.totalAmount ?? 100,
      scoringType: (defaults?.scoringType ?? template?.scoringType ?? 'all') as
        CarritosTeamBet['scoringType'],
      teamHandicaps: hcp?.teamHandicaps ?? { ...(template?.teamHandicaps ?? {}) },
      handicapConfig: defaults
        ? {
            ...(template?.handicapConfig ?? {}),
            mode: defaults.handicapMode,
            ...(hcp?.slidingHalfPointMode
              ? { slidingHalfPointMode: hcp.slidingHalfPointMode }
              : {}),
          }
        : template?.handicapConfig
        ? { ...template.handicapConfig }
        : undefined,
      enabled: true,
    } as CarritosTeamBet;
  });

/**
 * Round-robin between fixed pairs (6 players → 3 pairs → 3 matches:
 * P1vP2, P1vP3, P2vP3).
 */
export const pairMatchups = (
  pairs: Array<[string, string]>
): Array<{ teamA: [string, string]; teamB: [string, string] }> => {
  const out: Array<{ teamA: [string, string]; teamB: [string, string] }> = [];
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      out.push({ teamA: [...pairs[i]] as [string, string], teamB: [...pairs[j]] as [string, string] });
    }
  }
  return out;
};

export const buildTeamPressuresFromPairs = (
  pairs: Array<[string, string]>,
  template?: TeamPressuresBet,
  defaults?: BasePairDefaults,
  resolveHandicaps?: TeamHandicapResolver
): TeamPressuresBet[] =>
  pairMatchups(pairs).map((m, idx) => ({
    ...buildBasePairTeamPressures(m.teamA, m.teamB, template, defaults, resolveHandicaps)[0],
    id: uid('team-pressure', idx),
  }));

export const buildCarritosFromPairs = (
  pairs: Array<[string, string]>,
  template?: Partial<CarritosTeamBet>,
  defaults?: BasePairDefaults,
  resolveHandicaps?: TeamHandicapResolver
): CarritosTeamBet[] =>
  pairMatchups(pairs).map((m, idx) => ({
    ...buildBasePairCarritosTeams(m.teamA, m.teamB, template, defaults, resolveHandicaps)[0],
    id: uid('carritos', idx),
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
