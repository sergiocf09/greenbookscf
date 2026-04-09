
## Plan: Dashboard Fixes & Wolf/Vegas Enhancements

### 1. Hide F9/B9 segments in bilateral detail for "Sin presiones + Match Play 18"

When continua+onlyMatch is active, filter out `pressure_front` and `pressure_back` segments from the pressures group. Only keep `pressure_total` which already shows the 2-row 18-hole grid.

**File**: `src/components/bets/BilateralDetail.tsx`

---

### 2. Fix carritos ghost data in balance when disabled in matrix

`calculateCarritosBets()` never checks `config.carritos.enabled`, so when carritos is disabled but team data persists, the engine still produces summaries that leak into the bilateral balance.

**Fix**: Add `if (!config.carritos.enabled) return [];` at the top of `calculateCarritosBets()`.

**File**: `src/lib/bets/carritos.ts`

---

### 3. Fix nines showing in dashboard when deselected from matrix

The condition `(ninesBets).length > 0` passes even when all players are removed (empty `playerIds`). Strengthen to: `ninesBets.some(b => b.playerIds.length >= 3)`.

**File**: `src/components/bets/BetDashboard.tsx`

---

### 4. Vegas "rotating" variant: show auto-rotation preview in setup

When variant is "rotating", display a read-only preview of the 3 auto-generated sets below the team selector (Set 1: A+B vs C+D, Set 2: A+C vs B+D, Set 3: A+D vs B+C). The engine already handles the rotation logic.

**File**: `src/components/setup/bets/ParejasBets.tsx` (VegasBetCard)

---

### 5. Vegas rotating variant: Sixes-style 3-column layout in dashboard

When `variant === 'rotating'`, render 3 set columns with distinct team headers, similar to `SixesResultsCard`. The existing `buildVegasSetResults` already returns per-set data with rotated teams.

**File**: `src/components/bets/VegasResultsCard.tsx`

---

### 6. Allow Wolf player deselection in matrix (min 4)

Remove the hard-coded `if (betKey === 'wolf') return;` guard. Use the standard exclusion logic, allowing unchecking as long as ≥4 players remain.

**File**: `src/components/setup/bets/ParejasParticipationMatrix.tsx`

---

### 7. Add random player order shuffle for Wolf

- Add `playerOrder?: string[]` to `WolfSetupConfig`
- Add "🎲 Sortear orden" button in Wolf setup that randomizes active players and stores the order
- Display the numbered order list
- Use `wolfSetup.playerOrder` in ScoringView and wolf.ts for rotation instead of default player order

**Files**: `src/types/golf.ts`, `src/components/setup/bets/ParejasBets.tsx`, `src/components/scoring/ScoringView.tsx`, `src/lib/bets/wolf.ts`

---

### 8. Add "Hole 18 Redemption" option for Wolf

- Add `hole18Redemption?: boolean` to `WolfSetupConfig`
- Toggle in Wolf setup: "Recuperación Hoyo 18 (máx. perdedor, solo, ×3)"
- On hole 18: calculate P&L through 17 holes, identify max loser (skip if tie), auto-assign wolf to them, force solo, ×3 stakes
- Persist in `useBetConfigPersistence.ts`

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
