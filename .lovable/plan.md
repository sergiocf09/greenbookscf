
## Plan: Persistencia, Match-Play "Continúa" y Auto-rotación Sixes

### 1. Fix persistence for missing bet types

**File**: `src/hooks/useBetConfigPersistence.ts`

The following fields exist on `BetConfig` but are never saved or loaded:
- `wolfSetup`, `sixesBets`, `vegasBets`, `ninesBets`, `parejasExcluded`

Add all 5 to `RoundBetConfig`, `saveBetConfig`, and `applyDbConfigToState`.

### 2. Add "Continúa" (18-hole match) to Individual Pressures

**Files**: `golf.ts`, `IndividualBets.tsx`, `pressures.ts`, `BetDashboard.tsx`

- Add `continua?: boolean` to `PressureBetConfig`
- When `onlyMatch` + `continua`: hide Front/Back amounts, show single Match 18 amount
- Run single 1-18 match with early-win detection (lead > remaining holes = match over)
- Dashboard shows "4&3", "2&1", "1 Up" / "1 Down" with green/red styling

### 3. Add "Continúa" to Foursomes matchOnly

**Files**: `golf.ts`, `ParejasBets.tsx`, `teamPressures.ts`, `BetDashboard.tsx`

- Add `continua?: boolean` to `TeamPressuresBet`
- Same "Continúa (18 hoyos)" toggle when matchOnly is selected
- Same early-win logic and "X&Y" display format

### 4. Auto-rotate Sixes set assignments

**File**: `ParejasBets.tsx` (SixesBetCard)

When Set 1 has all 4 players filled (A+B vs C+D) and Sets 2/3 are empty, auto-generate:
- Set 2: A+C vs B+D
- Set 3: A+D vs B+C

User can still manually edit any set afterward.

### 5. Persist new fields

Add `continua` to persistence for both `pressures` and `teamPressures.bets[]`.

### Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useBetConfigPersistence.ts` | Save/load wolfSetup, sixesBets, vegasBets, ninesBets, parejasExcluded |
| `src/types/golf.ts` | Add `continua?: boolean` to PressureBetConfig and TeamPressuresBet |
| `src/components/setup/bets/IndividualBets.tsx` | "Continúa" toggle + single amount UI |
| `src/components/setup/bets/ParejasBets.tsx` | "Continúa" toggle for matchOnly; Sixes auto-rotation |
| `src/lib/bets/pressures.ts` | 18-hole continuous match with early-win |
| `src/lib/bets/teamPressures.ts` | 18-hole continuous match with early-win |
| `src/components/bets/BetDashboard.tsx` | "4&3" / "1 Up" match-play display |
