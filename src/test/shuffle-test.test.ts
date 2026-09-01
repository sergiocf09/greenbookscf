import { describe, it, expect } from 'vitest';

function getNextPairCombo(
  playerIds: string[],
  currentTeamA: [string, string],
  currentTeamB: [string, string],
  currentTeamC?: [string, string]
): {
  teamA: [string, string];
  teamB: [string, string];
  teamC?: [string, string];
} {
  if (playerIds.length === 4) {
    const [A, B, C, D] = playerIds;
    const combos: Array<{ teamA: [string, string]; teamB: [string, string] }> = [
      { teamA: [A, B], teamB: [C, D] },
      { teamA: [A, C], teamB: [B, D] },
      { teamA: [A, D], teamB: [B, C] },
    ];

    const currentKey = `${currentTeamA[0]}_${currentTeamA[1]}_${currentTeamB[0]}_${currentTeamB[1]}`;
    const currentIdx = combos.findIndex((c) =>
      [
        `${c.teamA[0]}_${c.teamA[1]}_${c.teamB[0]}_${c.teamB[1]}`,
        `${c.teamA[1]}_${c.teamA[0]}_${c.teamB[0]}_${c.teamB[1]}`,
        `${c.teamA[0]}_${c.teamA[1]}_${c.teamB[1]}_${c.teamB[0]}`,
        `${c.teamA[1]}_${c.teamA[0]}_${c.teamB[1]}_${c.teamB[0]}`,
      ].includes(currentKey)
    );

    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % 3;
    return combos[nextIdx];
  }

  if (playerIds.length === 6) {
    const [p1, p2, p3, p4, p5, p6] = playerIds;
    const combos: Array<{
      teamA: [string, string];
      teamB: [string, string];
      teamC: [string, string];
    }> = [
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

    const normalize = (a: string, b: string) => [a, b].sort().join('_');
    const currentMatches = new Set([
      normalize(currentTeamA[0], currentTeamA[1]),
      normalize(currentTeamB[0], currentTeamB[1]),
      normalize(currentTeamC?.[0] ?? '', currentTeamC?.[1] ?? ''),
    ]);

    const currentIdx = combos.findIndex((c) => {
      const comboMatches = new Set([
        normalize(c.teamA[0], c.teamA[1]),
        normalize(c.teamB[0], c.teamB[1]),
        normalize(c.teamC[0], c.teamC[1]),
      ]);
      return (
        [...currentMatches].every((m) => comboMatches.has(m)) &&
        [...comboMatches].every((m) => currentMatches.has(m))
      );
    });

    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % 15;
    return combos[nextIdx];
  }

  return { teamA: currentTeamA, teamB: currentTeamB };
}

describe('getNextPairCombo 6 players', () => {
  it('cycles through all 15 combinations and returns to start', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    let state: { teamA: [string, string]; teamB: [string, string]; teamC?: [string, string] } = {
      teamA: ['', ''] as [string, string],
      teamB: ['', ''] as [string, string],
      teamC: ['', ''] as [string, string],
    };

    const seen: string[] = [];
    for (let i = 0; i < 16; i++) {
      state = getNextPairCombo(ids, state.teamA, state.teamB, state.teamC);
      const key = [state.teamA, state.teamB, state.teamC]
        .map((t) => (t ? [...t].sort().join('-') : ''))
        .sort()
        .join('|');
      seen.push(key);
    }

    // First click: p1+p2 vs p3+p4 vs p5+p6
    expect(seen[0]).toBe('p1-p2|p3-p4|p5-p6');
    // Clicks 2-3: p1+p2 fixed, others change
    expect(seen[1]).toBe('p1-p2|p3-p5|p4-p6');
    expect(seen[2]).toBe('p1-p2|p3-p6|p4-p5');
    // Click 4: p1 changes partner to p3
    expect(seen[3]).toBe('p1-p3|p2-p4|p5-p6');
    // Click 16 returns to first
    expect(seen[15]).toBe(seen[0]);
    // 15 unique combinations (not counting the wrap-around duplicate)
    const unique = new Set(seen.slice(0, 15));
    expect(unique.size).toBe(15);
  });
});
