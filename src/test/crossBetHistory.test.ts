import { describe, it, expect } from 'vitest';
import { crossHistoryTotal, uniqueCrossHistory, type CrossHistoryLine } from '@/lib/crossBetHistory';
const line: CrossHistoryLine = { line_id: 'one', cross_bet_id: 'cross', origin_round_id: 'sergio', own_round_id: 'sergio', date: '2026-11-02', course_name: 'Course', rival_profile_id: 'rodrigo', rival_name: 'Rodrigo', net_amount: 50, label: 'Presiones Match 18', is_final: false };
describe('separate historical crossing accounting', () => {
  it('adds Sergio’s 50 crossing to his 475 round without duplicate lines', () => {
    expect(475 + crossHistoryTotal([line, line], 'sergio')).toBe(525);
    expect(uniqueCrossHistory([line, line])).toHaveLength(1);
  });
  it('does not affect other players or rounds', () => {
    expect(crossHistoryTotal([line], 'other')).toBe(0);
  });
  it('reflects replacement settlement instead of accumulating both versions', () => {
    expect(crossHistoryTotal([line, { ...line, net_amount: 100 }])).toBe(100);
  });
  it('preserves the reciprocal debit', () => {
    expect(crossHistoryTotal([{ ...line, net_amount: -50 }])).toBe(-50);
  });
});