

## Plan: Fix Wolf scoring mode change + tooltip detail

### Problem
1. **Stale results after mode change**: When the scoring mode is changed (e.g., from `stroke` to `lowBall`), the hole results stored in DB (`state.result`) are from the old mode. Both `calculateWolfBets` and `buildWolfHoleDetails` use the stale `state.result` instead of re-resolving with the current scoring mode.
2. **Missing tooltip detail**: In `lowBall` mode, the tooltip doesn't show which low balls were compared (e.g., "BB: Empate 5 vs 5"). In `stroke` mode, it doesn't show the sum breakdown (e.g., "5+5=10 vs 5+6=11"). Only `lowHighBall` mode currently shows the BB/BA detail.

### Changes

**File 1: `src/lib/bets/wolf.ts`**

- **`calculateWolfBets`**: Add `scores`, `course` parameters. For each hole state, re-resolve the result using `resolveWolfHole` with the current config (scoring mode). Use the fresh `resolved.winner` instead of `state.result` to determine winners/losers.
- **`buildWolfHoleDetails`**: Already calls `resolveWolfHole` but ignores the resolved `winner`. Change `result` in the return to use the mapped resolved winner (`wolf`→`won`, `rival`→`lost`, `tied`→`tied`) instead of `state.result`.

**File 2: `src/components/bets/WolfResultsCard.tsx`**

- Update `calculateWolfBets` call to pass `scores, course`.
- Update the tooltip "Extra info" section to show breakdown for ALL scoring modes:
  - **lowBall**: Show "Bola Baja: Loba/Rival/Empate" with the actual low ball values (e.g., "5 vs 5")
  - **stroke**: Show "Score Neto: X vs Y" with per-player sums
  - **lowHighBall**: Keep existing BB + BA display (already works)

**File 3: `src/components/bets/BetDashboard.tsx`**

- Update `calculateWolfBets` call to pass `scores, course` (the `wolfBetSummaries` useMemo).

### Detail on re-resolution logic

In `calculateWolfBets`, for each `state`:
```
const wolfTeam = [state.wolfPlayerId, ...state.partnerIds];
const rivalTeam = participantPlayers.filter(...);
const resolved = resolveWolfHole(wolfTeam, rivalTeam.map(p => p.id), state.holeNumber, players, scores, course, config);
// Use resolved.winner instead of state.result
const result = resolved.winner === 'wolf' ? 'won' : resolved.winner === 'rival' ? 'lost' : 'tied';
```

This ensures that changing the scoring mode instantly recalculates all results without needing to re-save each hole decision.

### Tooltip enhancement

For `lowBall` mode, after the player scores grid, add:
```
BB: {lowBallWinner label} · {wolfLowBall} vs {rivalLowBall}
```

For `stroke` mode, add:
```
Neto: {wolfTeamTotal} vs {rivalTeamTotal}
```

These use `detail.teamWolfScore` and `detail.teamRivalScore` which are already computed by `resolveWolfHole`.

