
## Plan: Persistencia, Match-Play "Continúa" y Auto-rotación Sixes

### 1. Fix persistence for missing bet types

**File**: `src/hooks/useBetConfigPersistence.ts`

The following fields exist on `BetConfig` but are **never saved or loaded** in the persistence hook:
- `wolfSetup` (Loba)
- `sixesBets` (Sixes instances)
- `vegasBets` (Vegas instances)
- `ninesBets` (Nines instances)
- `parejasExcluded` (Parejas matrix exclusions)

**Changes**:
- In `RoundBetConfig` interface: add `wolfSetup`, `sixesBets`, `vegasBets`, `ninesBets`, `parejasExcluded`
- In `saveBetConfig` (`configToSave`): add all 5 fields
- In `applyDbConfigToState`: add restore logic for all 5 fields (using `'key' in dbConfig` pattern for arrays)

### 2. Add "Continúa" (18-hole match) option to Individual Pressures

**Files**: `src/types/golf.ts`, `src/components/setup/bets/IndividualBets.tsx`, `src/lib/bets/pressures.ts`, `src/components/bets/BetDashboard.tsx`

When `onlyMatch` is true, add a new toggle `continua?: boolean` on `PressureBetConfig`:
- **UI** (`IndividualBets.tsx`): Show "Continúa (18 hoyos)" switch when `onlyMatch` is enabled. When `continua` is true, hide Front/Back amounts and only show a single "Match 18" amount.
- **Calculation** (`pressures.ts`): When `continua`, don't split at hole 9. Run a single match 1-18. Apply early-win logic: if a player leads by more holes than remain, the match ends (e.g., "4&3"). 
- **Dashboard** (`BetDashboard.tsx`): Show match result as "4&3", "2&1", "1 Up" etc. instead of F9/B9 split.

### 3. Add "Continúa" to Foursomes (Team Pressures) matchOnly

**Files**: `src/types/golf.ts`, `src/components/setup/bets/ParejasBets.tsx`, `src/lib/bets/teamPressures.ts`, `src/components/bets/BetDashboard.tsx`

Same concept for `TeamPressuresBet` when `scoringType === 'matchOnly'`:
- Add `continua?: boolean` to `TeamPressuresBet` interface
- **UI**: Show "Continúa (18 hoyos)" toggle when matchOnly is selected. When true, show only one "Match" amount field.
- **Calculation**: Run single 18-hole match with early-win detection
- **Dashboard**: Display "4&3", "1 Up", etc.

### 4. Auto-rotate Sixes set assignments

**File**: `src/components/setup/bets/ParejasBets.tsx` (SixesBetCard)

When the user sets 4 players in Set 1 (A+B vs C+D), auto-populate Sets 2 and 3:
- Set 2: A+C vs B+D
- Set 3: A+D vs B+C

Logic: In `updateSet` for set 1, if all 4 player IDs are filled and sets 2/3 are empty, auto-generate them. User can still manually edit any set afterward.

### 5. Persistence for new fields

Add `continua` to the `RoundBetConfig` type for both `pressures` and `teamPressures.bets[]`.

---

### Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useBetConfigPersistence.ts` | Save/load wolfSetup, sixesBets, vegasBets, ninesBets, parejasExcluded |
| `src/types/golf.ts` | Add `continua?: boolean` to `PressureBetConfig` and `TeamPressuresBet` |
| `src/components/setup/bets/IndividualBets.tsx` | "Continúa" toggle UI when onlyMatch, single amount |
| `src/components/setup/bets/ParejasBets.tsx` | "Continúa" toggle for matchOnly Foursomes; Sixes auto-rotation |
| `src/lib/bets/pressures.ts` | 18-hole match logic with early-win detection |
| `src/lib/bets/teamPressures.ts` | 18-hole match logic with early-win detection |
| `src/components/bets/BetDashboard.tsx` | Display match-play results ("4&3", "1 Up") for continúa mode |
