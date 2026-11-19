import { describe, it, expect } from 'vitest';
import { buildTournamentWinnings, tournamentWinningsTotal } from '@/lib/tournamentWinnings';

const events = [
  { id: 'lb1', name: 'Amigos Sunday Golf', startDate: '2026-11-20', endDate: null },
  { id: 'lb2', name: 'Copa Otoño', startDate: '2026-10-01', endDate: '2026-10-03' },
];
const payouts = (rows: [string, number][]) => ({ byParticipant: rows.map(([participantId, total]) => ({ participantId, total })) });

describe('buildTournamentWinnings', () => {
  it('takes my frozen prize total per competition, newest first, with course', () => {
    const lines = buildTournamentWinnings({
      myParticipants: [{ leaderboardId: 'lb1', participantId: 'p-me' }, { leaderboardId: 'lb2', participantId: 'q-me' }],
      prizes: [
        { leaderboardId: 'lb2', finalPayouts: payouts([['q-me', 2500], ['q-x', 900]]), finalizedAt: null },
        { leaderboardId: 'lb1', finalPayouts: payouts([['p-x', 15500], ['p-me', 10000]]), finalizedAt: null },
      ],
      events,
      coursesByLeaderboard: { lb1: ['Club de Golf Juriquilla', 'Club de Golf Juriquilla'] },
    });
    expect(lines.map(l => [l.name, l.date, l.amount])).toEqual([
      ['Amigos Sunday Golf', '2026-11-20', 10000],
      ['Copa Otoño', '2026-10-03', 2500],
    ]);
    expect(lines[0].courseNames).toEqual(['Club de Golf Juriquilla']);
    expect(tournamentWinningsTotal(lines)).toBe(12500);
  });

  it('skips competitions where I won nothing or am not a participant', () => {
    const lines = buildTournamentWinnings({
      myParticipants: [{ leaderboardId: 'lb1', participantId: 'p-me' }],
      prizes: [
        { leaderboardId: 'lb1', finalPayouts: payouts([['p-x', 15500]]), finalizedAt: null },
        { leaderboardId: 'lb2', finalPayouts: payouts([['q-me', 2500]]), finalizedAt: null },
      ],
      events,
      coursesByLeaderboard: {},
    });
    expect(lines).toEqual([]);
  });
});
