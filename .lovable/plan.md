## Plan: Dashboard Fixes — Early Win, Individual Match-Play Grid, Sixes Scores, Visual Consistency

### 1. Fix Foursomes early-win detection (premature "3 & 2")

**Problem**: In `BetDashboard.tsx` lines 2549-2557, the early-win check uses `Math.abs(cumBal) > remaining` but also requires `remaining > 0`. When 4 holes remain and cumBal is 3, `3 > 4` is false so the match is NOT over — but the *summary status* section (lines 2559-2561) treats `allDetails.every(d => d !== null)` as match over (all 14 played holes have data), incorrectly showing "3 Up" as a final result. The real bug: holes without data (null) are included in the loop but don't contribute. The check `allDetails.every(d => d !== null)` is true when all 18 slots have been scored — but 4 holes remain *unplayed* (they're null). The loop iterates 18 slots total, but some are null.

Actually, re-reading: `allDetails` has 18 entries (front 9 + back 9). Null entries = no score yet. The early-win loop checks `remaining = 18 - (i+1)` which counts ALL remaining slots including null. So if 14 are played and cumBal=3, at i=13 (last played), remaining=4, `3 > 4` is false — correct, match is not over. But `allDetails.every(d => d !== null)` is false too (4 nulls). So the summary shows `3 Up` — this seems correct behavior?

The user says "3 y 2 ganaste" is showing. Let me re-check: the condition `Math.abs(cumBal) > remaining && remaining > 0` — if the loop encounters nulls after the last scored hole, it still increments `i`. At i=14 (null), cumBal stays 3, remaining=3, `3 > 3` is false. At i=15, remaining=2, `3 > 2` is TRUE → matchOver = true, matchResult = "3 & 2". **This is the bug!** Null holes still advance the loop, and since cumBal doesn't change but remaining decreases, it eventually triggers early-win on null holes.

**Fix**: Only check early-win on holes that have data. Skip null holes in the early-win check, or count remaining as only the remaining *played* holes. Better: only trigger when `d !== null` (actual scored hole):

```typescript
if (matchConcludedAt < 0 && d) {  // Only check on scored holes
  const remainingPlayable = allDetails.slice(i + 1).filter(x => x !== null).length;
  // But we also need total remaining holes (not just scored)
}
```

Actually the correct approach: count remaining as `18 - (i+1)` only for holes that have been scored or are yet to be played. The issue is that unscored holes shouldn't advance the pointer. Better approach: **stop iterating at the last scored hole**. After the loop, if match wasn't concluded, show "X Up" / "X Dn" / "E":

```typescript
for (let i = 0; i < allDetails.length; i++) {
  const d = allDetails[i];
  if (!d) continue; // skip unscored — don't advance balance or check early-win
  cumBal += d.net;
  const holesPlayed = i + 1;
  const remaining = 18 - holesPlayed;
  if (Math.abs(cumBal) > remaining && remaining > 0) {
    matchConcludedAt = i;
    break;
  }
}
```

Wait, but hole numbering matters — hole 1 at index 0. If holes 1-14 are scored (indices 0-13 have data, 14-17 are null), after scoring hole 14, remaining = 18-14 = 4. cumBal=3, 3 > 4 = false. Correct. But the current code doesn't skip nulls, so it continues to indices 14,15,16,17 where cumBal stays 3 but remaining keeps decreasing. Fix: **add `if (!d) continue;`** before the early-win check AND don't push cumBalances for skipped holes (or rather, just stop checking after null).

Better: break out of the loop when we hit the first null hole (no more scored holes).

**File**: `src/components/bets/BetDashboard.tsx` — two places: summary block (~line 2543) and hole grid block (~line 2846)

---

### 2. Add match-play 18-hole grid for Individual Pressures

**Problem**: When individual pressures are set to "Sin presiones + Match Play 18", the BilateralDetail still shows the standard F9/B9/T18 split with "+7 / +3" format. It should show a single cumulative 18-hole grid with match-play notation (1 Up, 2 Up, E, etc.) like the Foursomes grid.

**Fix**: 
- In `pressureEvolution.ts`: when `onlyMatch && config.pressures.continua`, process all 18 holes as one sequence instead of two nines. Return a special `continua` evolution with match-play notation (E, 1Up, 2Dn, X&Y when concluded).
- In `BilateralDetail.tsx`: when pressures are `continua + onlyMatch`, replace the F9/B9 segments with a single popover showing two rows of 9 holes each, using match-play cumulative notation.

**Files**: `src/lib/bets/pressureEvolution.ts`, `src/components/bets/BilateralDetail.tsx`

---

### 3. Fix Sixes hole popover — missing net scores

**Problem**: In `SixesResultsCard.tsx` lines 164-165, the display logic checks `my.strokes > 0` but the `scoresByPlayer` entries have `gross` (the raw stroke count from holeDetail). When `useHandicap` is false, `strokes` (handicap strokes) = 0 and `net = gross`. The condition `my.strokes > 0` fails, showing "–" instead of the score.

**Fix**: Change display logic to use `my.gross > 0` instead of `my.strokes > 0` for both display and the comparison. Show `my.net` always (it equals `gross - strokes`), and show `(gross)` in small text only when there's a handicap difference.

**File**: `src/components/bets/SixesResultsCard.tsx`

---

### 4. Vegas card — match Foursomes/Carritos styling

**Current**: Total balance is in a Badge; team names share the same line with the total; no cancel (X) button.

**New layout** (matching CarritosResultsCard pattern):
- Header: "Las Vegas" title left, large total amount number right + X cancel button
- Below: Team A name (left) vs Team B name (right) — full width, larger text
- Collapsible: F9/B9/Total summary + hole grid
- Hole pills: small hole number on top, diff number below (matching foursomes pattern)

**File**: `src/components/bets/VegasResultsCard.tsx`

---

### 5. Sixes card — column layout + cancel button + per-player ranking

**Current**: Vertical stack of 3 sets, Badge for total, no cancel button.

**New layout**:
- Header: "Sixes" title + cancel (X) button
- Three columns (one per set): each shows team names, point differential
- Click a set column → expands to show hole grid + popovers
- Below sets: player ranking (sorted by net balance, like Coneja) showing each player's total Sixes P&L
- No single grand total number at top (since results vary by player perspective)

**File**: `src/components/bets/SixesResultsCard.tsx`

---

### 6. Wolf card — match styling + cancel button + per-player ranking

**Current**: Badge total, F9/B9 collapsibles, Pagos section.

**New layout**:
- Header: "🐺 Loba" title + cancel (X) button  
- Remove "Pagos" section
- After hole grids: per-player ranking (sorted by net balance) showing each player's total Wolf P&L
- Match Foursomes/Carritos header style for the total amount

**File**: `src/components/bets/WolfResultsCard.tsx`

---

### 7. Wire cancel/disable functionality for Sixes, Vegas, Wolf

The Carritos and Foursomes cards already have `onToggleDisabled` and `isDisabled` props connected to `betOverrides`. Need to add the same pattern for these three bet types so the X button actually excludes them from balance calculations.

**File**: `src/components/bets/BetDashboard.tsx` (pass handlers to the cards)

---

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/bets/BetDashboard.tsx` | Fix early-win null-hole bug (2 locations); wire disable handlers for Sixes/Vegas/Wolf |
| `src/lib/bets/pressureEvolution.ts` | Add continua 18-hole match-play evolution |
| `src/components/bets/BilateralDetail.tsx` | Show match-play grid when continua+onlyMatch |
| `src/components/bets/SixesResultsCard.tsx` | Fix score display in popovers; column layout; per-player ranking; cancel button |
| `src/components/bets/VegasResultsCard.tsx` | Restyle to match Foursomes/Carritos pattern; cancel button; pill layout |
| `src/components/bets/WolfResultsCard.tsx` | Restyle header; cancel button; per-player ranking; remove Pagos |
