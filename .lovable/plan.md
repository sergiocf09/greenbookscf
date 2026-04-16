

## Plan: Teams Cup polish (results, layout, UX)

### Issues to fix
1. **Back arrow noise** in both inline detail headers (Teams Cup + Standard) — already inline, the `← Leaderboards` is redundant.
2. **Match results not calculating** — the matches section shows "0 completados" and no per-match score even though holes have been played.
3. **Edit/Delete buttons clutter every match card** — should be hidden until the user expands/clicks the match.
4. **Match card name overflow** — long names get clipped on narrow viewports (390px); needs to allow 2-line wrap with taller pill.
5. **Participants listing** — keep alphabetical baseline; once assigned to a team, group by Team A then Team B (alphabetical inside each).

### Investigation needed
- Read `src/components/leaderboards/TeamsCupDetailInline.tsx` — header, matches list, participants section.
- Read `src/hooks/useTeamsCup.ts` — does it compute live match scores from hole_scores? If not, add derived computation per match (holes won / current standing per Match Play or Fourball format).
- Read `src/components/leaderboards/CupMatchEditorDialog.tsx` to understand how a match card opens.
- Read `src/components/leaderboards/CreateTeamsCupDialog.tsx` (team assignment UI) for the participants ordering fix.

### Changes

**A. Remove inline back arrow**
- `TeamsCupDetailInline.tsx`: drop the `← Leaderboards` button (the global subheader already provides navigation back to the Leaderboards tab). Reclaim space; the [Vincular/Desvincular ronda] button stays prominent on the left.
- `LeaderboardDetailInline.tsx`: same — remove `← Leaderboards` from top bar.

**B. Live match results in `useTeamsCup` + UI**
- Extend `useTeamsCup.ts` to fetch `hole_scores` for the linked round(s) and compute, per match:
  - **Match Play**: holes won by each side → current state ("3↑", "AS", "2↓", "Final 4&3").
  - **Fourball (Mejor bola)**: best ball per side per hole → same format.
- Expose `match.liveResult: { teamAUp: number, status: 'in_progress'|'closed'|'as', text: string, holesPlayed: number }`.
- Render this status badge prominently in each match card (replaces silent "VS").
- Update the "0 completados" counter to count matches whose `status === 'closed'` (mathematically decided).

**C. Cleaner match cards (collapse Edit/Delete)**
- Default match card shows: Team A pill · live result badge · Team B pill (no Edit/Delete row).
- Make the whole card clickable → opens an expanded inline panel (or drawer) with match detail + small **Editar** / **Eliminar** icons in a top-right corner of the expanded view.
- Creator-only for the action icons.

**D. Match card layout for narrow screens**
- Replace fixed-width truncated pill with flex layout where the name can wrap to 2 lines.
- Pill height auto-grows; "VS" stays vertically centered.
- Test at 390px width (current viewport).

**E. Participants ordering in CreateTeamsCupDialog (team assignment)**
- Sort source list alphabetically by display name.
- After assignment, render two grouped sections: **Equipo A** (alphabetical) then **Equipo B** (alphabetical), unassigned at top.
- Reassignment moves the row to its new section automatically.
- Remove the auto-save-on-handicap-keypress behavior if present (debounce or only save on blur / explicit Save).

### Files

| File | Change |
|---|---|
| `src/components/leaderboards/TeamsCupDetailInline.tsx` | Remove back arrow; live result badge per match; collapse Edit/Delete into expanded card; responsive pill layout |
| `src/components/leaderboards/LeaderboardDetailInline.tsx` | Remove back arrow |
| `src/hooks/useTeamsCup.ts` | Compute live match results from hole_scores (Match Play + Fourball) |
| `src/components/leaderboards/CreateTeamsCupDialog.tsx` (or wherever team assignment lives) | Alphabetical sorting + Team A/B grouping; remove autosave-per-keystroke on handicap |

### Open question
For **Fourball (Mejor bola)** match scoring, confirm: each hole is won by the team whose **best individual net score** beats the other team's best — agreed? (Standard Ryder Cup rule.) I'll implement this unless you flag otherwise.

