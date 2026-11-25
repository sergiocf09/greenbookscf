import type { MultiDayDay } from '@/types/leaderboard';
import {
  stablefordPointsForDiff,
  type DayStanding,
  type HoleInfo,
  type LeaderboardStablefordPoints,
} from '@/lib/leaderboardAggregation';

export interface LeaderboardLiveScoreRow {
  round_player_id: string;
  round_id: string;
  profile_id: string | null;
  guest_name: string | null;
  handicap_for_round: number | null;
  hole_number: number | null;
  strokes: number | null;
}

export interface LinkedRoundMeta {
  round_id: string;
  round_date: string;
  course_id: string;
  course_name: string;
  expected_holes: number;
  holes: HoleInfo[];
}

export interface MultiDayStandingParticipant {
  id: string;
  profile_id: string | null;
  guest_name: string | null;
  handicap_for_leaderboard: number;
}

export function parseLinkedRoundHoles(raw: unknown): HoleInfo[] {
  if (!Array.isArray(raw)) return [];
  const out: HoleInfo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const h = item as Record<string, unknown>;
    const hole_number = Number(h.hole_number);
    const par = Number(h.par);
    const stroke_index = Number(h.stroke_index);
    if (Number.isFinite(hole_number) && Number.isFinite(par) && Number.isFinite(stroke_index)) {
      out.push({ hole_number, par, stroke_index });
    }
  }
  return out;
}

export function buildMultiDayStandings(
  days: MultiDayDay[],
  participants: MultiDayStandingParticipant[],
  liveRows: LeaderboardLiveScoreRow[],
  roundMetas: LinkedRoundMeta[],
  stbTable: LeaderboardStablefordPoints,
): Record<number, DayStanding[]> {
  const acc: Record<number, Record<string, DayStanding>> = {};
  const dayByDate: Record<string, number> = {};
  for (const d of days) {
    dayByDate[d.date] = d.day_number;
    acc[d.day_number] = {};
    for (const part of participants) {
      acc[d.day_number][part.id] = {
        participantId: part.id,
        profile_id: part.profile_id,
        grossTotal: 0,
        netTotal: 0,
        grossVsPar: 0,
        netVsPar: 0,
        stablefordTotal: 0,
        holesPlayed: 0,
        position: 0,
      };
    }
  }

  const metaByRound = new Map<string, LinkedRoundMeta>();
  const sortedHolesByRound = new Map<string, HoleInfo[]>();
  for (const m of roundMetas) {
    metaByRound.set(m.round_id, m);
    sortedHolesByRound.set(
      m.round_id,
      [...m.holes].sort((a, b) => a.stroke_index - b.stroke_index),
    );
  }

  const profileToPart = new Map<string, MultiDayStandingParticipant>();
  const guestToPart = new Map<string, MultiDayStandingParticipant>();
  for (const part of participants) {
    if (part.profile_id) profileToPart.set(part.profile_id, part);
    if (part.guest_name) guestToPart.set(part.guest_name, part);
  }

  for (const row of liveRows) {
    if (row.hole_number == null || !row.strokes) continue;
    const part =
      (row.profile_id ? profileToPart.get(row.profile_id) : undefined) ??
      (row.guest_name ? guestToPart.get(row.guest_name) : undefined);
    if (!part) continue;

    const meta = metaByRound.get(row.round_id);
    if (!meta) continue;
    const dayNum = dayByDate[meta.round_date];
    if (!dayNum) continue;
    const entry = acc[dayNum]?.[part.id];
    if (!entry) continue;

    const holeInfo = meta.holes.find((h) => h.hole_number === row.hole_number);
    const par = holeInfo?.par || 4;
    const handicap = part.handicap_for_leaderboard ?? Number(row.handicap_for_round) ?? 0;
    const sortedHoles = sortedHolesByRound.get(row.round_id) ?? [];
    const idx = sortedHoles.findIndex((h) => h.hole_number === row.hole_number);
    const fullStrokes = Math.floor(handicap / 18);
    const remainder = Math.round(handicap) % 18;
    const strokesReceived = fullStrokes + (idx >= 0 && idx < remainder ? 1 : 0);
    const netStrokes = row.strokes - strokesReceived;
    const diff = netStrokes - par;
    const stb = stablefordPointsForDiff(diff, stbTable);

    entry.grossTotal += row.strokes;
    entry.netTotal += netStrokes;
    entry.grossVsPar += row.strokes - par;
    entry.netVsPar += diff;
    entry.stablefordTotal += stb;
    entry.holesPlayed += 1;
  }

  const byDay: Record<number, DayStanding[]> = {};
  for (const dayNum of Object.keys(acc)) {
    byDay[Number(dayNum)] = Object.values(acc[Number(dayNum)]);
  }
  return byDay;
}