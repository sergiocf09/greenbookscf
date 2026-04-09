

## Plan: Fix Loba — Rotation, Auto-Resolution, and Visual Consistency

### Problems Identified

1. **Rotation inconsistency**: Saved `wolf_hole_state` records have wrong `wolf_player_id` values (from before the source-of-truth fix). The UI uses `existingState?.wolfPlayerId ?? regularWolfPlayerId`, so corrupted saved data overrides the correct rotation.

2. **No results showing**: Most holes have `result: null` because auto-resolve only fires during `handleConfirmHole`. If scores were confirmed BEFORE the wolf decision was saved, the result is never calculated. There's no mechanism to auto-resolve when a decision is saved post-confirmation.

3. **Avatar green/gold missing**: `WolfResultsCard.tsx` and `ParejasBets.tsx` (setup order display) don't pass `isLoggedInUser` to `PlayerAvatar`, so the logged-in user's avatar doesn't show Augusta colors.

4. **Disambiguated initials missing in setup**: The wolf rotation order in `ParejasBets.tsx` shows raw `p.initials`, not disambiguated initials (important when multiple "SC" players exist).

5. **Position number missing in results**: The user wants a sequence number (1, 2, 3, 4) next to each player in the results ranking showing their Loba rotation position.

### Solution

#### Phase 1 — Fix rotation override from corrupted data

**`ScoringView.tsx`**: Change `effectiveWolfId` logic. The rotation order from `wolfConfig.playerOrder` must always take precedence. Only use saved `wolfPlayerId` if it matches the expected rotation for that hole (otherwise ignore the saved value as stale data).

```
const effectiveWolfId = (existingState?.wolfPlayerId === regularWolfPlayerId)
  ? regularWolfPlayerId
  : regularWolfPlayerId; // Always use rotation
```

**`Index.tsx` `onWolfDecision`**: Currently calls `wolf.getCurrentWolfId(holeNumber)` to derive the wolfId. This is correct but should be reinforced — if an existing state has a different wolfPlayerId, the save must overwrite it with the correct rotation value.

#### Phase 2 — Auto-resolve on decision save (post-confirm)

**`useWolf.ts` `saveDecision`**: After the upsert, check if all players in the hole have confirmed scores. If so, auto-compute the result using `resolveWolfHole` and immediately call `resolveHole`. This handles the scenario where scores were captured first and the wolf decision comes after.

**`ScoringView.tsx`**: Keep existing auto-resolve on confirm as a fallback (for when decision exists before confirm).

#### Phase 3 — Visual consistency (green/gold avatars + disambiguated initials)

**`WolfResultsCard.tsx`**:
- Pass `isLoggedInUser={pr.id === basePlayerId}` to `PlayerAvatar` in the ranking list
- Add rotation position number (from `wolfConfig.playerOrder`) as a small badge to the left of each player's avatar

**`ParejasBets.tsx`** (setup order display):
- Compute disambiguated initials for the wolf participant players
- Pass `isLoggedInUser` to the `PlayerAvatar` in the rotation display

**`WolfDecisionPanel.tsx`**:
- Pass `isLoggedInUser` to the wolf player's avatar in the header and to partner selection avatars

#### Phase 4 — Data cleanup for active round

Run a targeted cleanup to update `wolf_player_id` in existing `wolf_hole_state` records for the active round to match the correct rotation from `wolf_config.player_order`. This prevents stale data from causing display issues.

### Files to modify

| File | Change |
|------|--------|
| `src/components/scoring/ScoringView.tsx` | Always use rotation-derived wolfId, ignore stale saved wolfPlayerId |
| `src/hooks/useWolf.ts` | Auto-resolve hole on saveDecision if scores already confirmed |
| `src/components/bets/WolfResultsCard.tsx` | Add `isLoggedInUser`, rotation position number |
| `src/components/bets/WolfDecisionPanel.tsx` | Add `isLoggedInUser` to avatars |
| `src/components/setup/bets/ParejasBets.tsx` | Disambiguated initials + `isLoggedInUser` in order display |
| Database | Cleanup corrupted `wolf_hole_state` for active round |

