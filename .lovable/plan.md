

## Plan: Standardize Popovers, Pill Values, and Block Layout for Sixes/Vegas/Wolf

### Summary

Three main changes: (A) Match all popovers to the Carritos `TeamHoleGrid` style (larger `text-sm` font, filled circle `h-2 w-2 rounded-full bg-foreground` for strokes, dot to the RIGHT of "my team" scores and to the LEFT of rival scores). (B) Replace ✅/❌ icons in Sixes pills with the actual point differential number (e.g. `+1`, `-2`). (C) Refactor Vegas rotating variant from collapsible dropdown to 3 clickable blocks (same pattern as Sixes), and unify the block header style (compact team names) across both cards.

---

### 1. Standardize popovers across Sixes, Vegas, Wolf to match Carritos

**Reference pattern** (from `CarritosResultsCard.tsx` `TeamHoleGrid`):
- Uses `text-sm` for player rows (not `text-xs`/`text-[10px]`)
- Stroke indicator: `<span className="h-2 w-2 rounded-full bg-foreground" />` (filled circle, not text `●`)
- Position: For "my team" (left side), the dot appears to the RIGHT of the net score. For rivals (right side), the dot appears to the LEFT of the net score.
- Grid layout: `gridTemplateColumns: '1fr auto auto 12px auto auto 1fr'` — Name | Score | Dot | spacer | Dot | Score | Name

**Apply to**:
- **Sixes** (`SixesResultsCard.tsx` lines 208-244): Replace the current `text-xs`/`text-[10px]` popover with the `TeamHoleGrid`-style 7-column grid at `text-sm`. Move `●` text to filled circle. Fix dot placement (right of my team scores, left of rival scores).
- **Vegas** (`VegasResultsCard.tsx` lines 324-378): Same treatment for the per-player rows in the popover. Increase font to `text-sm`, use filled circle, correct dot side placement.
- **Wolf** (`WolfResultsCard.tsx` lines 120-159): Restructure the popover to use the same side-by-side layout (wolf team on left, rivals on right) with the 7-column grid, `text-sm`, filled circles.

**Files**: `SixesResultsCard.tsx`, `VegasResultsCard.tsx`, `WolfResultsCard.tsx`

---

### 2. Sixes pills: show point value instead of ✅/❌

**Current** (line 196): `{myTeamWon ? '✅' : myTeamLost ? '❌' : '='}`

**Change**: Show the actual point differential as a number. For `lowHighBall` mode the points can be 0, 1, or 2 per hole. Display `+N` in green or `-N` in red (same pattern as Vegas pills already do). When tied, show `0`.

Compute: `myPts = side === 'team1' ? hd.pointsTeam1 : hd.pointsTeam2` and `rvPts = ...`, then `diff = myPts - rvPts`. Display `{diff > 0 ? '+' : ''}{diff}`.

**File**: `SixesResultsCard.tsx`

---

### 3. Vegas rotating: convert from collapsible dropdown to 3 clickable blocks (like Sixes)

**Current**: The rotating variant (lines 146-199) uses a `Collapsible` with a single chevron that expands ALL 3 sets at once.

**Change**: Replace with the Sixes pattern — 3 clickable block buttons in a `grid grid-cols-3`. Clicking one expands only that set's 6-hole detail below. Use `expandedSet` state (same as Sixes).

Block header style (shared with Sixes):
```
H1–6
Name/Name
vs
Name/Name
+3 (or diff value)
```

This also unifies the visual: both Sixes and Vegas rotating use the same block + expand pattern.

**File**: `VegasResultsCard.tsx`

---

### 4. Sixes block headers: adopt Vegas compact font sizing

**Current Sixes blocks** use `text-[10px]` for team names and `text-[9px]` for "vs". The current Vegas rotating layout uses the same sizes.

Keep these as-is since both cards will now share the identical block pattern. The key change is just removing the full-width "vs" row that the user mentioned takes too much space — which is already solved by the block layout.

No additional file changes needed beyond what's covered in steps 2 and 3.

---

### Files to Modify

| File | Changes |
|------|---------|
| `SixesResultsCard.tsx` | Popover → Carritos-style `text-sm` grid with filled circles; pills show point numbers instead of ✅/❌ |
| `VegasResultsCard.tsx` | Popover → Carritos-style grid; rotating variant → 3 clickable blocks with `expandedSet` state |
| `WolfResultsCard.tsx` | Popover → Carritos-style side-by-side grid with filled circles |

