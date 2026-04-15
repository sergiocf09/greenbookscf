

# Fix: Half-Point Breaking Both LowBall AND HighBall Ties

## Root Cause

When both teammates have the same net score (e.g., both 4), `Math.min` and `Math.max` return the same value. Since `halfPlayerNet` equals both, the current code breaks **both** the lowball and highball ties — awarding 2 (or 3 with combined) points instead of just 1.

The half-point advantage means the player effectively scores 0.5 lower. This makes them the **low ball** contributor. They should NOT also be treated as the high ball contributor when both teammates tie.

## The Rule

- The half-point player's effective score is `net - 0.5`, making them always the **lower** contributor on their team.
- **LowBall tie**: break it if `halfPlayerNet === Math.min(teamNets)` — the player IS the low ball. ✓
- **HighBall tie**: break it ONLY if `halfPlayerNet === Math.max(teamNets)` **AND** `halfPlayerNet > Math.min(teamNets)` — i.e., the player is exclusively the high ball (different from teammate). If both teammates tied, the half-point player is the low ball, so high ball stays tied.
- **Combined tie**: always break (the 0.5 affects the team total).

## Files to Fix (4 locations)

### 1. `src/lib/bets/carritos.ts` (line 142)
Add guard: `&& halfPlayerNet !== Math.min(...halfTeamNets)` to the highBall tie-break condition. This prevents breaking high ball when the player also equals the min (meaning both teammates tied).

### 2. `src/lib/bets/sixes.ts` (line 120-123)
Same fix in `highTieBreak()`: add check that `halfPlayerNet > Math.min(...halfPlayerTeamVals)`.

### 3. `src/components/bets/BetDashboard.tsx` (line 715)
Carritos tooltip: add guard to highball tie-break — only break if halfPlayerNet is exclusively the high value on the team.

### 4. `src/components/bets/BetDashboard.tsx` (line 2547)
Foursomes tooltip: same guard for highball tie-break.

## Concrete Change Pattern

```typescript
// BEFORE (all locations):
if (highBallTied && halfPlayerNet === teamMax) { break tie }

// AFTER:
if (highBallTied && halfPlayerNet === teamMax && halfPlayerNet !== teamMin) { break tie }
// Only applies the .5 to high ball when the player is exclusively the high ball
```

This is a minimal, targeted fix — 4 lines changed across 3 files.

