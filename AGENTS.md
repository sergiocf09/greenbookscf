Friend-group display order is persisted in `friend_groups.sort_order`; all group consumers use the RPC order so personal ordering stays consistent.
- Handicap ranking RPCs compute differentials with `_adjusted_gross_score` (Net Double Bogey, same stroke allocation as `calculateStrokesPerHole`); keep both in sync so rankings match the in-app Handicap Index.
- League player history reads gross and net totals from leaderboard_scores; constrain ScrollArea content and use fixed table columns so horizontal player selectors cannot widen the page.
