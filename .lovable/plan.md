

## Plan: Dashboard & Setup Fixes — Carritos Ghost, Nines Visibility, Vegas Rotating, Wolf UX, Handicap Indicators

### 1. Fix Carritos ghost data in Balance General

**Root cause**: `BetDashboard.tsx` line ~780 computes `allCarritosResults` without checking `effectiveBetConfig.carritos.enabled`. The guard in `carritos.ts` only protects the engine path, but the dashboard has its own inline calculator. The `carritosSummaries` emitted via `onBetSummariesChange` leak into the balance even when carritos is disabled in the matrix.

**Fix**: Wrap the legacy carritos block (line ~779-788) with `if (effectiveBetConfig.carritos.enabled && !hasCarritosTeams ...)`. Also wrap the `carritosTeams` loop (line ~792) to skip when carritos is disabled.

**File**: `src/components/bets/BetDashboard.tsx`

---

### 2. Fix Nines showing when deselected from matrix

**Root cause**: `ninesHook?.isActive` returns `true` whenever a config was saved to the DB (even if the matrix later toggled it off). The `ninesBets` array-length check is correct but `ninesHook.isActive` overrides it.

**Fix**: Change the condition to: `(effectiveBetConfig.ninesBets ?? []).some(b => (b as any).playerIds?.length >= 3)` — removing `ninesHook?.isActive` as a prerequisite. The nines card already needs valid bet instances with ≥3 players; the hook being "active" is irrelevant.

**File**: `src/components/bets/BetDashboard.tsx`

---

### 3. Vegas rotating variant: remove top-level total, add player ranking

**Problem**: Rotating variant shows `totalBalance` in the header (only relevant to logged-in user). Should show no single total and instead use a player ranking at the bottom (like Sixes).

**Fix**: In `VegasResultsCard.tsx`, when `isRotating`, hide the `totalBalance` from the header. Add a `playerRanking` computation (same pattern as Sixes) and render sorted list below the set columns. Only include the 4 participating players in the ranking.

**File**: `src/components/bets/VegasResultsCard.tsx`

---

### 4. Sixes & Vegas ranking: only show participating players

**Problem**: `playerRanking` iterates over all `players` including non-participants. Should filter to only the 4 players in the bet.

**Fix**:
- **Sixes**: Compute participating player IDs from `sixesConfig.sets` (unique set of all team members). Filter `playerRanking` to only those IDs.
- **Vegas**: Same approach — only include `playerAId/B/C/D`.
- **Wolf**: Filter to only wolf-participating players.

**Files**: `src/components/bets/SixesResultsCard.tsx`, `src/components/bets/VegasResultsCard.tsx`, `src/components/bets/WolfResultsCard.tsx`

---

### 5. Wolf player order: show all players in one row

**Problem**: The player order list in setup shows one player per row (vertical). User wants them all in one horizontal row for visual cleanliness.

**Fix**: Change the order display from a vertical list to a horizontal inline format: `1. Name · 2. Name · 3. Name · 4. Name`.

**File**: `src/components/setup/bets/ParejasBets.tsx`

---

### 6. Wolf Hole 18 Redemption: make it optional for the loser

**Problem**: Current logic auto-assigns the biggest loser on H18 with no choice. The user wants the loser to be able to decline, in which case the normal rotation applies.

**Fix**: On hole 18 with redemption enabled:
- Show a choice UI in `WolfDecisionPanel`: "El máximo perdedor (Name) puede tomar la Loba ×3 solo" with Accept/Decline buttons.
- If accepted → force solo, ×3. If declined → normal wolf rotation applies.
- Track choice via a new `redemptionAccepted` field on the `WolfHoleState` or by simply not overriding `wolfPlayerId` until accepted.
- In `ScoringView.tsx`: show both options (regular wolf and redemption candidate) until decided.

**Files**: `src/components/scoring/ScoringView.tsx`, `src/components/bets/WolfDecisionPanel.tsx`

---

### 7. Sixes setup: auto-generate sets 2 & 3 from set 1

**Problem**: User must manually configure all 3 sets. Should auto-generate sets 2 and 3 when set 1 is fully assigned (A+B vs C+D → A+C vs B+D → A+D vs B+C), and show a preview like Vegas does.

**Status**: The auto-rotation logic already exists (lines 1099-1111 in `ParejasBets.tsx`). It fires only when sets 2 & 3 are empty. The preview display for sets 2 & 3 should show them as read-only (like the Vegas rotation preview).

**Fix**: After auto-generation, display sets 2 and 3 as read-only previews (similar to Vegas). Remove the manual selectors for sets 2 and 3 when auto-generated.

**File**: `src/components/setup/bets/ParejasBets.tsx` (SixesBetCard)

---

### 8. Add per-set/per-round amounts for Sixes and Vegas

**Sixes**: Currently has a single `amount`. Add the ability to define amount per set (for `per_set` cobro mode) — or keep single amount as the per-unit amount.

**Vegas (fixed)**: Add option to define amount per 9-hole half (front/back amount) instead of a single `valuePerPoint`.

**Fix**:
- For Sixes: The current `amount` already serves as per-hole or per-set unit. Add a label clarification in setup. No structural change needed.
- For Vegas fixed variant: Add `frontAmount`, `backAmount` fields to `VegasBetInstance` and `VegasConfig`. In setup, show these fields when variant is `fixed`. The engine uses `valuePerPoint` — keep that as the multiplier, and add segment-level amounts for settlement.

**Files**: `src/types/golf.ts`, `src/components/setup/bets/ParejasBets.tsx`

---

### 9. Handicap stroke indicators in Wolf, Sixes, Vegas, Nines popovers

**Problem**: When playing with handicaps, the hole detail popovers don't show the black dot (●) indicator for strokes received, as Carritos and Foursomes do.

**Fix**: In each results card's hole popover:
- Show `●` next to the net score when `strokes > 0`
- Show gross in parentheses when net ≠ gross
- This pattern already exists in Sixes (`my.strokes > 0 && my.net !== my.gross`), ensure it's consistent across Vegas and Wolf popovers too.
- For Nines: add stroke indicator in the per-player score display.

**Files**: `src/components/bets/SixesResultsCard.tsx`, `src/components/bets/VegasResultsCard.tsx`, `src/components/bets/WolfResultsCard.tsx`, `src/components/bets/NinesResultsCard.tsx`

---

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/bets/BetDashboard.tsx` | Gate carritos inline calc on `enabled`; fix nines visibility condition |
| `src/components/bets/VegasResultsCard.tsx` | Remove header total for rotating; add player ranking (participants only); add ● stroke indicator in popover |
| `src/components/bets/SixesResultsCard.tsx` | Filter ranking to participants only; ensure ● stroke indicator |
| `src/components/bets/WolfResultsCard.tsx` | Filter ranking to participants only; add ● stroke indicator in popover |
| `src/components/bets/NinesResultsCard.tsx` | Add ● stroke indicator |
| `src/components/setup/bets/ParejasBets.tsx` | Wolf order horizontal; Sixes auto-gen read-only preview; Vegas per-half amounts |
| `src/components/scoring/ScoringView.tsx` | H18 redemption: show choice instead of auto-assign |
| `src/components/bets/WolfDecisionPanel.tsx` | Add Accept/Decline redemption UI |
| `src/types/golf.ts` | Optional: Vegas front/back amounts |

