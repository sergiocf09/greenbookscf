

## Plan: Match cards UX refinements

Adjustments to the previously approved Teams Cup match card plan:

### Changes to nomenclature
- **Center big score**: instead of just `2↑` show **`2UP`** (or **`3DN`** when trailing). When tied: **`AS`**. Color follows the leading team. Format:
  - Leader perspective: `1UP`, `2UP`, `3UP`...
  - Tied: `AS`
  - When match is closed mid-round: `Final 4&3` underneath
- **Hole-by-hole tooltip cells**: same convention — `1UP` / `2UP` / `1DN` / `AS` / `—`, colored by who's up at that hole.
- **Progress label below center number**: `thru 6`, `thru 16` — keep English (no Spanish `tras N`).

### Everything else from the prior approved plan stays
- Always-visible ✏ / 🗑 icons stacked on the right (creator only).
- Click card → Popover with per-hole running standing (2 rows × 9 holes).
- Configurable `points_per_match` per match + default in event `rules_json.default_points_per_match`.
- Standings include in-progress provisional points (leader gets full points, AS = half each).
- Migration: `cup_matches.points_per_match numeric default 1`; recreate `get_cup_match_result` to also return `hole_breakdown jsonb` (per-hole `{hole, side_a_net, side_b_net, hole_winner, running_a_up}`).

### Files

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | ALTER `cup_matches` add `points_per_match`; DROP+CREATE `get_cup_match_result` returning `hole_breakdown jsonb` |
| `src/hooks/useTeamsCup.ts` | Add `points_per_match` + `hole_breakdown` typings; standings include in-progress provisional points |
| `src/components/leaderboards/TeamsCupDetailInline.tsx` | New `CupMatchRow`: big colored `NUP`/`NDN`/`AS` center, `thru N` label (English), always-visible ✏ 🗑 right side, Popover with per-hole grid using same `NUP`/`NDN`/`AS` notation |
| `src/components/leaderboards/CupMatchEditorDialog.tsx` | Add `points_per_match` numeric input |
| `src/components/leaderboards/CupSettingsDialog.tsx` | Add "Puntos por defecto por match" → `rules_json.default_points_per_match` |

