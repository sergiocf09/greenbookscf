

## Plan: Inline Teams Cup + UX consistency

### Problem (from your audit)
1. **Banner click breaks Teams Cup**: `Index.tsx` `linkedLeaderboardInfo` banner calls `setLeaderboardDetailId(...)` which always renders `LeaderboardDetailInline` (individual view), regardless of `competition_type`. So Ryder cups display as individual gross/net leaderboards.
2. **Teams Cup is a full route** (`/leaderboards/cup/:id`, `TeamsCupDetail.tsx`) instead of inline under the subheader → forces `←` navigation, profile menu becomes useless until you back out.
3. **Individual leaderboard buttons are noisy**: Edit / Delete / Unlink shown as full-width buttons in the results view.
4. **Unlink ronda position**: needs to live next to the share icon, not under the title.

### Solution

#### A. New inline Teams Cup view
Create `src/components/leaderboards/TeamsCupDetailInline.tsx` — the same content as `TeamsCupDetail.tsx` minus the page chrome (no header bar, no profile dropdown, no `min-h-screen` wrapper). Accepts the same props pattern as `LeaderboardDetailInline`:

```ts
interface Props {
  leaderboardId: string;
  onBack: () => void;
  hasActiveRound?: boolean;
  isRoundLinked?: boolean;
  onLinkRound?: () => void;
  onUnlinkRound?: () => void;
}
```

Internal layout (rendered under the global subheader):
- **Top bar**: `← Leaderboards` · code chip · spacer · **[Vincular/Desvincular ronda]** · Share · Settings (gear, creator only)
- Event title + format badge
- Scoreboard (teams)
- Matches list
- Participants section
- All existing dialogs (CupSettings, MatchEditor, LinkRound)

Reuses all `useTeamsCup`, `useActiveRoundForLink`, `CupSettingsDialog`, `CupMatchEditorDialog` logic — just lifts the markup out of the page wrapper.

#### B. Wire the inline router in `Index.tsx`
1. Detect competition type when opening detail. Add state:
   ```ts
   const [leaderboardDetailType, setLeaderboardDetailType] = useState<'standard'|'teams_cup'>('standard');
   ```
2. Update the banner click and `LeaderboardsInlineView` callback to capture the type and route to the right inline component:
   ```tsx
   {leaderboardDetailId ? (
     leaderboardDetailType === 'teams_cup' ? (
       <TeamsCupDetailInline ... />
     ) : (
       <LeaderboardDetailInline ... />
     )
   ) : (
     <LeaderboardsInlineView onNavigateToDetail={(id, type) => { ... }} />
   )}
   ```
3. Update `LeaderboardsInlineView` to pass `competition_type` to `onNavigateToDetail` instead of navigating to `/leaderboards/cup/:id`. Drop the external `navigate(...)` for cups.
4. Update the **linked leaderboard banner** lookup (lines 507–528) to also fetch `competition_type` so the banner click sets the correct `leaderboardDetailType`.
5. Same for `joinByCode` flow — instead of `navigate('/leaderboards/cup/...')`, set inline state.

#### C. Repackage individual leaderboard actions (`LeaderboardDetailInline.tsx`)
- **Remove** the full-width Edit / Delete row (lines 206–215).
- **Remove** the standalone Link/Unlink row (lines 178–203).
- **Move them into the top bar**, mirroring Teams Cup style:
  ```
  [← Leaderboards] [#code] ............... [Link/Unlink] [Share] [Settings ⚙]
  ```
- Create a tiny `LeaderboardSettingsDialog` (or reuse the existing rename/delete dialogs triggered from a Settings button) that contains: Editar nombre · Eliminar leaderboard. Creator-only.
- The existing rename + delete dialogs stay, just opened from the gear menu.

#### D. Teams Cup page route (legacy)
Keep `/leaderboards/cup/:id` working for deep links / shared URLs by having `TeamsCupDetail.tsx` simply render a page wrapper around the new `TeamsCupDetailInline`. (Or leave the page as-is — both will exist; users coming from inside the app always use the inline path.)

### Files

| File | Change |
|---|---|
| `src/components/leaderboards/TeamsCupDetailInline.tsx` | **New** — extract from TeamsCupDetail.tsx |
| `src/pages/TeamsCupDetail.tsx` | Refactor to render `<TeamsCupDetailInline>` inside page header chrome (or leave — non-blocking) |
| `src/pages/Index.tsx` | Add `leaderboardDetailType` state; fetch type when banner loads; route to inline cup view; pass type from join/link flows |
| `src/components/leaderboards/LeaderboardsInlineView.tsx` | `onNavigateToDetail(id, type)` signature; remove `navigate('/leaderboards/cup/...')` |
| `src/components/leaderboards/LeaderboardDetailInline.tsx` | Move Edit/Delete/Link/Unlink into top bar + Settings dialog |
| `src/components/leaderboards/LeaderboardSettingsDialog.tsx` | **New** — gear-icon dialog with Editar nombre + Eliminar |
| `src/hooks/useLeaderboards.ts` | Already returns `competition_type` from `joinByCode`; ensure `linkedLeaderboardInfo` query in Index also selects it |

### UX result
- Open Scoring → see Ryder banner → tap → **Teams Cup detail renders inline** under the subheader, profile menu still works, free navigation across Setup/Bets/Scorecard/Bets/Leaderboards.
- Individual leaderboard view is clean: just the table; admin actions hidden behind ⚙.
- Unlink ronda lives next to Share in both views, consistent.
- No more `/leaderboards/cup/:id` full-page lock-in from inside the app.

### Open question (one only)
Should the legacy route `/leaderboards/cup/:id` stay as a standalone page (for shared deep links from outside the app), or should it also redirect to `/?view=leaderboards&cup=:id` so everything lives inline? Recommendation: **keep the route as a thin wrapper** (no extra work, deep links keep working).

