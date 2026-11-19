/**
 * Tournament (competition prize) winnings for Historical Balances.
 *
 * Reads ONLY frozen prize results (leaderboard_prizes.status = 'final',
 * final_payouts.byParticipant). Entry fees or other costs are never part of it,
 * and it never recalculates prizes.
 */
import { supabase } from '@/integrations/supabase/client';

export interface TournamentWinningLine {
  leaderboardId: string;
  name: string;
  /** ISO date (yyyy-mm-dd) used for display and sorting. */
  date: string;
  courseNames: string[];
  amount: number;
}

export interface TournamentWinningsInput {
  /** My participant ids per leaderboard. */
  myParticipants: { leaderboardId: string; participantId: string }[];
  prizes: { leaderboardId: string; finalPayouts: unknown; finalizedAt: string | null }[];
  events: { id: string; name: string; startDate: string; endDate: string | null }[];
  coursesByLeaderboard: Record<string, string[]>;
}

/** Pure: one line per frozen competition where I won money, newest first. */
export function buildTournamentWinnings(input: TournamentWinningsInput): TournamentWinningLine[] {
  const mine = new Map<string, Set<string>>();
  for (const p of input.myParticipants) {
    if (!mine.has(p.leaderboardId)) mine.set(p.leaderboardId, new Set());
    mine.get(p.leaderboardId)!.add(p.participantId);
  }
  const eventById = new Map(input.events.map(e => [e.id, e]));
  const lines: TournamentWinningLine[] = [];
  for (const prize of input.prizes) {
    const ids = mine.get(prize.leaderboardId);
    const ev = eventById.get(prize.leaderboardId);
    if (!ids || !ev) continue;
    const rows = (prize.finalPayouts as { byParticipant?: { participantId?: string; total?: unknown }[] } | null)?.byParticipant;
    if (!Array.isArray(rows)) continue;
    const amount = rows
      .filter(r => r && typeof r.participantId === 'string' && ids.has(r.participantId))
      .reduce((s, r) => s + (Number.isFinite(Number(r.total)) ? Number(r.total) : 0), 0);
    if (!(amount > 0)) continue;
    lines.push({
      leaderboardId: prize.leaderboardId,
      name: ev.name,
      date: ev.endDate || ev.startDate || (prize.finalizedAt ?? '').slice(0, 10),
      courseNames: [...new Set(input.coursesByLeaderboard[prize.leaderboardId] ?? [])],
      amount: Math.round(amount * 100) / 100,
    });
  }
  return lines.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

export const tournamentWinningsTotal = (lines: TournamentWinningLine[]) =>
  Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;

/** Loads my frozen competition winnings. Readable through existing participant RLS. */
export async function fetchTournamentWinnings(profileId: string): Promise<TournamentWinningLine[]> {
  const { data: parts, error: pErr } = await supabase
    .from('leaderboard_participants')
    .select('id, leaderboard_id')
    .eq('profile_id', profileId);
  if (pErr) throw pErr;
  const lbIds = [...new Set((parts ?? []).map(p => p.leaderboard_id))];
  if (lbIds.length === 0) return [];

  const { data: prizes, error: zErr } = await supabase
    .from('leaderboard_prizes')
    .select('leaderboard_id, final_payouts, finalized_at')
    .eq('status', 'final')
    .in('leaderboard_id', lbIds);
  if (zErr) throw zErr;
  const finalIds = (prizes ?? []).map(p => p.leaderboard_id);
  if (finalIds.length === 0) return [];

  const [{ data: events, error: eErr }, { data: links }] = await Promise.all([
    supabase.from('leaderboard_events').select('id, name, start_date, end_date').in('id', finalIds),
    supabase.from('leaderboard_rounds')
      .select('leaderboard_id, rounds(course:golf_courses(name))')
      .in('leaderboard_id', finalIds),
  ]);
  if (eErr) throw eErr;

  const coursesByLeaderboard: Record<string, string[]> = {};
  for (const l of (links ?? []) as { leaderboard_id: string; rounds: { course: { name: string } | null } | null }[]) {
    const n = l.rounds?.course?.name;
    if (!n) continue;
    (coursesByLeaderboard[l.leaderboard_id] ||= []).push(n);
  }

  return buildTournamentWinnings({
    myParticipants: (parts ?? []).map(p => ({ leaderboardId: p.leaderboard_id, participantId: p.id })),
    prizes: (prizes ?? []).map(p => ({ leaderboardId: p.leaderboard_id, finalPayouts: p.final_payouts, finalizedAt: p.finalized_at })),
    events: (events ?? []).map(e => ({ id: e.id, name: e.name, startDate: e.start_date, endDate: e.end_date })),
    coursesByLeaderboard,
  });
}
