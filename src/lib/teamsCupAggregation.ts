import type { CupMatch, CupMatchResult } from '@/hooks/useTeamsCup';

export interface CupPoints {
  points_a: number;
  points_b: number;
  matches_total: number;
  matches_completed: number;
  matches_in_progress: number;
  has_in_progress: boolean;
  /** Points already locked (closed matches / manual results). */
  closed_points_a: number;
  closed_points_b: number;
}

const EMPTY: CupPoints = {
  points_a: 0, points_b: 0,
  matches_total: 0, matches_completed: 0, matches_in_progress: 0,
  has_in_progress: false, closed_points_a: 0, closed_points_b: 0,
};

/**
 * Points for a set of matches.
 * Closed matches (or manual overrides) award final points; matches in
 * progress award provisional points to the current leader (AS = half each),
 * matching the live Ryder-Cup style scoreboard.
 */
export function computeCupPoints(
  matches: CupMatch[],
  results: Map<string, CupMatchResult>,
): CupPoints {
  if (matches.length === 0) return { ...EMPTY };
  let pointsA = 0, pointsB = 0, closedA = 0, closedB = 0;
  let completed = 0, inProgress = 0;

  for (const m of matches) {
    const pts = m.points_per_match ?? 1;
    const live = results.get(m.id);
    const closed = live?.match_closed ?? false;
    // Live results are the single source of truth whenever the match is linked
    // to a round: a stored result_type is only honoured for manual overrides or
    // when no live computation exists, so unconfirming holes clears the points.
    const rtype = closed
      ? live!.result_type
      : (live ? (m.result_override ? m.result_type : null) : m.result_type);

    if (rtype === 'a_wins') { pointsA += pts; closedA += pts; completed++; }
    else if (rtype === 'b_wins') { pointsB += pts; closedB += pts; completed++; }
    else if (rtype === 'halved') {
      pointsA += pts / 2; pointsB += pts / 2;
      closedA += pts / 2; closedB += pts / 2;
      completed++;
    } else if (live && live.holes_played > 0 && live.result_type === 'in_progress') {
      inProgress++;
      const diff = live.side_a_holes_won - live.side_b_holes_won;
      if (diff > 0) pointsA += pts;
      else if (diff < 0) pointsB += pts;
      else { pointsA += pts / 2; pointsB += pts / 2; }
    }
  }

  return {
    points_a: pointsA,
    points_b: pointsB,
    matches_total: matches.length,
    matches_completed: completed,
    matches_in_progress: inProgress,
    has_in_progress: inProgress > 0,
    closed_points_a: closedA,
    closed_points_b: closedB,
  };
}

/** Total points available across a set of matches (used for progress bars). */
export function totalPointsAvailable(matches: CupMatch[]): number {
  return matches.reduce((s, m) => s + (m.points_per_match ?? 1), 0);
}
