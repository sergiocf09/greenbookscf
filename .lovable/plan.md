Plan: Wolf Conditional Display, Continúa Cumulative Fix, Labels & Dashboard Redesign

### 1. Hide Wolf panel in Scoring when not enabled

**Problem**: Once `wolf.saveConfig()` is called, `wolf.wolfConfig` stays non-null forever, so the Wolf decision panel always shows in ScoringView even if `wolfSetup.enabled` is later toggled off or was never enabled in the matrix.

**Fix**: In `ScoringView.tsx` (line 240), add `betConfig.wolfSetup?.enabled` to the condition:

```
{wolfConfig && betConfig.wolfSetup?.enabled && players.length >= 4 && (
```

Same for `wolfNeedsDecision` (line 203) — gate it with `betConfig.wolfSetup?.enabled`.

Also gate the confirm button's wolf-blocking text (line 329).

**File**: `src/components/scoring/ScoringView.tsx`

---

### 2. Fix Foursomes "Continúa" dashboard — cumulative 18-hole display

**Problem**: The BetDashboard processes Front 9 and Back 9 independently via `processNine()` (lines 2375-2408), so the Back 9 balance resets to 0 instead of continuing from the Front 9 cumulative total. The display shows F9/B9/T18 as three separate sections, but in continúa mode it should be a single running tally across all 18 holes.

**Fix**: In `BetDashboard.tsx`, when `bet.continua && bet.scoringType === 'matchOnly'`:

- Process all 18 holes as one sequence (single `processNine` call with all 18 details) instead of separate front/back
- Display a single "Match Play" grid of 18 holes (2 rows of 9) with running cumulative balance using match-play notation (1 Up, 2 Up, E, etc.)
- Replace the F9/B9/T18 summary row with a single match-play status line showing current state or final result (e.g., "3 & 2", "1 Up", "E")
- Implement early-win detection: stop showing results after the match is decided
- When match concluded, show "X & Y" in the summary; otherwise show "X Up" / "X Down" / "E"

**File**: `src/components/bets/BetDashboard.tsx` (foursomes rendering block ~lines 2498-2940)

---

### 3. Fix Individual Pressures "Continúa" dashboard display

**Problem**: Same issue — the individual pressures dashboard likely shows Front/Back split even for continúa mode. The `pressures.ts` calculation engine already handles it correctly, but the dashboard visualization needs to match.

**Fix**: In the pressures display section of BetDashboard (individual pressures rendering), detect when `config.pressures.continua && config.pressures.onlyMatch` and show:

- Match-play notation: "1 Up", "2 Up", "E" instead of "+1", "+2", "0"
- Single running cumulative across 18 holes
- This is largely handled by the calculation engine already returning "X Up" / "X Down" / "Even" descriptions — verify the dashboard uses these descriptions properly.

**File**: `src/components/bets/BetDashboard.tsx`

---

### 4. Rename labels: "Solo Match" → "Sin presiones", "Continúa" → "Match Play por 18 hoyos"

**Changes**:

**IndividualBets.tsx** (lines 88-101):

- "Sólo match" → "Sin presiones"
- "Continúa (18 hoyos)" → "Match Play por 18 hoyos"
- Update info notes accordingly

**ParejasBets.tsx** (Foursomes scoring dropdown, lines 719-731):

- `<SelectItem value="matchOnly">Solo Match</SelectItem>` → `Sin presiones`
- "Continúa (18 hoyos)" → "Match Play por 18 hoyos"
- Update info notes

**BetDashboard.tsx** (line 2797):

- "Solo Match" → "Sin presiones"

**Files**: `IndividualBets.tsx`, `ParejasBets.tsx`, `BetDashboard.tsx`

---

### 5. Match-play notation in dashboard hole pills

For both Individual and Foursomes continúa mode, each hole pill should show:

- **"E"** when cumulative balance = 0 (Even)
- **"1 Up"** / **"2 Up"** etc. when winning
- **"1 Dn"** / **"2 Dn"** etc. when losing
- After match concluded: grayed out pills for remaining holes
- Final result badge: "4 & 3", "2 & 1", "1 Up" with green/red styling

**File**: `src/components/bets/BetDashboard.tsx`

---

### 6. Sixes dashboard redesign

**Current**: Collapsible sections with "Set 1 · Name+Name vs Name+Name · ganó" text, expanding to a 6-col grid of small pills.

**New design**:

- Header row showing team names like Foursomes: "Name / Name vs Name / Name"
- Three compact set cards with labels "1–6", "7–12", "13–18" (instead of "Set 1")
- Each set shows the team pairing and a 6-cell hole grid with win/loss/tie indicators
- Clicking a hole opens a popover with side-by-side team comparison (like Carritos `TeamHoleGrid`):
  - Left: "Tu equipo" with player scores
  - Right: "Rival" with player scores
  - Center: score comparison with black badge for advantage
- Remove the separate "Pagos" section — let the bilateral balance handle payment display

**File**: `src/components/bets/SixesResultsCard.tsx`

---

### 7. Vegas dashboard redesign

**Current**: Collapsible sections with set labels, expanding to hole grids showing diff numbers, popovers showing raw text.

**New design**:

- Header showing team pairing: "Name / Name vs Name / Name" (like Foursomes)
- Summary row: Front (accumulated diff), Back (accumulated diff), Total
- Hole grid with cells showing the diff per hole
- Clicking a hole opens a popover with side-by-side layout:
  - Left: "Tu equipo" with player gross scores
  - Right: "Rival" with player gross scores
  - Below: the two Vegas numbers formed, then the diff and peso amount
  - If birdie multiplier applied, show indicator
- Remove the separate "Pagos" section

**File**: `src/components/bets/VegasResultsCard.tsx`

---

### Files to Modify


| File                                           | Changes                                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/components/scoring/ScoringView.tsx`       | Gate Wolf panel/blocking on `betConfig.wolfSetup?.enabled`                                                                   |
| `src/components/setup/bets/IndividualBets.tsx` | Rename "Sólo match" → "Sin presiones", "Continúa" → "Match Play por 18 hoyos"                                                |
| `src/components/setup/bets/ParejasBets.tsx`    | Same label renames for Foursomes                                                                                             |
| `src/components/bets/BetDashboard.tsx`         | Foursomes continúa: single 18-hole cumulative with match-play notation; label updates; individual pressures continúa display |
| `src/components/bets/SixesResultsCard.tsx`     | Full redesign with Carritos-style team layout and side-by-side popovers                                                      |
| `src/components/bets/VegasResultsCard.tsx`     | Full redesign with team header, side-by-side popovers, remove Pagos                                                          |
