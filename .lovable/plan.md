

## Plan: Dashboard Polish — Names, Disambiguation, Nines Visibility, Sixes Setup, Stroke Indicators, Wolf UX, Pressures Toggle

### 1. Full names in Sixes & Vegas (3-block variant) player rankings

In `SixesResultsCard.tsx` and `VegasResultsCard.tsx`, the player ranking section uses `getName(id)` which truncates to first name. Change to show full player name for these rankings since there's sufficient space.

**Files**: `SixesResultsCard.tsx`, `VegasResultsCard.tsx`

---

### 2. Disambiguated initials in Sixes, Vegas, Wolf, Nines

Import `disambiguateInitials` from `playerInput.ts` and compute disambiguated initials map for the active players. Use these initials wherever `PlayerAvatar` or initials-based headers are rendered, instead of raw `player.initials`.

**Files**: `SixesResultsCard.tsx`, `VegasResultsCard.tsx`, `WolfResultsCard.tsx`, `NinesResultsCard.tsx`

---

### 3. Fix Nines still showing when deselected from matrix

**Root cause**: The condition at line 3195 checks `ninesHook?.ninesConfig` first — once a config is saved to the DB, this stays truthy forever even after deselecting from the matrix. The `effectiveBetConfig.ninesBets` check is correct but `ninesHook?.ninesConfig` bypasses it.

**Fix**: Remove the `ninesHook?.ninesConfig` prerequisite. Use only the `effectiveBetConfig.ninesBets` check: `(effectiveBetConfig.ninesBets ?? []).some(b => b.playerIds?.length >= 3)`. This mirrors the pattern used for Sixes/Vegas (which use `(effectiveBetConfig.sixesBets ?? []).length > 0`).

**File**: `BetDashboard.tsx`

---

### 4. Fix Carritos ghost data persisting in Balance General

**Root cause analysis**: The guard at line 778 (`if (!betConfig.carritos.enabled) return results`) uses `betConfig` but the rendering and useEffect use `effectiveBetConfig`. If `effectiveBetConfig` has a stale `enabled: true`, the inline summary computation runs. Also the useEffect at line 818 doesn't check `betConfig.carritos.enabled` before processing `allCarritosResults`.

**Fix**: Add `if (!betConfig.carritos.enabled) return;` at the top of the useEffect (line 818) to skip `carritosSummaries` emission. Also ensure `allCarritosResults` memo uses `effectiveBetConfig.carritos.enabled` consistently.

**File**: `BetDashboard.tsx`

---

### 5. Sixes setup: show all 3 sets in rotation preview (not just 2 & 3)

Currently shows Set 1 as editable + Sets 2&3 as read-only. The user wants all 3 sets shown below (like Vegas). Change to show Set 1 in the same read-only preview format alongside Sets 2&3, creating a 3-column grid.

**File**: `ParejasBets.tsx` (SixesBetCard)

---

### 6. Stroke indicator in popovers: only ● dot, no gross in parentheses

**Current**: Nines shows `(gross) ●`, Sixes shows `(gross)`. User wants: show only the net score and `●` beside it when a stroke was applied — no gross value shown.

**Fix across all 4 cards**:
- **Sixes**: Replace `({my.gross})` with just `●` when `strokes > 0`
- **Nines**: Replace `({hs.strokes}) ●` with just `●`
- **Vegas**: Add `●` indicator (currently missing)
- **Wolf**: Add `●` indicator (currently missing)

**Files**: `SixesResultsCard.tsx`, `NinesResultsCard.tsx`, `VegasResultsCard.tsx`, `WolfResultsCard.tsx`

---

### 7. Wolf setup: show player avatars with initials in shuffle order display

Currently displays `1. Name · 2. Name`. Change to include `PlayerAvatar` inline next to each name, distributed across the full row width for better spacing and clarity when names repeat.

**File**: `ParejasBets.tsx`

---

### 8. Wolf H18 Redemption: show loser info, allow reversibility

- Show who the max loser is at the time of H18 (name + accumulated loss amount)
- Allow selecting either the max loser (×3 solo) OR the regular rotation wolf
- Make the choice always reversible (editing returns to the selection UI)
- The "Cambiar" button already exists in the in-play state; ensure it properly resets `redemptionMode` back to `pending`

**Files**: `WolfDecisionPanel.tsx`, `ScoringView.tsx`

---

### 9. Pressures bilateral toggle: dynamic label + restore F9/B9 when toggled off

**Problem 1**: The toggle label says "Solo Match" — should say "Sin Presiones" when only `onlyMatch` is set, and "Sin Presiones · Match Play 18" when both `continua` and `onlyMatch` are set.

**Problem 2**: When toggled OFF (from Sin Presiones → regular pressures), the F9/B9 segments don't reappear because `isContinuaMatch` still reads from `resolvedCfg.pressures?.continua && resolvedCfg.pressures?.onlyMatch`. When the pair override sets `onlyMatch: false`, the segment filter at line 677 should correctly produce all 3 segments. The issue is that `isContinuaMatch` uses the resolved config (which includes pair overrides), but the pair override is checked independently later. Need to unify: at line 677, incorporate the pair-level override to determine `isContinuaMatch`.

**Fix**: Pass pair-specific override context into the pressures segment determination. The `isContinuaMatch` at line 677 should use the same pair-aware logic as line 2454-2457.

**Files**: `BilateralDetail.tsx`

---

### Files to Modify

| File | Changes |
|------|---------|
| `SixesResultsCard.tsx` | Full names in ranking; disambiguated initials; ● only (no gross) |
| `VegasResultsCard.tsx` | Full names in ranking; disambiguated initials; ● indicator |
| `WolfResultsCard.tsx` | Disambiguated initials; ● indicator |
| `NinesResultsCard.tsx` | Disambiguated initials; ● only (no gross) |
| `BetDashboard.tsx` | Fix nines visibility; fix carritos useEffect guard |
| `ParejasBets.tsx` | Sixes 3-set preview; Wolf avatar+initials in order display |
| `WolfDecisionPanel.tsx` | Show loser info on H18; reversible redemption choice |
| `BilateralDetail.tsx` | Dynamic toggle label; pair-aware isContinuaMatch for segments |

