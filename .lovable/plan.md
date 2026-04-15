

# Plan: Sliding Calculation, UX, and Half-Point Visual Fixes

## Issues Identified

### 1. Sliding Team Calculation (may show 0.5 when result should be 1)
The `calcSlidingTeamDifferential` in `src/lib/handicapUtils.ts` computes `raw = Math.abs(totalAtoB) / 2`. The user reports that for their team composition, the bilateral sum is 2, so the result should be 1 (integer), but the system shows 0.5. This could be caused by `getBilateralStrokes` returning unexpected values due to the fallback logic in `ParejasBets.tsx` (line 165-172 in HandicapMatrix uses a handicap differential fallback when persisted value is 0, which may not match the displayed matrix values). Will add logging and verify the bilateral values being passed to the calculation.

### 2. Sliding Button UX: "Aplicar Sliding" label persists after applying
After clicking "Aplicar Sliding" → "Guardar", the button reverts to "Aplicar Sliding" because `slidingSuggestions` state persists. Per the user's request, after sliding is applied, the button should change to show the "Full Handicap" option instead, giving a clear state transition.

**File:** `src/components/setup/HandicapMatrix.tsx`
- Track a `slidingApplied` state flag
- After applying sliding and saving, change the button label/action to "Aplicar Full Hándicap" (which resets handicaps to full individual mode)
- When "Full Hándicap" is tapped, revert to full handicap values and re-show "Aplicar Sliding"

### 3. Foursomes Tooltip: Half-point reducing score incorrectly (5 → 4)
In `BetDashboard.tsx` line 2468-2469, the `getPlayerScore` function for Foursomes sets `displayHcp = 0.5` which makes the dot appear, but the `net` calculation `score.strokes - hcp` uses the integer `hcp` (0), so `net = 5`. However, the bug is in lines 2483-2486 where AFTER the half-point is applied, the scores are re-fetched with `showHalf = true`, and the lowBall/highBall comparison uses the `.net` from these re-fetched values.

Wait -- re-reading: `net: score.strokes - hcp` where `hcp` is the integer (0), so net = 5. The lowBall comparison at line 2483 uses the FIRST call (without showHalf), so net is correct. But then line 2521-2524 re-fetches with `showHalf=true` for DISPLAY, and the display values have correct net.

The actual bug: lines 2509-2518 detect a tie between lowBall values (both are 4) and then apply `showHalf` to break it. BUT the half-point is on Fernando (who scored 5), NOT on the player who has the lowBall score (Sergio P scored 4). The tie-break should only apply if the half-point player's score IS the one creating the tie. Currently, it blindly breaks any tie on the half-point hole regardless of which player's score is involved.

**Fix in `BetDashboard.tsx` (Carritos ~line 694-704 and Foursomes ~line 2509-2518):**
- When breaking a lowBall tie: only break it if the `halfPlayerId`'s net score equals the tied value (i.e., the half-point player IS the one with the low score)
- When breaking a highBall tie: same logic
- When breaking a combined tie: same logic

### 4. Dot Color: Green instead of Black for half-point indicator
The half-point dot should be green to distinguish it from regular handicap dots (black).

**Files:**
- `src/components/bets/CarritosResultsCard.tsx` (lines 36, 38, 46, 48)
- `src/components/bets/SixesResultsCard.tsx` (line 249, 251)
- `src/components/bets/VegasResultsCard.tsx` (line 384, 386)

For each dot, detect if the `hcp` value is exactly `0.5` (the half-point marker). If so, render with `bg-green-600` instead of `bg-foreground`. The existing `hcp > 0` condition already triggers for 0.5.

### 5. Carritos: Already correct behavior, just visual refinement
The user confirms Carritos calculates correctly (doesn't apply the advantage when the hole isn't tied). The only change needed is the green dot color (covered in item 4).

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/handicapUtils.ts` | Debug/verify `calcSlidingTeamDifferential` computation |
| `src/components/setup/HandicapMatrix.tsx` | Track sliding-applied state; toggle button between "Aplicar Sliding" and "Aplicar Full Hándicap" |
| `src/components/bets/BetDashboard.tsx` | Fix half-point tie-break to only apply when the half-point player's score creates the tie (both Carritos and Foursomes sections) |
| `src/components/bets/CarritosResultsCard.tsx` | Green dot for half-point (hcp === 0.5) |
| `src/components/bets/SixesResultsCard.tsx` | Green dot for half-point |
| `src/components/bets/VegasResultsCard.tsx` | Green dot for half-point |

