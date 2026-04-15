

# Fix: Half-Point Tie-Break Accuracy + HandicapMatrix Save Timing

## Problem Summary

Three distinct issues:

1. **Carritos engine** (`carritos.ts`): On the half-point hole, ALL ties (lowball, highball, combined) are blindly broken in favor of the receiving team — without checking if the half-point player is actually the one providing the low or high ball. The dashboard tooltip (`BetDashboard.tsx`) already has the correct check, but the **calculation engine** does not.

2. **Sixes engine** (`sixes.ts`): Same issue in `lowHighBall` mode — `tieWinner()` blindly awards the tie to the receiving team without verifying player contribution.

3. **HandicapMatrix save timing** (`HandicapMatrix.tsx`): `applyAllSliding` calls `setCellStrokes` (which queues React state via `setPendingChanges`), then calls `saveAllChanges()` via `setTimeout(0)`. But `saveAllChanges` is a `useCallback` that captures `pendingChanges` from its closure — the stale value from before the state update. The save either saves nothing or saves old data.

**Vegas** is already correct — it tracks `halfPlayerId` and only breaks ties when appropriate.

---

## Fix 1: Carritos Engine — Track halfPlayerId and Validate Contribution

**File**: `src/lib/bets/carritos.ts`

- Track `halfPlayerId` alongside `halfStrokeHole` and `halfReceivingTeam` (line 85-97).
- In `getHolePoints` (line 114-141), before breaking a tie:
  - **LowBall**: Only break if `halfPlayerId`'s net score equals `Math.min()` on their team (i.e., they ARE the low ball).
  - **HighBall**: Only break if `halfPlayerId`'s net score equals `Math.max()` on their team (i.e., they ARE the high ball).
  - **Combined**: Always applies (the .5 affects the team total regardless).

## Fix 2: Sixes Engine — Track halfPlayerId in lowHighBall Mode

**File**: `src/lib/bets/sixes.ts`

- Extend `detectHalfPoint` (line 33-47) to also return `halfPlayerId`.
- Pass `halfPlayerId` into `resolveSixesHole`.
- In `lowHighBall` mode (line 103-111):
  - For lowball tie: only break if halfPlayer's net IS `Math.min()` on their team.
  - For highball tie: only break if halfPlayer's net IS `Math.max()` on their team.
- For `lowBall`-only and `stroke`-only modes, the current logic is fine (single comparison).

## Fix 3: HandicapMatrix — Fix Save Timing with useEffect

**File**: `src/components/setup/HandicapMatrix.tsx`

Replace the `setTimeout(() => saveAllChanges())` pattern with a `useEffect`-based approach:

- Add a `pendingSaveRequested` state flag (`useState(false)`).
- In `applyAllSliding`: after calling `setCellStrokes` for all pairs, set `pendingSaveRequested = true` (do NOT call `saveAllChanges` directly).
- In "Aplicar Full Hándicap" handler: same pattern — set values, then `pendingSaveRequested = true`.
- Add a `useEffect` that watches `[pendingSaveRequested, pendingChanges]`:
  ```
  if pendingSaveRequested && pendingChanges.size > 0:
    call saveAllChanges()
    set pendingSaveRequested = false
    set slidingApplied accordingly
  ```
- This guarantees the save runs AFTER React has flushed the pending changes state.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/bets/carritos.ts` | Track `halfPlayerId`, validate low/high ball contribution before breaking tie |
| `src/lib/bets/sixes.ts` | Return `halfPlayerId` from `detectHalfPoint`, validate in lowHighBall mode |
| `src/components/setup/HandicapMatrix.tsx` | Replace `setTimeout` save with `useEffect` + `pendingSaveRequested` flag |

