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

/* ─── Pairing combinations (moved from ParejasBets to be shared) ─── */

export interface PairCombo {
  teamA: [string, string];
  teamB: [string, string];
  teamC?: [string, string];
}

/** Full ordered list of pairing combinations: 3 for 4 players, 15 for 6 players. */
export function getPairCombos(playerIds: string[]): PairCombo[] {
  if (playerIds.length === 4) {
    const [A, B, C, D] = playerIds;
    return [
      { teamA: [A, B], teamB: [C, D] },
      { teamA: [A, C], teamB: [B, D] },
      { teamA: [A, D], teamB: [B, C] },
    ];
  }

  if (playerIds.length === 6) {
    const [p1, p2, p3, p4, p5, p6] = playerIds;
    return [
      { teamA: [p1, p2], teamB: [p3, p4], teamC: [p5, p6] },
      { teamA: [p1, p2], teamB: [p3, p5], teamC: [p4, p6] },
      { teamA: [p1, p2], teamB: [p3, p6], teamC: [p4, p5] },
      { teamA: [p1, p3], teamB: [p2, p4], teamC: [p5, p6] },
      { teamA: [p1, p3], teamB: [p2, p5], teamC: [p4, p6] },
      { teamA: [p1, p3], teamB: [p2, p6], teamC: [p4, p5] },
      { teamA: [p1, p4], teamB: [p2, p3], teamC: [p5, p6] },
      { teamA: [p1, p4], teamB: [p2, p5], teamC: [p3, p6] },
      { teamA: [p1, p4], teamB: [p2, p6], teamC: [p3, p5] },
      { teamA: [p1, p5], teamB: [p2, p3], teamC: [p4, p6] },
      { teamA: [p1, p5], teamB: [p2, p4], teamC: [p3, p6] },
      { teamA: [p1, p5], teamB: [p2, p6], teamC: [p3, p4] },
      { teamA: [p1, p6], teamB: [p2, p3], teamC: [p4, p5] },
      { teamA: [p1, p6], teamB: [p2, p4], teamC: [p3, p5] },
      { teamA: [p1, p6], teamB: [p2, p5], teamC: [p3, p4] },
    ];
  }

  return [];
}

const normalizePair = (a?: string, b?: string) => [a ?? '', b ?? ''].sort().join('_');

/** Index of the combo that matches the current teams, or -1 when the state matches none. */
export function findPairComboIndex(
  combos: PairCombo[],
  currentTeamA: [string, string],
  currentTeamB: [string, string],
  currentTeamC?: [string, string]
): number {
  const currentPairs = [
    normalizePair(currentTeamA?.[0], currentTeamA?.[1]),
    normalizePair(currentTeamB?.[0], currentTeamB?.[1]),
  ];
  const expectThree = combos.some((c) => !!c.teamC);
  if (expectThree) currentPairs.push(normalizePair(currentTeamC?.[0], currentTeamC?.[1]));

  const currentSet = new Set(currentPairs);
  if (currentSet.size !== currentPairs.length) return -1;

  return combos.findIndex((c) => {
    const comboPairs = [
      normalizePair(c.teamA[0], c.teamA[1]),
      normalizePair(c.teamB[0], c.teamB[1]),
    ];
    if (c.teamC) comboPairs.push(normalizePair(c.teamC[0], c.teamC[1]));
    return comboPairs.length === currentPairs.length && comboPairs.every((p) => currentSet.has(p));
  });
}
