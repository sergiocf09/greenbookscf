

# Fix: HandicapMatrix Sliding UX — Manual Save + Persistent Toggle

## Problems

1. **Auto-save on "Aplicar Sliding"**: Currently, clicking "Aplicar Sliding" triggers an auto-save via `useEffect` + `pendingSaveRequested`. The user wants the sliding values to appear in the matrix as pending changes (orange ring), then manually click "Guardar" to confirm.

2. **Same for "Aplicar Full Hándicap"**: Should also just stage changes, not auto-save.

3. **`slidingApplied` resets on refresh**: The toggle between "Aplicar Sliding" and "Aplicar Full Hándicap" is lost on page refresh because it's only in React state. After saving sliding values and refreshing, the button reverts to "Aplicar Sliding" even though sliding IS applied.

4. **Manual edits + Guardar must persist**: If the user manually changes any cell after applying sliding (or from setup defaults), clicking "Guardar" must persist exactly what's shown — no reverting.

## Solution

### A. Remove auto-save `useEffect` (line 232-244)
Delete the `pendingSaveRequested` state and the `useEffect` that auto-triggers `saveAllChanges()`. Instead:
- `applyAllSliding`: Just call `setCellStrokes` for all pairs → pending changes appear → "Guardar" button shows. Set `slidingApplied = true` locally.
- "Aplicar Full Hándicap" handler: Just call `setCellStrokes` for all pairs → pending changes appear → "Guardar" button shows. Set `slidingApplied = false` locally.
- User clicks "Guardar" → calls existing `saveAllChanges()` which persists and clears `pendingChanges`.

### B. Detect sliding state on load (persist toggle across refresh)
When sliding suggestions AND persisted handicaps are both loaded, compare them:
- For each pair with a sliding suggestion, check if the persisted value matches the sliding value.
- If **all** pairs with sliding match → `slidingApplied = true` (show "Aplicar Full Hándicap").
- If **any** pair differs → `slidingApplied = false` (show "Aplicar Sliding").

This is computed via `useMemo` watching `[slidingSuggestions, handicaps loaded state, allPlayers]`. No localStorage needed — the truth is derived from comparing DB values to sliding suggestions.

### C. Manual edit detection
When the user manually edits a cell (via popover stepper), `setCellStrokes` already adds to `pendingChanges` → "Guardar" button appears. `saveAllChanges` already persists and clears. No change needed here — it already works correctly.

After a manual edit that changes a value away from sliding, the `useMemo` comparison will detect mismatch → button toggles to "Aplicar Sliding" (offering to re-apply).

## Files to Modify

| File | Change |
|------|--------|
| `src/components/setup/HandicapMatrix.tsx` | Remove `pendingSaveRequested` + useEffect auto-save. Add `useMemo` to derive `slidingApplied` from persisted vs. suggested values. Update `applyAllSliding` and "Full Hándicap" to only stage changes. |

## Summary of UX Flow After Fix

1. Matrix loads → shows persisted values (inherited from setup or previously saved).
2. If sliding suggestions exist AND persisted values don't match → "Aplicar Sliding" button visible.
3. User clicks "Aplicar Sliding" → values update visually (pending ring) → "Guardar" button appears.
4. User clicks "Guardar" → persisted to DB → toast confirmation → "Aplicar Full Hándicap" button now visible.
5. User manually edits a cell → "Guardar" appears → saves on click.
6. Page refresh → `useMemo` re-derives sliding state from DB vs. suggestions → correct button shown.

