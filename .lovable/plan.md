# Recálculo de rondas de Tequisquiapan tras corrección de rating/slope

## Contexto
Se corrigieron los valores de course_rating y slope_rating de los 4 tees del Club de Golf Tequisquiapan. Ahora hay rondas ya cerradas que se jugaron con los valores anteriores y cuyos cálculos dependientes (handicap history, snapshots, balances, estadísticas) deben reconstruirse.

## Alcance
1. Confirmar con el usuario cuáles 3 rondas (de las 6 cerradas encontradas en Tequisquiapan) deben recalcularse, o si aplica a todas.
2. Respaldar los registros actuales de `handicap_history` y `round_snapshots` para las rondas afectadas.
3. Recalcular diferenciales de `handicap_history` usando los nuevos `course_rating` y `slope_rating` del tee correspondiente.
4. Regenerar `round_snapshots` con la información de campo corregida.
5. Reconstruir datos derivados:
   - `player_statistics` (gross/net, porcentajes, dinero).
   - `player_vs_player` balances y `sliding_current` / `sliding_history`.
   - `leaderboard_scores` si alguna ronda está vinculada a una leaderboard.
   - `ledger_transactions` y balances de apuestas si el snapshot afecta la resolución.
6. Verificar que los Handicap Index resultantes y los balances coincidan con lo esperado.

## Datos técnicos
- Campo: `Club de Golf Tequisquiapan` (`course_id: 433ac097-7e97-4110-89d9-f6fbdad988fa`).
- Rondas cerradas encontradas: 6 (27 ago, 17 jul ×2, 29 jun, 25 feb, 28 ene).
- Tees afectados: white (68.9/120), blue (71.1/124), yellow (66.8/116), red (69.8/126).

## Nota
El paso 1 es necesario porque la base de datos muestra 6 rondas cerradas en Tequisquiapan, no 3. Se pedirá confirmación antes de ejecutar cualquier cambio destructivo.