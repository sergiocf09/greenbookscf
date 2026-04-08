

## Fix: Graceful handling when a player is removed from a bet

### Problem
When a player is removed from the round but their ID is still referenced in bet configurations (Nines, Sixes, Vegas, Wolf), the ResultsCards crash with `Cannot read properties of undefined (reading 'id')`. The app should instead show a warning message indicating incomplete participation.

### Plan

**1. Add missing-player guard to NinesResultsCard.tsx**
- After computing `activePlayers`, check if `activePlayers.length < 3` (minimum for Nines)
- If insufficient players, render a warning card instead of the calculation: "⚠️ Faltan jugadores para esta apuesta. Verifica la configuración."
- Show which player IDs from `ninesConfig.playerIds` are missing from the round

**2. Add missing-player guard to SixesResultsCard.tsx**
- Check if any player ID referenced in `sixesConfig.sets` is not found in `players`
- If missing players detected, render warning card with message about incomplete team assignments

**3. Add missing-player guard to VegasResultsCard.tsx**
- Check if `playerAId/playerBId/playerCId/playerDId` from config resolve to actual players
- If any are missing, render warning card

**4. Add missing-player guard to WolfResultsCard.tsx**
- Check if any player ID in `wolfConfig` or `holeStates` references a missing player
- If so, render warning card

### Warning card design
Each card will show its normal header (title + icon) but replace the content with:
```
⚠️ Participación incompleta
[Nombre del jugador eliminado] ya no está en la ronda.
Agrega un jugador de reemplazo o desactiva esta apuesta.
```

Uses existing `AlertTriangle` icon (already imported in Sixes/Vegas cards) and `bg-amber-500/10` styling consistent with the app's warning patterns.

### Technical details
- **NinesResultsCard.tsx**: Early return after `activePlayers` memo if `length < 3`. The guard wraps the entire calculation block.
- **SixesResultsCard.tsx**: Collect missing IDs from sets' team arrays; show warning if any found.
- **VegasResultsCard.tsx**: Check all 4 player IDs resolve; show warning if any missing.
- **WolfResultsCard.tsx**: Filter `wolfConfig` player references against current players list.
- No changes to hooks or data model — this is purely a defensive UI guard.
- The existing `ninesConfig`/`sixesConfig`/`vegasConfig` in the DB remain unchanged; the warning prompts the organizer to reconfigure or re-add a player.

