## Plan: Dashboard Fixes & Wolf/Vegas Enhancements

### 1. Hide F9/B9 segments in bilateral detail for "Sin presiones + Match Play 18"

**Problem**: When continua+onlyMatch is active, the bilateral detail still shows Front 9, Back 9, and Total 18 rows. Only Total 18 (with the 2-row grid) is needed.

**Fix**: In `BilateralDetail.tsx`, filter out `pressure_front` and `pressure_back` segments from the pressures group when `isContinua` is true. Only keep `pressure_total`.

**File**: `src/components/bets/BilateralDetail.tsx` (~line 681-686, segments array)

---

### 2. Fix carritos "ghost" data in balance when disabled in matrix

**Problem**: `calculateCarritosBets()` in `carritos.ts` never checks `config.carritos.enabled`. So when carritos is disabled in the matrix but team data persists in config, the engine still produces BetSummaries. The dashboard card is hidden (`effectiveBetConfig.carritos.enabled`), but the bilateral balance and the `onBetSummariesChange` emission still include carritos results.

**Fix**: Add `if (!config.carritos.enabled) return [];` at the top of `calculateCarritosBets()` in `carritos.ts`. This gates the engine itself, preventing ghost summaries.

**File**: `src/lib/bets/carritos.ts` (line ~13)

---

### 3. Fix nines showing in dashboard when deselected from matrix

**Problem**: The dashboard condition `(effectiveBetConfig.ninesBets ?? []).length > 0` passes even when all players are removed from nines instances (empty `playerIds` arrays). The instances still exist in the array.

**Fix**: Strengthen the condition to also check that at least one nines instance has ≥3 players:
```
(effectiveBetConfig.ninesBets ?? []).some(b => b.playerIds.length >= 3)
```

**File**: `src/components/bets/BetDashboard.tsx` (line ~3192)

---

### 4. Vegas "rotating" variant: auto-rotate teams like Sixes

**Problem**: When variant is "rotating", the setup still shows a single team selector. The engine in `vegas.ts` already handles the 3-set rotation logic correctly (`buildVegasSetResults` generates 3 sets with rotated teams). But the setup UI doesn't clearly show the 3 rotated pairings.

**Fix**: In `VegasBetCard` in `ParejasBets.tsx`, when variant is "rotating", after showing the A+B vs C+D selector, display a read-only preview of the 3 auto-generated sets (like Sixes):
- Set 1 (1–6): A+B vs C+D
- Set 2 (7–12): A+C vs B+D  
- Set 3 (13–18): A+D vs B+C

The rotation logic is already in the engine — this is purely a UI preview.

**File**: `src/components/setup/bets/ParejasBets.tsx` (VegasBetCard, after line ~1143)

---

### 5. Vegas rotating variant: use Sixes-style 3-column layout in dashboard

**Problem**: When Vegas variant is "rotating", the dashboard should display results in a Sixes-style 3-column layout (one column per set with different team pairings), instead of the current single-pair layout.

**Fix**: In `VegasResultsCard.tsx`, detect `variant === 'rotating'` and render 3 set columns with distinct team headers, similar to `SixesResultsCard`. The existing `buildVegasSetResults` already returns per-set data with rotated teams.

**File**: `src/components/bets/VegasResultsCard.tsx`

---

### 6. Allow Wolf player deselection in matrix (min 4)

**Problem**: The matrix hard-codes `betKey === 'wolf'` to skip toggle (`return;`), preventing any player from being unchecked.

**Fix**: In `ParejasParticipationMatrix.tsx`:
- Remove the `if (betKey === 'wolf') return;` guard in `handleCellToggle`
- Use the same exclusion logic as other bets: allow unchecking as long as ≥4 players remain active
- Update `canToggle` check on line ~252 to allow wolf toggles with the min-4 constraint
- Also update `handleColumnToggle` to include wolf

**File**: `src/components/setup/bets/ParejasParticipationMatrix.tsx`

---

### 7. Add random player order shuffle for Wolf

**Problem**: Wolf rotation uses the player array order (`(holeNumber-1) % players.length`). Users want a shuffle button to randomize who gets the wolf on each hole.

**Fix**:
- Add `playerOrder?: string[]` to `WolfSetupConfig` in `golf.ts`
- In `ParejasBets.tsx` Wolf section, add a "🎲 Sortear orden" button that randomizes the active wolf players and stores the order in `wolfSetup.playerOrder`
- Display the current order as a numbered list below the button
- In `ScoringView.tsx` and `wolf.ts`, use `wolfSetup.playerOrder` (if set) instead of the default player array order for `getWolfPlayerId`

**Files**: `src/types/golf.ts`, `src/components/setup/bets/ParejasBets.tsx`, `src/components/scoring/ScoringView.tsx`, `src/lib/bets/wolf.ts`

---

### 8. Add "Hole 18 Redemption" option for Wolf

**Problem**: Users want an optional rule where on hole 18, the biggest loser after 17 holes can take the wolf and play solo at triple stakes.

**Fix**:
- Add `hole18Redemption?: boolean` to `WolfSetupConfig` in `golf.ts`
- In `ParejasBets.tsx` Wolf section, add a toggle: "Recuperación Hoyo 18 (máx. perdedor, solo, ×3)"
- In `ScoringView.tsx` / `WolfDecisionPanel.tsx`, on hole 18 when redemption is enabled:
  - Calculate each player's wolf P&L through 17 holes
  - Identify the max loser (skip if there's a tie for last place)
  - Auto-assign wolf to that player, force solo, set effective amount to ×3
- In `wolf.ts` `computeEffectiveAmount`, handle the ×3 multiplier for redemption holes
- Persist `hole18Redemption` in `useBetConfigPersistence.ts`

**Files**: `src/types/golf.ts`, `src/components/setup/bets/ParejasBets.tsx`, `src/components/scoring/ScoringView.tsx`, `src/components/bets/WolfDecisionPanel.tsx`, `src/lib/bets/wolf.ts`, `src/hooks/useBetConfigPersistence.ts`

---

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/bets/BilateralDetail.tsx` | Filter out F9/B9 segments when continua+onlyMatch |
| `src/lib/bets/carritos.ts` | Gate on `config.carritos.enabled` |
| `src/components/bets/BetDashboard.tsx` | Strengthen nines visibility condition |
| `src/components/setup/bets/ParejasBets.tsx` | Vegas rotation preview; Wolf shuffle + redemption toggle |
| `src/components/bets/VegasResultsCard.tsx` | 3-column layout for rotating variant |
| `src/components/setup/bets/ParejasParticipationMatrix.tsx` | Allow wolf player deselection (min 4) |
| `src/types/golf.ts` | Add `playerOrder`, `hole18Redemption` to WolfSetupConfig |
| `src/components/scoring/ScoringView.tsx` | Use wolfSetup.playerOrder; hole 18 redemption logic |
| `src/components/bets/WolfDecisionPanel.tsx` | Handle redemption auto-assignment on hole 18 |
| `src/lib/bets/wolf.ts` | Use custom player order; ×3 redemption multiplier |
| `src/hooks/useBetConfigPersistence.ts` | Persist new wolf fields |
