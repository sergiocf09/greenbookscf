

## Fixes: Parejas Matrix Interaction, Foursomes Notes & Column Headers

### Problems Identified

1. **Parejas matrix column headers are `<div>` not `<button>`** — clicking player initials does nothing (Individual & Grupal use `<button>` with `handleColumnToggle`)
2. **Cell toggle broken for all bet types** — `getParticipantIds` falls back to "all players" when no team assignments exist, so toggling a player off (blanking their slot) still returns all IDs. The toggle is a no-op loop.
3. **Foursomes info note wording** — currently says "no apuesta cuando diferencia = 2" (negative). Should be positive: "Abre presión cuando diferencia = 2"
4. **No `handleColumnToggle` function exists** in `ParejasParticipationMatrix.tsx`

### Solution

#### 1. Add explicit exclusion tracking per parejas bet (`ParejasParticipationMatrix.tsx`)

Instead of deriving participation solely from team assignments (which are empty initially), add an `excludedParejasPlayers` map on `BetConfig` (or handle it locally):

**Simpler approach**: Track excluded players per bet type via a new field `parejasExcluded?: Record<string, string[]>` on `BetConfig` in `golf.ts`. This maps bet key → array of excluded player IDs. Then:
- `getParticipantIds` returns `allIds.filter(id => !excluded.includes(id))` when bet is enabled
- `handleCellToggle` adds/removes from the exclusion list
- Min 4 players enforced (can't exclude if only 4 remain)
- Downstream: `ParejasBets.tsx` filters `playerOptions` based on non-excluded players

#### 2. Make column headers clickable (`ParejasParticipationMatrix.tsx`)

Change `<div>` → `<button>` in thead, add `handleColumnToggle` that toggles a player across all enabled bets (same pattern as Individual/Grupal matrices).

#### 3. Fix Foursomes info note (`ParejasBets.tsx`, line 822-828)

Change text to positive framing:
- `lowBall` → "Bola Baja: abre presión cuando diferencia = 2"
- `highBall` → "Bola Alta: abre presión cuando diferencia = 2"
- `combined` → "Combinado: abre presión cuando diferencia > 2"
- `matchOnly` → "Solo Match: sin apertura de presiones" (unchanged)

#### 4. Filter `playerOptions` in `ParejasBets.tsx`

For each bet section (Foursomes, Carritos, Sixes, Vegas, Loba), filter `playerOptions` to exclude players marked as excluded in the matrix, so deselected players don't appear in the team Select dropdowns.

### Files to Modify

| File | Changes |
|------|---------|
| `src/types/golf.ts` | Add `parejasExcluded?: Record<string, string[]>` to `BetConfig` |
| `src/components/setup/bets/ParejasParticipationMatrix.tsx` | Rewrite `getParticipantIds` to use exclusion list; change header `<div>` → `<button>`; add `handleColumnToggle`; update `handleCellToggle` to write to `parejasExcluded` |
| `src/components/setup/bets/ParejasBets.tsx` | Fix info note wording (positive framing); filter `playerOptions` per bet type using `getParejasActivePlayerIds` |

