

## Plan: Dashboard Fixes — Early Win, Individual Match-Play Grid, Sixes Scores, Visual Consistency

### 1. Fix Foursomes early-win detection (premature "3 & 2")

**Problem**: When unscored holes remain (null entries in `allDetails`), the early-win loop keeps iterating past them. Since `cumBal` stays the same but `remaining` decreases on each iteration, the check `Math.abs(cumBal) > remaining` eventually fires on null holes — incorrectly declaring the match over (e.g., "3 & 2" when 4 holes are still unplayed).

**Fix**: Skip null holes in the loop so the early-win check only fires on actually scored holes. Apply this in both the summary block and the hole grid block.

**File**: `src/components/bets/BetDashboard.tsx` (two locations ~line 2549 and ~line 2853)

---

### 2. Add match-play 18-hole grid for Individual Pressures

**Problem**: When "Sin presiones + Match Play 18" is selected for individual pressures, the BilateralDetail still shows F9/B9/T18 with "+7 / +3" notation instead of a cumulative 18-hole match-play grid (E, 1Up, 2Dn, X&Y).

**Fix**:
- In `pressureEvolution.ts`: when `onlyMatch && config.pressures.continua`, generate a unified 18-hole evolution with match-play notation and early-win detection (populating the `total` segment with hole-by-hole states).
- In `BilateralDetail.tsx`: when pressures are continua+onlyMatch, replace the F9/B9 segment rows with a single popover that shows 2 rows of 9 holes each with cumulative match-play notation (E, 1Up, 2Dn), matching the Foursomes grid style.

**Files**: `src/lib/bets/pressureEvolution.ts`, `src/components/bets/BilateralDetail.tsx`

---

### 3. Fix Sixes hole popover — missing net scores

**Problem**: The popover checks `my.strokes > 0` (handicap strokes), which is 0 when no handicap is applied, causing scores to display as "–" even when gross data exists.

**Fix**: Use `my.gross > 0` instead. Always show `my.net` as the display value; show `(gross)` annotation only when handicap strokes differ from zero.

**File**: `src/components/bets/SixesResultsCard.tsx`

---

### 4. Vegas card — match Foursomes/Carritos styling

Restyle to match the Carritos header pattern:
- Large total amount number (not Badge) + cancel (X) button in header
- Team names row below: left-aligned team vs right-aligned team (larger text)
- Collapsible interior with F9/B9/Total + hole grid
- Hole pills: small hole number top, diff number bottom

**File**: `src/components/bets/VegasResultsCard.tsx`

---

### 5. Sixes card — columns + per-player ranking

- Three set columns (1–6, 7–12, 13–18) with team names and point differential
- Click to expand hole detail
- Below: per-player ranking sorted by net balance (like Coneja), showing each player's total Sixes P&L
- Cancel (X) button in header
- No single grand total Badge (varies by perspective)

**File**: `src/components/bets/SixesResultsCard.tsx`

---

### 6. Wolf card — consistent styling + per-player ranking

- Restyle header: large total number + cancel (X) button (matching Carritos)
- Remove "Pagos" section
- Add per-player ranking below hole grids

**File**: `src/components/bets/WolfResultsCard.tsx`

---

### 7. Wire cancel/disable for Sixes, Vegas, Wolf

Connect `onToggleDisabled`/`isDisabled` props for these three cards in BetDashboard, using the same betOverrides pattern already used by Carritos and Foursomes.

**File**: `src/components/bets/BetDashboard.tsx`

---

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/bets/BetDashboard.tsx` | Fix early-win null-hole bug; wire disable for Sixes/Vegas/Wolf |
| `src/lib/bets/pressureEvolution.ts` | Add continua 18-hole match-play evolution |
| `src/components/bets/BilateralDetail.tsx` | Show match-play grid when continua+onlyMatch |
| `src/components/bets/SixesResultsCard.tsx` | Fix scores; column layout; player ranking; cancel button |
| `src/components/bets/VegasResultsCard.tsx` | Restyle to match Carritos; cancel button; pill layout |
| `src/components/bets/WolfResultsCard.tsx` | Restyle; cancel button; player ranking; remove Pagos |

