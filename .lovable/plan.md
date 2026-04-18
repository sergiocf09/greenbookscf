
## Dictamen: Persistencia de tees y cálculo de handicap

### Lo que encontré (validado en BD producción)

**Bug crítico #1 — `handicap_history` se guarda con TODOS los campos de trazabilidad en NULL**

Validé en la BD: las últimas ~30 inserciones a `handicap_history` tienen `tee_color`, `slope_rating`, `course_rating`, `gross_score`, `adjusted_gross_score` y `differential` todos en `NULL`. Solo se guarda el índice final.

Causa raíz en `useRoundManagement.ts` líneas 1934–2000: la consulta filtra por `rounds.status = 'completed'`, pero la ronda actual aún está en `setup`/`in_progress` cuando esto corre. El bloque `if (rd.id === roundState.id)` (línea 1993) **nunca matchea**, así que `thisRoundDiff/AGS/Gross/CR/SR/Tee` se quedan en `null`. Después (línea 2126) recién se marca `completed`. El orden de operaciones está invertido.

**Bug crítico #2 — Tee del organizador no se persiste al crear la ronda**

La función `create_round` en BD (migración 20260128024928) inserta `round_players` SIN `tee_color`. Validé en BD que varios `round_players` tienen `tee_color = NULL` mientras que `rounds.tee_color` puede ser distinto al que jugó el jugador.

Ejemplo real (12-abr-2026): el organizador Sergio CF jugó tees azules pero su `round_players.tee_color` es NULL. Otro caso (12-abr-2026): Carlos Echevarría tiene `player_tee=blue` pero `round_tee=white` — el cálculo USGA del histórico cae al fallback `round.tee_color = white` para Sergio CF, usando un Slope incorrecto.

**Bug crítico #3 — El recálculo del Index nuevo usa el mismo dato sucio**

Como la ronda recién cerrada todavía aparece como no-completed, no se incluye en la lista de las últimas 20 rondas usadas para `calcHI(diffs)`. El nuevo `current_handicap` se calcula con el set anterior (sin la ronda recién jugada).

### Plan de corrección

**1) Reordenar el cierre de ronda (`useRoundManagement.ts`)**

Marcar `rounds.status = 'completed'` **antes** del bloque de `handicap_history`. Si falla algún paso posterior, revertir solo ese paso (ya hay try/catch granular). Esto asegura que:
- La ronda recién cerrada se incluye en las últimas 20 para el nuevo Index.
- El bloque `if (rd.id === roundState.id)` matchea y persiste todos los campos de trazabilidad (tee, slope, rating, gross, AGS, diff).

Alternativa más segura: en vez de mover el UPDATE, calcular los datos de la ronda actual **directamente** (no depender de que aparezca en el query), y dejar el resto del histórico tal cual. Esto evita riesgos de cambio de orden en la pipeline de cierre.

**Recomiendo la alternativa**: calcular la ronda actual con los datos ya en memoria (`sanitizedPlayers`, `confirmedScoresForClose`, `course`, `roundState.teeColor` por jugador) y luego unirla al histórico para `calcHI`. Es determinista y no depende del estado en BD.

**2) Corregir `create_round` para persistir el tee del organizador**

Migración: agregar `tee_color := COALESCE(p_tee_color, 'white')` al INSERT de `round_players`. Garantiza que desde el inicio cada jugador tiene su tee explícito en su fila.

**3) Backfill de datos históricos**

Script de migración que para cada `round_players` con `tee_color IS NULL` lo setea al `rounds.tee_color` correspondiente (es lo que el cálculo asume hoy como fallback, pero lo materializa explícitamente para no perder integridad si después se cambia el default de la ronda).

**4) Backfill opcional de `handicap_history` traceability (NULL → calculado)**

Para cada fila de `handicap_history` con `tee_color IS NULL` y `round_id` no nulo, recomputar `gross_score`, `AGS`, `differential`, `course_rating`, `slope_rating` y `tee_color` desde `hole_scores` + `round_players.tee_color` + `course_tees`. Esto rehidrata el módulo de hándicap (Stats, HandicapHistoryView) con datos reales en vez de mostrar `--`.

**5) Validación post-fix**

Después de cerrar una ronda nueva, verificar en BD:
- `round_players.tee_color` tiene valor (no NULL) para el organizador y todos los jugadores.
- `handicap_history` recién insertado tiene `tee_color`, `slope_rating`, `course_rating`, `gross_score`, `adjusted_gross_score`, `differential` poblados.
- El nuevo `current_handicap` incluye la ronda recién cerrada en su cálculo.

### Archivos a tocar

- `src/hooks/useRoundManagement.ts` — calcular la ronda actual en memoria antes del query histórico, mergear al diffs[] y al insert de `handicap_history`.
- Migración SQL: `create_round` actualizada para escribir `tee_color` del organizador.
- Migración SQL: backfill de `round_players.tee_color` desde `rounds.tee_color`.
- Migración SQL: backfill de `handicap_history` con campos de trazabilidad recomputados (consulta SELECT + UPDATE sobre rondas con scoring confirmado).

### Notas

- El `roundSnapshot.ts` ya persiste `teeColor` por jugador (línea 273), así que el snapshot histórico está OK.
- `useUSGAHandicap.ts` y `useHandicapHistory.ts` ya usan `rp.tee_color` como fuente principal con fallback a `round.tee_color`. El fix lo deja completamente determinista.
- El fix #1 también resuelve que el módulo "Hándicap Index Calculado" muestre la ronda recién cerrada de inmediato al volver al perfil.
