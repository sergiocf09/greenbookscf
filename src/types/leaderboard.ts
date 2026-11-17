export interface MultiDayDay {
  day_number: number;
  date: string; // 'YYYY-MM-DD'
  label?: string;
}

export interface MultiDayRulesJson {
  days: MultiDayDay[];
  aggregation: 'sum' | 'best_n';
  best_n?: number;
  /** Optional custom Stableford table (net vs par). */
  stableford_points?: import('@/lib/leaderboardAggregation').LeaderboardStablefordPoints;
}

/* ── Teams Cup (Ryder-style) multi-day / multi-session config ── */

export type CupSessionFormat = 'match_individual' | 'fourball';

export interface CupSession {
  session_number: number;
  /** e.g. "Matutina", "Vespertina" */
  label?: string;
  format: CupSessionFormat;
}

export interface CupDay {
  day_number: number;
  /** 'YYYY-MM-DD' — optional, used only for display */
  date?: string | null;
  label?: string;
  sessions: CupSession[];
}

export interface CupRulesJson {
  cup_days?: CupDay[];
  default_points_per_match?: number;
  [key: string]: any;
}

/** Key used to group matches: "day-session". */
export const cupSlotKey = (day: number, session: number) => `${day}-${session}`;

/**
 * Returns the configured days/sessions for a Teams Cup.
 * Falls back to a single day with a single session using the event format,
 * so legacy cups (created before multi-day) keep working unchanged.
 */
export function getCupDays(
  rules: CupRulesJson | null | undefined,
  fallbackFormat: CupSessionFormat = 'match_individual',
  fallbackDate?: string | null,
): CupDay[] {
  const raw = rules?.cup_days;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((d, i) => ({
        day_number: Number(d.day_number ?? i + 1),
        date: d.date ?? null,
        label: d.label || undefined,
        sessions: (Array.isArray(d.sessions) && d.sessions.length > 0 ? d.sessions : [
          { session_number: 1, format: fallbackFormat },
        ]).map((s: any, si: number) => ({
          session_number: Number(s.session_number ?? si + 1),
          label: s.label || undefined,
          format: (s.format as CupSessionFormat) || fallbackFormat,
        })),
      }))
      .sort((a, b) => a.day_number - b.day_number);
  }
  return [{
    day_number: 1,
    date: fallbackDate ?? null,
    label: undefined,
    sessions: [{ session_number: 1, format: fallbackFormat }],
  }];
}

export function cupSessionLabel(day: CupDay, session: CupSession, multiSession: boolean): string {
  const dayPart = day.label?.trim() || `Día ${day.day_number}`;
  if (!multiSession) return dayPart;
  const sessPart = session.label?.trim() || `S${session.session_number}`;
  return `${dayPart} · ${sessPart}`;
}

/* ── Leaderboard prizes (individual Day / Multi-day) ── */

export type PrizeMode = 'gross' | 'net' | 'stableford';

export interface PrizeTier {
  place: number;
  amount: number;
}

export interface PrizeCategory {
  id: string;
  name: string;
  hcpMin?: number | null;
  hcpMax?: number | null;
}

export interface PrizePool {
  id: string;
  mode: PrizeMode;
  categoryId: string | null;
  label: string;
  tiers: PrizeTier[];
  /** Ids of EARLIER pools (array order) whose winners cannot win in this pool. */
  excludeWinnersOf: string[];
}

export interface PrizeConfig {
  totalPool?: number | null;
  categories: PrizeCategory[];
  /** participantId → categoryId */
  assignments: Record<string, string>;
  pools: PrizePool[];
  manualExclusions: { poolId: string; participantId: string }[];
}

export interface SpecialAward {
  id: string;
  label: string;
  holeNumber?: number | null;
  dayNumber?: number | null;
  amount: number;
  winnerParticipantId: string | null;
  categoryId?: string | null;
  note?: string;
}

export interface PrizeCandidate {
  participantId: string;
  completed: boolean;
  /** gross/net: vs par, LOWER is better. stableford: points, HIGHER is better. */
  metrics: { gross: number; net: number; stableford: number };
}

export interface PayoutRow {
  participantId: string;
  rank: number;
  tied: boolean;
  tiedCount: number;
  amount: number;
}

export interface PoolPayout {
  poolId: string;
  rows: PayoutRow[];
  allocated: number;
  unallocated: number;
}

export interface PlayerPayoutItem {
  kind: 'pool' | 'award';
  refId: string;
  label: string;
  place?: number;
  tied?: boolean;
  amount: number;
}

export interface PlayerPayout {
  participantId: string;
  total: number;
  items: PlayerPayoutItem[];
}

export interface PayoutResult {
  pools: PoolPayout[];
  awards: { awardId: string; participantId: string | null; amount: number }[];
  /** Sorted by total, descending. Only players with total > 0. */
  byParticipant: PlayerPayout[];
  totalAllocated: number;
  totalUnallocated: number;
  totalPendingAwards: number;
}
