# Keep card crossings separate from the round

## What's wrong today
When a friend accepts a crossing, the app adds them to the host round as a player (flagged "cross only"). The round screens don't skip that flag when they load players. So the crossed friend shows up in the bet matrix, the handicap matrix, results and the other groups, even though they only crossed with one person. That can mix bets into the round.

## What will change
1. **The crossed friend is not a player in the round.** They no longer show up in setup, the bet matrices, handicaps, scorecard, results, the round's balances, or the other groups.
2. **The crossing has its own panel.** It shows only the two people crossing (for example, Alejandro and Rodrigo), with every individual bet available: Medal Front/Back/Total, Presiones, Oyeses, Unidades, Manchas, Skins, and so on, each with its own amount. Either player can turn bets on or off and change amounts. The panel is in the bets screen of each player's own round, and when sending the invitation.
3. **No mixing.** The crossing's bets never use the round's bet setup, and the round's bets never include the crossed friend.
4. **Today's crossing** (Alejandro and Rodrigo) is cleaned up so Rodrigo no longer shows up as a player in Alejandro's round. Its saved bets stay as they are.

## Not included in this step
How crossing bets are scored, comparing each player's card from their own round, is still pending, as we agreed earlier. The amounts get saved but won't add to balances until we do that next step.

## Technical details
- Filter out `is_cross_only = true` in every `round_players` load in the frontend: useRoundManagement (lines ~294, ~410), Index, PlayViews, SetupView, BetDashboard and the results and history readers. Also filter it in the snapshot and close functions (`finalize_round_bets`, the ledger and the snapshot builders) so it never enters the round.
- Keep the `is_cross_only` row for now (it's needed for permissions and the link), but use it only for the crossing. Look into whether `accept_cross_bet_invitation` can skip adding the row. If permissions allow it, update the migration so it stops adding the row.
- CrossBetSetupSheet and the BetDashboard crossing panel (~3846): a full catalog of individual bets with an on/off switch and amount per bet, stored in `round_cross_bets.bet_config` and edited through the existing `onUpdateCrossBetConfig`.
- Check on a phone screen: the matrix in Alejandro's round shows no Rodrigo, and the crossing panel lets you edit amounts.
