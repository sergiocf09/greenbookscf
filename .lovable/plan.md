

## Fixes: Foursomes Dashboard, Sixes/Vegas Guards, Matrix Alignment

### Issues Found

1. **Foursomes hole grid shows no results** — `getHoleDetail()` in BetDashboard (line 2339) only handles `lowBall`, `highBall`, and `combined` scoring types. `matchOnly` matches none, so every hole returns 0 points. Also `openingThreshold` (line 2372) doesn't account for `matchOnly`.

2. **Sixes/Vegas show "missing players" warning** — `SixesResultsCard` and `VegasResultsCard` read player assignments from `sixesHook.sixesConfig` / `vegasHook.vegasConfig` (DB tables), but the setup UI saves to `betConfig.sixesBets` / `betConfig.vegasBets` (local state). The DB-backed hooks never receive the player assignments configured in setup. The results cards need to also check `betConfig` as a fallback source for player data, or the setup needs to sync to the DB hooks.

3. **Individual/Grupal matrix cell misalignment** — Cell buttons in `ParticipationMatrix.tsx` (line 345) and `GrupalParticipationMatrix.tsx` (line 301) are missing `mx-auto` class, causing them not to center under the column headers.

### Plan

#### 1. Fix Foursomes `matchOnly` in BetDashboard hole detail (lines 2339-2372)

Add `matchOnly` handling — treat it like `lowBall` for scoring (compare low balls) but set `openingThreshold = Infinity` so no pressures open:

```text
if (scoringType === 'lowBall' || scoringType === 'combined' || scoringType === 'matchOnly') {
  // lowBall comparison...
}
```

And on line 2372:
```text
const openingThreshold = scoringType === 'matchOnly' ? Infinity 
  : (scoringType === 'lowBall' || scoringType === 'highBall') ? 2 : 3;
```

Also update the label on line 2795 to include `matchOnly`:
```text
{bet.scoringType === 'matchOnly' ? 'Solo Match' : ...}
```

#### 2. Fix Sixes/Vegas "missing players" guard

The simplest fix: in `BetDashboard.tsx` where `SixesResultsCard` and `VegasResultsCard` are rendered, construct the config from `betConfig.sixesBets` / `betConfig.vegasBets` when the hook config has empty player IDs. This way, player assignments from setup flow through to the results cards.

For **Sixes** (line 3013-3021): Build `sixesConfig` from `effectiveBetConfig.sixesBets[0]` if `sixesHook.sixesConfig` has empty player IDs in sets.

For **Vegas** (line 3023-3031): Build `vegasConfig` from `effectiveBetConfig.vegasBets[0]` if `vegasHook.vegasConfig` has empty player IDs.

Alternatively, update `SixesResultsCard` and `VegasResultsCard` to accept an optional `betConfigFallback` prop and merge player assignments.

**Chosen approach**: Pass the `betConfig` instance data directly to the results cards as a fallback. Modify `SixesResultsCard` to accept optional `sixesBetInstance` and use its `sets` if the hook config has empties. Same for `VegasResultsCard` with `vegasBetInstance`.

#### 3. Add `mx-auto` to cell buttons in Individual and Grupal matrices

**ParticipationMatrix.tsx** line 345: Add `mx-auto` to button class.
**GrupalParticipationMatrix.tsx** line 301: Add `mx-auto` to button class.

### Files to Modify

| File | Change |
|------|--------|
| `src/components/bets/BetDashboard.tsx` | Fix `matchOnly` in `getHoleDetail`, `openingThreshold`, label; pass betConfig instance to Sixes/Vegas cards |
| `src/components/bets/SixesResultsCard.tsx` | Accept optional `sixesBetInstance` prop for player fallback |
| `src/components/bets/VegasResultsCard.tsx` | Accept optional `vegasBetInstance` prop for player fallback |
| `src/components/setup/bets/ParticipationMatrix.tsx` | Add `mx-auto` to cell buttons |
| `src/components/setup/bets/GrupalParticipationMatrix.tsx` | Add `mx-auto` to cell buttons |

