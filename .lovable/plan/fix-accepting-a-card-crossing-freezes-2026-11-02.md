# Fix: accepting a card crossing freezes

## Diagnosis (confirmed)
- Pending invitation from today: Alejandro Saucedo (co-admin) invited Rodrigo Echevarria in Sergio's round. Sending works.
- When Rodrigo taps Accept, the backend adds him to the round and then links his entry to the crossing. That last step is blocked by a protection rule that only lets a non-organizer change their tee color. Because Rodrigo is not the round's creator, the whole accept is undone.
- The screen shows no error, so it looks frozen.
- It is not caused by Alejandro being a co-admin. Any invitation fails when the person accepting is not the round's creator, which is almost always the case.

## Fix
1. Allow the accept step to link the player to their crossing. The tee-color-only protection still applies to every other edit players make themselves.
2. Keep the current rule: any registered player in the round can send a crossing, no co-admin role needed. Only the invited friend can accept.
3. On the accept and decline buttons, show a loading state, then show a clear message in Spanish or English if it fails, and always unlock the button.
4. After the fix, the pending invitation from Alejandro to Rodrigo can be accepted without being sent again.

## Technical details
- Migration: in `accept_cross_bet_invitation`, call `set_config('app.cross_bet_accept','on', true)` before the `UPDATE round_players SET cross_bet_id`. In `enforce_round_players_self_update`, skip the `cross_bet_id` check only when that flag is set. Both functions run as security definer, and the flag only lasts for the transaction.
- Client: in `Index.tsx` / the invitation toast, use `mutateAsync` in try/catch with a toast mapped to errors (`subscription_required`, `invitation_not_pending`, generic).
- Check: run the accept as Rodrigo's session against the pending invitation and confirm `round_cross_bets` is created and the player row is linked.
