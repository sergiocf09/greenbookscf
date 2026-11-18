import { describe, it, expect } from 'vitest';
import {
  computePrizePayouts, normalizeSpecialAwards, validatePrizeConfig,
} from '@/lib/leaderboardPrizes';
import {
  buildPar3Slots, extrasRemovedBy, groupSpecialAwards, MAX_AWARD_WINNERS, mergeGeneratedSlots,
  patchAwardBase, removeAwardGroup, setAwardWinnerCount, syncAwardGroups,
} from '@/lib/prizeSlots';
import type { PrizeConfig, SpecialAward } from '@/types/leaderboard';

const emptyCfg: PrizeConfig = { totalPool: null, categories: [], assignments: {}, pools: [], manualExclusions: [] };
const award = (p: Partial<SpecialAward> & { id: string }): SpecialAward => ({
  label: p.id, amount: 0, winnerParticipantId: null, holeNumber: null, dayNumber: null, categoryId: null, note: '', ...p,
});

describe('special award groups', () => {
  it('normalizeSpecialAwards keeps groupId and place', () => {
    const raw = [award({ id: 'a' }), award({ id: 'a-p2', groupId: 'a', place: 2 })];
    const out = normalizeSpecialAwards(JSON.parse(JSON.stringify(raw)));
    expect(out[1]).toMatchObject({ id: 'a-p2', groupId: 'a', place: 2 });
    expect(out[0].groupId).toBeUndefined();
  });

  it('adding winners creates `${id}-p${n}` extras with derived label and shared fields', () => {
    const base = award({ id: 'drive', label: 'Drive', holeNumber: 5, dayNumber: 2, categoryId: 'c1', note: 'x', amount: 300 });
    const out = setAwardWinnerCount([base, award({ id: 'other' })], 'drive', 3);
    expect(out.map(a => a.id)).toEqual(['drive', 'drive-p2', 'drive-p3', 'other']);
    expect(out[2]).toMatchObject({
      label: 'Drive · 3º', groupId: 'drive', place: 3, holeNumber: 5, dayNumber: 2, categoryId: 'c1', note: 'x',
      amount: 0, winnerParticipantId: null,
    });
  });

  it('reducing keeps lower places and reports removed ones; never exceeds the max', () => {
    let list = setAwardWinnerCount([award({ id: 'd', label: 'D' })], 'd', 3);
    list = list.map(a => (a.id === 'd-p2' ? { ...a, amount: 200, winnerParticipantId: 'p2' } : a));
    expect(extrasRemovedBy(list, 'd', 1).map(a => a.id)).toEqual(['d-p2', 'd-p3']);
    list = setAwardWinnerCount(list, 'd', 2);
    expect(list.map(a => a.id)).toEqual(['d', 'd-p2']);
    expect(list[1]).toMatchObject({ amount: 200, winnerParticipantId: 'p2' });
    expect(setAwardWinnerCount(list, 'd', 99)).toHaveLength(MAX_AWARD_WINNERS);
  });

  it('renaming the base relabels extras; removing the base removes its group', () => {
    let list = setAwardWinnerCount([award({ id: 'd', label: 'Drive' })], 'd', 2);
    list = patchAwardBase(list, 'd', { label: 'Drive largo' });
    expect(list[1].label).toBe('Drive largo · 2º');
    expect(syncAwardGroups(list.map(a => (a.id === 'd' ? { ...a, label: 'X' } : a)))[1].label).toBe('X · 2º');
    expect(removeAwardGroup([...list, award({ id: 'z' })], 'd').map(a => a.id)).toEqual(['z']);
  });

  it('groups extras under their base; legacy awards are their own group', () => {
    const list = [award({ id: 'a' }), award({ id: 'b' }), award({ id: 'a-p2', groupId: 'a', place: 2 })];
    const groups = groupSpecialAwards(list);
    expect(groups.map(g => [g.base.id, g.extras.map(x => x.id)])).toEqual([['a', ['a-p2']], ['b', []]]);
  });

  it('computePrizePayouts pays two places of one award separately and sums across awards', () => {
    const awards = [
      award({ id: 'drive', label: 'Drive', amount: 500, winnerParticipantId: 'p1' }),
      award({ id: 'drive-p2', label: 'Drive · 2º', groupId: 'drive', place: 2, amount: 200, winnerParticipantId: 'p2' }),
      award({ id: 'oyes', label: 'Oyes', amount: 300, winnerParticipantId: 'p2' }),
      award({ id: 'oyes-p2', label: 'Oyes · 2º', groupId: 'oyes', place: 2, amount: 100, winnerParticipantId: 'p1' }),
    ];
    const res = computePrizePayouts({ config: emptyCfg, awards, candidates: [] });
    expect(res.awards.find(a => a.awardId === 'drive-p2')).toMatchObject({ participantId: 'p2', amount: 200 });
    const p1 = res.byParticipant.find(p => p.participantId === 'p1')!;
    const p2 = res.byParticipant.find(p => p.participantId === 'p2')!;
    expect(p1.total).toBe(600);
    expect(p2.total).toBe(500);
    expect(p1.items.map(i => i.label)).toEqual(['Drive', 'Oyes · 2º']);
    expect(res.totalAllocated).toBe(1100);
  });

  it('extra places count toward the total-pool check', () => {
    const awards = [
      award({ id: 'd', amount: 500 }),
      award({ id: 'd-p2', groupId: 'd', place: 2, amount: 200 }),
    ];
    expect(validatePrizeConfig({ ...emptyCfg, totalPool: 600 }, awards).some(e => e.includes('supera'))).toBe(true);
    expect(validatePrizeConfig({ ...emptyCfg, totalPool: 700 }, awards)).toEqual([]);
  });

  it('mergeGeneratedSlots leaves extra places of an existing slot untouched', () => {
    const generated = buildPar3Slots({
      rounds: [{ roundId: 'r1', date: '2026-11-20', courseId: 'c1', dayNumber: null }],
      holesByCourse: { c1: [{ hole_number: 3, par: 3 }, { hole_number: 8, par: 3 }] },
      isMultiDay: false,
    });
    let list = mergeGeneratedSlots([], generated);
    list = setAwardWinnerCount(list, 'oyes-d0-h3', 3);
    list = list.map(a => (a.id === 'oyes-d0-h3-p2' ? { ...a, amount: 150, winnerParticipantId: 'p9' } : a));
    const merged = mergeGeneratedSlots(list, generated);
    expect(merged).toEqual(list);
    expect(merged.filter(a => a.groupId === 'oyes-d0-h3')).toHaveLength(2);
  });
});
