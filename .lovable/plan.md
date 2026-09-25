# Finish the English translation (phases 2–5)

The finding is real. The English button works, but so far only the profile menu and the round setup screen are translated. Everything else is still in Spanish. This was already planned as phases 2–5. The work touches around 75 screens, so it will be done in stages.

## Stage A — Playing a round (highest priority)
- Score entry: hole header, score buttons, putts, markers (Marks, Units, Closest to the Pin, Zoo)
- Scorecard (TV-style) and the pop-up for adding a player
- Bet dashboard: result cards (Wolf, Sixes, Vegas, Nines, Team Carts, Blocks), head-to-head detail, tooltips
- Close-round dialogs, score attestations, round log
- The approved English bet names used everywhere

## Stage B — Bet setup
- Bet tabs, individual, group and team bet editors, participation grids, handicap grid, templates

## Stage C — Everything else in the app
- Help drawer and contextual help (full text)
- Round History, activity charts, Historical Balances (Evolution / By Bet), Stats, Handicap calculator and history
- Rankings, Leaderboards, Leagues, Teams Cup, Friends, Profile, Join by code, sign-in page, onboarding

## Stage D — Outside the app screens
- Share images, terms and privacy pages; notification emails will stay in Spanish unless you ask otherwise

## Technical details
- Add `en`/`es` keys to the locale files, grouped by area (scoring, scorecard, dashboard, betSetup, help, history, stats, rankings, leaderboards, auth, common).
- Replace hardcoded text with `t()` via `useTranslation`. Date formats follow the language (date-fns `es`/`enUS`), and so do Recharts month labels.
- Use `t('bets.*')` for bet names. Emoji rules and name formats stay as they are.
- After each stage, check both languages on the mobile preview and search the finished files for leftover Spanish text.
- Mark the QA finding fixed once stages A–C are done.
